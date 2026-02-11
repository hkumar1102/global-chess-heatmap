import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fuzzyBestScore } from '../algorithms/search/fuzzy'

export type CommandAction = {
  id: string
  title: string
  subtitle?: string
  keywords?: string[]
  shortcut?: string
  section?: string
  enabled?: boolean
  perform: () => void
}

type ActionGroup = { section: string; actions: CommandAction[] }
type NavigationMode = 'keyboard' | 'pointer'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function scrollChildIntoView(
  parent: HTMLElement,
  child: HTMLElement,
  opts: { margin: number; behavior: ScrollBehavior },
): void {
  const maxScroll = Math.max(0, parent.scrollHeight - parent.clientHeight)
  const childTop = child.offsetTop
  const childBottom = childTop + child.offsetHeight
  const parentTop = parent.scrollTop
  const parentBottom = parentTop + parent.clientHeight

  let targetTop: number | null = null
  if (childTop - opts.margin < parentTop) targetTop = childTop - opts.margin
  else if (childBottom + opts.margin > parentBottom) targetTop = childBottom + opts.margin - parent.clientHeight
  if (targetTop === null) return

  parent.scrollTo({
    top: clamp(targetTop, 0, maxScroll),
    behavior: opts.behavior,
  })
}

function normalizedTexts(action: CommandAction): string[] {
  const texts: string[] = [action.title]
  if (action.subtitle) texts.push(action.subtitle)
  if (action.keywords && action.keywords.length > 0) texts.push(...action.keywords)
  return texts
}

function scoreAction(action: CommandAction, query: string): number | null {
  const q = query.trim()
  if (q.length === 0) return 1
  return fuzzyBestScore(normalizedTexts(action), q)
}

function buildGroups(actions: readonly CommandAction[], query: string): { groups: ActionGroup[]; flat: CommandAction[] } {
  const q = query.trim()
  if (q.length === 0) {
    const groupsBySection = new Map<string, CommandAction[]>()
    const order: string[] = []
    for (const a of actions) {
      const section = a.section ?? 'Commands'
      if (!groupsBySection.has(section)) {
        groupsBySection.set(section, [])
        order.push(section)
      }
      groupsBySection.get(section)!.push(a)
    }
    const groups = order.map((section) => ({ section, actions: groupsBySection.get(section)! }))
    return { groups, flat: groups.flatMap((g) => g.actions) }
  }

  const scored: Array<{ a: CommandAction; score: number }> = []
  for (const a of actions) {
    const s = scoreAction(a, q)
    if (s === null) continue
    scored.push({ a, score: s })
  }
  scored.sort((x, y) => y.score - x.score || x.a.title.localeCompare(y.a.title))

  const flat = scored.map((s) => s.a)
  return { groups: [{ section: 'Results', actions: flat }], flat }
}

export default function CommandPalette(props: {
  open: boolean
  onClose: () => void
  actions: readonly CommandAction[]
}) {
  const { open, onClose, actions } = props
  const reduce = useReducedMotion()

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const navigationModeRef = useRef<NavigationMode>('keyboard')
  const hoverSuppressedUntilRef = useRef(0)

  const { groups, flat } = useMemo(() => buildGroups(actions, query), [actions, query])
  const indexById = useMemo(() => {
    const map = new Map<string, number>()
    for (let i = 0; i < flat.length; i += 1) {
      map.set(flat[i]!.id, i)
    }
    return map
  }, [flat])
  const active = flat[clamp(activeIndex, 0, Math.max(0, flat.length - 1))] ?? null

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    navigationModeRef.current = 'keyboard'
  }, [open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const body = document.body
    const prevOverflow = body.style.overflow
    const prevPaddingRight = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
    return () => {
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPaddingRight
    }
  }, [open])

  useEffect(() => {
    setActiveIndex((i) => clamp(i, 0, Math.max(0, flat.length - 1)))
  }, [flat.length])

  useEffect(() => {
    const el = listRef.current
    if (!open || !el) return
    if (navigationModeRef.current !== 'keyboard') return
    const target = el.querySelector<HTMLElement>('[data-cmd-active="true"]')
    if (!target) return
    scrollChildIntoView(el, target, { margin: 10, behavior: reduce ? 'auto' : 'smooth' })
  }, [activeIndex, open, reduce])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        navigationModeRef.current = 'keyboard'
        setActiveIndex((i) => clamp(i + 1, 0, Math.max(0, flat.length - 1)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        navigationModeRef.current = 'keyboard'
        setActiveIndex((i) => clamp(i - 1, 0, Math.max(0, flat.length - 1)))
        return
      }
      if (e.key === 'Enter') {
        const a = active
        if (!a || a.enabled === false) return
        e.preventDefault()
        a.perform()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true } as AddEventListenerOptions)
  }, [active, flat.length, onClose, open])

  const activateFromPointer = (idx: number) => {
    if (idx < 0) return
    if (performance.now() < hoverSuppressedUntilRef.current) return
    navigationModeRef.current = 'pointer'
    setActiveIndex(idx)
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] grid place-items-start px-4 py-10 sm:place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          onMouseDown={() => onClose()}
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/85 shadow-glow"
            initial={reduce ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-800 bg-slate-950/30 p-3">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-950/30 text-slate-300">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M10.5 19a8.5 8.5 0 1 1 8.5-8.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M21 21l-4.6-4.6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    navigationModeRef.current = 'keyboard'
                    setQuery(e.target.value)
                  }}
                  placeholder="Type a command..."
                  className="w-full bg-transparent px-1 py-2 text-sm font-semibold text-slate-100 outline-none placeholder:text-slate-500"
                />
                <div className="hidden select-none items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/20 px-2 py-1 text-[11px] font-semibold text-slate-400 sm:flex">
                  <span>Esc</span>
                </div>
              </div>
            </div>

            <div
              ref={listRef}
              onWheelCapture={() => {
                hoverSuppressedUntilRef.current = performance.now() + 220
              }}
              className="max-h-[55vh] overflow-auto overscroll-contain p-2 [scrollbar-gutter:stable]"
            >
              <LayoutGroup>
                {flat.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4 text-sm text-slate-400">
                    No matches.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {groups.map((g) => (
                      <div key={g.section}>
                        <div className="px-2 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-slate-500">
                          {g.section}
                        </div>
                        <div className="flex flex-col gap-1">
                          {g.actions.map((a) => {
                            const idx = indexById.get(a.id) ?? -1
                            const isActive = idx >= 0 && idx === activeIndex
                            const enabled = a.enabled !== false
                            return (
                              <div key={a.id} className="relative">
                                <AnimatePresence initial={false}>
                                  {isActive ? (
                                    <motion.div
                                      layoutId="cmd-active"
                                      className="pointer-events-none absolute inset-0 rounded-xl border border-cyan-300/40 bg-cyan-500/10"
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      transition={{ duration: 0.16, ease: 'easeOut' }}
                                    />
                                  ) : null}
                                </AnimatePresence>

                                <motion.button
                                  layout
                                  type="button"
                                  disabled={!enabled}
                                  data-cmd-active={isActive ? 'true' : 'false'}
                                  onMouseEnter={() => activateFromPointer(idx)}
                                  onMouseMove={() => activateFromPointer(idx)}
                                  onClick={() => {
                                    if (!enabled) return
                                    a.perform()
                                    onClose()
                                  }}
                                  className={[
                                    'group relative w-full rounded-xl border border-slate-800 px-3 py-3 text-left outline-none',
                                    enabled
                                      ? 'cursor-pointer bg-slate-950/20'
                                      : 'cursor-not-allowed bg-slate-950/10 opacity-60',
                                  ].join(' ')}
                                  whileHover={
                                    enabled && !reduce ? { y: -1, backgroundColor: 'rgba(2,6,23,0.32)' } : undefined
                                  }
                                  whileTap={enabled && !reduce ? { y: 0, scale: 0.99 } : undefined}
                                  transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }}
                                >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-slate-200">{a.title}</div>
                                    {a.subtitle ? (
                                      <div className="mt-0.5 truncate text-[11px] text-slate-500">
                                        {a.subtitle}
                                      </div>
                                    ) : null}
                                  </div>
                                  {a.shortcut ? (
                                    <div className="flex flex-none items-center rounded-lg border border-slate-800 bg-slate-950/20 px-2 py-1 text-[11px] font-semibold text-slate-400">
                                      {a.shortcut}
                                    </div>
                                  ) : null}
                                </div>
                                </motion.button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </LayoutGroup>
            </div>

            <div className="border-t border-slate-800 bg-slate-950/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg border border-slate-800 bg-slate-950/20 px-2 py-1">{'\u2191\u2193'}</span>
                  <span className="rounded-lg border border-slate-800 bg-slate-950/20 px-2 py-1">Enter</span>
                  <span className="rounded-lg border border-slate-800 bg-slate-950/20 px-2 py-1">Esc</span>
                </div>
                <div className="text-slate-600">{active ? active.section ?? 'Commands' : ''}</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
