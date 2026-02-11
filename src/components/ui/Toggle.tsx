import { motion, useReducedMotion } from 'framer-motion'

export default function Toggle(props: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  const { checked, onChange, label, hint, disabled } = props
  const reduce = useReducedMotion()

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'group flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left outline-none',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        checked
          ? 'border-cyan-300/30 bg-cyan-500/10'
          : 'border-slate-800 bg-slate-950/20 hover:bg-slate-950/30',
      ].join(' ')}
      animate={
        reduce
          ? undefined
          : {
              backgroundColor: checked ? 'rgba(6,182,212,0.10)' : 'rgba(2,6,23,0.20)',
              borderColor: checked ? 'rgba(103,232,249,0.30)' : 'rgba(30,41,59,1)',
            }
      }
      whileHover={
        !disabled && !reduce
          ? {
              y: -1,
              backgroundColor: checked ? 'rgba(6,182,212,0.14)' : 'rgba(2,6,23,0.30)',
            }
          : undefined
      }
      whileTap={!disabled && !reduce ? { y: 0, scale: 0.99 } : undefined}
      transition={reduce ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
    >
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-200">{label}</div>
        {hint ? <div className="mt-0.5 truncate text-[11px] text-slate-500">{hint}</div> : null}
      </div>

      <motion.div
        className={[
          'relative h-6 w-10 flex-none rounded-full ring-1',
          checked ? 'bg-cyan-400/30 ring-cyan-200/30' : 'bg-slate-900/70 ring-slate-700/50',
        ].join(' ')}
        animate={reduce ? undefined : { backgroundColor: checked ? 'rgba(34,211,238,0.30)' : 'rgba(15,23,42,0.70)' }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className={[
            'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full',
            checked ? 'bg-cyan-100' : 'bg-slate-200',
            'shadow-[0_6px_16px_rgba(0,0,0,0.35)]',
          ].join(' ')}
          initial={false}
          animate={{ left: checked ? 22 : 2 }}
          transition={
            reduce
              ? { duration: 0 }
              : { type: 'spring', stiffness: 740, damping: 40, mass: 0.45 }
          }
        />
      </motion.div>
    </motion.button>
  )
}
