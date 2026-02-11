import { AnimatePresence, motion } from 'framer-motion'
import type { Color, PromotionPieceType } from '../algorithms/chess/types'
import PieceGlyph from './chess/PieceGlyph'

export default function PromotionPicker(props: {
  open: boolean
  color: Color
  onChoose: (type: PromotionPieceType) => void
  onCancel: () => void
}) {
  const { open, color, onChoose, onCancel } = props
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="absolute inset-0 z-20 grid place-items-center bg-slate-950/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 p-3 shadow-glow"
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            {(['q', 'r', 'b', 'n'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChoose(t)}
                className="grid h-12 w-12 place-items-center rounded-lg border border-slate-700 bg-slate-800/70 text-2xl text-slate-50 hover:bg-slate-800"
              >
                <PieceGlyph color={color} type={t} className="text-2xl" />
              </button>
            ))}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
