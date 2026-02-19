import type { Color, PieceType } from '../../algorithms/chess/types'

const GLYPH: Record<Color, Record<PieceType, string>> = {
  w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
  b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F\uFE0E' },
}

const OUTLINE_TRANSLATE = [
  'translate-x-px',
  '-translate-x-px',
  'translate-y-px',
  '-translate-y-px',
  'translate-x-px translate-y-px',
  'translate-x-px -translate-y-px',
  '-translate-x-px translate-y-px',
  '-translate-x-px -translate-y-px',
] as const

export default function PieceGlyph(props: { color: Color; type: PieceType; className?: string }) {
  const { color, type, className } = props
  const glyph = GLYPH[color][type]
  const fill = color === 'w' ? 'piece-fill-white' : 'piece-fill-black'
  const stroke = color === 'w' ? 'piece-stroke-white' : 'piece-stroke-black'

  return (
    <span className={['relative inline-block leading-none', className ?? ''].join(' ')}>
      {OUTLINE_TRANSLATE.map((t) => (
        <span key={t} className={['absolute left-0 top-0', t, stroke].join(' ')}>
          {glyph}
        </span>
      ))}
      <span className={['relative', fill].join(' ')}>{glyph}</span>
    </span>
  )
}
