import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { applyMove } from '../algorithms/chess/apply'
import type { ServerMessage, ServerSnapshotDTO } from './types'
import { openServerSocket } from './api'

export const SERVER_SNAPSHOT_QUERY_KEY = ['server', 'snapshot'] as const

function parseServerMessage(data: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(data) as ServerMessage
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function useServerConnection(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = openServerSocket()
    const handleOpen = () => {
      socket.send(JSON.stringify({ type: 'subscribe', channels: ['games'] }))
    }

    const handleMessage = (ev: MessageEvent<string>) => {
      const msg = parseServerMessage(ev.data)
      if (!msg) return

      queryClient.setQueryData<ServerSnapshotDTO>(SERVER_SNAPSHOT_QUERY_KEY, (prev) => {
        if (!prev) return prev

        if (msg.type === 'game_reset') {
          const games = prev.games.filter((g) => g.id !== msg.game.id)
          games.push(msg.game)
          games.sort((a, b) => b.startedAt - a.startedAt)
          return { ...prev, games }
        }

        const gameIndex = prev.games.findIndex((g) => g.id === msg.gameId)
        if (gameIndex === -1) return prev

        const prevGame = prev.games[gameIndex]!
        let nextPosition = prevGame.position
        try {
          nextPosition = applyMove(prevGame.position, msg.move).next
        } catch {
          return prev
        }

        const games = prev.games.slice()
        games[gameIndex] = {
          ...prevGame,
          position: nextPosition,
          ply: msg.ply,
          outcome: msg.outcome,
          lastMove: { san: msg.san, move: msg.move },
        }

        const heatmapCounts = prev.heatmapCounts.slice()
        for (const u of msg.heatmapUpdates) {
          if (Number.isInteger(u.square) && u.square >= 0 && u.square < 64) heatmapCounts[u.square] = u.count
        }

        return { ...prev, games, heatmapCounts }
      })
    }

    socket.addEventListener('open', handleOpen)
    socket.addEventListener('message', handleMessage as unknown as EventListener)

    return () => {
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('message', handleMessage as unknown as EventListener)
      socket.close()
    }
  }, [queryClient])
}

