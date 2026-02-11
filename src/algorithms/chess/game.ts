import { applyMove } from './apply'
import { getLegalMoves, isInCheck } from './movegen'
import { createInitialPosition, positionKey } from './position'
import { moveToSan } from './san'
import type { Color, GameOutcome, GameState, Move, Piece, Position } from './types'

function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

function nonKingPiecesByColor(position: Position, color: Color): Piece[] {
  const out: Piece[] = []
  for (const p of position.board) {
    if (p && p.color === color && p.type !== 'k') out.push(p)
  }
  return out
}

export function hasMatingMaterial(position: Position, color: Color): boolean {
  const pieces = nonKingPiecesByColor(position, color)
  if (pieces.length === 0) return false

  if (pieces.some((p) => p.type === 'p' || p.type === 'q' || p.type === 'r')) return true

  let bishops = 0
  let knights = 0
  for (const p of pieces) {
    if (p.type === 'b') bishops += 1
    else if (p.type === 'n') knights += 1
  }

  if (bishops >= 2) return true
  if (bishops >= 1 && knights >= 1) return true
  if (knights >= 2) return true

  if (pieces.length === 1 && (pieces[0]!.type === 'b' || pieces[0]!.type === 'n')) return false

  return false
}

function isInsufficientMaterial(position: Position): boolean {
  if (hasMatingMaterial(position, 'w')) return false
  if (hasMatingMaterial(position, 'b')) return false
  return true
}

function computeOutcome(
  position: Position,
  repetition: Map<string, number>,
): GameOutcome {
  const legal = getLegalMoves(position)
  if (legal.length === 0) {
    if (isInCheck(position, position.turn)) return { kind: 'checkmate', winner: opposite(position.turn) }
    return { kind: 'stalemate' }
  }

  if (isInsufficientMaterial(position)) return { kind: 'draw_insufficient' }

  const key = positionKey(position)
  const repeats = repetition.get(key) ?? 0

  // Mandatory FIDE automatic draw thresholds.
  if (repeats >= 5) return { kind: 'draw_fivefold_repetition' }
  if (position.halfmoveClock >= 150) return { kind: 'draw_seventy_five_move' }

  // Claimable thresholds are auto-applied in this UI.
  if (repeats >= 3) return { kind: 'draw_repetition' }
  if (position.halfmoveClock >= 100) return { kind: 'draw_fifty_move' }

  return { kind: 'active' }
}

export function createGameState(id: string): GameState {
  const position = createInitialPosition()
  const repetition = new Map<string, number>()
  repetition.set(positionKey(position), 1)
  return {
    id,
    position,
    history: [],
    repetition,
    outcome: { kind: 'active' },
  }
}

function normalizeMove(move: Move): string {
  return `${move.from}-${move.to}-${move.promotion ?? ''}`
}

export function makeGameMove(game: GameState, move: Move): GameState {
  if (game.outcome.kind !== 'active') return game

  const legal = getLegalMoves(game.position)
  const key = normalizeMove(move)
  const found = legal.find((m) => normalizeMove(m) === key)
  if (!found) throw new Error('makeGameMove: illegal move')

  const san = moveToSan(game.position, found)
  const applied = applyMove(game.position, found)
  const next = applied.next

  const repetition = new Map(game.repetition)
  const nextKey = positionKey(next)
  repetition.set(nextKey, (repetition.get(nextKey) ?? 0) + 1)

  const outcome = computeOutcome(next, repetition)

  const capture =
    applied.captured && applied.capturedSquare !== null
      ? { piece: applied.captured, square: applied.capturedSquare }
      : undefined

  return {
    ...game,
    position: next,
    history: [...game.history, { move: found, san, positionKeyAfter: nextKey, capture }],
    repetition,
    outcome,
  }
}

export function resetGame(game: GameState): GameState {
  return createGameState(game.id)
}

export function resignGame(game: GameState, loser: Color = game.position.turn): GameState {
  if (game.outcome.kind !== 'active') return game
  return {
    ...game,
    outcome: { kind: 'resignation', winner: opposite(loser) },
  }
}

export function timeoutGame(game: GameState, loser: Color = game.position.turn): GameState {
  if (game.outcome.kind !== 'active') return game
  const winner = opposite(loser)
  const winnerHasMatingMaterial = hasMatingMaterial(game.position, winner)
  return {
    ...game,
    outcome: winnerHasMatingMaterial ? { kind: 'timeout', winner } : { kind: 'draw_insufficient' },
  }
}

export function drawByAgreement(game: GameState): GameState {
  if (game.outcome.kind !== 'active') return game
  return {
    ...game,
    outcome: { kind: 'draw_agreement' },
  }
}
