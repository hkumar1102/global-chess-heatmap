import { applyMove } from '../algorithms/chess/apply'
import { createGameState, makeGameMove, resetGame } from '../algorithms/chess/game'
import { evaluate } from '../algorithms/chess/eval'
import { getLegalMoves } from '../algorithms/chess/movegen'
import type { Move, Position } from '../algorithms/chess/types'
import { MockWebSocketServer } from './mockWebSocket'
import type { ClientMessage, LiveGameDTO, ServerMessage, ServerSnapshotDTO } from './types'

type Subscription = { games: boolean }

const MAX_PLY_BEFORE_ADJUDICATION = 220

function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

function weightedPick<T>(items: Array<{ item: T; weight: number }>): T {
  const total = items.reduce((acc, it) => acc + it.weight, 0)
  let r = Math.random() * total
  for (const it of items) {
    r -= it.weight
    if (r <= 0) return it.item
  }
  return items[items.length - 1]!.item
}

function chooseBotMove(position: Position): Move | null {
  const legal = getLegalMoves(position)
  if (legal.length === 0) return null

  // One-ply selection with light randomness. Minimax depth-2 is used in the UI analysis layer.
  const scored = legal.map((mv) => {
    const { next } = applyMove(position, mv)
    const score = evaluate(next)
    return { mv, score }
  })

  const isWhite = position.turn === 'w'
  scored.sort((a, b) => (isWhite ? b.score - a.score : a.score - b.score))
  const top = scored.slice(0, Math.min(4, scored.length))
  const weighted = top.map((t, idx) => ({ item: t.mv, weight: 1 / (idx + 1) }))
  return weightedPick(weighted)
}

export class MockChessServer {
  private socketServer: MockWebSocketServer
  private subscriptions = new WeakMap<object, Subscription>()

  private games = new Map<string, ReturnType<typeof createGameState>>()
  private players = new Map<string, { white: string; black: string; startedAt: number }>()
  private heatmapCounts: number[] = Array.from({ length: 64 }, () => 0)

  private started = false

  constructor() {
    this.socketServer = new MockWebSocketServer((socket, msg) => this.onClientMessage(socket, msg))
    this.seedGames()
  }

  connect(): ReturnType<MockWebSocketServer['connect']> {
    const socket = this.socketServer.connect('ws://mock-chess')
    this.subscriptions.set(socket, { games: true })
    socket.addEventListener('close', () => this.subscriptions.delete(socket))
    return socket
  }

  async fetchSnapshot(): Promise<ServerSnapshotDTO> {
    await new Promise((r) => setTimeout(r, randomBetween(80, 180)))
    return {
      games: this.getGamesDto(),
      heatmapCounts: this.heatmapCounts.slice(),
    }
  }

  start(): void {
    if (this.started) return
    this.started = true
    for (const gameId of this.games.keys()) this.scheduleNextMove(gameId)
  }

  private seedGames(): void {
    const names = [
      'Ava',
      'Noah',
      'Mia',
      'Ethan',
      'Sofia',
      'Liam',
      'Zoe',
      'Kai',
      'Iris',
      'Omar',
      'Nina',
      'Theo',
    ]
    const gameCount = 6
    for (let i = 0; i < gameCount; i += 1) {
      const id = `g${i + 1}`
      const white = pick(names)
      let black = pick(names)
      while (black === white) black = pick(names)
      const startedAt = Date.now() - randomBetween(0, 8_000)
      this.games.set(id, createGameState(id))
      this.players.set(id, { white, black, startedAt })
    }
  }

  private getGamesDto(): LiveGameDTO[] {
    const out: LiveGameDTO[] = []
    for (const [id, game] of this.games.entries()) {
      const meta = this.players.get(id)
      const startedAt = meta?.startedAt ?? Date.now()
      const last = game.history.at(-1)
      out.push({
        id,
        white: meta?.white ?? 'White',
        black: meta?.black ?? 'Black',
        startedAt,
        ply: game.history.length,
        position: game.position,
        outcome: game.outcome,
        lastMove: last ? { san: last.san, move: last.move } : undefined,
      })
    }
    out.sort((a, b) => b.startedAt - a.startedAt)
    return out
  }

  private onClientMessage(socket: object, msg: ClientMessage): void {
    if (msg.type === 'unsubscribe') {
      this.subscriptions.set(socket, { games: false })
      return
    }
    if (msg.type === 'subscribe') {
      this.subscriptions.set(socket, { games: msg.channels.includes('games') })
      return
    }
  }

  private broadcastToSubscribers(message: ServerMessage): void {
    this.socketServer.broadcastWhere(message, (socket) => this.subscriptions.get(socket)?.games ?? false)
  }

  private scheduleNextMove(gameId: string): void {
    const delay = randomBetween(450, 1_200)
    setTimeout(() => {
      const game = this.games.get(gameId)
      if (!game) return
      if (game.outcome.kind !== 'active') {
        this.scheduleReset(gameId)
        return
      }

      const mv = chooseBotMove(game.position)
      if (!mv) {
        this.scheduleReset(gameId)
        return
      }

      const after = makeGameMove(game, mv)
      this.games.set(gameId, after)

      const updates: Array<{ square: number; count: number }> = []
      for (const sq of [mv.from, mv.to]) {
        const nextCount = (this.heatmapCounts[sq] ?? 0) + 1
        this.heatmapCounts[sq] = nextCount
        updates.push({ square: sq, count: nextCount })
      }

      const last = after.history.at(-1)
      if (!last) return

      this.broadcastToSubscribers({
        type: 'game_update',
        gameId,
        move: last.move,
        san: last.san,
        ply: after.history.length,
        outcome: after.outcome,
        heatmapUpdates: updates,
      })

      if (after.history.length >= MAX_PLY_BEFORE_ADJUDICATION) {
        this.scheduleReset(gameId)
        return
      }

      if (after.outcome.kind !== 'active') {
        this.scheduleReset(gameId)
        return
      }

      this.scheduleNextMove(gameId)
    }, delay)
  }

  private scheduleReset(gameId: string): void {
    const delay = randomBetween(1_400, 2_800)
    setTimeout(() => {
      const game = this.games.get(gameId)
      if (!game) return
      const next = resetGame(game)
      this.games.set(gameId, next)

      const meta = this.players.get(gameId)
      if (meta) meta.startedAt = Date.now()

      const dto = this.getGamesDto().find((g) => g.id === gameId)
      if (!dto) return
      this.broadcastToSubscribers({ type: 'game_reset', game: dto })
      this.scheduleNextMove(gameId)
    }, delay)
  }
}

declare global {
  var __GCHM_SERVER__: MockChessServer | undefined
}

export function getMockChessServer(): MockChessServer {
  if (!globalThis.__GCHM_SERVER__) {
    globalThis.__GCHM_SERVER__ = new MockChessServer()
    globalThis.__GCHM_SERVER__.start()
  }
  return globalThis.__GCHM_SERVER__
}
