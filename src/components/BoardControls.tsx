import { motion } from 'framer-motion'
import type { Color } from '../algorithms/chess/types'
import MotionSlider from './ui/MotionSlider'
import Toggle from './ui/Toggle'

export interface BoardSettings {
  orientation: Color
  showHeatmap: boolean
  showPulses: boolean
  heatRadius: number
  showCoordinates: boolean
  showThreats: boolean
  showCheckLines: boolean
  showSuggestions: boolean
  tiltEnabled: boolean
  tiltStrength: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export default function BoardControls(props: {
  settings: BoardSettings
  onChange: (next: BoardSettings) => void
}) {
  const { settings, onChange } = props

  const update = (patch: Partial<BoardSettings>) => onChange({ ...settings, ...patch })

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">Board Controls</div>
          <div className="text-xs text-slate-500">Overlays / orientation / tilt</div>
        </div>

        <button
          type="button"
          onClick={() => update({ orientation: settings.orientation === 'w' ? 'b' : 'w' })}
          className="group inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-950/30"
          title="Flip board"
        >
          <motion.span
            className="inline-flex"
            animate={{ rotate: settings.orientation === 'w' ? 0 : 180 }}
            transition={{ type: 'spring', stiffness: 520, damping: 40 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M7 7h10v10H7V7Z"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.7"
              />
              <path
                d="M4 10V6a2 2 0 0 1 2-2h4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M20 14v4a2 2 0 0 1-2 2h-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </motion.span>
          Flip
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Toggle
          checked={settings.showHeatmap}
          onChange={(v) => update({ showHeatmap: v })}
          label="Heatmap"
          hint="Square usage intensity overlay"
        />
        <Toggle
          checked={settings.showPulses}
          onChange={(v) => update({ showPulses: v })}
          label="Heat Pulses"
          hint="Pulse squares on updates"
          disabled={!settings.showHeatmap}
        />

        <MotionSlider
          label="Heat Radius"
          hint="Prefix-sum smoothing radius"
          min={0}
          max={3}
          step={1}
          value={settings.heatRadius}
          formatValue={(v) => `${v}`}
          onChange={(v) => update({ heatRadius: clamp(v, 0, 3) })}
          disabled={!settings.showHeatmap}
        />

        <Toggle
          checked={settings.showCoordinates}
          onChange={(v) => update({ showCoordinates: v })}
          label="Coordinates"
          hint="Show a-h and 1-8 labels"
        />

        <Toggle
          checked={settings.showThreats}
          onChange={(v) => update({ showThreats: v })}
          label="Threat Rays"
          hint="Show selected piece attack paths"
        />

        <Toggle
          checked={settings.showCheckLines}
          onChange={(v) => update({ showCheckLines: v })}
          label="Check Lines"
          hint="Highlight attackers when in check"
        />

        <Toggle
          checked={settings.showSuggestions}
          onChange={(v) => update({ showSuggestions: v })}
          label="Minimax Arrows"
          hint="Top depth-2 move suggestions"
        />

        <Toggle
          checked={settings.tiltEnabled}
          onChange={(v) => update({ tiltEnabled: v })}
          label="3D Tilt"
          hint="Three.js + motion-driven tilt"
        />

        <MotionSlider
          label="Tilt Strength"
          hint="Rotation intensity"
          min={0}
          max={1}
          step={0.05}
          value={settings.tiltStrength}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => update({ tiltStrength: clamp(v, 0, 1) })}
          disabled={!settings.tiltEnabled}
        />
      </div>
    </div>
  )
}
