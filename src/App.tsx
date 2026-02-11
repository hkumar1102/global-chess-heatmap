import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toAlgebraic } from './algorithms/chess/coords'
import { evaluate } from './algorithms/chess/eval'
import { drawByAgreement, makeGameMove, resignGame, timeoutGame } from './algorithms/chess/game'
import { computeMaterial } from './algorithms/chess/material'
import { replayGame } from './algorithms/chess/replay'
import type { Color, Move, MoveRecord, Square } from './algorithms/chess/types'
import { positionKey } from './algorithms/chess/position'
import { computeHeatmapIntensity } from './algorithms/heatmap/prefixSum2d'
import { analyzeDepth2 } from './algorithms/minimax/depth2'
import AuroraBackground from './components/AuroraBackground'
import BoardControls, { type BoardSettings } from './components/BoardControls'
import CapturesPanel from './components/CapturesPanel'
import ChessBoard from './components/ChessBoard'
import CommandPalette, { type CommandAction } from './components/CommandPalette'
import EvalBar from './components/EvalBar'
import HeatLegend from './components/HeatLegend'
import MoveList from './components/MoveList'
import MinimaxPanel from './components/MinimaxPanel'
import TiltStage from './components/TiltStage'
import { fetchServerSnapshot } from './sockets/api'
import type { LiveGameDTO } from './sockets/types'
import { SERVER_SNAPSHOT_QUERY_KEY, useServerConnection } from './sockets/useServerConnection'

type Mode = 'play' | 'watch'
type ThemeMode = 'dark' | 'light'
type TimeControlPresetId = 'bullet_1_0' | 'blitz_3_2' | 'rapid_10_5' | 'classical_15_10'

type TimeControlPreset = {
  id: TimeControlPresetId
  label: string
  baseMs: number
  incrementMs: number
}

type ClockSnapshot = { whiteMs: number; blackMs: number }

const TIME_CONTROL_PRESETS: TimeControlPreset[] = [
  { id: 'bullet_1_0', label: '1+0 Bullet', baseMs: 60_000, incrementMs: 0 },
  { id: 'blitz_3_2', label: '3+2 Blitz', baseMs: 180_000, incrementMs: 2_000 },
  { id: 'rapid_10_5', label: '10+5 Rapid', baseMs: 600_000, incrementMs: 5_000 },
  { id: 'classical_15_10', label: '15+10 Classical', baseMs: 900_000, incrementMs: 10_000 },
]

const DEFAULT_TIME_PRESET = TIME_CONTROL_PRESETS[1]!

function outcomeLabel(outcome: LiveGameDTO['outcome']): string {
  switch (outcome.kind) {
    case 'active':
      return 'Active'
    case 'checkmate':
      return outcome.winner === 'w' ? 'Checkmate (White wins)' : 'Checkmate (Black wins)'
    case 'resignation':
      return outcome.winner === 'w' ? 'White wins by resignation' : 'Black wins by resignation'
    case 'timeout':
      return outcome.winner === 'w' ? 'White wins on time' : 'Black wins on time'
    case 'stalemate':
      return 'Stalemate'
    case 'draw_agreement':
      return 'Draw (Agreement)'
    case 'draw_fifty_move':
      return 'Draw (50-move)'
    case 'draw_seventy_five_move':
      return 'Draw (75-move)'
    case 'draw_repetition':
      return 'Draw (Repetition)'
    case 'draw_fivefold_repetition':
      return 'Draw (Fivefold Repetition)'
    case 'draw_insufficient':
      return 'Draw (Insufficient)'
    default: {
      const _exhaustive: never = outcome
      return _exhaustive
    }
  }
}

type ConnState = 'connecting' | 'online' | 'offline'

function connLabel(state: ConnState): { text: string; dot: string; ring: string } {
  switch (state) {
    case 'connecting':
      return { text: 'Connecting', dot: 'bg-amber-300', ring: 'ring-amber-300/30' }
    case 'online':
      return { text: 'Live', dot: 'bg-emerald-300', ring: 'ring-emerald-300/25' }
    case 'offline':
      return { text: 'Offline', dot: 'bg-rose-300', ring: 'ring-rose-300/25' }
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

type LocalTerminal =
  | { kind: 'resignation'; loser: Color; atPly: number }
  | { kind: 'timeout'; loser: Color; atPly: number }
  | { kind: 'draw_agreement'; atPly: number }
type LocalTimeline = {
  line: Move[]
  cursor: number
  terminal: LocalTerminal | null
  drawOfferBy: Color | null
  clock: {
    baseMs: number
    incrementMs: number
    snapshots: ClockSnapshot[]
    turnStartedAtMs: number | null
  }
}

const STORAGE_KEYS = {
  boardSettings: 'gchm:boardSettings:v1',
  localTimeline: 'gchm:localTimeline:v1',
  mode: 'gchm:mode:v1',
  selectedGameId: 'gchm:selectedGameId:v1',
  theme: 'gchm:theme:v1',
} as const

const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  orientation: 'w',
  showHeatmap: true,
  showPulses: true,
  heatRadius: 1,
  showCoordinates: true,
  showThreats: true,
  showCheckLines: true,
  showSuggestions: true,
  tiltEnabled: true,
  tiltStrength: 0.85,
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function isSquare(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 64
}

function isPromotion(v: unknown): v is 'q' | 'r' | 'b' | 'n' {
  return v === 'q' || v === 'r' || v === 'b' || v === 'n'
}

function isColor(v: unknown): v is Color {
  return v === 'w' || v === 'b'
}

function coerceMode(value: unknown): Mode | null {
  if (value === 'play' || value === 'watch') return value
  return null
}

function coerceTheme(value: unknown): ThemeMode | null {
  if (value === 'dark' || value === 'light') return value
  return null
}

function coerceTimePresetId(value: unknown): TimeControlPresetId | null {
  if (
    value === 'bullet_1_0' ||
    value === 'blitz_3_2' ||
    value === 'rapid_10_5' ||
    value === 'classical_15_10'
  ) {
    return value
  }
  return null
}

function findTimePreset(baseMs: number, incrementMs: number): TimeControlPreset | null {
  return TIME_CONTROL_PRESETS.find((p) => p.baseMs === baseMs && p.incrementMs === incrementMs) ?? null
}

function makeInitialClock(baseMs: number, incrementMs: number): LocalTimeline['clock'] {
  return {
    baseMs,
    incrementMs,
    snapshots: [{ whiteMs: baseMs, blackMs: baseMs }],
    turnStartedAtMs: Date.now(),
  }
}

function makeDefaultLocalTimeline(): LocalTimeline {
  return {
    line: [],
    cursor: 0,
    terminal: null,
    drawOfferBy: null,
    clock: makeInitialClock(DEFAULT_TIME_PRESET.baseMs, DEFAULT_TIME_PRESET.incrementMs),
  }
}

function sanitizeClockSnapshots(
  snapshots: ClockSnapshot[],
  targetLength: number,
  fallback: ClockSnapshot,
): ClockSnapshot[] {
  const out = snapshots.slice(0, Math.max(1, targetLength))
  while (out.length < Math.max(1, targetLength)) out.push({ ...fallback })
  return out
}

function normalizeLocalTimeline(t: LocalTimeline): LocalTimeline {
  const line = t.line.slice()
  const cursor = clamp(t.cursor, 0, line.length)
  const fallbackClock = {
    whiteMs: clamp(t.clock.baseMs, 0, 86_400_000),
    blackMs: clamp(t.clock.baseMs, 0, 86_400_000),
  }
  const snapshots = sanitizeClockSnapshots(t.clock.snapshots, line.length + 1, fallbackClock)
  return {
    ...t,
    line,
    cursor,
    terminal:
      t.terminal && t.terminal.kind !== 'draw_agreement'
        ? { ...t.terminal, atPly: clamp(t.terminal.atPly, 0, line.length) }
        : t.terminal
          ? { kind: 'draw_agreement', atPly: clamp(t.terminal.atPly, 0, line.length) }
          : null,
    clock: {
      baseMs: fallbackClock.whiteMs,
      incrementMs: clamp(t.clock.incrementMs, 0, 60_000),
      snapshots,
      turnStartedAtMs: t.clock.turnStartedAtMs,
    },
  }
}

function formatClock(ms: number): string {
  const safe = Math.max(0, Math.floor(ms))
  const totalSeconds = Math.floor(safe / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const centis = Math.floor((safe % 1000) / 10)
  if (minutes >= 1) return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
}

function clockFlagClass(ms: number): string {
  if (ms <= 5_000) return 'text-rose-200'
  if (ms <= 15_000) return 'text-amber-200'
  return 'text-slate-100'
}

function isEditableActiveElement(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

function loadMode(defaultMode: Mode): Mode {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.mode)
    if (!raw) return defaultMode
    const parsed = safeParseJson(raw)
    const mode = coerceMode(parsed)
    return mode ?? defaultMode
  } catch {
    return defaultMode
  }
}

function loadTheme(defaultTheme: ThemeMode): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.theme)
    if (!raw) return defaultTheme
    const parsed = safeParseJson(raw)
    const theme = coerceTheme(parsed)
    return theme ?? defaultTheme
  } catch {
    return defaultTheme
  }
}

function loadSelectedGameId(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.selectedGameId)
    if (!raw) return null
    const parsed = safeParseJson(raw)
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

function coerceBoardSettings(defaults: BoardSettings): BoardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.boardSettings)
    if (!raw) return defaults
    const parsed = safeParseJson(raw)
    if (!isRecord(parsed)) return defaults

    const next: BoardSettings = { ...defaults }
    const o = parsed.orientation
    if (o === 'w' || o === 'b') next.orientation = o
    if (typeof parsed.showHeatmap === 'boolean') next.showHeatmap = parsed.showHeatmap
    if (typeof parsed.showPulses === 'boolean') next.showPulses = parsed.showPulses
    if (typeof parsed.heatRadius === 'number' && Number.isFinite(parsed.heatRadius)) {
      next.heatRadius = clamp(Math.round(parsed.heatRadius), 0, 3)
    }
    if (typeof parsed.showCoordinates === 'boolean') next.showCoordinates = parsed.showCoordinates
    if (typeof parsed.showThreats === 'boolean') next.showThreats = parsed.showThreats
    if (typeof parsed.showCheckLines === 'boolean') next.showCheckLines = parsed.showCheckLines
    if (typeof parsed.showSuggestions === 'boolean') next.showSuggestions = parsed.showSuggestions
    if (typeof parsed.tiltEnabled === 'boolean') next.tiltEnabled = parsed.tiltEnabled
    if (typeof parsed.tiltStrength === 'number' && Number.isFinite(parsed.tiltStrength)) {
      next.tiltStrength = clamp(parsed.tiltStrength, 0, 1)
    }

    return next
  } catch {
    return defaults
  }
}

function loadLocalTimeline(): LocalTimeline | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.localTimeline)
    if (!raw) return null
    const parsed = safeParseJson(raw)
    if (!isRecord(parsed)) return null
    const lineRaw = parsed.line
    const cursorRaw = parsed.cursor
    const terminalRaw = parsed.terminal
    if (!Array.isArray(lineRaw)) return null
    if (typeof cursorRaw !== 'number' || !Number.isFinite(cursorRaw) || !Number.isInteger(cursorRaw)) return null
    if (lineRaw.length > 4000) return null

    const line: Move[] = []
    for (const mv of lineRaw) {
      if (!isRecord(mv)) return null
      if (!isSquare(mv.from) || !isSquare(mv.to)) return null
      const promotion = mv.promotion
      if (promotion !== undefined && !isPromotion(promotion)) return null
      line.push(
        promotion ? ({ from: mv.from, to: mv.to, promotion } as Move) : ({ from: mv.from, to: mv.to } as Move),
      )
    }

    const cursor = clamp(cursorRaw, 0, line.length)

    let terminal: LocalTerminal | null = null
    if (isRecord(terminalRaw)) {
      const kind = terminalRaw.kind
      const loser = terminalRaw.loser
      const atPly = terminalRaw.atPly
      if (typeof atPly === 'number' && Number.isInteger(atPly)) {
        if (kind === 'resignation' && isColor(loser)) {
          terminal = { kind: 'resignation', loser, atPly: clamp(atPly, 0, line.length) }
        } else if (kind === 'timeout' && isColor(loser)) {
          terminal = { kind: 'timeout', loser, atPly: clamp(atPly, 0, line.length) }
        } else if (kind === 'draw_agreement') {
          terminal = { kind: 'draw_agreement', atPly: clamp(atPly, 0, line.length) }
        }
      }
    }

    const drawOfferRaw = parsed.drawOfferBy
    const drawOfferBy = isColor(drawOfferRaw) ? drawOfferRaw : null

    const presetId = coerceTimePresetId(parsed.timePresetId)
    const preset = TIME_CONTROL_PRESETS.find((p) => p.id === presetId) ?? DEFAULT_TIME_PRESET
    let baseMs = preset.baseMs
    let incrementMs = preset.incrementMs
    let turnStartedAtMs: number | null = null
    let snapshots: ClockSnapshot[] = []

    const clockRaw = parsed.clock
    if (isRecord(clockRaw)) {
      if (typeof clockRaw.baseMs === 'number' && Number.isFinite(clockRaw.baseMs)) {
        baseMs = clamp(Math.round(clockRaw.baseMs), 10_000, 86_400_000)
      }
      if (typeof clockRaw.incrementMs === 'number' && Number.isFinite(clockRaw.incrementMs)) {
        incrementMs = clamp(Math.round(clockRaw.incrementMs), 0, 60_000)
      }
      if (typeof clockRaw.turnStartedAtMs === 'number' && Number.isFinite(clockRaw.turnStartedAtMs)) {
        turnStartedAtMs = clockRaw.turnStartedAtMs
      }
      if (Array.isArray(clockRaw.snapshots) && clockRaw.snapshots.length <= 5000) {
        for (const s of clockRaw.snapshots) {
          if (!isRecord(s)) {
            snapshots = []
            break
          }
          const whiteMs = s.whiteMs
          const blackMs = s.blackMs
          if (
            typeof whiteMs !== 'number' ||
            typeof blackMs !== 'number' ||
            !Number.isFinite(whiteMs) ||
            !Number.isFinite(blackMs)
          ) {
            snapshots = []
            break
          }
          snapshots.push({
            whiteMs: clamp(Math.round(whiteMs), 0, 86_400_000),
            blackMs: clamp(Math.round(blackMs), 0, 86_400_000),
          })
        }
      }
    }

    const fallbackSnapshot: ClockSnapshot = { whiteMs: baseMs, blackMs: baseMs }
    const normalizedSnapshots = sanitizeClockSnapshots(snapshots, line.length + 1, fallbackSnapshot)
    turnStartedAtMs = null

    return normalizeLocalTimeline({
      line,
      cursor,
      terminal,
      drawOfferBy,
      clock: {
        baseMs,
        incrementMs,
        snapshots: normalizedSnapshots,
        turnStartedAtMs,
      },
    })
  } catch {
    return null
  }
}

function formatSignedPawns(scoreCp: number): string {
  if (Math.abs(scoreCp) >= 90_000) return scoreCp > 0 ? '+Mate' : '-Mate'
  const pawns = scoreCp / 100
  const sign = pawns >= 0 ? '+' : ''
  return `${sign}${pawns.toFixed(2)}`
}

function outcomeResultToken(outcome: LiveGameDTO['outcome']): string {
  switch (outcome.kind) {
    case 'active':
      return '*'
    case 'checkmate':
    case 'resignation':
    case 'timeout':
      return outcome.winner === 'w' ? '1-0' : '0-1'
    case 'stalemate':
    case 'draw_agreement':
    case 'draw_fifty_move':
    case 'draw_seventy_five_move':
    case 'draw_repetition':
    case 'draw_fivefold_repetition':
    case 'draw_insufficient':
      return '1/2-1/2'
    default: {
      const _exhaustive: never = outcome
      return _exhaustive
    }
  }
}

function buildLocalPgn(records: readonly MoveRecord[], outcome: LiveGameDTO['outcome']): string {
  const date = new Date().toISOString().slice(0, 10)
  const moves: string[] = []
  for (let i = 0; i < records.length; i += 2) {
    const moveNo = Math.floor(i / 2) + 1
    const white = records[i]?.san ?? ''
    const black = records[i + 1]?.san ?? ''
    moves.push(`${moveNo}. ${white}${black ? ` ${black}` : ''}`)
  }
  const result = outcomeResultToken(outcome)
  const moveText = moves.join(' ').trim()
  return [
    '[Event "Global Chess Heatmap Local Match"]',
    '[Site "Local"]',
    `[Date "${date}"]`,
    '[Round "-"]',
    '[White "White"]',
    '[Black "Black"]',
    `[Result "${result}"]`,
    '',
    moveText.length > 0 ? `${moveText} ${result}` : result,
  ].join('\n')
}

function applyLocalTerminalOutcome(
  game: ReturnType<typeof replayGame>,
  terminal: LocalTerminal | null,
  cursor: number,
): ReturnType<typeof replayGame> {
  if (!terminal) return game
  if (cursor < terminal.atPly) return game
  if (game.outcome.kind !== 'active') return game
  if (terminal.kind === 'resignation') return resignGame(game, terminal.loser)
  if (terminal.kind === 'timeout') return timeoutGame(game, terminal.loser)
  return drawByAgreement(game)
}

function outcomePill(outcome: LiveGameDTO['outcome']): { text: string; className: string } {
  const text = outcomeLabel(outcome)
  switch (outcome.kind) {
    case 'active':
      return { text, className: 'bg-emerald-500/10 text-emerald-100 ring-emerald-200/20' }
    case 'checkmate':
    case 'resignation':
    case 'timeout':
      return { text, className: 'bg-rose-500/10 text-rose-100 ring-rose-200/20' }
    case 'stalemate':
    case 'draw_agreement':
    case 'draw_fifty_move':
    case 'draw_seventy_five_move':
    case 'draw_repetition':
    case 'draw_fivefold_repetition':
    case 'draw_insufficient':
      return { text, className: 'bg-amber-500/10 text-amber-100 ring-amber-200/20' }
    default: {
      const _exhaustive: never = outcome
      return _exhaustive
    }
  }
}

export default function App() {
  const reduceMotion = useReducedMotion()
  useServerConnection()

  const snapshotQuery = useQuery({
    queryKey: SERVER_SNAPSHOT_QUERY_KEY,
    queryFn: fetchServerSnapshot,
  })

  const snapshot = snapshotQuery.data

  const [mode, setMode] = useState<Mode>(() => loadMode('play'))
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme('dark'))
  const [selectedGameId, setSelectedGameId] = useState<string | null>(() => loadSelectedGameId())
  const [local, setLocal] = useState<LocalTimeline>(() => loadLocalTimeline() ?? makeDefaultLocalTimeline())
  const [boardSettings, setBoardSettings] = useState<BoardSettings>(() => coerceBoardSettings(DEFAULT_BOARD_SETTINGS))
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now())
  const [pgnCopyState, setPgnCopyState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const closePalette = useCallback(() => setPaletteOpen(false), [])

  const patchSettings = useCallback((patch: Partial<BoardSettings>) => {
    setBoardSettings((s) => ({ ...s, ...patch }))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.mode, JSON.stringify(mode))
    } catch {
      // ignore
    }
  }, [mode])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(theme))
    } catch {
      // ignore
    }
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    return () => {
      if (document.documentElement.dataset.theme === theme) {
        delete document.documentElement.dataset.theme
      }
    }
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.selectedGameId, JSON.stringify(selectedGameId))
    } catch {
      // ignore
    }
  }, [selectedGameId])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.boardSettings, JSON.stringify(boardSettings))
    } catch {
      // ignore
    }
  }, [boardSettings])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.localTimeline, JSON.stringify(local))
    } catch {
      // ignore
    }
  }, [local])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const key = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (!mod || key !== 'k') return
      if (isEditableActiveElement()) return
      e.preventDefault()
      setPaletteOpen((o) => !o)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (selectedGameId) return
    const first = snapshot?.games[0]
    if (first) setSelectedGameId(first.id)
  }, [selectedGameId, snapshot?.games])

  const selectedLiveGame = useMemo(() => {
    if (!snapshot?.games.length) return null
    return snapshot.games.find((g) => g.id === selectedGameId) ?? snapshot.games[0]!
  }, [selectedGameId, snapshot?.games])

  const heatCounts = snapshot?.heatmapCounts ?? Array.from({ length: 64 }, () => 0)
  const { intensity: heatIntensityRaw, smoothedCounts: heatSmoothedCounts, maxSmoothed } = useMemo(
    () => computeHeatmapIntensity(heatCounts, boardSettings.heatRadius),
    [boardSettings.heatRadius, heatCounts],
  )
  const heatIntensity = boardSettings.showHeatmap ? heatIntensityRaw : undefined
  const heatTop = useMemo(() => {
    const entries: Array<{ square: string; count: number; intensity: number }> = []
    for (let sq = 0; sq < 64; sq += 1) {
      const count = heatSmoothedCounts[sq] ?? 0
      if (count <= 0) continue
      entries.push({
        square: toAlgebraic(sq as Square),
        count,
        intensity: heatIntensityRaw[sq] ?? 0,
      })
    }
    entries.sort((a, b) => b.count - a.count)
    return entries.slice(0, 4)
  }, [heatIntensityRaw, heatSmoothedCounts])

  const [heatPulse, setHeatPulse] = useState<number[]>(() => Array.from({ length: 64 }, () => 0))
  const prevCountsRef = useRef<number[] | null>(null)
  useEffect(() => {
    setHeatPulse((prevPulse) => {
      const prev = prevCountsRef.current
      if (!prev) {
        prevCountsRef.current = heatCounts.slice()
        return prevPulse
      }
      const next = prevPulse.slice()
      for (let i = 0; i < 64; i += 1) {
        const a = prev[i] ?? 0
        const b = heatCounts[i] ?? 0
        if (a !== b) next[i] = (next[i] ?? 0) + 1
      }
      prevCountsRef.current = heatCounts.slice()
      return next
    })
  }, [heatCounts])

  const localCursor = Math.min(local.cursor, local.line.length)
  const localFullGameBase = useMemo(() => replayGame('local', local.line), [local.line])
  const localViewGameBase = useMemo(
    () => replayGame('local', local.line.slice(0, localCursor)),
    [local.line, localCursor],
  )
  const localFullGame = useMemo(
    () => applyLocalTerminalOutcome(localFullGameBase, local.terminal, local.line.length),
    [local.line.length, local.terminal, localFullGameBase],
  )
  const localViewGame = useMemo(
    () => applyLocalTerminalOutcome(localViewGameBase, local.terminal, localCursor),
    [local.terminal, localCursor, localViewGameBase],
  )
  const localPgn = useMemo(
    () => buildLocalPgn(localFullGame.history, localFullGame.outcome),
    [localFullGame.history, localFullGame.outcome],
  )

  const copyLocalPgn = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(localPgn)
      } else {
        const ta = document.createElement('textarea')
        ta.value = localPgn
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (!ok) throw new Error('copy failed')
      }
      setPgnCopyState('ok')
    } catch {
      setPgnCopyState('fail')
    }
  }, [localPgn])

  useEffect(() => {
    if (pgnCopyState === 'idle') return
    const id = window.setTimeout(() => setPgnCopyState('idle'), 1800)
    return () => window.clearTimeout(id)
  }, [pgnCopyState])

  const localClockSnapshot =
    local.clock.snapshots[localCursor] ??
    local.clock.snapshots.at(-1) ?? { whiteMs: local.clock.baseMs, blackMs: local.clock.baseMs }

  const shouldClockBeRunning =
    mode === 'play' && localCursor === local.line.length && localViewGame.outcome.kind === 'active'
  const localClockShouldRun = shouldClockBeRunning && local.clock.turnStartedAtMs !== null

  const localClock = useMemo<ClockSnapshot>(() => {
    const base = {
      whiteMs: localClockSnapshot.whiteMs,
      blackMs: localClockSnapshot.blackMs,
    }
    if (!localClockShouldRun || local.clock.turnStartedAtMs === null) return base
    const elapsed = Math.max(0, clockNowMs - local.clock.turnStartedAtMs)
    if (localViewGame.position.turn === 'w') return { whiteMs: Math.max(0, base.whiteMs - elapsed), blackMs: base.blackMs }
    return { whiteMs: base.whiteMs, blackMs: Math.max(0, base.blackMs - elapsed) }
  }, [
    clockNowMs,
    local.clock.turnStartedAtMs,
    localClockShouldRun,
    localClockSnapshot.blackMs,
    localClockSnapshot.whiteMs,
    localViewGame.position.turn,
  ])

  const selectedTimePreset = useMemo(
    () => findTimePreset(local.clock.baseMs, local.clock.incrementMs),
    [local.clock.baseMs, local.clock.incrementMs],
  )

  const boardPosition = mode === 'play' ? localViewGame.position : selectedLiveGame?.position ?? null
  const lastMove = useMemo(() => {
    if (mode === 'play') return localViewGame.history.at(-1)?.move ?? null
    return selectedLiveGame?.lastMove?.move ?? null
  }, [localViewGame.history, mode, selectedLiveGame?.lastMove])

  const canPlay = mode === 'play' && localViewGame.outcome.kind === 'active'

  useEffect(() => {
    setLocal((t) => {
      const running = t.clock.turnStartedAtMs !== null
      if (shouldClockBeRunning && !running) {
        return {
          ...t,
          clock: {
            ...t.clock,
            turnStartedAtMs: Date.now(),
          },
        }
      }
      if (!shouldClockBeRunning && running) {
        return {
          ...t,
          clock: {
            ...t.clock,
            turnStartedAtMs: null,
          },
        }
      }
      return t
    })
  }, [shouldClockBeRunning])

  useEffect(() => {
    if (!localClockShouldRun) return
    const id = window.setInterval(() => setClockNowMs(Date.now()), 120)
    return () => window.clearInterval(id)
  }, [localClockShouldRun])

  useEffect(() => {
    if (mode !== 'play') return
    if (localCursor !== local.line.length) return
    if (local.terminal !== null) return
    if (localViewGame.outcome.kind !== 'active') return

    const sideToMove = localViewGame.position.turn
    const remaining = sideToMove === 'w' ? localClock.whiteMs : localClock.blackMs
    if (remaining > 0) return

    setLocal((t) => {
      if (t.terminal !== null) return t
      const cursor = clamp(t.cursor, 0, t.line.length)
      if (cursor !== t.line.length) return t
      const view = applyLocalTerminalOutcome(replayGame('local', t.line), t.terminal, cursor)
      if (view.outcome.kind !== 'active') return t
      const loser = view.position.turn
      const terminal: LocalTerminal = { kind: 'timeout', loser, atPly: cursor }
      return {
        ...t,
        drawOfferBy: null,
        terminal,
        clock: {
          ...t.clock,
          turnStartedAtMs: null,
        },
      }
    })
  }, [
    local.line,
    local.line.length,
    local.terminal,
    localClock.blackMs,
    localClock.whiteMs,
    localCursor,
    localViewGame.outcome.kind,
    localViewGame.position.turn,
    mode,
  ])

  useEffect(() => {
    if (mode !== 'play') return
    if (local.drawOfferBy === null) return
    if (localViewGame.outcome.kind === 'active') return
    setLocal((t) => (t.drawOfferBy === null ? t : { ...t, drawOfferBy: null }))
  }, [local.drawOfferBy, localViewGame.outcome.kind, mode])

  const minimaxQuery = useQuery({
    queryKey: ['minimax', positionKey(localViewGame.position)],
    queryFn: async () => analyzeDepth2(localViewGame.position, 6),
    enabled: mode === 'play' && localViewGame.outcome.kind === 'active',
    staleTime: 0,
  })

  const minimax = minimaxQuery.data ?? null
  const evalScoreWhite = useMemo(() => {
    if (!boardPosition) return null
    if (mode !== 'play') return evaluate(boardPosition)
    const best = minimax?.lines[0]?.score
    return typeof best === 'number' ? best : evaluate(boardPosition)
  }, [boardPosition, minimax, mode])

  const material = useMemo(() => (boardPosition ? computeMaterial(boardPosition) : null), [boardPosition])
  const minimaxArrows = useMemo(() => {
    if (!minimax) return undefined
    return minimax.lines.slice(0, 3).map((l, idx) => ({
      from: l.move.from,
      to: l.move.to,
      tone: l.scoreRelative > 35 ? ('good' as const) : l.scoreRelative < -35 ? ('bad' as const) : ('neutral' as const),
      strength: 1 / (idx + 1),
    }))
  }, [minimax])

  const handleLocalMove = useCallback((move: Move) => {
    setLocal((t) => {
      const cursor = clamp(t.cursor, 0, t.line.length)
      const line = t.line.slice(0, cursor)
      const fallbackSnapshot = { whiteMs: t.clock.baseMs, blackMs: t.clock.baseMs }
      const snapshots = sanitizeClockSnapshots(t.clock.snapshots, line.length + 1, fallbackSnapshot)
      const view = applyLocalTerminalOutcome(replayGame('local', line), t.terminal, cursor)
      if (view.outcome.kind !== 'active') return t

      const mover = view.position.turn
      const base = snapshots[cursor] ?? fallbackSnapshot
      let whiteMs = base.whiteMs
      let blackMs = base.blackMs

      const now = Date.now()
      if (cursor === t.line.length && t.clock.turnStartedAtMs !== null) {
        const elapsed = Math.max(0, now - t.clock.turnStartedAtMs)
        if (mover === 'w') whiteMs = Math.max(0, whiteMs - elapsed)
        else blackMs = Math.max(0, blackMs - elapsed)
      }

      if ((mover === 'w' ? whiteMs : blackMs) <= 0) {
        const terminal: LocalTerminal = { kind: 'timeout', loser: mover, atPly: cursor }
        return {
          ...t,
          line,
          cursor,
          terminal,
          drawOfferBy: null,
          clock: {
            ...t.clock,
            snapshots,
            turnStartedAtMs: null,
          },
        }
      }

      let after: ReturnType<typeof makeGameMove>
      try {
        after = makeGameMove(view, move)
      } catch {
        return t
      }

      if (mover === 'w') whiteMs = Math.max(0, whiteMs) + t.clock.incrementMs
      else blackMs = Math.max(0, blackMs) + t.clock.incrementMs

      const nextLine = [...line, move]
      const nextSnapshots = [...snapshots, { whiteMs, blackMs }]
      return normalizeLocalTimeline({
        line: nextLine,
        cursor: nextLine.length,
        terminal: null,
        drawOfferBy: null,
        clock: {
          ...t.clock,
          snapshots: nextSnapshots,
          turnStartedAtMs: after.outcome.kind === 'active' ? now : null,
        },
      })
    })
  }, [])

  const resetLocal = useCallback(
    () =>
      setLocal((t) => ({
        line: [],
        cursor: 0,
        terminal: null,
        drawOfferBy: null,
        clock: makeInitialClock(t.clock.baseMs, t.clock.incrementMs),
      })),
    [],
  )
  const jumpLocal = useCallback(
    (cursor: number) =>
      setLocal((t) => {
        const nextCursor = clamp(cursor, 0, t.line.length)
        const view = applyLocalTerminalOutcome(replayGame('local', t.line.slice(0, nextCursor)), t.terminal, nextCursor)
        const turnStartedAtMs = nextCursor === t.line.length && view.outcome.kind === 'active' ? Date.now() : null
        return {
          ...t,
          cursor: nextCursor,
          clock: {
            ...t.clock,
            turnStartedAtMs,
          },
        }
      }),
    [],
  )
  const shiftLocal = useCallback(
    (delta: number) =>
      setLocal((t) => {
        const nextCursor = clamp(t.cursor + delta, 0, t.line.length)
        const view = applyLocalTerminalOutcome(replayGame('local', t.line.slice(0, nextCursor)), t.terminal, nextCursor)
        const turnStartedAtMs = nextCursor === t.line.length && view.outcome.kind === 'active' ? Date.now() : null
        return {
          ...t,
          cursor: nextCursor,
          clock: {
            ...t.clock,
            turnStartedAtMs,
          },
        }
      }),
    [],
  )
  const undoLocal = useCallback(
    () => shiftLocal(-1),
    [shiftLocal],
  )
  const redoLocal = useCallback(
    () => shiftLocal(1),
    [shiftLocal],
  )
  const resignLocal = useCallback(
    () =>
      setLocal((t) => {
        const cursor = clamp(t.cursor, 0, t.line.length)
        const line = t.line.slice(0, cursor)
        const view = applyLocalTerminalOutcome(replayGame('local', line), t.terminal, cursor)
        if (view.outcome.kind !== 'active') return t
        const terminal: LocalTerminal = { kind: 'resignation', loser: view.position.turn, atPly: cursor }
        return {
          ...t,
          line,
          cursor,
          terminal,
          drawOfferBy: null,
          clock: {
            ...t.clock,
            turnStartedAtMs: null,
            snapshots: sanitizeClockSnapshots(t.clock.snapshots, line.length + 1, {
              whiteMs: t.clock.baseMs,
              blackMs: t.clock.baseMs,
            }),
          },
        }
      }),
    [],
  )

  const offerDrawLocal = useCallback(
    () =>
      setLocal((t) => {
        if (t.drawOfferBy !== null) return t
        const cursor = clamp(t.cursor, 0, t.line.length)
        if (cursor !== t.line.length) return t
        const view = applyLocalTerminalOutcome(replayGame('local', t.line), t.terminal, cursor)
        if (view.outcome.kind !== 'active') return t
        return { ...t, drawOfferBy: view.position.turn }
      }),
    [],
  )

  const declineDrawLocal = useCallback(
    () =>
      setLocal((t) => {
        if (t.drawOfferBy === null) return t
        return { ...t, drawOfferBy: null }
      }),
    [],
  )

  const acceptDrawLocal = useCallback(
    () =>
      setLocal((t) => {
        const cursor = clamp(t.cursor, 0, t.line.length)
        if (cursor !== t.line.length) return t
        if (t.drawOfferBy === null) return t
        const view = applyLocalTerminalOutcome(replayGame('local', t.line), t.terminal, cursor)
        if (view.outcome.kind !== 'active') return t
        return {
          ...t,
          drawOfferBy: null,
          terminal: { kind: 'draw_agreement', atPly: cursor },
          clock: { ...t.clock, turnStartedAtMs: null },
        }
      }),
    [],
  )

  const applyTimePreset = useCallback(
    (preset: TimeControlPreset) =>
      setLocal(() => ({
        line: [],
        cursor: 0,
        terminal: null,
        drawOfferBy: null,
        clock: makeInitialClock(preset.baseMs, preset.incrementMs),
      })),
    [],
  )

  useEffect(() => {
    if (mode !== 'play') return
    if (paletteOpen) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (isEditableActiveElement()) return

      const key = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey

      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redoLocal()
        else undoLocal()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        redoLocal()
        return
      }

      if (!mod && key === 'arrowleft') {
        e.preventDefault()
        undoLocal()
        return
      }
      if (!mod && key === 'arrowright') {
        e.preventDefault()
        redoLocal()
        return
      }
      if (!mod && key === 'home') {
        e.preventDefault()
        jumpLocal(0)
        return
      }
      if (!mod && key === 'end') {
        e.preventDefault()
        jumpLocal(local.line.length)
        return
      }
      if (!mod && key === 'r') {
        e.preventDefault()
        resetLocal()
        return
      }
      if (!mod && key === 'x') {
        e.preventDefault()
        resignLocal()
        return
      }
      if (!mod && key === 'g') {
        e.preventDefault()
        void copyLocalPgn()
        return
      }
      if (!mod && key === 'd') {
        e.preventDefault()
        if (local.drawOfferBy === null) offerDrawLocal()
        else acceptDrawLocal()
        return
      }
      if (!mod && key === 'escape' && local.drawOfferBy !== null) {
        e.preventDefault()
        declineDrawLocal()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [
    acceptDrawLocal,
    declineDrawLocal,
    jumpLocal,
    local.drawOfferBy,
    local.line.length,
    mode,
    copyLocalPgn,
    offerDrawLocal,
    paletteOpen,
    redoLocal,
    resignLocal,
    resetLocal,
    undoLocal,
  ])

  const paletteActions = useMemo<CommandAction[]>(() => {
    const actions: CommandAction[] = []

    actions.push(
      {
        id: 'mode.play',
        section: 'Mode',
        title: 'Switch to Play Mode',
        subtitle: 'Local match (interactive)',
        shortcut: 'P',
        enabled: mode !== 'play',
        perform: () => setMode('play'),
      },
      {
        id: 'mode.watch',
        section: 'Mode',
        title: 'Switch to Watch Live',
        subtitle: 'Select a streaming game',
        shortcut: 'W',
        enabled: mode !== 'watch',
        perform: () => setMode('watch'),
      },
    )

    actions.push({
      id: 'theme.toggle',
      section: 'Theme',
      title: theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme',
      shortcut: 'T',
      perform: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    })

    actions.push(
      {
        id: 'local.undo',
        section: 'Local',
        title: 'Undo',
        shortcut: 'Ctrl+Z',
        enabled: mode === 'play' && localCursor > 0,
        perform: undoLocal,
      },
      {
        id: 'local.redo',
        section: 'Local',
        title: 'Redo',
        shortcut: 'Ctrl+Y',
        enabled: mode === 'play' && localCursor < local.line.length,
        perform: redoLocal,
      },
      {
        id: 'local.reset',
        section: 'Local',
        title: 'Reset Local Game',
        shortcut: 'R',
        enabled: mode === 'play' && (local.line.length > 0 || local.terminal !== null || local.drawOfferBy !== null),
        perform: resetLocal,
      },
      {
        id: 'local.resign',
        section: 'Local',
        title: 'Resign Current Side',
        shortcut: 'X',
        enabled: mode === 'play' && canPlay,
        perform: resignLocal,
      },
      {
        id: 'local.copy.pgn',
        section: 'Local',
        title: 'Copy PGN',
        shortcut: 'G',
        enabled: mode === 'play' && localFullGame.history.length > 0,
        perform: () => {
          void copyLocalPgn()
        },
      },
      {
        id: 'local.draw.offer',
        section: 'Local',
        title: 'Offer Draw',
        shortcut: 'D',
        enabled: mode === 'play' && canPlay && localCursor === local.line.length && local.drawOfferBy === null,
        perform: offerDrawLocal,
      },
      {
        id: 'local.draw.accept',
        section: 'Local',
        title: 'Accept Draw Offer',
        subtitle: 'Ends game as draw agreement',
        enabled: mode === 'play' && canPlay && local.drawOfferBy !== null,
        perform: acceptDrawLocal,
      },
      {
        id: 'local.draw.decline',
        section: 'Local',
        title: 'Decline Draw Offer',
        enabled: mode === 'play' && canPlay && local.drawOfferBy !== null,
        perform: declineDrawLocal,
      },
    )

    for (const preset of TIME_CONTROL_PRESETS) {
      actions.push({
        id: `clock.${preset.id}`,
        section: 'Clock',
        title: `Time Control: ${preset.label}`,
        subtitle:
          local.clock.baseMs === preset.baseMs && local.clock.incrementMs === preset.incrementMs
            ? 'Current'
            : 'Starts a fresh local match',
        enabled:
          mode === 'play' &&
          !(local.clock.baseMs === preset.baseMs && local.clock.incrementMs === preset.incrementMs),
        perform: () => applyTimePreset(preset),
      })
    }

    actions.push(
      {
        id: 'board.flip',
        section: 'Board',
        title: 'Flip Board',
        subtitle: boardSettings.orientation === 'w' ? 'White at bottom' : 'Black at bottom',
        perform: () =>
          patchSettings({ orientation: boardSettings.orientation === 'w' ? 'b' : 'w' }),
      },
      {
        id: 'overlay.heatmap',
        section: 'Overlays',
        title: boardSettings.showHeatmap ? 'Disable Heatmap' : 'Enable Heatmap',
        perform: () => patchSettings({ showHeatmap: !boardSettings.showHeatmap }),
      },
      {
        id: 'overlay.pulses',
        section: 'Overlays',
        title: boardSettings.showPulses ? 'Disable Heat Pulses' : 'Enable Heat Pulses',
        enabled: boardSettings.showHeatmap,
        perform: () => patchSettings({ showPulses: !boardSettings.showPulses }),
      },
      {
        id: 'overlay.coords',
        section: 'Overlays',
        title: boardSettings.showCoordinates ? 'Hide Coordinates' : 'Show Coordinates',
        perform: () => patchSettings({ showCoordinates: !boardSettings.showCoordinates }),
      },
      {
        id: 'overlay.threats',
        section: 'Overlays',
        title: boardSettings.showThreats ? 'Hide Threat Rays' : 'Show Threat Rays',
        perform: () => patchSettings({ showThreats: !boardSettings.showThreats }),
      },
      {
        id: 'overlay.check',
        section: 'Overlays',
        title: boardSettings.showCheckLines ? 'Hide Check Lines' : 'Show Check Lines',
        perform: () => patchSettings({ showCheckLines: !boardSettings.showCheckLines }),
      },
      {
        id: 'overlay.suggestions',
        section: 'Overlays',
        title: boardSettings.showSuggestions ? 'Hide Minimax Arrows' : 'Show Minimax Arrows',
        perform: () => patchSettings({ showSuggestions: !boardSettings.showSuggestions }),
      },
    )

    actions.push(
      {
        id: 'heat.radius.down',
        section: 'Heatmap',
        title: 'Decrease Heat Radius',
        enabled: boardSettings.showHeatmap && boardSettings.heatRadius > 0,
        perform: () => patchSettings({ heatRadius: clamp(boardSettings.heatRadius - 1, 0, 3) }),
      },
      {
        id: 'heat.radius.up',
        section: 'Heatmap',
        title: 'Increase Heat Radius',
        enabled: boardSettings.showHeatmap && boardSettings.heatRadius < 3,
        perform: () => patchSettings({ heatRadius: clamp(boardSettings.heatRadius + 1, 0, 3) }),
      },
    )

    actions.push(
      {
        id: 'tilt.toggle',
        section: 'Tilt',
        title: boardSettings.tiltEnabled ? 'Disable 3D Tilt' : 'Enable 3D Tilt',
        perform: () => patchSettings({ tiltEnabled: !boardSettings.tiltEnabled }),
      },
      {
        id: 'tilt.strength.down',
        section: 'Tilt',
        title: 'Decrease Tilt Strength',
        enabled: boardSettings.tiltEnabled && boardSettings.tiltStrength > 0,
        perform: () => patchSettings({ tiltStrength: clamp(boardSettings.tiltStrength - 0.1, 0, 1) }),
      },
      {
        id: 'tilt.strength.up',
        section: 'Tilt',
        title: 'Increase Tilt Strength',
        enabled: boardSettings.tiltEnabled && boardSettings.tiltStrength < 1,
        perform: () => patchSettings({ tiltStrength: clamp(boardSettings.tiltStrength + 0.1, 0, 1) }),
      },
    )

    for (const g of snapshot?.games ?? []) {
      actions.push({
        id: `live.${g.id}`,
        section: 'Live Games',
        title: `Watch: ${g.white} vs ${g.black}`,
        subtitle: g.lastMove ? `Last: ${g.lastMove.san}` : 'Opening...',
        enabled: true,
        perform: () => {
          setMode('watch')
          setSelectedGameId(g.id)
        },
      })
    }

    return actions
  }, [
    boardSettings.heatRadius,
    boardSettings.orientation,
    boardSettings.showCheckLines,
    boardSettings.showCoordinates,
    boardSettings.showHeatmap,
    boardSettings.showPulses,
    boardSettings.showSuggestions,
    boardSettings.showThreats,
    boardSettings.tiltEnabled,
    boardSettings.tiltStrength,
    local.clock.baseMs,
    local.clock.incrementMs,
    local.drawOfferBy,
    localFullGame.history.length,
    local.line.length,
    local.terminal,
    localCursor,
    mode,
    theme,
    acceptDrawLocal,
    applyTimePreset,
    canPlay,
    copyLocalPgn,
    declineDrawLocal,
    offerDrawLocal,
    patchSettings,
    redoLocal,
    resignLocal,
    resetLocal,
    snapshot?.games,
    undoLocal,
  ])

  const connState: ConnState = snapshotQuery.isLoading
    ? 'connecting'
    : snapshotQuery.isError
      ? 'offline'
      : 'online'
  const conn = connLabel(connState)
  const localOutcomeStyle = outcomePill(localViewGame.outcome)

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-slate-950 text-slate-100">
      <AuroraBackground theme={theme} />
      <CommandPalette open={paletteOpen} onClose={closePalette} actions={paletteActions} />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold tracking-wide text-slate-100">
                Global Chess Heatmap
              </div>
              <div className={['inline-flex items-center gap-2 rounded-full px-2 py-1 text-[11px] font-semibold ring-1', conn.ring].join(' ')}>
                <motion.span
                  className={['h-1.5 w-1.5 rounded-full', conn.dot].join(' ')}
                  animate={connState === 'connecting' ? { scale: [1, 1.6, 1], opacity: [0.6, 1, 0.6] } : { scale: 1, opacity: 1 }}
                  transition={connState === 'connecting' ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                />
                <span className="text-slate-200">{conn.text}</span>
              </div>
            </div>
            <div className="text-xs text-slate-400">
              Live games / prefix-sum heatmaps / depth-2 minimax / 3D tilt
            </div>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="group inline-flex items-center gap-2 rounded-xl bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-200 ring-1 ring-slate-800 outline-none"
              whileHover={reduceMotion ? undefined : { y: -1, backgroundColor: 'rgba(15,23,42,0.65)' }}
              whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
              title="Open command palette (Ctrl/Cmd+K)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
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
              <span className="hidden sm:inline">Commands</span>
              <span className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/20 px-2 py-1 text-[11px] font-semibold text-slate-400">
                Ctrl K
              </span>
            </motion.button>

            <motion.button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="group inline-flex items-center gap-2 rounded-xl bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-200 ring-1 ring-slate-800 outline-none"
              whileHover={reduceMotion ? undefined : { y: -1, backgroundColor: 'rgba(15,23,42,0.65)' }}
              whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
              title="Toggle theme"
            >
              {theme === 'dark' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </motion.button>

            <LayoutGroup>
              <div className="flex items-center rounded-xl bg-slate-900/40 p-1 ring-1 ring-slate-800">
                <motion.button
                  type="button"
                  aria-pressed={mode === 'play'}
                  onClick={() => setMode('play')}
                  className={[
                    'relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold outline-none',
                    'whitespace-nowrap',
                    mode === 'play' ? 'text-cyan-100' : 'text-slate-300',
                  ].join(' ')}
                  whileHover={reduceMotion ? undefined : { y: -1 }}
                  whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                >
                  {mode === 'play' ? (
                    <motion.div
                      layoutId="mode-pill"
                      className="absolute inset-0 rounded-lg bg-cyan-500/20 ring-1 ring-cyan-300/40"
                      transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }}
                    />
                  ) : null}
                  <span className="relative inline-flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-90">
                      <path
                        d="M8 5h8M9 9h6M10 13h4M8 19h8"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                    Play
                  </span>
                </motion.button>

                <motion.button
                  type="button"
                  aria-pressed={mode === 'watch'}
                  onClick={() => setMode('watch')}
                  className={[
                    'relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold outline-none',
                    'whitespace-nowrap',
                    mode === 'watch' ? 'text-cyan-100' : 'text-slate-300',
                  ].join(' ')}
                  whileHover={reduceMotion ? undefined : { y: -1 }}
                  whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                >
                  {mode === 'watch' ? (
                    <motion.div
                      layoutId="mode-pill"
                      className="absolute inset-0 rounded-lg bg-cyan-500/20 ring-1 ring-cyan-300/40"
                      transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }}
                    />
                  ) : null}
                  <span className="relative inline-flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-90">
                      <path
                        d="M4 12c2.6-4.4 5.8-6.6 8-6.6s5.4 2.2 8 6.6c-2.6 4.4-5.8 6.6-8 6.6S6.6 16.4 4 12Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                    </svg>
                    Watch Live
                  </span>
                </motion.button>
              </div>
            </LayoutGroup>
          </div>
        </header>

        <main className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/20 p-4 shadow-glow">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  {mode === 'play' ? 'Local Match' : selectedLiveGame ? `${selectedLiveGame.white} vs ${selectedLiveGame.black}` : 'Live Game'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Heat radius: {boardSettings.heatRadius} / Smoothed max: {maxSmoothed}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {mode === 'play'
                    ? `Time control: ${selectedTimePreset?.label ?? `${Math.round(local.clock.baseMs / 60_000)}+${Math.round(local.clock.incrementMs / 1000)}`}`
                    : 'Streaming engine games'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {mode === 'watch' ? (
                  <div className="rounded-lg bg-slate-900/40 px-3 py-2 text-[11px] font-semibold text-slate-300 ring-1 ring-slate-800">
                    View-only
                  </div>
                ) : null}
                {mode === 'play' ? (
                  <motion.button
                    type="button"
                    onClick={resetLocal}
                    className="rounded-lg bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-300 ring-1 ring-slate-800 outline-none"
                    whileHover={reduceMotion ? undefined : { y: -1, backgroundColor: 'rgba(15,23,42,0.65)' }}
                    whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                  >
                    Reset
                  </motion.button>
                ) : null}
                {mode === 'play' && localFullGame.history.length > 0 ? (
                  <motion.button
                    type="button"
                    onClick={() => {
                      void copyLocalPgn()
                    }}
                    className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-300/30 outline-none"
                    whileHover={reduceMotion ? undefined : { y: -1, backgroundColor: 'rgba(6,182,212,0.2)' }}
                    whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                    title="Copy game PGN"
                  >
                    Copy PGN
                  </motion.button>
                ) : null}
                {mode === 'play' && canPlay && local.drawOfferBy === null ? (
                  <motion.button
                    type="button"
                    onClick={offerDrawLocal}
                    className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-100 ring-1 ring-amber-300/30 outline-none"
                    whileHover={reduceMotion ? undefined : { y: -1, backgroundColor: 'rgba(245,158,11,0.2)' }}
                    whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                    title="Offer draw"
                  >
                    Offer Draw
                  </motion.button>
                ) : null}
                {mode === 'play' && canPlay && local.drawOfferBy !== null ? (
                  <>
                    <motion.button
                      type="button"
                      onClick={acceptDrawLocal}
                      className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/35 outline-none"
                      whileHover={reduceMotion ? undefined : { y: -1, backgroundColor: 'rgba(16,185,129,0.2)' }}
                      whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                      title="Accept draw offer"
                    >
                      Accept
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={declineDrawLocal}
                      className="rounded-lg bg-slate-900/50 px-3 py-2 text-xs font-semibold text-slate-300 ring-1 ring-slate-800 outline-none"
                      whileHover={reduceMotion ? undefined : { y: -1, backgroundColor: 'rgba(15,23,42,0.65)' }}
                      whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                      title="Decline draw offer"
                    >
                      Decline
                    </motion.button>
                  </>
                ) : null}
                {mode === 'play' && canPlay ? (
                  <motion.button
                    type="button"
                    onClick={resignLocal}
                    className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 ring-1 ring-rose-300/35 outline-none"
                    whileHover={reduceMotion ? undefined : { y: -1, backgroundColor: 'rgba(244,63,94,0.2)' }}
                    whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                    title="Resign current side"
                  >
                    Resign
                  </motion.button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-col items-center gap-4">
              <div className="w-full max-w-[580px]">
                {boardPosition ? (
                  <div className="flex items-stretch justify-center gap-3">
                    {evalScoreWhite !== null ? (
                      <EvalBar
                        scoreWhite={evalScoreWhite}
                        label={mode === 'play' ? (minimax ? 'D2' : 'Eval') : 'Eval'}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <TiltStage enabled={boardSettings.tiltEnabled} strength={boardSettings.tiltStrength} theme={theme}>
                        <ChessBoard
                          position={boardPosition}
                          theme={theme}
                          orientation={boardSettings.orientation}
                          interactive={canPlay}
                          lastMove={lastMove}
                          heatIntensity={heatIntensity}
                          heatPulse={boardSettings.showHeatmap && boardSettings.showPulses ? heatPulse : undefined}
                          arrows={mode === 'play' && boardSettings.showSuggestions ? minimaxArrows : undefined}
                          showCoordinates={boardSettings.showCoordinates}
                          showThreats={boardSettings.showThreats}
                          showCheckLines={boardSettings.showCheckLines}
                          showSuggestions={boardSettings.showSuggestions}
                          onMove={handleLocalMove}
                        />
                      </TiltStage>
                    </div>
                  </div>
                ) : (
                  <div className="grid aspect-square w-full place-items-center rounded-2xl border border-slate-800 bg-slate-950/30 text-sm text-slate-500">
                    {snapshotQuery.isLoading ? 'Connecting...' : 'No game selected'}
                  </div>
                )}
              </div>

              <div className="w-full max-w-[540px] rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                {mode === 'play' ? (
                  <>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="text-slate-400">
                        Turn: {localViewGame.position.turn === 'w' ? 'White' : 'Black'}
                      </div>
                      <div className="text-slate-300">{outcomeLabel(localViewGame.outcome)}</div>
                    </div>
                    {local.drawOfferBy !== null && canPlay ? (
                      <motion.div
                        className="mt-2 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-100"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                      >
                        Draw offered by {local.drawOfferBy === 'w' ? 'White' : 'Black'}. Accept or decline.
                      </motion.div>
                    ) : null}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <motion.div
                        className={[
                          'rounded-lg border px-3 py-2',
                          localViewGame.position.turn === 'w' && canPlay
                            ? 'border-cyan-300/40 bg-cyan-500/10'
                            : 'border-slate-800 bg-slate-950/20',
                        ].join(' ')}
                        animate={localViewGame.position.turn === 'w' && canPlay ? { scale: [1, 1.01, 1] } : { scale: 1 }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <div className="text-[11px] font-semibold text-slate-500">White</div>
                        <div className={['mt-0.5 text-lg font-semibold tabular-nums', clockFlagClass(localClock.whiteMs)].join(' ')}>
                          {formatClock(localClock.whiteMs)}
                        </div>
                      </motion.div>
                      <motion.div
                        className={[
                          'rounded-lg border px-3 py-2',
                          localViewGame.position.turn === 'b' && canPlay
                            ? 'border-cyan-300/40 bg-cyan-500/10'
                            : 'border-slate-800 bg-slate-950/20',
                        ].join(' ')}
                        animate={localViewGame.position.turn === 'b' && canPlay ? { scale: [1, 1.01, 1] } : { scale: 1 }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <div className="text-[11px] font-semibold text-slate-500">Black</div>
                        <div className={['mt-0.5 text-lg font-semibold tabular-nums', clockFlagClass(localClock.blackMs)].join(' ')}>
                          {formatClock(localClock.blackMs)}
                        </div>
                      </motion.div>
                    </div>
                    <div className="mt-2 flex gap-2 overflow-auto pb-1 [scrollbar-gutter:stable]">
                      {TIME_CONTROL_PRESETS.map((preset) => {
                        const active = local.clock.baseMs === preset.baseMs && local.clock.incrementMs === preset.incrementMs
                        return (
                          <motion.button
                            key={preset.id}
                            type="button"
                            disabled={active}
                            onClick={() => applyTimePreset(preset)}
                            className={[
                              'whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold outline-none',
                              active
                                ? 'border-cyan-300/40 bg-cyan-500/15 text-cyan-100'
                                : 'border-slate-800 bg-slate-950/20 text-slate-300',
                            ].join(' ')}
                            whileHover={!active && !reduceMotion ? { y: -1 } : undefined}
                            whileTap={!active && !reduceMotion ? { y: 0, scale: 0.99 } : undefined}
                            transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                            title={`Switch to ${preset.label} (resets local match)`}
                          >
                            {preset.label}
                          </motion.button>
                        )
                      })}
                    </div>
                  </>
                ) : selectedLiveGame ? (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="text-slate-400">Turn: {selectedLiveGame.position.turn === 'w' ? 'White' : 'Black'}</div>
                    <div className="text-slate-300">{outcomeLabel(selectedLiveGame.outcome)}</div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Waiting for live games...</div>
                )}

                {boardPosition && evalScoreWhite !== null && material ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold">
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/20 px-2 py-2">
                      <div className="text-slate-500">Eval</div>
                      <AnimatePresence initial={false}>
                        <motion.div
                          key={`eval-${evalScoreWhite}`}
                          className={evalScoreWhite >= 0 ? 'text-emerald-200' : 'text-rose-200'}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: 'easeOut' }}
                        >
                          {formatSignedPawns(evalScoreWhite)}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/20 px-2 py-2">
                      <div className="text-slate-500">Material</div>
                      <AnimatePresence initial={false}>
                        <motion.div
                          key={`mat-${material.diff}`}
                          className={material.diff >= 0 ? 'text-emerald-200' : 'text-rose-200'}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: 'easeOut' }}
                          title="Based on piece values (centipawns)"
                        >
                          {formatSignedPawns(material.diff)}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </div>
                ) : null}
                {mode === 'play' && canPlay ? (
                  <div className="mt-2 text-[11px] text-slate-500">
                    Tip: click a piece then a target square, or drag &amp; drop.
                    {pgnCopyState === 'ok' ? ' PGN copied.' : pgnCopyState === 'fail' ? ' Copy failed.' : ''}
                  </div>
                ) : null}
                {mode === 'play' && !canPlay ? (
                  <motion.div
                    className="mt-2 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-3 text-[11px] font-semibold text-cyan-100"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>Game Over: {outcomeLabel(localViewGame.outcome)}.</div>
                      <div className={['inline-flex items-center rounded-full px-2 py-1 text-[11px] ring-1', localOutcomeStyle.className].join(' ')}>
                        {localOutcomeStyle.text}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <motion.button
                        type="button"
                        onClick={resetLocal}
                        className="rounded-lg bg-slate-900/50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 ring-1 ring-slate-800"
                        whileHover={reduceMotion ? undefined : { y: -1 }}
                        whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                      >
                        New Match
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => {
                          void copyLocalPgn()
                        }}
                        className="rounded-lg bg-cyan-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100 ring-1 ring-cyan-300/30"
                        whileHover={reduceMotion ? undefined : { y: -1 }}
                        whileTap={reduceMotion ? undefined : { y: 0, scale: 0.99 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                      >
                        Copy PGN
                      </motion.button>
                      {pgnCopyState === 'ok' ? <span className="text-[11px] text-emerald-200">Copied</span> : null}
                      {pgnCopyState === 'fail' ? <span className="text-[11px] text-rose-200">Clipboard blocked</span> : null}
                    </div>
                  </motion.div>
                ) : null}
              </div>

              {mode === 'play' ? (
                <div className="w-full max-w-[540px]">
                  <CapturesPanel history={localViewGame.history} />
                </div>
              ) : null}

              <div className="w-full max-w-[540px]">
                <HeatLegend
                  enabled={boardSettings.showHeatmap}
                  radius={boardSettings.heatRadius}
                  maxSmoothed={maxSmoothed}
                  top={heatTop}
                />
              </div>

              <AnimatePresence initial={false}>
                {mode === 'play' ? (
                  <motion.div
                    key="minimax"
                    className="w-full max-w-[540px]"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                  >
                    <MinimaxPanel analysis={minimax} loading={minimaxQuery.isFetching} />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {mode === 'play' ? (
                  <motion.div
                    key="movelist"
                    className="w-full max-w-[540px]"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.24, ease: 'easeOut' }}
                  >
                    <MoveList
                      records={localFullGame.history}
                      cursor={localCursor}
                      onJump={jumpLocal}
                      onUndo={undoLocal}
                      onRedo={redoLocal}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900/20 p-4 shadow-glow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:overflow-hidden">
            <div className="flex min-h-0 flex-col gap-3 lg:h-full">
              <BoardControls settings={boardSettings} onChange={setBoardSettings} />

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-200">Live Games</div>
                    <div className="text-xs text-slate-500">Streaming via mock WebSocket</div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {snapshot ? `${snapshot.games.length} games` : snapshotQuery.isLoading ? 'Loading...' : 'Offline'}
                  </div>
                </div>

                <div className="mt-3 min-h-0 flex-1 overflow-auto overscroll-contain pb-10 pr-3 [scrollbar-gutter:stable]">
                  <LayoutGroup>
                    <div className="flex flex-col gap-2">
                      {(snapshot?.games ?? []).map((g) => {
                        const selected = g.id === selectedLiveGame?.id
                        const pill = outcomePill(g.outcome)
                        return (
                          <motion.button
                            layout
                            key={g.id}
                            type="button"
                            onClick={() => {
                              setMode('watch')
                              setSelectedGameId(g.id)
                            }}
                            className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/20 p-3 text-left outline-none"
                            whileHover={reduceMotion ? undefined : { scale: 1.01, y: -1 }}
                            whileTap={reduceMotion ? undefined : { scale: 0.995, y: 0 }}
                            transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }}
                          >
                            <AnimatePresence initial={false}>
                              {selected ? (
                                <motion.div
                                  layoutId="live-game-selected"
                                  className="pointer-events-none absolute inset-0 rounded-xl border border-cyan-300/40 bg-cyan-500/10"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.16, ease: 'easeOut' }}
                                />
                              ) : null}
                            </AnimatePresence>

                            <div className="relative">
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-xs font-semibold text-slate-200">
                                  {g.white} <span className="text-slate-500">vs</span> {g.black}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-500 tabular-nums">
                                  Ply{' '}
                                  <AnimatePresence initial={false} mode="popLayout">
                                    <motion.span
                                      key={g.ply}
                                      className="inline-block text-slate-300"
                                      initial={{ opacity: 0, y: 6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: -6 }}
                                      transition={{ duration: 0.16, ease: 'easeOut' }}
                                    >
                                      {g.ply}
                                    </motion.span>
                                  </AnimatePresence>
                                </div>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-3">
                                <div className="text-[11px] text-slate-500">
                                  {g.lastMove ? `Last: ${g.lastMove.san}` : 'Opening...'}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {g.position.turn === 'w' ? 'White' : 'Black'} to move
                                </div>
                              </div>
                              <div
                                className={[
                                  'mt-2 inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ring-1',
                                  pill.className,
                                ].join(' ')}
                              >
                                {pill.text}
                              </div>
                            </div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </LayoutGroup>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}
