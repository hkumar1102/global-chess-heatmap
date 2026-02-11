import { motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'

type Layer = {
  id: string
  className: string
  gradient: string
  animate: { x: number[]; y: number[]; rotate: number[]; scale: number[] }
  transition: { duration: number; repeat: number; repeatType: 'mirror' | 'loop'; ease: 'easeInOut' }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function seededRand(seed: number): () => number {
  // Mulberry32
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function makeLayer(seed: number, color: string, duration: number): Layer {
  const r = seededRand(seed)
  const size = clamp(520 + r() * 740, 520, 1260)
  const x0 = clamp(-180 + r() * 360, -180, 180)
  const y0 = clamp(-160 + r() * 320, -160, 160)
  const x1 = clamp(-180 + r() * 360, -180, 180)
  const y1 = clamp(-160 + r() * 320, -160, 160)

  return {
    id: `layer-${seed}`,
    className: 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 will-change-transform',
    gradient: `radial-gradient(${size}px ${size}px at 50% 50%, ${color}, rgba(0,0,0,0) 60%)`,
    animate: {
      x: [x0, x1, x0],
      y: [y0, y1, y0],
      rotate: [0, 12 + r() * 26, 0],
      scale: [1, 1.06 + r() * 0.08, 1],
    },
    transition: { duration, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
  }
}

export default function AuroraBackground(props: { theme?: 'dark' | 'light' }) {
  const { theme = 'dark' } = props
  const reduce = useReducedMotion()
  const layers = useMemo(() => {
    const light = theme === 'light'
    return [
      makeLayer(1, light ? 'rgba(14,116,144,0.18)' : 'rgba(34,211,238,0.34)', 26),
      makeLayer(2, light ? 'rgba(217,119,6,0.16)' : 'rgba(251,146,60,0.24)', 30),
      makeLayer(3, light ? 'rgba(15,23,42,0.10)' : 'rgba(167,139,250,0.20)', 34),
    ]
  }, [theme])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={
          theme === 'light'
            ? 'absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(14,116,144,0.12),rgba(255,255,255,0)_55%),radial-gradient(circle_at_80%_40%,rgba(217,119,6,0.09),rgba(255,255,255,0)_60%),radial-gradient(circle_at_50%_90%,rgba(15,23,42,0.08),rgba(255,255,255,0)_55%)]'
            : 'absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(56,189,248,0.12),rgba(0,0,0,0)_55%),radial-gradient(circle_at_80%_40%,rgba(251,146,60,0.10),rgba(0,0,0,0)_60%),radial-gradient(circle_at_50%_90%,rgba(167,139,250,0.08),rgba(0,0,0,0)_55%)]'
        }
      />
      <div
        className={
          theme === 'light'
            ? 'absolute inset-0 bg-gradient-to-b from-slate-50/80 via-sky-50/70 to-slate-100/65'
            : 'absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/60'
        }
      />

      {!reduce
        ? layers.map((l) => (
            <motion.div
              key={l.id}
              className={l.className}
              style={{ width: 1600, height: 1600, backgroundImage: l.gradient, filter: 'blur(28px)' }}
              animate={l.animate}
              transition={l.transition}
            />
          ))
        : null}

      <div
        className={
          theme === 'light'
            ? 'absolute inset-0 opacity-[0.16] [background-image:radial-gradient(circle_at_1px_1px,rgba(71,85,105,0.22)_1px,transparent_0)] [background-size:18px_18px]'
            : 'absolute inset-0 opacity-[0.18] mix-blend-soft-light [background-image:radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.35)_1px,transparent_0)] [background-size:18px_18px]'
        }
      />
      <div className={theme === 'light' ? 'absolute inset-0 bg-slate-50/22' : 'absolute inset-0 bg-slate-950/40'} />
    </div>
  )
}
