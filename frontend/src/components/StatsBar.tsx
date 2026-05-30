import { useState } from 'react'
import { eventTypeClass } from '../lib/eventStyles'

export type Stats = {
  total: number
  perSecond: number
  byEvent: Record<string, number>
}

export function StatsBar({
  stats,
  config,
  chaos,
  onChangeDelay,
  onToggleChaos,
  onChangeChaosInterval,
}: {
  stats: Stats
  config: { subscriberDelayMs: number }
  chaos: { running: boolean; intervalMs: number }
  onChangeDelay: (ms: number) => void
  onToggleChaos: (next: { running: boolean; intervalMs: number }) => void
  onChangeChaosInterval: (ms: number) => void
}) {
  const [localDelay, setLocalDelay] = useState(config.subscriberDelayMs)
  const [localChaosInterval, setLocalChaosInterval] = useState(chaos.intervalMs)

  // Re-sync the sliders when the server-provided values change. Tracks the previous
  // prop in state and adjusts during render (the React-recommended alternative to a
  // sync effect) — avoids a cascading re-render; local drags still update immediately.
  const [prevDelay, setPrevDelay] = useState(config.subscriberDelayMs)
  if (prevDelay !== config.subscriberDelayMs) {
    setPrevDelay(config.subscriberDelayMs)
    setLocalDelay(config.subscriberDelayMs)
  }
  const [prevChaosInterval, setPrevChaosInterval] = useState(chaos.intervalMs)
  if (prevChaosInterval !== chaos.intervalMs) {
    setPrevChaosInterval(chaos.intervalMs)
    setLocalChaosInterval(chaos.intervalMs)
  }

  const eventEntries = Object.entries(stats.byEvent).sort((a, b) => b[1] - a[1])

  return (
    <div className="stats-bar">
      <div className="stats-row">
        <Stat label="Total" value={stats.total.toLocaleString()} />
        <Stat label="Rate" value={`${stats.perSecond.toFixed(1)}/s`} highlight={stats.perSecond > 0} />
        <div className="stats-chips">
          {eventEntries.length === 0 && <span className="stats-empty">no events yet</span>}
          {eventEntries.map(([name, count]) => (
            <span key={name} className={`stats-chip stats-chip-${eventTypeClass(name)}`}>
              <span className="stats-chip-dot" />
              {name}: <strong>{count}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="controls-row">
        <label className="control">
          <span className="control-label">Speed</span>
          <input
            type="range"
            min={0}
            max={1500}
            step={50}
            value={localDelay}
            onChange={(e) => {
              const v = Number(e.target.value)
              setLocalDelay(v)
              onChangeDelay(v)
            }}
          />
          <span className="control-value">{localDelay} ms</span>
        </label>

        <button
          className={`chaos-btn ${chaos.running ? 'active' : ''}`}
          onClick={() => onToggleChaos({ running: !chaos.running, intervalMs: localChaosInterval })}
        >
          🌪 Chaos <span>{chaos.running ? 'ON' : 'OFF'}</span>
        </button>

        <label className={`control ${chaos.running ? '' : 'disabled'}`}>
          <span className="control-label">Interval</span>
          <input
            type="range"
            min={80}
            max={1000}
            step={20}
            value={localChaosInterval}
            disabled={!chaos.running}
            onChange={(e) => {
              const v = Number(e.target.value)
              setLocalChaosInterval(v)
              onChangeChaosInterval(v)
            }}
          />
          <span className="control-value">{localChaosInterval} ms</span>
        </label>
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`stat ${highlight ? 'highlight' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}
