import type { Color, PieceType, Position } from './types'
import { PIECE_VALUE_CP } from './pieceValues'

export type PieceCounts = Record<PieceType, number>

function emptyCounts(): PieceCounts {
  return { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }
}

export function countPieces(position: Position): Record<Color, PieceCounts> {
  const out: Record<Color, PieceCounts> = { w: emptyCounts(), b: emptyCounts() }
  for (const p of position.board) {
    if (!p) continue
    out[p.color][p.type] += 1
  }
  return out
}

function materialForCounts(counts: PieceCounts): number {
  return (
    counts.p * PIECE_VALUE_CP.p +
    counts.n * PIECE_VALUE_CP.n +
    counts.b * PIECE_VALUE_CP.b +
    counts.r * PIECE_VALUE_CP.r +
    counts.q * PIECE_VALUE_CP.q
  )
}

export function computeMaterial(position: Position): {
  counts: Record<Color, PieceCounts>
  white: number
  black: number
  diff: number
} {
  const counts = countPieces(position)
  const white = materialForCounts(counts.w)
  const black = materialForCounts(counts.b)
  return { counts, white, black, diff: white - black }
}

