function createMatrix(rows: number, cols: number, fill = 0): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill))
}

function countsToMatrix8(counts: readonly number[]): number[][] {
  if (counts.length !== 64) throw new Error(`countsToMatrix8: expected 64, got ${counts.length}`)
  const m = createMatrix(8, 8, 0)
  for (let sq = 0; sq < 64; sq += 1) {
    const file = sq % 8
    const rank = Math.floor(sq / 8)
    m[rank]![file]! = counts[sq] ?? 0
  }
  return m
}

function buildPrefixSum(matrix: readonly number[][]): number[][] {
  const rows = matrix.length
  const cols = rows === 0 ? 0 : matrix[0]!.length
  const ps = createMatrix(rows + 1, cols + 1, 0)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      ps[r + 1]![c + 1]! =
        (matrix[r]![c]! ?? 0) +
        ps[r]![c + 1]! +
        ps[r + 1]![c]! -
        ps[r]![c]!
    }
  }
  return ps
}

function rectSum(ps: readonly number[][], r0: number, c0: number, r1: number, c1: number): number {
  // Inclusive bounds; assumes (r0,c0) and (r1,c1) are clamped.
  const R0 = r0
  const C0 = c0
  const R1 = r1 + 1
  const C1 = c1 + 1
  return ps[R1]![C1]! - ps[R0]![C1]! - ps[R1]![C0]! + ps[R0]![C0]!
}

export interface HeatmapIntensity {
  smoothedCounts: number[] // length 64
  intensity: number[] // length 64, normalized 0..1
  maxSmoothed: number
}

export function computeHeatmapIntensity(counts: readonly number[], radius: number): HeatmapIntensity {
  const r = Math.max(0, Math.min(4, Math.floor(radius)))
  const matrix = countsToMatrix8(counts)
  const ps = buildPrefixSum(matrix)

  const smoothedCounts = Array.from({ length: 64 }, () => 0)
  let maxSmoothed = 0

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const r0 = Math.max(0, rank - r)
      const r1 = Math.min(7, rank + r)
      const c0 = Math.max(0, file - r)
      const c1 = Math.min(7, file + r)
      const sum = rectSum(ps, r0, c0, r1, c1)
      const sq = rank * 8 + file
      smoothedCounts[sq]! = sum
      if (sum > maxSmoothed) maxSmoothed = sum
    }
  }

  const intensity = smoothedCounts.map((v) => (maxSmoothed === 0 ? 0 : v / maxSmoothed))
  return { smoothedCounts, intensity, maxSmoothed }
}

