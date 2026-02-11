import { fileOf, rankOf, squareOf } from './coords'
import { isInCheck } from './movegen'
import { PIECE_VALUE_CP } from './pieceValues'
import type { Piece, Position } from './types'

// Small positional nudges (white perspective). Values are intentionally modest: minimax depth is shallow.
const KNIGHT_PST: number[][] = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
]

const PAWN_PST: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [0, 0, 0, 0, 0, 0, 0, 0],
]

function pst(piece: Piece, square: number): number {
  const f = fileOf(square)
  const r = rankOf(square)
  const rr = piece.color === 'w' ? r : 7 - r
  switch (piece.type) {
    case 'p':
      return PAWN_PST[rr]![f]!
    case 'n':
      return KNIGHT_PST[rr]![f]!
    default:
      return 0
  }
}

function countCenterControl(position: Position): number {
  const centers = [
    squareOf(3, 3)!,
    squareOf(4, 3)!,
    squareOf(3, 4)!,
    squareOf(4, 4)!,
  ]
  let score = 0
  for (const sq of centers) {
    const p = position.board[sq]
    if (!p) continue
    score += p.color === 'w' ? 6 : -6
  }
  return score
}

export function evaluate(position: Position): number {
  // Positive favors White.
  let score = 0
  for (let sq = 0; sq < 64; sq += 1) {
    const p = position.board[sq]
    if (!p) continue
    const base = PIECE_VALUE_CP[p.type] + pst(p, sq)
    score += p.color === 'w' ? base : -base
  }
  score += countCenterControl(position)

  // Small penalty for being in check to encourage king safety in shallow search.
  if (isInCheck(position, position.turn)) score += position.turn === 'w' ? -35 : 35
  return score
}
