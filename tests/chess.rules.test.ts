import { describe, expect, test } from 'vitest'
import { applyMove } from '../src/algorithms/chess/apply'
import { createGameState, makeGameMove } from '../src/algorithms/chess/game'
import { fromAlgebraic } from '../src/algorithms/chess/coords'
import { getLegalMovesFrom } from '../src/algorithms/chess/movegen'
import { positionFromFen } from '../src/algorithms/chess/position'

function sq(a: string): number {
  const s = fromAlgebraic(a)
  if (s === null) throw new Error(`bad square ${a}`)
  return s
}

describe('special rules', () => {
  test('en passant capture is generated and applied', () => {
    let g = createGameState('t')
    g = makeGameMove(g, { from: sq('e2'), to: sq('e4') })
    g = makeGameMove(g, { from: sq('a7'), to: sq('a6') })
    g = makeGameMove(g, { from: sq('e4'), to: sq('e5') })
    g = makeGameMove(g, { from: sq('d7'), to: sq('d5') })

    const moves = getLegalMovesFrom(g.position, sq('e5'))
    const ep = moves.find((m) => m.to === sq('d6'))
    expect(ep).toBeTruthy()
    const applied = applyMove(g.position, ep!)
    expect(applied.isEnPassant).toBe(true)
    expect(applied.captured?.type).toBe('p')
    expect(applied.next.board[sq('d5')]).toBeNull()
    expect(applied.next.board[sq('d6')]?.type).toBe('p')
  })

  test('promotion generates 4 options', () => {
    const pos = positionFromFen('8/P7/8/8/8/8/8/k6K w - - 0 1')
    const moves = getLegalMovesFrom(pos, sq('a7'))
    const promos = moves.filter((m) => m.to === sq('a8'))
    expect(promos.map((m) => m.promotion).sort()).toEqual(['b', 'n', 'q', 'r'])
  })

  test('castling moves rook and king', () => {
    let g = createGameState('c')
    g = makeGameMove(g, { from: sq('e2'), to: sq('e4') })
    g = makeGameMove(g, { from: sq('a7'), to: sq('a6') })
    g = makeGameMove(g, { from: sq('g1'), to: sq('f3') })
    g = makeGameMove(g, { from: sq('a6'), to: sq('a5') })
    g = makeGameMove(g, { from: sq('f1'), to: sq('e2') })
    g = makeGameMove(g, { from: sq('a5'), to: sq('a4') })

    const kingMoves = getLegalMovesFrom(g.position, sq('e1'))
    const castle = kingMoves.find((m) => m.to === sq('g1'))
    expect(castle).toBeTruthy()
    const applied = applyMove(g.position, castle!)
    expect(applied.isCastle).toBe(true)
    expect(applied.next.board[sq('g1')]?.type).toBe('k')
    expect(applied.next.board[sq('f1')]?.type).toBe('r')
  })
})
