import { describe, expect, test } from 'vitest'
import { fromAlgebraic } from '../src/algorithms/chess/coords'
import { createGameState, drawByAgreement, makeGameMove, resignGame, timeoutGame } from '../src/algorithms/chess/game'
import { getLegalMoves, isInCheck } from '../src/algorithms/chess/movegen'
import { positionFromFen, positionKey } from '../src/algorithms/chess/position'
import type { GameState } from '../src/algorithms/chess/types'

function sq(a: string): number {
  const s = fromAlgebraic(a)
  if (s === null) throw new Error(`bad square ${a}`)
  return s
}

describe('game outcomes', () => {
  test("fool's mate is checkmate", () => {
    let g = createGameState('fool')
    g = makeGameMove(g, { from: sq('f2'), to: sq('f3') })
    g = makeGameMove(g, { from: sq('e7'), to: sq('e5') })
    g = makeGameMove(g, { from: sq('g2'), to: sq('g4') })
    g = makeGameMove(g, { from: sq('d8'), to: sq('h4') })

    expect(g.outcome.kind).toBe('checkmate')
    expect(g.outcome).toEqual({ kind: 'checkmate', winner: 'b' })

    expect(g.position.turn).toBe('w')
    expect(isInCheck(g.position, 'w')).toBe(true)
    expect(getLegalMoves(g.position)).toHaveLength(0)
  })

  test('threefold repetition ends game', () => {
    let g = createGameState('rep')

    g = makeGameMove(g, { from: sq('g1'), to: sq('f3') })
    g = makeGameMove(g, { from: sq('g8'), to: sq('f6') })
    g = makeGameMove(g, { from: sq('f3'), to: sq('g1') })
    g = makeGameMove(g, { from: sq('f6'), to: sq('g8') })

    g = makeGameMove(g, { from: sq('g1'), to: sq('f3') })
    g = makeGameMove(g, { from: sq('g8'), to: sq('f6') })
    g = makeGameMove(g, { from: sq('f3'), to: sq('g1') })
    g = makeGameMove(g, { from: sq('f6'), to: sq('g8') })

    expect(g.outcome).toEqual({ kind: 'draw_repetition' })
  })

  test('50-move rule ends game at halfmove 100', () => {
    const position = positionFromFen('4k3/8/8/8/8/8/8/KQ6 w - - 99 1')
    const g: GameState = {
      id: 'fifty',
      position,
      history: [],
      repetition: new Map([[positionKey(position), 1]]),
      outcome: { kind: 'active' },
    }

    const next = makeGameMove(g, { from: sq('b1'), to: sq('b2') })
    expect(next.outcome).toEqual({ kind: 'draw_fifty_move' })
  })

  test('capturing king is never generated as legal move', () => {
    const position = positionFromFen('4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1')
    const legal = getLegalMoves(position)
    const kingCapture = legal.find((mv) => mv.from === sq('e2') && mv.to === sq('e8'))
    expect(kingCapture).toBeUndefined()
  })

  test('checkmate takes precedence over 50-move draw threshold', () => {
    const position = positionFromFen('8/1Q6/2K5/k7/8/8/8/8 w - - 99 1')
    const g: GameState = {
      id: 'mate-priority',
      position,
      history: [],
      repetition: new Map([[positionKey(position), 1]]),
      outcome: { kind: 'active' },
    }

    const next = makeGameMove(g, { from: sq('b7'), to: sq('b5') })
    expect(next.outcome).toEqual({ kind: 'checkmate', winner: 'w' })
  })

  test('75-move mandatory draw triggers at halfmove 150', () => {
    const position = positionFromFen('4k3/8/8/8/8/8/6p1/2B1K3 w - - 149 1')
    const g: GameState = {
      id: 'seventy-five',
      position,
      history: [],
      repetition: new Map([[positionKey(position), 1]]),
      outcome: { kind: 'active' },
    }

    const next = makeGameMove(g, { from: sq('e1'), to: sq('f2') })
    expect(next.outcome).toEqual({ kind: 'draw_seventy_five_move' })
  })

  test('K+NN vs K is not dead position by rule', () => {
    const position = positionFromFen('8/8/8/8/8/8/NN6/K6k w - - 0 1')
    const g: GameState = {
      id: 'knights',
      position,
      history: [],
      repetition: new Map([[positionKey(position), 1]]),
      outcome: { kind: 'active' },
    }

    const next = makeGameMove(g, { from: sq('a2'), to: sq('c3') })
    expect(next.outcome.kind).toBe('active')
  })

  test('resignation ends game immediately', () => {
    const g = createGameState('resign')
    const resigned = resignGame(g, 'w')
    expect(resigned.outcome).toEqual({ kind: 'resignation', winner: 'b' })
  })

  test('draw agreement ends game immediately', () => {
    const g = createGameState('agree')
    const drawn = drawByAgreement(g)
    expect(drawn.outcome).toEqual({ kind: 'draw_agreement' })
  })

  test('timeout awards win when winner has mating material', () => {
    const position = positionFromFen('6k1/8/8/8/8/8/8/6KQ w - - 0 1')
    const g: GameState = {
      id: 'timeout-win',
      position,
      history: [],
      repetition: new Map([[positionKey(position), 1]]),
      outcome: { kind: 'active' },
    }
    const timedOut = timeoutGame(g, 'b')
    expect(timedOut.outcome).toEqual({ kind: 'timeout', winner: 'w' })
  })

  test('timeout is draw when winner has insufficient mating material', () => {
    const position = positionFromFen('6k1/8/8/8/8/8/8/6KN w - - 0 1')
    const g: GameState = {
      id: 'timeout-draw',
      position,
      history: [],
      repetition: new Map([[positionKey(position), 1]]),
      outcome: { kind: 'active' },
    }
    const timedOut = timeoutGame(g, 'w')
    expect(timedOut.outcome).toEqual({ kind: 'draw_insufficient' })
  })
})
