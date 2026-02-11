import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function winProbFromCp(scoreWhite: number): number {
  if (Math.abs(scoreWhite) >= 90_000) return scoreWhite > 0 ? 1 : 0
  const cp = clamp(scoreWhite, -1500, 1500)
  return 1 / (1 + Math.exp(-cp / 240))
}

function formatEval(scoreWhite: number): string {
  if (Math.abs(scoreWhite) >= 90_000) return scoreWhite > 0 ? '+Mate' : '-Mate'
  const pawns = scoreWhite / 100
  const sign = pawns >= 0 ? '+' : ''
  return `${sign}${pawns.toFixed(2)}`
}

export default function EvalBar(props: { scoreWhite: number; label?: string }) {
  const { scoreWhite, label = 'Eval' } = props
  const reduce = useReducedMotion()

  const prob = useMemo(() => winProbFromCp(scoreWhite), [scoreWhite])
  const evalLabel = useMemo(() => formatEval(scoreWhite), [scoreWhite])
  const edgePct = useMemo(() => `${Math.round((1 - prob) * 1000) / 10}%`, [prob])
  const fillPct = useMemo(() => `${Math.round(prob * 1000) / 10}%`, [prob])

  return (
    <div className="flex w-10 flex-col items-center gap-2 self-stretch">
      <div className="text-[10px] font-semibold tracking-wide text-slate-500">{label}</div>
      <div className="relative flex w-6 flex-1 flex-col overflow-hidden rounded-full border border-slate-800 bg-slate-950/40 shadow-glow min-h-[220px]">
        <motion.div
          className="absolute bottom-0 left-0 right-0 bg-[linear-gradient(180deg,rgba(34,211,238,0.25),rgba(248,250,252,0.90))]"
          initial={false}
          animate={{ height: fillPct }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 36 }}
        />

        <motion.div
          className="absolute left-0 right-0 h-2"
          initial={false}
          animate={{ top: edgePct }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 36 }}
          style={{ translateY: '-50%' }}
        >
          <div className="mx-auto h-2 w-5 rounded-full bg-cyan-200/70 shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_8px_18px_rgba(0,0,0,0.45)]" />
        </motion.div>
      </div>

      <AnimatePresence initial={false}>
        <motion.div
          key={evalLabel}
          className={[
            'rounded-full px-2 py-1 text-[11px] font-semibold ring-1',
            scoreWhite >= 0 ? 'bg-emerald-500/10 text-emerald-100 ring-emerald-200/20' : 'bg-rose-500/10 text-rose-100 ring-rose-200/20',
          ].join(' ')}
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          title="Positive favors White"
        >
          {evalLabel}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
