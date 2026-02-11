import { fromAlgebraic, rankOf, squareOf, toAlgebraic } from './coords'
import type { CastlingRights, Color, Piece, PieceType, Position } from './types'

const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function createEmptyBoard(): Array<Piece | null> {
  return Array.from({ length: 64 }, () => null)
}

function pieceTypeFromFenChar(char: string): PieceType | null {
  switch (char.toLowerCase()) {
    case 'p':
    case 'n':
    case 'b':
    case 'r':
    case 'q':
    case 'k':
      return char.toLowerCase() as PieceType
    default:
      return null
  }
}

function colorFromFenChar(char: string): Color | null {
  if (char >= 'A' && char <= 'Z') return 'w'
  if (char >= 'a' && char <= 'z') return 'b'
  return null
}

function parseCastling(text: string): CastlingRights {
  return {
    wk: text.includes('K'),
    wq: text.includes('Q'),
    bk: text.includes('k'),
    bq: text.includes('q'),
  }
}

function castlingToFen(c: CastlingRights): string {
  const out = `${c.wk ? 'K' : ''}${c.wq ? 'Q' : ''}${c.bk ? 'k' : ''}${c.bq ? 'q' : ''}`
  return out.length === 0 ? '-' : out
}

export function createInitialPosition(): Position {
  return positionFromFen(START_FEN)
}

export function positionKey(position: Position): string {
  let pieces = ''
  for (let i = 0; i < 64; i += 1) {
    const p = position.board[i]
    if (!p) pieces += '.'
    else pieces += p.color === 'w' ? p.type.toUpperCase() : p.type
  }
  const ep = position.enPassant === null ? '-' : toAlgebraic(position.enPassant)
  return `${pieces}|${position.turn}|${castlingToFen(position.castling)}|${ep}`
}

export function positionFromFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/)
  if (parts.length !== 6) throw new Error(`Invalid FEN: expected 6 fields, got ${parts.length}`)
  const [placement, active, castlingText, epText, halfmoveText, fullmoveText] = parts

  const board = createEmptyBoard()
  const ranks = placement.split('/')
  if (ranks.length !== 8) throw new Error('Invalid FEN: expected 8 ranks')

  for (let fenRank = 0; fenRank < 8; fenRank += 1) {
    const rankStr = ranks[fenRank]
    const rank = 7 - fenRank
    let file = 0
    for (const ch of rankStr) {
      if (file > 7) throw new Error('Invalid FEN: file overflow')
      if (ch >= '1' && ch <= '8') {
        file += Number(ch)
        continue
      }
      const type = pieceTypeFromFenChar(ch)
      const color = colorFromFenChar(ch)
      if (!type || !color) throw new Error(`Invalid FEN: bad piece char '${ch}'`)
      const sq = squareOf(file, rank)
      if (sq === null) throw new Error('Invalid FEN: bad square')
      const id = `${color}${type}@${toAlgebraic(sq)}`
      board[sq] = { id, type, color }
      file += 1
    }
    if (file !== 8) throw new Error('Invalid FEN: rank does not have 8 files')
  }

  if (active !== 'w' && active !== 'b') throw new Error('Invalid FEN: active color must be w or b')
  const castling = castlingText === '-' ? { wk: false, wq: false, bk: false, bq: false } : parseCastling(castlingText)
  const enPassant = epText === '-' ? null : fromAlgebraic(epText)
  if (epText !== '-' && enPassant === null) throw new Error('Invalid FEN: en passant square')
  const halfmoveClock = Number(halfmoveText)
  const fullmoveNumber = Number(fullmoveText)
  if (!Number.isInteger(halfmoveClock) || halfmoveClock < 0) throw new Error('Invalid FEN: halfmove clock')
  if (!Number.isInteger(fullmoveNumber) || fullmoveNumber < 1) throw new Error('Invalid FEN: fullmove number')

  // Basic en-passant sanity (not exhaustive): only allow target squares on ranks 3/6.
  if (enPassant !== null) {
    const r = rankOf(enPassant)
    if (r !== 2 && r !== 5) throw new Error('Invalid FEN: en passant target rank')
  }

  return {
    board,
    turn: active,
    castling,
    enPassant,
    halfmoveClock,
    fullmoveNumber,
  }
}
