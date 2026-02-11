import { createGameState, makeGameMove } from './game'
import type { GameState, Move } from './types'

export function replayGame(id: string, moves: readonly Move[]): GameState {
  let game = createGameState(id)
  for (const mv of moves) {
    game = makeGameMove(game, mv)
  }
  return game
}

