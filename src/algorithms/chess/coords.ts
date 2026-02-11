import type { Square } from './types'

export type File = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export function fileOf(square: Square): File {
  return (square % 8) as File
}

export function rankOf(square: Square): Rank {
  return Math.floor(square / 8) as Rank
}

export function squareOf(file: number, rank: number): Square | null {
  if (!Number.isInteger(file) || !Number.isInteger(rank)) return null
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
  return (rank * 8 + file) as Square
}

export function toAlgebraic(square: Square): string {
  const file = fileOf(square)
  const rank = rankOf(square)
  return `${String.fromCharCode(97 + file)}${rank + 1}`
}

export function fromAlgebraic(text: string): Square | null {
  if (text.length !== 2) return null
  const fileChar = text[0]
  const rankChar = text[1]
  const file = fileChar.charCodeAt(0) - 97
  const rank = Number(rankChar) - 1
  return squareOf(file, rank)
}

export function squareColor(square: Square): 'light' | 'dark' {
  const f = fileOf(square)
  const r = rankOf(square)
  return (f + r) % 2 === 0 ? 'dark' : 'light'
}
