import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef } from 'react'
import type { MoveRecord } from '../algorithms/chess/types'

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

export default function MoveList(props: {
  records: MoveRecord[]
  cursor: number
  onJump: (cursor: number) => void
  onUndo: () => void
  onRedo: () => void
}) {
  const { records, cursor, onJump, onUndo, onRedo } = props
  const reduce = useReducedMotion()
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const rows = useMemo(() => {
    const out: Array<{ moveNo: number; white?: MoveRecord; black?: MoveRecord; whitePly?: number; blackPly?: number }> =
      []
    for (let i = 0; i < records.length; i += 2) {
      const moveNo = Math.floor(i / 2) + 1
      const white = records[i]
      const black = records[i + 1]
      out.push({
        moveNo,
        white: white,
        black: black,
        whitePly: white ? i + 1 : undefined,
        blackPly: black ? i + 2 : undefined,
      })
    }
    return out
  }, [records])

  const canUndo = cursor > 0
  const canRedo = cursor < records.length

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const target = el.querySelector<HTMLElement>(`[data-ply="${cursor}"]`)
    if (!target) return
    scrollChildIntoView(el, target, { margin: 10, behavior: reduce ? 'auto' : 'smooth' })
  }, [cursor, reduce])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">Move List</div>
          <div className="text-xs text-slate-500">
            Ply {cursor}/{records.length}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={[
              'rounded-xl px-3 py-2 text-xs font-semibold ring-1 outline-none',
              canUndo
                ? 'bg-slate-950/20 text-slate-200 ring-slate-800'
                : 'cursor-not-allowed bg-slate-950/10 text-slate-500 ring-slate-800/70',
            ].join(' ')}
            whileHover={
              canUndo && !reduce ? { y: -1, backgroundColor: 'rgba(2,6,23,0.30)' } : undefined
            }
            whileTap={canUndo && !reduce ? { y: 0, scale: 0.99 } : undefined}
            transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
          >
            Undo
          </motion.button>
          <motion.button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className={[
              'rounded-xl px-3 py-2 text-xs font-semibold ring-1 outline-none',
              canRedo
                ? 'bg-slate-950/20 text-slate-200 ring-slate-800'
                : 'cursor-not-allowed bg-slate-950/10 text-slate-500 ring-slate-800/70',
            ].join(' ')}
            whileHover={
              canRedo && !reduce ? { y: -1, backgroundColor: 'rgba(2,6,23,0.30)' } : undefined
            }
            whileTap={canRedo && !reduce ? { y: 0, scale: 0.99 } : undefined}
            transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
          >
            Redo
          </motion.button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[42px_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[11px] font-semibold text-slate-500">
        <div>#</div>
        <div>White</div>
        <div>Black</div>
      </div>

      <div
        ref={scrollerRef}
        className="mt-2 max-h-[240px] overflow-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
      >
        <LayoutGroup>
          <div className="flex flex-col gap-1">
          <motion.button
            type="button"
            onClick={() => onJump(0)}
            data-ply={0}
            className={[
              'relative rounded-xl border border-slate-800 px-2 py-2 text-left outline-none',
              cursor === 0 ? 'bg-slate-950/20' : 'bg-slate-950/20 hover:bg-slate-950/30',
            ].join(' ')}
            whileHover={reduce ? undefined : { y: -1 }}
            whileTap={reduce ? undefined : { y: 0, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
          >
            {cursor === 0 ? (
              <motion.div
                layoutId="move-active"
                className="pointer-events-none absolute inset-0 rounded-xl border border-cyan-300/40 bg-cyan-500/10"
                transition={{ type: 'spring', stiffness: 620, damping: 46, mass: 0.8 }}
              />
            ) : null}
            <div className="relative grid grid-cols-[42px_minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <div className="text-[11px] font-semibold text-slate-500">0</div>
              <div className="text-xs font-semibold text-slate-200">Start</div>
              <div className="text-xs font-semibold text-slate-500">-</div>
            </div>
          </motion.button>

          {rows.map((row) => {
            const whitePly = row.whitePly ?? 0
            const blackPly = row.blackPly ?? 0
            const whiteActive = cursor === whitePly
            const blackActive = cursor === blackPly
            const whitePast = whitePly > 0 && whitePly <= cursor
            const blackPast = blackPly > 0 && blackPly <= cursor
            const whiteFuture = row.white && whitePly > cursor
            const blackFuture = row.black && blackPly > cursor
            const active = whiteActive || blackActive

            const rowKey = `${row.moveNo}-${row.white?.positionKeyAfter ?? 'w'}-${row.black?.positionKeyAfter ?? 'b'}`

            return (
              <div key={rowKey} className="relative">
                {active ? (
                  <motion.div
                    layoutId="move-active"
                    className="pointer-events-none absolute inset-0 rounded-xl border border-cyan-300/40 bg-cyan-500/10"
                    transition={{ type: 'spring', stiffness: 620, damping: 46, mass: 0.8 }}
                  />
                ) : null}

                <div className="relative grid grid-cols-[42px_minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-xl border border-slate-800 bg-slate-950/20 px-2 py-2">
                  <div className="text-[11px] font-semibold text-slate-500">{row.moveNo}</div>

                  <motion.button
                    type="button"
                    disabled={!row.white}
                    data-ply={whitePly}
                    onClick={() => onJump(clamp(whitePly, 0, records.length))}
                    className={[
                      'relative rounded-lg px-2 py-1 text-left text-xs font-semibold outline-none',
                      row.white ? 'hover:bg-slate-900/40' : '',
                      whiteActive
                        ? 'text-cyan-100'
                        : whiteFuture
                          ? 'text-slate-500'
                          : whitePast
                            ? 'text-slate-200'
                            : 'text-slate-500',
                    ].join(' ')}
                    whileHover={row.white && !reduce ? { backgroundColor: 'rgba(15,23,42,0.40)' } : undefined}
                    whileTap={row.white && !reduce ? { scale: 0.99 } : undefined}
                    transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.7 }}
                  >
                    {row.white?.san ?? '-'}
                  </motion.button>

                  <motion.button
                    type="button"
                    disabled={!row.black}
                    data-ply={blackPly}
                    onClick={() => onJump(clamp(blackPly, 0, records.length))}
                    className={[
                      'relative rounded-lg px-2 py-1 text-left text-xs font-semibold outline-none',
                      row.black ? 'hover:bg-slate-900/40' : '',
                      blackActive
                        ? 'text-cyan-100'
                        : blackFuture
                          ? 'text-slate-500'
                          : blackPast
                            ? 'text-slate-200'
                            : 'text-slate-500',
                    ].join(' ')}
                    whileHover={row.black && !reduce ? { backgroundColor: 'rgba(15,23,42,0.40)' } : undefined}
                    whileTap={row.black && !reduce ? { scale: 0.99 } : undefined}
                    transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.7 }}
                  >
                    {row.black?.san ?? '-'}
                  </motion.button>
                </div>
              </div>
            )
          })}
          </div>
        </LayoutGroup>
      </div>
    </div>
  )
}
