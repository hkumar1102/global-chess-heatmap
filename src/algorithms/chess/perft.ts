import { applyMove } from './apply'
import { getLegalMoves } from './movegen'
import type { Position } from './types'

export function perft(position: Position, depth: number): number {
  if (depth === 0) return 1
  const moves = getLegalMoves(position)
  let nodes = 0
  for (const mv of moves) {
    const { next } = applyMove(position, mv)
    nodes += perft(next, depth - 1)
  }
  return nodes
}

