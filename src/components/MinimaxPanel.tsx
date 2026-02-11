import { motion } from 'framer-motion'
import type { Depth2Analysis } from '../algorithms/minimax/depth2'

function formatRelative(score: number): string {
  if (Math.abs(score) >= 90_000) return score > 0 ? '+Mate' : '-Mate'
  const pawns = score / 100
  const sign = pawns >= 0 ? '+' : ''
  return `${sign}${pawns.toFixed(2)}`
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export default function MinimaxPanel(props: {
  analysis: Depth2Analysis | null
  loading: boolean
}) {
  const { analysis, loading } = props

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">Minimax (Depth 2)</div>
          <div className="text-xs text-slate-500">
            {analysis ? `${analysis.nodes} leaf evaluations` : loading ? 'Analyzing...' : '-'}
          </div>
        </div>
        {analysis ? (
          <div className="text-xs text-slate-400">
            Root: {analysis.rootTurn === 'w' ? 'White' : 'Black'} to move
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {(analysis?.lines ?? []).map((l, idx) => {
          const rel = l.scoreRelative
          const clamped = clamp(rel, -800, 800)
          const pct = (clamped + 800) / 1600
          return (
            <div
              key={`${l.san}-${idx}`}
              className="rounded-xl border border-slate-800 bg-slate-950/20 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    {idx + 1}. {l.san}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {l.reply ? `... ${l.reply.san}` : '...'}
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-200">{formatRelative(rel)}</div>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900/60 ring-1 ring-slate-800">
                <motion.div
                  className={rel >= 0 ? 'h-full bg-emerald-400/70' : 'h-full bg-rose-400/70'}
                  initial={false}
                  animate={{ width: `${Math.round(pct * 100)}%` }}
                  transition={{ type: 'spring', stiffness: 420, damping: 40 }}
                />
              </div>
            </div>
          )
        })}

        {!analysis && !loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-3 text-xs text-slate-500">
            Make a move to get updated suggestions.
          </div>
        ) : null}
      </div>
    </div>
  )
}
