import { applyMove } from './apply'
import { fileOf, rankOf, toAlgebraic } from './coords'
import { getLegalMoves, isInCheck } from './movegen'
import type { Move, PieceType, Position } from './types'

const PIECE_SAN: Record<PieceType, string> = {
  p: '',
  n: 'N',
  b: 'B',
  r: 'R',
  q: 'Q',
  k: 'K',
}

function sameMove(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.promotion === b.promotion
}

function isCastleMove(position: Position, move: Move): boolean {
  const piece = position.board[move.from]
  if (!piece || piece.type !== 'k') return false
  return Math.abs(fileOf(move.to) - fileOf(move.from)) === 2
}

function isEnPassant(position: Position, move: Move): boolean {
  const piece = position.board[move.from]
  if (!piece || piece.type !== 'p') return false
  if (position.enPassant === null) return false
  return move.to === position.enPassant && position.board[move.to] === null && Math.abs(fileOf(move.to) - fileOf(move.from)) === 1
}

function isCapture(position: Position, move: Move): boolean {
  if (isEnPassant(position, move)) return true
  const target = position.board[move.to]
  return target !== null && target.color !== position.turn
}

function disambiguation(position: Position, move: Move): string {
  const moving = position.board[move.from]
  if (!moving || moving.type === 'p') return ''

  const legal = getLegalMoves(position)
  const rivals = legal.filter((m) => {
    if (sameMove(m, move)) return false
    if (m.to !== move.to) return false
    const p = position.board[m.from]
    return !!p && p.color === moving.color && p.type === moving.type
  })
  if (rivals.length === 0) return ''

  const fromFile = fileOf(move.from)
  const fromRank = rankOf(move.from)

  const hasSameFile = rivals.some((m) => fileOf(m.from) === fromFile)
  const hasSameRank = rivals.some((m) => rankOf(m.from) === fromRank)

  if (!hasSameFile) return String.fromCharCode(97 + fromFile)
  if (!hasSameRank) return String(fromRank + 1)
  return `${String.fromCharCode(97 + fromFile)}${fromRank + 1}`
}

export function moveToSan(position: Position, move: Move): string {
  if (isCastleMove(position, move)) {
    const kingSide = fileOf(move.to) === 6
    const san = kingSide ? 'O-O' : 'O-O-O'
    const { next } = applyMove(position, move)
    const check = isInCheck(next, next.turn)
    if (!check) return san
    const replies = getLegalMoves(next)
    return replies.length === 0 ? `${san}#` : `${san}+`
  }

  const moving = position.board[move.from]
  if (!moving) throw new Error('moveToSan: missing moving piece')

  const capture = isCapture(position, move)
  const promo = move.promotion

  let san = ''
  san += PIECE_SAN[moving.type]
  san += disambiguation(position, move)

  if (moving.type === 'p' && capture) san += String.fromCharCode(97 + fileOf(move.from))
  if (capture) san += 'x'
  san += toAlgebraic(move.to)

  if (promo) san += `=${PIECE_SAN[promo as PieceType] || promo.toUpperCase()}`

  const { next } = applyMove(position, move)
  const check = isInCheck(next, next.turn)
  if (!check) return san
  const replies = getLegalMoves(next)
  return replies.length === 0 ? `${san}#` : `${san}+`
}
