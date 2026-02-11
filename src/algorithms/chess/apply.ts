import { fileOf, rankOf, squareOf } from './coords'
import type { CastlingRights, Color, Move, Piece, Position, PromotionPieceType, Square } from './types'

export interface AppliedMove {
  next: Position
  captured: Piece | null
  capturedSquare: Square | null
  isEnPassant: boolean
  isCastle: boolean
  isPromotion: boolean
}

function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

function cloneCastling(c: CastlingRights): CastlingRights {
  return { wk: c.wk, wq: c.wq, bk: c.bk, bq: c.bq }
}

function isPromotionPieceType(type: string): type is PromotionPieceType {
  return type === 'q' || type === 'r' || type === 'b' || type === 'n'
}

function clearCastlingForColor(c: CastlingRights, color: Color): void {
  if (color === 'w') {
    c.wk = false
    c.wq = false
  } else {
    c.bk = false
    c.bq = false
  }
}

export function applyMove(position: Position, move: Move): AppliedMove {
  const moving = position.board[move.from]
  if (!moving) throw new Error('applyMove: missing moving piece')
  if (moving.color !== position.turn) throw new Error('applyMove: wrong turn')

  const board = position.board.slice()
  const castling = cloneCastling(position.castling)

  const fromFile = fileOf(move.from)
  const fromRank = rankOf(move.from)
  const toFile = fileOf(move.to)
  const toRank = rankOf(move.to)

  let captured: Piece | null = null
  let capturedSquare: Square | null = null
  let isEnPassant = false
  let isCastle = false
  let isPromotion = false

  const target = board[move.to]

  if (
    moving.type === 'p' &&
    position.enPassant !== null &&
    move.to === position.enPassant &&
    target === null &&
    Math.abs(toFile - fromFile) === 1
  ) {
    isEnPassant = true
    capturedSquare = moving.color === 'w' ? ((move.to - 8) as Square) : ((move.to + 8) as Square)
    captured = board[capturedSquare]
    if (!captured || captured.type !== 'p' || captured.color === moving.color) {
      throw new Error('applyMove: invalid en passant capture')
    }
    board[capturedSquare] = null
  } else if (target) {
    captured = target
    capturedSquare = move.to
  }

  board[move.from] = null

  if (moving.type === 'k' && Math.abs(toFile - fromFile) === 2 && fromRank === toRank) {
    isCastle = true
    board[move.to] = moving

    const isKingSide = toFile === 6
    const rookFrom = squareOf(isKingSide ? 7 : 0, fromRank)
    const rookTo = squareOf(isKingSide ? 5 : 3, fromRank)
    if (rookFrom === null || rookTo === null) throw new Error('applyMove: invalid castling squares')

    const rook = board[rookFrom]
    if (!rook || rook.type !== 'r' || rook.color !== moving.color) {
      throw new Error('applyMove: missing rook for castling')
    }
    board[rookFrom] = null
    board[rookTo] = rook
    clearCastlingForColor(castling, moving.color)
  } else {
    if (moving.type === 'p' && (toRank === 7 || toRank === 0)) {
      const promo = move.promotion ?? 'q'
      if (!isPromotionPieceType(promo)) throw new Error('applyMove: invalid promotion type')
      board[move.to] = { ...moving, type: promo }
      isPromotion = true
    } else {
      board[move.to] = moving
    }
  }

  const a1 = 0 as Square
  const h1 = 7 as Square
  const e1 = 4 as Square
  const a8 = 56 as Square
  const h8 = 63 as Square
  const e8 = 60 as Square

  if (moving.type === 'k') clearCastlingForColor(castling, moving.color)

  if (moving.type === 'r') {
    if (moving.color === 'w') {
      if (move.from === a1) castling.wq = false
      if (move.from === h1) castling.wk = false
    } else {
      if (move.from === a8) castling.bq = false
      if (move.from === h8) castling.bk = false
    }
  }

  if (captured && captured.type === 'r' && capturedSquare !== null) {
    if (captured.color === 'w') {
      if (capturedSquare === a1) castling.wq = false
      if (capturedSquare === h1) castling.wk = false
    } else {
      if (capturedSquare === a8) castling.bq = false
      if (capturedSquare === h8) castling.bk = false
    }
  }

  if (moving.type === 'k') {
    if (moving.color === 'w' && move.from !== e1) clearCastlingForColor(castling, 'w')
    if (moving.color === 'b' && move.from !== e8) clearCastlingForColor(castling, 'b')
  }

  let enPassant: Square | null = null
  if (moving.type === 'p' && fromFile === toFile && Math.abs(toRank - fromRank) === 2) {
    const midRank = (fromRank + toRank) / 2
    const midSq = squareOf(fromFile, midRank)
    if (midSq === null) throw new Error('applyMove: invalid en passant square')
    enPassant = midSq
  }

  const isCapture = captured !== null
  const isPawnMove = moving.type === 'p'
  const halfmoveClock = isPawnMove || isCapture ? 0 : position.halfmoveClock + 1
  const fullmoveNumber = position.turn === 'b' ? position.fullmoveNumber + 1 : position.fullmoveNumber

  return {
    next: {
      board,
      turn: opposite(position.turn),
      castling,
      enPassant,
      halfmoveClock,
      fullmoveNumber,
    },
    captured,
    capturedSquare,
    isEnPassant,
    isCastle,
    isPromotion,
  }
}

