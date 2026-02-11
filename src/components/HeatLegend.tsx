import { motion, useReducedMotion } from 'framer-motion'

export interface HeatTopSquare {
  square: string
  count: number
  intensity: number
}

export default function HeatLegend(props: {
  enabled: boolean
  radius: number
  maxSmoothed: number
  top: HeatTopSquare[]
}) {
  const { enabled, radius, maxSmoothed, top } = props
  const reduce = useReducedMotion()

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">Heatmap</div>
          <div className="text-xs text-slate-500">
            Radius {radius} / Max {maxSmoothed}
          </div>
        </div>
        <div
          className={[
            'rounded-full px-2 py-1 text-[11px] font-semibold ring-1',
            enabled ? 'bg-orange-500/10 text-orange-100 ring-orange-200/25' : 'bg-slate-900/40 text-slate-300 ring-slate-800',
          ].join(' ')}
        >
          {enabled ? 'On' : 'Off'}
        </div>
      </div>

      <div className="mt-3">
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-900/60 ring-1 ring-slate-800">
          <motion.div
            className="absolute inset-0 bg-[linear-gradient(90deg,rgba(56,189,248,0.35),rgba(251,146,60,0.45),rgba(244,63,94,0.45))]"
            animate={reduce ? undefined : { x: ['-12%', '0%', '-12%'] }}
            transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ opacity: enabled ? 1 : 0.35 }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {top.length > 0 ? (
          top.map((t) => (
            <div
              key={t.square}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-2"
            >
              <div className="flex items-baseline gap-2">
                <div className="text-xs font-semibold text-slate-200">{t.square}</div>
                <div className="text-[11px] text-slate-500">count {t.count}</div>
              </div>
              <div className="flex w-28 items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900/60 ring-1 ring-slate-800">
                  <motion.div
                    className="h-full bg-orange-300/70"
                    initial={false}
                    animate={{ width: `${Math.round(t.intensity * 100)}%` }}
                    transition={{ type: 'spring', stiffness: 440, damping: 42 }}
                  />
                </div>
                <div className="w-10 text-right text-[11px] font-semibold tabular-nums text-slate-200">
                  {Math.round(t.intensity * 100)}%
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-2 text-xs text-slate-500">
            Waiting for streamed moves...
          </div>
        )}
      </div>
    </div>
  )
}
