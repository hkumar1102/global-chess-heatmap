import { describe, expect, test } from 'vitest'
import { perft } from '../src/algorithms/chess/perft'
import { positionFromFen, createInitialPosition } from '../src/algorithms/chess/position'

describe('perft', () => {
  test('start position depth 3', () => {
    const pos = createInitialPosition()
    expect(perft(pos, 1)).toBe(20)
    expect(perft(pos, 2)).toBe(400)
    expect(perft(pos, 3)).toBe(8902)
  })

  test('kiwipete depth 2 (castling stress)', () => {
    const pos = positionFromFen(
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    )
    expect(perft(pos, 1)).toBe(48)
    expect(perft(pos, 2)).toBe(2039)
  })
})

