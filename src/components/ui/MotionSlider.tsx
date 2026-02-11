import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useMemo, useRef } from 'react'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function roundToStep(value: number, step: number): number {
  if (step <= 0) return value
  const inv = 1 / step
  return Math.round(value * inv) / inv
}

function quantize(value: number, min: number, max: number, step: number): number {
  const clamped = clamp(value, min, max)
  return clamp(roundToStep(clamped, step), min, max)
}

export default function MotionSlider(props: {
  label: string
  hint?: string
  min: number
  max: number
  step: number
  value: number
  formatValue?: (v: number) => string
  onChange: (next: number) => void
  disabled?: boolean
}) {
  const { label, hint, min, max, step, value, formatValue, onChange, disabled } = props
  const reduce = useReducedMotion()
  const trackRef = useRef<HTMLDivElement | null>(null)

  const pct = useMemo(() => {
    if (max === min) return 0
    return clamp((value - min) / (max - min), 0, 1)
  }, [max, min, value])

  const setFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const t = clamp((clientX - rect.left) / rect.width, 0, 1)
      const raw = min + t * (max - min)
      onChange(quantize(raw, min, max, step))
    },
    [max, min, onChange, step],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    if (e.button !== 0) return
    setFromClientX(e.clientX)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled) return
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
    setFromClientX(e.clientX)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (disabled) return
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    const delta =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown'
        ? -step
        : e.key === 'ArrowRight' || e.key === 'ArrowUp'
          ? step
          : e.key === 'Home'
            ? min - value
            : e.key === 'End'
              ? max - value
              : 0
    if (delta === 0) return
    e.preventDefault()
    onChange(quantize(value + delta, min, max, step))
  }

  return (
    <div
      className={[
        'w-full rounded-xl border px-3 py-2',
        disabled ? 'border-slate-800/70 bg-slate-950/10 opacity-60' : 'border-slate-800 bg-slate-950/20',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-200">{label}</div>
          {hint ? <div className="mt-0.5 truncate text-[11px] text-slate-500">{hint}</div> : null}
        </div>
        <div className="text-xs font-semibold tabular-nums text-slate-200">
          {formatValue ? formatValue(value) : value}
        </div>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={[
          'relative mt-3 h-3 w-full rounded-full bg-slate-900/60 ring-1 ring-slate-800',
          disabled ? 'cursor-not-allowed' : 'cursor-ew-resize',
          'focus:outline-none focus:ring-2 focus:ring-cyan-300/40',
        ].join(' ')}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-300/70 to-emerald-300/60"
          initial={false}
          animate={{ width: `${Math.round(pct * 100)}%` }}
          transition={
            reduce ? { duration: 0 } : { type: 'spring', stiffness: 560, damping: 42, mass: 0.55 }
          }
        />
        <motion.div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-100 shadow-[0_10px_26px_rgba(0,0,0,0.35)] ring-1 ring-slate-700/60"
          initial={false}
          animate={{ left: `${Math.round(pct * 100)}%` }}
          transition={
            reduce ? { duration: 0 } : { type: 'spring', stiffness: 620, damping: 44, mass: 0.55 }
          }
        />
      </div>
    </div>
  )
}

