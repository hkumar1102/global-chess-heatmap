import type { GameOutcome, Move, Position } from '../algorithms/chess/types'

export interface LiveGameDTO {
  id: string
  white: string
  black: string
  startedAt: number
  ply: number
  position: Position
  outcome: GameOutcome
  lastMove?: { san: string; move: Move }
}

export type HeatmapCountsDTO = number[] // length 64

export interface ServerSnapshotDTO {
  games: LiveGameDTO[]
  heatmapCounts: HeatmapCountsDTO
}

export type ClientMessage =
  | { type: 'subscribe'; channels: Array<'games'> }
  | { type: 'unsubscribe' }

export type ServerMessage =
  | {
      type: 'game_update'
      gameId: string
      move: Move
      san: string
      ply: number
      outcome: GameOutcome
      heatmapUpdates: Array<{ square: number; count: number }>
    }
  | { type: 'game_reset'; game: LiveGameDTO }

