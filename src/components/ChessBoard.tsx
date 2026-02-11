import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { fileOf, rankOf } from '../algorithms/chess/coords'
import { getAttackers, getThreatPaths, getLegalMovesFrom, isInCheck } from '../algorithms/chess/movegen'
import type { Color, Move, Piece, Position, PromotionPieceType, Square } from '../algorithms/chess/types'
import { useElementSize } from '../hooks/useElementSize'
import PieceGlyph from './chess/PieceGlyph'
import PromotionPicker from './PromotionPicker'

type PointerType = 'mouse' | 'touch' | 'pen'

function normalizePointerType(value: string): PointerType {
  if (value === 'touch' || value === 'pen') return value
  return 'mouse'
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function dragStartDistanceSq(pointerType: PointerType): number {
  return pointerType === 'mouse' ? 64 : 196
}

function squareToDisplay(square: Square, orientation: Color): { row: number; col: number } {
  const file = fileOf(square)
  const rank = rankOf(square)
  if (orientation === 'w') return { col: file, row: 7 - rank }
  return { col: 7 - file, row: rank }
}

function displayToSquare(row: number, col: number, orientation: Color): Square {
  if (orientation === 'w') {
    const file = col
    const rank = 7 - row
    return (rank * 8 + file) as Square
  }
  const file = 7 - col
  const rank = row
  return (rank * 8 + file) as Square
}

function findKingSquare(position: Position, color: Color): Square | null {
  for (let sq = 0 as Square; sq < 64; sq += 1) {
    const p = position.board[sq]
    if (p && p.color === color && p.type === 'k') return sq
  }
  return null
}

function isCaptureLike(position: Position, move: Move): boolean {
  const target = position.board[move.to]
  if (target) return target.color !== position.turn
  const moving = position.board[move.from]
  if (!moving || moving.type !== 'p') return false
  if (position.enPassant === null) return false
  return (
    move.to === position.enPassant &&
    Math.abs(fileOf(move.to) - fileOf(move.from)) === 1 &&
    position.board[move.to] === null
  )
}

type DestHint = { square: Square; isCapture: boolean; isPromotion: boolean }

export default function ChessBoard(props: {
  position: Position
  theme?: 'dark' | 'light'
  orientation?: Color
  interactive?: boolean
  lastMove?: Move | null
  heatIntensity?: readonly number[]
  heatPulse?: readonly number[]
  arrows?: Array<{ from: Square; to: Square; tone: 'good' | 'bad' | 'neutral'; strength: number }>
  showCoordinates?: boolean
  showThreats?: boolean
  showCheckLines?: boolean
  showSuggestions?: boolean
  onMove?: (move: Move) => void
}) {
  const {
    position,
    theme = 'dark',
    orientation = 'w',
    interactive = false,
    lastMove = null,
    heatIntensity,
    heatPulse,
    arrows,
    showCoordinates = true,
    showThreats = true,
    showCheckLines = true,
    showSuggestions = true,
    onMove,
  } = props

  const boardRef = useRef<HTMLDivElement | null>(null)
  const { width, height } = useElementSize(boardRef)
  const boardSize = Math.min(width, height)
  const squareSize = boardSize > 0 ? boardSize / 8 : 0
  const svgSize = boardSize > 0 ? boardSize : 1

  const [selectedFrom, setSelectedFrom] = useState<Square | null>(null)
  const [legalMoves, setLegalMoves] = useState<Move[]>([])
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square
    to: Square
    options: Move[]
  } | null>(null)

  const suppressClickRef = useRef(false)
  const dragCandidateRef = useRef<{
    pointerId: number
    pointerType: PointerType
    from: Square
    startX: number
    startY: number
  } | null>(null)
  const draggingRef = useRef<{ from: Square; piece: Piece } | null>(null)
  const hoverSquareRef = useRef<Square | null>(null)
  const [dragging, setDragging] = useState<{ from: Square; piece: Piece } | null>(null)
  const [hoverSquare, setHoverSquare] = useState<Square | null>(null)

  const ghostXRaw = useMotionValue(0)
  const ghostYRaw = useMotionValue(0)
  const ghostScaleRaw = useMotionValue(1)
  const ghostRotateRaw = useMotionValue(0)
  const ghostX = useSpring(ghostXRaw, { stiffness: 900, damping: 56, mass: 0.45 })
  const ghostY = useSpring(ghostYRaw, { stiffness: 900, damping: 56, mass: 0.45 })
  const ghostScale = useSpring(ghostScaleRaw, { stiffness: 700, damping: 52, mass: 0.5 })
  const ghostRotate = useSpring(ghostRotateRaw, { stiffness: 460, damping: 34, mass: 0.52 })
  const dragLastRef = useRef<{ x: number; y: number; t: number } | null>(null)

  useEffect(() => {
    setPendingPromotion(null)
    if (interactive) {
      setSelectedFrom(null)
      setLegalMoves([])
      return
    }
    if (selectedFrom === null) return
    const stillPiece = position.board[selectedFrom]
    if (!stillPiece) {
      setSelectedFrom(null)
      setLegalMoves([])
      return
    }
    setLegalMoves(getLegalMovesFrom(position, selectedFrom))
  }, [interactive, position])

  const squareFromPoint = (clientX: number, clientY: number): Square | null => {
    const el = document.elementFromPoint(clientX, clientY)
    if (!el) return null
    const squareEl = el.closest('[data-square]')
    if (!squareEl) return null
    const raw = (squareEl as HTMLElement).dataset.square
    if (!raw) return null
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 0 || n >= 64) return null
    return n as Square
  }

  const setHover = (sq: Square | null) => {
    if (hoverSquareRef.current === sq) return
    hoverSquareRef.current = sq
    setHoverSquare(sq)
  }

  const destHints = useMemo<DestHint[]>(() => {
    if (selectedFrom === null) return []
    const byTo = new Map<Square, Move[]>()
    for (const mv of legalMoves) {
      const arr = byTo.get(mv.to) ?? []
      arr.push(mv)
      byTo.set(mv.to, arr)
    }
    const hints: DestHint[] = []
    for (const [to, moves] of byTo.entries()) {
      const isPromotion = moves.some((m) => !!m.promotion)
      const isCapture = moves.some((m) => isCaptureLike(position, m))
      hints.push({ square: to, isCapture, isPromotion })
    }
    return hints
  }, [legalMoves, position, selectedFrom])

  const hintBySquare = useMemo(() => {
    const m = new Map<Square, DestHint>()
    for (const h of destHints) m.set(h.square, h)
    return m
  }, [destHints])

  const inCheckKing = useMemo(() => {
    if (!isInCheck(position, position.turn)) return null
    return findKingSquare(position, position.turn)
  }, [position])

  const overlayLines = useMemo(() => {
    const lines: Array<{
      from: Square
      to: Square
      color: string
      width: number
      kind: 'suggestion' | 'threat' | 'check'
    }> = []

    if (showSuggestions && arrows && arrows.length > 0) {
      for (const a of arrows) {
        const color =
          a.tone === 'good' ? 'rgba(110,231,183,0.9)' : a.tone === 'bad' ? 'rgba(251,113,133,0.9)' : 'rgba(125,211,252,0.9)'
        lines.push({
          from: a.from,
          to: a.to,
          color,
          width: 2.5 + Math.max(0, Math.min(1, a.strength)) * 2.5,
          kind: 'suggestion',
        })
      }
    }

    if (showCheckLines && inCheckKing !== null) {
      const attackers = getAttackers(position, inCheckKing, position.turn === 'w' ? 'b' : 'w')
      for (const from of attackers) {
        lines.push({ from, to: inCheckKing, color: 'rgba(251,113,133,0.92)', width: 3.2, kind: 'check' })
      }
    }

    if (showThreats && selectedFrom !== null) {
      const piece = position.board[selectedFrom]
      if (piece) {
        const rawPaths = getThreatPaths(position, selectedFrom)
        for (const path of rawPaths) {
          const filtered: Square[] = []
          for (const sq of path) {
            const occ = position.board[sq]
            if (!occ) {
              filtered.push(sq)
              continue
            }
            if (occ.color !== piece.color) filtered.push(sq)
            break
          }
          const end = filtered.at(-1)
          if (end !== undefined) {
            lines.push({ from: selectedFrom, to: end, color: 'rgba(34,211,238,0.72)', width: 2.3, kind: 'threat' })
          }
        }
      }
    }

    return lines
  }, [arrows, inCheckKing, position, selectedFrom, showCheckLines, showSuggestions, showThreats])

  const pieces = useMemo(() => {
    const out: Array<{ square: Square; piece: Piece }> = []
    for (let sq = 0 as Square; sq < 64; sq += 1) {
      const p = position.board[sq]
      if (p) out.push({ square: sq, piece: p })
    }
    return out
  }, [position.board])

  const beginDrag = (pointerId: number, from: Square, piece: Piece, clientX: number, clientY: number) => {
    suppressClickRef.current = true
    draggingRef.current = { from, piece }
    setDragging({ from, piece })

    ghostScaleRaw.set(1.12)
    ghostRotateRaw.set(0)
    const size = squareSize
    ghostXRaw.set(clientX - size / 2)
    ghostYRaw.set(clientY - size / 2)
    dragLastRef.current = { x: clientX, y: clientY, t: performance.now() }

    setSelectedFrom(from)
    setLegalMoves(getLegalMovesFrom(position, from))
    setHover(squareFromPoint(clientX, clientY))

    boardRef.current?.setPointerCapture(pointerId)
  }

  const endDrag = () => {
    draggingRef.current = null
    setDragging(null)
    setHover(null)
    dragLastRef.current = null
    ghostScaleRaw.set(1)
    ghostRotateRaw.set(0)
    dragCandidateRef.current = null
    setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }

  const handlePointerDown = (e: ReactPointerEvent) => {
    if (!interactive) return
    if (pendingPromotion) return
    if (e.button !== 0) return
    if (squareSize <= 0) return

    const sq = squareFromPoint(e.clientX, e.clientY)
    if (sq === null) return
    const piece = position.board[sq]
    if (!piece || piece.color !== position.turn) return
    const pointerType = normalizePointerType(e.pointerType)
    dragCandidateRef.current = {
      pointerId: e.pointerId,
      pointerType,
      from: sq,
      startX: e.clientX,
      startY: e.clientY,
    }
  }

  const handlePointerMove = (e: ReactPointerEvent) => {
    const active = draggingRef.current
    if (active) {
      const size = squareSize
      ghostXRaw.set(e.clientX - size / 2)
      ghostYRaw.set(e.clientY - size / 2)
      const now = performance.now()
      const prev = dragLastRef.current
      if (prev) {
        const dt = Math.max(8, now - prev.t)
        const vx = (e.clientX - prev.x) / dt
        ghostRotateRaw.set(clamp(vx * 26, -9, 9))
      }
      dragLastRef.current = { x: e.clientX, y: e.clientY, t: now }
      setHover(squareFromPoint(e.clientX, e.clientY))
      return
    }

    const cand = dragCandidateRef.current
    if (!cand) return
    if (cand.pointerId !== e.pointerId) return

    const dx = e.clientX - cand.startX
    const dy = e.clientY - cand.startY
    if (dx * dx + dy * dy < dragStartDistanceSq(cand.pointerType)) return

    const piece = position.board[cand.from]
    if (!piece || piece.color !== position.turn) {
      dragCandidateRef.current = null
      return
    }
    beginDrag(e.pointerId, cand.from, piece, e.clientX, e.clientY)
  }

  const handlePointerUp = (e: ReactPointerEvent) => {
    const active = draggingRef.current
    const cand = dragCandidateRef.current
    if (active && cand && cand.pointerId === e.pointerId) {
      const drop = squareFromPoint(e.clientX, e.clientY)
      if (drop !== null) {
        const moves = getLegalMovesFrom(position, active.from)
        const candidates = moves.filter((m) => m.to === drop)
        if (candidates.length > 0) {
          if (candidates.some((m) => !!m.promotion)) {
            setPendingPromotion({ from: active.from, to: drop, options: candidates })
          } else {
            onMove?.(candidates[0]!)
          }
        }
      }
      endDrag()
      return
    }

    const touchLike = e.pointerType !== 'mouse'
    if (cand && cand.pointerId === e.pointerId) {
      dragCandidateRef.current = null
      if (touchLike && !suppressClickRef.current) {
        const dx = e.clientX - cand.startX
        const dy = e.clientY - cand.startY
        if (dx * dx + dy * dy <= dragStartDistanceSq(cand.pointerType)) {
          handleSquareClick(cand.from)
          suppressClickRef.current = true
          setTimeout(() => {
            suppressClickRef.current = false
          }, 0)
        }
      }
      return
    }

    if (touchLike && !suppressClickRef.current) {
      const sq = squareFromPoint(e.clientX, e.clientY)
      if (sq !== null) {
        handleSquareClick(sq)
        suppressClickRef.current = true
        setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }
    }
  }

  const handlePointerCancel = (e: ReactPointerEvent) => {
    const cand = dragCandidateRef.current
    if (!cand || cand.pointerId !== e.pointerId) return
    if (draggingRef.current) endDrag()
    else dragCandidateRef.current = null
  }

  const handleSquareClick = (square: Square) => {
    if (suppressClickRef.current) return
    if (pendingPromotion) return

    const clickedPiece = position.board[square]
    const canSelect = !!clickedPiece

    if (selectedFrom === null) {
      if (!canSelect) return
      if (interactive && clickedPiece.color !== position.turn) return
      setSelectedFrom(square)
      setLegalMoves(getLegalMovesFrom(position, square))
      return
    }

    if (square === selectedFrom) {
      setSelectedFrom(null)
      setLegalMoves([])
      return
    }

    if (canSelect && (!interactive || clickedPiece.color === position.turn)) {
      setSelectedFrom(square)
      setLegalMoves(getLegalMovesFrom(position, square))
      return
    }

    const candidates = legalMoves.filter((m) => m.to === square)
    if (!interactive || candidates.length === 0) return

    if (candidates.some((m) => !!m.promotion)) {
      setPendingPromotion({ from: selectedFrom, to: square, options: candidates })
      return
    }

    onMove?.(candidates[0]!)
  }

  const choosePromotion = (type: PromotionPieceType) => {
    const pending = pendingPromotion
    if (!pending) return
    const mv = pending.options.find((m) => m.promotion === type)
    if (mv) onMove?.(mv)
    setPendingPromotion(null)
  }

  const cancelPromotion = () => setPendingPromotion(null)

  const centerOf = (square: Square) => {
    const { row, col } = squareToDisplay(square, orientation)
    return { x: col * squareSize + squareSize / 2, y: row * squareSize + squareSize / 2 }
  }

  return (
    <div
      ref={boardRef}
      className={[
        'relative aspect-square w-full select-none',
        interactive ? 'touch-pan-y' : '',
      ].join(' ')}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClickCapture={(e) => {
        if (!suppressClickRef.current) return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <PromotionPicker
        open={pendingPromotion !== null}
        color={position.turn}
        onChoose={choosePromotion}
        onCancel={cancelPromotion}
      />

      <AnimatePresence>
        {dragging && squareSize > 0 ? (
          <motion.div
            key={`drag-${dragging.piece.id}`}
            className="pointer-events-none fixed left-0 top-0 z-[70] grid place-items-center"
            style={{
              width: squareSize,
              height: squareSize,
              fontSize: squareSize * 0.78,
              x: ghostX,
              y: ghostY,
              scale: ghostScale,
              rotate: ghostRotate,
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            <div
              className={
                theme === 'dark'
                  ? 'absolute inset-0 rounded-full bg-cyan-300/20 blur-md'
                  : 'absolute inset-0 rounded-full bg-cyan-500/20 blur-md'
              }
            />
            <div
              className={
                theme === 'dark'
                  ? 'absolute inset-[20%] rounded-full bg-slate-950/45 blur-[2px]'
                  : 'absolute inset-[20%] rounded-full bg-slate-200/70 blur-[2px]'
              }
            />
            <PieceGlyph color={dragging.piece.color} type={dragging.piece.type} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 overflow-hidden rounded-2xl border border-slate-800 shadow-glow">
        {Array.from({ length: 64 }, (_, displayIndex) => {
          const row = Math.floor(displayIndex / 8)
          const col = displayIndex % 8
          const square = displayToSquare(row, col, orientation)
          const file = fileOf(square)
          const rank = rankOf(square)
          const dark = (file + rank) % 2 === 0
          const fileLabel = String.fromCharCode(97 + file)
          const rankLabel = String(rank + 1)

          const selected = selectedFrom === square
          const hint = hintBySquare.get(square)
          const isLast = lastMove ? square === lastMove.from || square === lastMove.to : false
          const isCheck = inCheckKing === square
          const isHover = dragging !== null && hoverSquare === square
          const hoverHint = isHover ? hintBySquare.get(square) : undefined
          const heat = heatIntensity?.[square] ?? 0
          const pulseToken = heatPulse?.[square] ?? 0
          const squarePiece = position.board[square]
          const dragTouch = interactive && squarePiece !== null && squarePiece.color === position.turn

          return (
            <button
              key={square}
              data-square={square}
              type="button"
              onClick={() => handleSquareClick(square)}
              className={[
                'relative h-full w-full outline-none',
                theme === 'dark'
                  ? dark
                    ? 'bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900'
                    : 'bg-gradient-to-br from-slate-600 via-slate-600 to-slate-500'
                  : dark
                    ? 'bg-gradient-to-br from-[#b9c8d6] via-[#afbfce] to-[#a7b8c8]'
                    : 'bg-gradient-to-br from-[#f5ecdf] via-[#f0e4d1] to-[#e8d8c2]',
                dragTouch ? 'touch-none' : '',
                selected ? 'ring-2 ring-cyan-300/80 ring-offset-0' : '',
                isLast ? 'ring-1 ring-amber-200/60' : '',
                isCheck ? 'ring-2 ring-rose-400/90' : '',
                isHover
                  ? hoverHint
                    ? 'ring-2 ring-emerald-300/70'
                    : 'ring-2 ring-rose-300/60'
                  : '',
                interactive ? 'cursor-pointer' : 'cursor-default',
              ].join(' ')}
            >
              <motion.div
                className="absolute inset-0"
                style={{ opacity: Math.min(0.75, Math.pow(heat, 0.82) * 0.9) }}
                animate={{ opacity: Math.min(0.75, Math.pow(heat, 0.82) * 0.9) }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <div className="absolute inset-0 bg-orange-500/40 mix-blend-screen" />
              </motion.div>

              <AnimatePresence>
                {pulseToken > 0 ? (
                  <motion.div
                    key={pulseToken}
                    className="absolute inset-0"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: [0, 0.55, 0], scale: [0.98, 1.02, 1] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  >
                    <div className="absolute inset-0 bg-orange-300/35 mix-blend-screen" />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {hint ? (
                <motion.div
                  className="pointer-events-none absolute inset-0 grid place-items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {hint.isCapture ? (
                    <div className="h-5 w-5 rounded-full border-2 border-emerald-300/80 bg-emerald-300/10" />
                  ) : (
                    <div className="h-3 w-3 rounded-full bg-emerald-300/70" />
                  )}
                </motion.div>
              ) : null}

              {showCoordinates && (row === 7 || col === 0) ? (
                <div className="pointer-events-none absolute inset-0">
                  {row === 7 ? (
                    <div
                      className={[
                        'absolute bottom-1 left-1 text-[10px] font-semibold tracking-wide',
                        theme === 'dark'
                          ? dark
                            ? 'text-slate-200/55'
                            : 'text-slate-950/55'
                          : dark
                            ? 'text-slate-800/70'
                            : 'text-slate-600/75',
                      ].join(' ')}
                    >
                      {fileLabel}
                    </div>
                  ) : null}
                  {col === 0 ? (
                    <div
                      className={[
                        'absolute left-1 top-1 text-[10px] font-semibold tracking-wide',
                        theme === 'dark'
                          ? dark
                            ? 'text-slate-200/55'
                            : 'text-slate-950/55'
                          : dark
                            ? 'text-slate-800/70'
                            : 'text-slate-600/75',
                      ].join(' ')}
                    >
                      {rankLabel}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </button>
          )
        })}
      </div>

      <svg className="pointer-events-none absolute inset-0" viewBox={`0 0 ${svgSize} ${svgSize}`}>
        <defs>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.75 0"
            />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {overlayLines.map((l, idx) => {
          const a = centerOf(l.from)
          const b = centerOf(l.to)
          const d = `M ${a.x} ${a.y} L ${b.x} ${b.y}`
          return (
            <motion.path
              key={`${l.kind}-${idx}-${l.from}-${l.to}`}
              d={d}
              fill="none"
              stroke={l.color}
              strokeWidth={l.width}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: l.kind === 'suggestion' ? 0.55 : 0.35, ease: 'easeOut' }}
              style={{ filter: 'url(#softGlow)' }}
            />
          )
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0">
        <AnimatePresence>
          {pieces.map(({ square, piece }) => {
            const { row, col } = squareToDisplay(square, orientation)
            const x = col * squareSize
            const y = row * squareSize
            const hidden = dragging !== null && dragging.from === square
            const selected = selectedFrom === square
            const lift = selected ? -2 : 0
            return (
              <motion.div
                key={piece.id}
                className="absolute grid place-items-center text-slate-50 drop-shadow-[0_10px_12px_rgba(0,0,0,0.35)]"
                style={{
                  width: squareSize,
                  height: squareSize,
                  fontSize: squareSize * 0.78,
                }}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{
                  opacity: hidden ? 0 : 1,
                  scale: hidden ? 0.92 : selected ? 1.05 : 1,
                  x,
                  y: y + lift,
                }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: 'spring', stiffness: 720, damping: 46, mass: 0.7 }}
              >
                <div className="absolute inset-0 grid place-items-center">
                  <div
                    className={[
                      'h-[70%] w-[70%] rounded-full blur-[1px]',
                      piece.color === 'w'
                        ? theme === 'dark'
                          ? 'bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.28),transparent_62%)]'
                          : 'bg-[radial-gradient(circle_at_50%_45%,rgba(245,158,11,0.22),transparent_62%)]'
                        : theme === 'dark'
                          ? 'bg-[radial-gradient(circle_at_50%_45%,rgba(148,163,184,0.26),transparent_62%)]'
                          : 'bg-[radial-gradient(circle_at_50%_45%,rgba(71,85,105,0.24),transparent_62%)]',
                    ].join(' ')}
                  />
                </div>
                <PieceGlyph color={piece.color} type={piece.type} />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
