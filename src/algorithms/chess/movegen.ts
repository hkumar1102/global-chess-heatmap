import { fileOf, rankOf, squareOf } from './coords'
import { applyMove } from './apply'
import type { CastlingRights, Color, Move, Piece, Position, Square } from './types'

function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

const KNIGHT_DELTAS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
] as const

const KING_DELTAS = [
  [1, 1],
  [1, 0],
  [1, -1],
  [0, 1],
  [0, -1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const

const BISHOP_DELTAS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

const ROOK_DELTAS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

const QUEEN_DELTAS = [...BISHOP_DELTAS, ...ROOK_DELTAS] as const

function findKingSquare(position: Position, color: Color): Square {
  for (let sq = 0 as Square; sq < 64; sq += 1) {
    const piece = position.board[sq]
    if (piece && piece.color === color && piece.type === 'k') return sq
  }
  throw new Error('findKingSquare: king missing')
}

function addMove(out: Move[], from: Square, to: Square, promotion?: Move['promotion']): void {
  if (promotion) out.push({ from, to, promotion })
  else out.push({ from, to })
}

function canCaptureTarget(target: Piece | null, ownColor: Color): boolean {
  return target !== null && target.color !== ownColor && target.type !== 'k'
}

function pieceAttacksSquare(position: Position, from: Square, piece: Piece, target: Square): boolean {
  if (from === target) return false
  const fromFile = fileOf(from)
  const fromRank = rankOf(from)
  const targetFile = fileOf(target)
  const targetRank = rankOf(target)
  const df = targetFile - fromFile
  const dr = targetRank - fromRank

  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1
      return dr === dir && (df === 1 || df === -1)
    }
    case 'n':
      return (
        (Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1)
      )
    case 'b': {
      if (Math.abs(df) !== Math.abs(dr)) return false
      const stepF = Math.sign(df)
      const stepR = Math.sign(dr)
      let f = fromFile + stepF
      let r = fromRank + stepR
      while (f !== targetFile && r !== targetRank) {
        const sq = squareOf(f, r)
        if (sq === null) return false
        if (position.board[sq]) return false
        f += stepF
        r += stepR
      }
      return true
    }
    case 'r': {
      if (df !== 0 && dr !== 0) return false
      const stepF = df === 0 ? 0 : Math.sign(df)
      const stepR = dr === 0 ? 0 : Math.sign(dr)
      let f = fromFile + stepF
      let r = fromRank + stepR
      while (f !== targetFile || r !== targetRank) {
        const sq = squareOf(f, r)
        if (sq === null) return false
        if (sq === target) return true
        if (position.board[sq]) return false
        f += stepF
        r += stepR
      }
      return true
    }
    case 'q': {
      if (df === 0 || dr === 0) {
        const stepF = df === 0 ? 0 : Math.sign(df)
        const stepR = dr === 0 ? 0 : Math.sign(dr)
        let f = fromFile + stepF
        let r = fromRank + stepR
        while (f !== targetFile || r !== targetRank) {
          const sq = squareOf(f, r)
          if (sq === null) return false
          if (sq === target) return true
          if (position.board[sq]) return false
          f += stepF
          r += stepR
        }
        return true
      }
      if (Math.abs(df) !== Math.abs(dr)) return false
      const stepF = Math.sign(df)
      const stepR = Math.sign(dr)
      let f = fromFile + stepF
      let r = fromRank + stepR
      while (f !== targetFile && r !== targetRank) {
        const sq = squareOf(f, r)
        if (sq === null) return false
        if (position.board[sq]) return false
        f += stepF
        r += stepR
      }
      return true
    }
    case 'k':
      return Math.max(Math.abs(df), Math.abs(dr)) === 1
    default: {
      const _exhaustive: never = piece.type
      return _exhaustive
    }
  }
}

export function isSquareAttacked(position: Position, square: Square, byColor: Color): boolean {
  // Pawns
  const targetFile = fileOf(square)
  const targetRank = rankOf(square)
  const pawnDir = byColor === 'w' ? -1 : 1
  for (const df of [-1, 1]) {
    const from = squareOf(targetFile + df, targetRank + pawnDir)
    if (from === null) continue
    const p = position.board[from]
    if (p && p.color === byColor && p.type === 'p') return true
  }

  // Knights
  for (const [df, dr] of KNIGHT_DELTAS) {
    const from = squareOf(targetFile + df, targetRank + dr)
    if (from === null) continue
    const p = position.board[from]
    if (p && p.color === byColor && p.type === 'n') return true
  }

  // Kings
  for (const [df, dr] of KING_DELTAS) {
    const from = squareOf(targetFile + df, targetRank + dr)
    if (from === null) continue
    const p = position.board[from]
    if (p && p.color === byColor && p.type === 'k') return true
  }

  // Sliding pieces
  for (const [df, dr] of QUEEN_DELTAS) {
    let f = targetFile + df
    let r = targetRank + dr
    while (true) {
      const from = squareOf(f, r)
      if (from === null) break
      const p = position.board[from]
      if (p) {
        if (p.color === byColor) {
          if (df === 0 || dr === 0) {
            if (p.type === 'r' || p.type === 'q') return true
          } else {
            if (p.type === 'b' || p.type === 'q') return true
          }
        }
        break
      }
      f += df
      r += dr
    }
  }

  return false
}

export function isInCheck(position: Position, color: Color): boolean {
  const king = findKingSquare(position, color)
  return isSquareAttacked(position, king, opposite(color))
}

function canCastle(
  position: Position,
  color: Color,
  side: 'king' | 'queen',
  rights: CastlingRights,
): boolean {
  const rank = color === 'w' ? 0 : 7
  const kingFrom = squareOf(4, rank)!
  const rookFrom = squareOf(side === 'king' ? 7 : 0, rank)!
  const throughFiles = side === 'king' ? [5, 6] : [3, 2]
  const emptyFiles = side === 'king' ? [5, 6] : [3, 2, 1]

  const king = position.board[kingFrom]
  const rook = position.board[rookFrom]
  if (!king || king.type !== 'k' || king.color !== color) return false
  if (!rook || rook.type !== 'r' || rook.color !== color) return false

  const allowed =
    color === 'w'
      ? side === 'king'
        ? rights.wk
        : rights.wq
      : side === 'king'
        ? rights.bk
        : rights.bq
  if (!allowed) return false

  for (const f of emptyFiles) {
    const sq = squareOf(f, rank)!
    if (position.board[sq]) return false
  }

  if (isInCheck(position, color)) return false

  for (const f of throughFiles) {
    const sq = squareOf(f, rank)!
    if (isSquareAttacked(position, sq, opposite(color))) return false
  }

  const kingTo = squareOf(side === 'king' ? 6 : 2, rank)!
  if (isSquareAttacked(position, kingTo, opposite(color))) return false

  return true
}

function generatePseudoMovesForSquare(position: Position, from: Square): Move[] {
  const piece = position.board[from]
  if (!piece || piece.color !== position.turn) return []

  const out: Move[] = []
  const fromFile = fileOf(from)
  const fromRank = rankOf(from)

  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1
      const startRank = piece.color === 'w' ? 1 : 6
      const promoteRank = piece.color === 'w' ? 7 : 0

      const one = squareOf(fromFile, fromRank + dir)
      if (one !== null && position.board[one] === null) {
        if (rankOf(one) === promoteRank) {
          for (const promotion of ['q', 'r', 'b', 'n'] as const) addMove(out, from, one, promotion)
        } else addMove(out, from, one)

        const two = squareOf(fromFile, fromRank + 2 * dir)
        if (fromRank === startRank && two !== null && position.board[two] === null) addMove(out, from, two)
      }

      for (const df of [-1, 1]) {
        const to = squareOf(fromFile + df, fromRank + dir)
        if (to === null) continue
        const target = position.board[to]
        const isEnPassant =
          position.enPassant !== null &&
          to === position.enPassant &&
          target === null &&
          (() => {
            const capturedSq = piece.color === 'w' ? ((to - 8) as Square) : ((to + 8) as Square)
            const captured = position.board[capturedSq]
            return !!captured && captured.type === 'p' && captured.color !== piece.color
          })()
        const isCapture = canCaptureTarget(target, piece.color)
        if (!isCapture && !isEnPassant) continue

        if (rankOf(to) === promoteRank) {
          for (const promotion of ['q', 'r', 'b', 'n'] as const) addMove(out, from, to, promotion)
        } else addMove(out, from, to)
      }
      return out
    }
    case 'n': {
      for (const [df, dr] of KNIGHT_DELTAS) {
        const to = squareOf(fromFile + df, fromRank + dr)
        if (to === null) continue
        const target = position.board[to]
        if (!target || canCaptureTarget(target, piece.color)) addMove(out, from, to)
      }
      return out
    }
    case 'b':
    case 'r':
    case 'q': {
      const deltas = piece.type === 'b' ? BISHOP_DELTAS : piece.type === 'r' ? ROOK_DELTAS : QUEEN_DELTAS
      for (const [df, dr] of deltas) {
        let f = fromFile + df
        let r = fromRank + dr
        while (true) {
          const to = squareOf(f, r)
          if (to === null) break
          const target = position.board[to]
          if (!target) {
            addMove(out, from, to)
          } else {
            if (canCaptureTarget(target, piece.color)) addMove(out, from, to)
            break
          }
          f += df
          r += dr
        }
      }
      return out
    }
    case 'k': {
      for (const [df, dr] of KING_DELTAS) {
        const to = squareOf(fromFile + df, fromRank + dr)
        if (to === null) continue
        const target = position.board[to]
        if (!target || canCaptureTarget(target, piece.color)) addMove(out, from, to)
      }

      if (piece.color === position.turn) {
        if (canCastle(position, piece.color, 'king', position.castling)) {
          const to = squareOf(6, piece.color === 'w' ? 0 : 7)!
          addMove(out, from, to)
        }
        if (canCastle(position, piece.color, 'queen', position.castling)) {
          const to = squareOf(2, piece.color === 'w' ? 0 : 7)!
          addMove(out, from, to)
        }
      }
      return out
    }
    default: {
      const _exhaustive: never = piece.type
      return _exhaustive
    }
  }
}

export function getLegalMoves(position: Position): Move[] {
  const out: Move[] = []
  for (let from = 0 as Square; from < 64; from += 1) {
    const pseudo = generatePseudoMovesForSquare(position, from)
    for (const mv of pseudo) out.push(mv)
  }

  const color = position.turn
  return out.filter((mv) => {
    const { next } = applyMove(position, mv)
    return !isInCheck(next, color)
  })
}

export function getLegalMovesFrom(position: Position, from: Square): Move[] {
  const pseudo = generatePseudoMovesForSquare(position, from)
  const color = position.turn
  return pseudo.filter((mv) => {
    const { next } = applyMove(position, mv)
    return !isInCheck(next, color)
  })
}

export function getAttackers(position: Position, square: Square, byColor: Color): Square[] {
  const attackers: Square[] = []
  for (let from = 0 as Square; from < 64; from += 1) {
    const p = position.board[from]
    if (!p || p.color !== byColor) continue
    if (pieceAttacksSquare(position, from, p, square)) attackers.push(from)
  }
  return attackers
}

export function getThreatPaths(position: Position, from: Square): Square[][] {
  const piece = position.board[from]
  if (!piece) return []

  const fromFile = fileOf(from)
  const fromRank = rankOf(from)

  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1
      const paths: Square[][] = []
      for (const df of [-1, 1]) {
        const to = squareOf(fromFile + df, fromRank + dir)
        if (to !== null) paths.push([to])
      }
      return paths
    }
    case 'n': {
      const paths: Square[][] = []
      for (const [df, dr] of KNIGHT_DELTAS) {
        const to = squareOf(fromFile + df, fromRank + dr)
        if (to !== null) paths.push([to])
      }
      return paths
    }
    case 'k': {
      const paths: Square[][] = []
      for (const [df, dr] of KING_DELTAS) {
        const to = squareOf(fromFile + df, fromRank + dr)
        if (to !== null) paths.push([to])
      }
      return paths
    }
    case 'b':
    case 'r':
    case 'q': {
      const deltas = piece.type === 'b' ? BISHOP_DELTAS : piece.type === 'r' ? ROOK_DELTAS : QUEEN_DELTAS
      const paths: Square[][] = []
      for (const [df, dr] of deltas) {
        const ray: Square[] = []
        let f = fromFile + df
        let r = fromRank + dr
        while (true) {
          const sq = squareOf(f, r)
          if (sq === null) break
          ray.push(sq)
          if (position.board[sq]) break
          f += df
          r += dr
        }
        if (ray.length > 0) paths.push(ray)
      }
      return paths
    }
    default: {
      const _exhaustive: never = piece.type
      return _exhaustive
    }
  }
}
