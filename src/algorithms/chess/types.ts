export type Color = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type PromotionPieceType = Exclude<PieceType, 'p' | 'k'>

export type Square = number

export interface Piece {
  id: string
  color: Color
  type: PieceType
}

export interface CastlingRights {
  wk: boolean
  wq: boolean
  bk: boolean
  bq: boolean
}

export interface Position {
  board: Array<Piece | null>
  turn: Color
  castling: CastlingRights
  enPassant: Square | null
  halfmoveClock: number
  fullmoveNumber: number
}

export interface Move {
  from: Square
  to: Square
  promotion?: PromotionPieceType
}

export type GameOutcome =
  | { kind: 'active' }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'resignation'; winner: Color }
  | { kind: 'timeout'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'draw_agreement' }
  | { kind: 'draw_fifty_move' }
  | { kind: 'draw_seventy_five_move' }
  | { kind: 'draw_repetition' }
  | { kind: 'draw_fivefold_repetition' }
  | { kind: 'draw_insufficient' }

export interface MoveRecord {
  move: Move
  san: string
  positionKeyAfter: string
  capture?: { piece: Piece; square: Square }
}

export interface GameState {
  id: string
  position: Position
  history: MoveRecord[]
  repetition: Map<string, number>
  outcome: GameOutcome
}
