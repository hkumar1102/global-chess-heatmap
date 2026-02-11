import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'
import { PIECE_VALUE_CP } from '../algorithms/chess/pieceValues'
import type { MoveRecord, Piece, PieceType } from '../algorithms/chess/types'
import PieceGlyph from './chess/PieceGlyph'

const TYPE_NAME: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
}

function sortCaptured(pieces: readonly Piece[]): Piece[] {
  return [...pieces].sort((a, b) => {
    const va = PIECE_VALUE_CP[a.type]
    const vb = PIECE_VALUE_CP[b.type]
    if (va !== vb) return vb - va
    if (a.type !== b.type) return a.type.localeCompare(b.type)
    return a.id.localeCompare(b.id)
  })
}

function CapturedRow(props: { label: string; pieces: readonly Piece[] }) {
  const { label, pieces } = props
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="pt-1 text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="flex flex-1 flex-wrap justify-end gap-1">
        {pieces.length === 0 ? (
          <div className="text-[11px] font-semibold text-slate-600">-</div>
        ) : (
          <AnimatePresence initial={false}>
            {pieces.map((p) => (
              <motion.div
                key={p.id}
                className="grid h-7 w-7 place-items-center rounded-lg border border-slate-800 bg-slate-950/30"
                initial={{ opacity: 0, scale: 0.85, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -6 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                title={`${p.color === 'w' ? 'White' : 'Black'} ${TYPE_NAME[p.type]}`}
              >
                <PieceGlyph color={p.color} type={p.type} className="text-lg" />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

export default function CapturesPanel(props: { history: readonly MoveRecord[] }) {
  const { history } = props

  const { byWhite, byBlack } = useMemo(() => {
    const capturedByWhite: Piece[] = []
    const capturedByBlack: Piece[] = []

    for (const r of history) {
      const c = r.capture
      if (!c) continue
      if (c.piece.color === 'b') capturedByWhite.push(c.piece)
      else capturedByBlack.push(c.piece)
    }

    return { byWhite: sortCaptured(capturedByWhite), byBlack: sortCaptured(capturedByBlack) }
  }, [history])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">Captures</div>
          <div className="text-xs text-slate-500">Tracked from applied moves (incl. en passant)</div>
        </div>
        <div className="rounded-full bg-slate-950/20 px-2 py-1 text-[11px] font-semibold text-slate-300 ring-1 ring-slate-800">
          {byWhite.length + byBlack.length}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <CapturedRow label="White captured" pieces={byWhite} />
        <CapturedRow label="Black captured" pieces={byBlack} />
      </div>
    </div>
  )
}

