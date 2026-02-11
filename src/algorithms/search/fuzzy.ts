function isWordBoundary(ch: string): boolean {
  return ch === ' ' || ch === '-' || ch === '_' || ch === '/' || ch === '.'
}

export function fuzzyScore(text: string, query: string): number | null {
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  if (q.length === 0) return 1

  const idx = t.indexOf(q)
  let score = 0
  if (idx >= 0) {
    score += 40
    if (idx === 0) score += 10
    else if (isWordBoundary(t[idx - 1]!)) score += 6
    score += Math.max(0, 20 - idx * 0.5)
  }

  let ti = 0
  let last = -2
  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi]!
    const found = t.indexOf(ch, ti)
    if (found < 0) return null

    const consecutive = found === last + 1
    score += consecutive ? 8 : 4
    if (found === 0) score += 4
    else if (isWordBoundary(t[found - 1]!)) score += 3

    last = found
    ti = found + 1
  }

  score -= Math.max(0, t.length - q.length) * 0.06
  return score
}

export function fuzzyBestScore(texts: readonly string[], query: string): number | null {
  let best: number | null = null
  for (const t of texts) {
    const s = fuzzyScore(t, query)
    if (s === null) continue
    if (best === null || s > best) best = s
  }
  return best
}

