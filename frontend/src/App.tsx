import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useCardPositions } from './hooks/useCardPositions'
import { ParticleLayer, type Particle } from './components/ParticleLayer'
import { WiringLayer, type WiringEdge } from './components/WiringLayer'
import { StatsBar } from './components/StatsBar'
import { ArchitectureDiagram } from './components/ArchitectureDiagram'
import { eventTypeClass } from './lib/eventStyles'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5080'
const MAX_HISTORY = 8
const STATS_WINDOW_MS = 1000
const EVENT_LOG_MAX = 400

type Message = {
  count: number
  value: string
  timestamp: number
  eventName: string
  attempt: number
  failed: boolean
}

type Actor = { name: string; eventNames: string[]; messages: Message[]; isFailing?: boolean }
type ActorMap = Record<string, Actor>
type ActorInfo = { name: string; eventNames: string[]; isFailing?: boolean }

type SseEvent = {
  side: 'publisher' | 'subscriber'
  actor: string
  eventName: string
  count: number
  value: string
  attempt: number
  failed: boolean
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

const formatTime = (ts: number) => {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

const addMessage = (state: ActorMap, key: string, msg: Message): ActorMap => {
  const actor = state[key]
  if (!actor) return state
  return {
    ...state,
    [key]: { ...actor, messages: [msg, ...actor.messages].slice(0, MAX_HISTORY) },
  }
}

const toActorMap = (actors: ActorInfo[]): ActorMap =>
  Object.fromEntries(actors.map((a) => [a.name, { ...a, messages: [] }]))

const EVENT_COLORS: Record<string, string> = {
  randomNumber: '#3b82f6',
  randomAlphabet: '#8b5cf6',
  randomColor: '#ec4899',
  randomEmoji: '#f59e0b',
}

const colorFor = (eventName: string, value: string): string => {
  if (eventName === 'randomColor' || eventName === 'gotTheRandomColor') return value
  return EVENT_COLORS[eventName] ?? '#6b7280'
}

function App() {
  const [publishers, setPublishers] = useState<ActorMap>({})
  const [subscribers, setSubscribers] = useState<ActorMap>({})
  const [connected, setConnected] = useState(false)
  const [showArch, setShowArch] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [config, setConfig] = useState({ subscriberDelayMs: 250 })
  const [chaos, setChaos] = useState({ running: false, intervalMs: 300 })
  const [particles, setParticles] = useState<Particle[]>([])
  const [edges, setEdges] = useState<WiringEdge[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [stats, setStats] = useState({ total: 0, perSecond: 0, byEvent: {} as Record<string, number> })

  const eventLogRef = useRef<{ timestamp: number }[]>([])
  const totalRef = useRef(0)
  const byEventRef = useRef<Record<string, number>>({})
  const configRef = useRef(config)
  useEffect(() => { configRef.current = config }, [config])

  const subscribersRef = useRef<ActorMap>({})
  useEffect(() => { subscribersRef.current = subscribers }, [subscribers])

  const publishersRef = useRef<ActorMap>({})
  useEffect(() => { publishersRef.current = publishers }, [publishers])

  const cards = useCardPositions()

  // Fetch initial state
  useEffect(() => {
    fetch(`${API}/actors`)
      .then((r) => r.json())
      .then((data: { publishers: ActorInfo[]; subscribers: ActorInfo[] }) => {
        setPublishers(toActorMap(data.publishers))
        setSubscribers(toActorMap(data.subscribers))
        // Build edges: for each publisher and each subscriber that listens to its event(s)
        const e: WiringEdge[] = []
        for (const p of data.publishers) {
          for (const s of data.subscribers) {
            for (const evt of p.eventNames) {
              if (s.eventNames.includes(evt)) {
                e.push({
                  id: `${p.name}->${s.name}::${evt}`,
                  publisherName: p.name,
                  subscriberName: s.name,
                  eventName: evt,
                  color: EVENT_COLORS[evt] ?? '#6b7280',
                  lastFiredAt: 0,
                })
              }
            }
          }
        }
        setEdges(e)
      })
      .catch(() => {})
    fetch(`${API}/config`).then((r) => r.json()).then(setConfig).catch(() => {})
    fetch(`${API}/chaos`).then((r) => r.json()).then(setChaos).catch(() => {})
  }, [])

  // Spawn particles for a publisher event, fanning out to every listening subscriber.
  // Declared before the SSE effect that calls it; reads live state via refs.
  const spawnParticles = useCallback(
    (ev: SseEvent) => {
      // Lookup from card positions — use refs so we don't capture stale state
      const positions = cards.positions
      const from = positions[ev.actor]
      if (!from) return
      // Find all subscribers listening to this event
      const targets: string[] = []
      const allSubs = subscribersRef.current
      for (const name in allSubs) {
        if (allSubs[name].eventNames.includes(ev.eventName)) targets.push(name)
      }
      const dur = configRef.current.subscriberDelayMs
      const bornAt = Date.now()
      const newParticles: Particle[] = []
      for (const target of targets) {
        const to = positions[target]
        if (!to) continue
        newParticles.push({
          id: `${ev.actor}-${target}-${ev.count}-${bornAt}-${Math.random().toString(36).slice(2, 6)}`,
          fromX: from.centerX,
          fromY: from.centerY,
          toX: to.centerX,
          toY: to.centerY,
          color: colorFor(ev.eventName, ev.value),
          emoji: ev.eventName === 'randomEmoji' ? ev.value : undefined,
          durationMs: dur,
          bornAt,
        })
      }
      if (newParticles.length) {
        setParticles((prev) => [...prev, ...newParticles])
      }
      // Pulse wiring edges from this publisher
      setEdges((prev) =>
        prev.map((e) =>
          e.publisherName === ev.actor && e.eventName === ev.eventName
            ? { ...e, lastFiredAt: bornAt }
            : e,
        ),
      )
    },
    [cards.positions],
  )

  // SSE
  useEffect(() => {
    const es = new EventSource(`${API}/events`)
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as SseEvent
      const ts = Date.now()
      const msg: Message = {
        count: ev.count, value: ev.value, timestamp: ts,
        eventName: ev.eventName, attempt: ev.attempt, failed: ev.failed,
      }

      // Stats
      eventLogRef.current.push({ timestamp: ts })
      if (eventLogRef.current.length > EVENT_LOG_MAX) {
        eventLogRef.current.splice(0, eventLogRef.current.length - EVENT_LOG_MAX)
      }
      totalRef.current += 1
      byEventRef.current[ev.eventName] = (byEventRef.current[ev.eventName] ?? 0) + 1

      if (ev.side === 'publisher') {
        setPublishers((prev) => addMessage(prev, ev.actor, msg))
        spawnParticles(ev)
      } else {
        setSubscribers((prev) => addMessage(prev, ev.actor, msg))
        // Touch the corresponding wiring edge for pulse
        setEdges((prev) =>
          prev.map((e) =>
            e.subscriberName === ev.actor && e.eventName === ev.eventName
              ? { ...e, lastFiredAt: ts }
              : e,
          ),
        )
      }
    }
    return () => es.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rate ticker + wiring redraw
  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - STATS_WINDOW_MS
      const recent = eventLogRef.current.filter((e) => e.timestamp >= cutoff)
      setStats({
        total: totalRef.current,
        perSecond: recent.length,
        byEvent: { ...byEventRef.current },
      })
      setNow(Date.now())
    }, 200)
    return () => window.clearInterval(id)
  }, [])

  const removeParticle = useCallback((id: string) => {
    setParticles((prev) => prev.filter((p) => p.id !== id))
  }, [])

  // Debounced config push
  const delayTimerRef = useRef<number | null>(null)
  const onChangeDelay = useCallback((ms: number) => {
    setConfig({ subscriberDelayMs: ms })
    if (delayTimerRef.current !== null) window.clearTimeout(delayTimerRef.current)
    delayTimerRef.current = window.setTimeout(() => {
      fetch(`${API}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriberDelayMs: ms }),
      }).catch(() => {})
    }, 150)
  }, [])

  const onToggleChaos = useCallback(async (next: { running: boolean; intervalMs: number }) => {
    setChaos(next)
    if (next.running) {
      await fetch(`${API}/chaos/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMs: next.intervalMs }),
      })
    } else {
      await fetch(`${API}/chaos/stop`, { method: 'POST' })
    }
  }, [])

  const chaosTimerRef = useRef<number | null>(null)
  const onChangeChaosInterval = useCallback((ms: number) => {
    setChaos((c) => ({ ...c, intervalMs: ms }))
    if (chaosTimerRef.current !== null) window.clearTimeout(chaosTimerRef.current)
    chaosTimerRef.current = window.setTimeout(() => {
      // Re-start chaos with new interval (no-op if not running)
      fetch(`${API}/chaos/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMs: ms }),
      }).catch(() => {})
    }, 200)
  }, [])

  const setBusyKey = (key: string, v: boolean) =>
    setBusy((b) => ({ ...b, [key]: v }))

  const publishOne = async (name: string) => {
    setBusyKey(name, true)
    try {
      await fetch(`${API}/publishers/${name}/publish`, { method: 'POST' })
    } finally {
      setBusyKey(name, false)
    }
  }

  const publishAll = async () => {
    setBusyKey('_all', true)
    try {
      await fetch(`${API}/publish-all`, { method: 'POST' })
    } finally {
      setBusyKey('_all', false)
    }
  }

  const publisherList = useMemo(() => Object.values(publishers), [publishers])
  const subscriberList = useMemo(() => Object.values(subscribers), [subscribers])

  return (
    <main className={`app ${chaos.running ? 'chaos-active' : ''}`}>
      <WiringLayer edges={edges} positions={cards.positions} now={now} />
      <ParticleLayer particles={particles} onComplete={removeParticle} />

      <header>
        <h1>Pub/Sub Visualiser</h1>
        <span className={`status ${connected ? 'on' : 'off'}`}>
          {connected ? 'connected' : 'disconnected'}
        </span>
        <button
          className={`arch-toggle-btn ${showArch ? 'active' : ''}`}
          onClick={() => setShowArch((v) => !v)}
          title="Toggle architecture diagram"
        >
          ⬡ Architecture
        </button>
      </header>

      <StatsBar
        stats={stats}
        config={config}
        chaos={chaos}
        onChangeDelay={onChangeDelay}
        onToggleChaos={onToggleChaos}
        onChangeChaosInterval={onChangeChaosInterval}
      />

      <DeadLetterPanel />

      <div className="publish-row">
        <button
          className="publish-btn primary"
          onClick={publishAll}
          disabled={busy._all || publisherList.length === 0}
        >
          ⚡ Publish all {publisherList.length}
        </button>
        <span className="publish-hint">
          or click <strong>Publish</strong> on a specific publisher below
        </span>
      </div>

      {showArch && (
        <section className="arch-section">
          <h2 className="arch-title">Architecture</h2>
          <ArchitectureDiagram
            publishers={publisherList}
            subscribers={subscriberList}
          />
        </section>
      )}

      <section className="actors">
        <ActorColumn
          title="Publishers"
          icon="↗"
          accent="pub"
          actors={publisherList}
          eventLabel="fires"
          busy={busy}
          onPublish={publishOne}
          register={cards.register}
        />
        <ActorColumn
          title="Subscribers"
          icon="↙"
          accent="sub"
          actors={subscriberList}
          eventLabel="listens to"
          busy={{}}
          register={cards.register}
        />
      </section>
    </main>
  )
}

function ActorColumn({
  title,
  icon,
  accent,
  actors,
  eventLabel,
  busy,
  onPublish,
  register,
}: {
  title: string
  icon: string
  accent: 'pub' | 'sub'
  actors: Actor[]
  eventLabel: string
  busy: Record<string, boolean>
  onPublish?: (name: string) => void
  register: (name: string) => (el: HTMLElement | null) => void
}) {
  return (
    <div className={`actor-col ${accent}`}>
      <h2 className="actor-col-title">
        <span className="actor-col-icon">{icon}</span> {title}
        <span className="actor-col-count">{actors.length}</span>
      </h2>
      <div className="actor-list">
        {actors.length === 0 ? (
          <div className="actor-card-placeholder">loading actors…</div>
        ) : (
          actors.map((a) => (
            <ActorCard
              key={a.name}
              actor={a}
              accent={accent}
              eventLabel={eventLabel}
              isBusy={busy[a.name] ?? false}
              onPublish={onPublish ? () => onPublish(a.name) : undefined}
              register={register}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ActorCard({
  actor,
  accent,
  eventLabel,
  isBusy,
  onPublish,
  register,
}: {
  actor: Actor
  accent: 'pub' | 'sub'
  eventLabel: string
  isBusy: boolean
  onPublish?: () => void
  register: (name: string) => (el: HTMLElement | null) => void
}) {
  const isMulti = actor.eventNames.length > 1
  const isFailing = actor.isFailing === true
  const cardRef = useMemo(() => register(actor.name), [register, actor.name])
  const [pulseKey, setPulseKey] = useState(0)
  const [floater, setFloater] = useState<{ id: string; value: string; eventName: string } | null>(null)
  const latestMsg = actor.messages[0]
  const latestSig = latestMsg ? `${latestMsg.count}-${latestMsg.timestamp}` : ''
  const [lastSig, setLastSig] = useState('')

  // When a new message arrives, pulse the card and (for publishers) show a transient
  // floating value. Detected during render via the "previous value" pattern — tracking the
  // last seen signature in state and using it as a stable id — so we avoid setState in an effect.
  if (latestMsg && latestSig !== lastSig) {
    setLastSig(latestSig)
    setPulseKey((k) => k + 1)
    if (accent === 'pub') {
      setFloater({ id: latestSig, value: latestMsg.value, eventName: latestMsg.eventName })
    }
  }

  // Auto-dismiss the floater shortly after it appears.
  useEffect(() => {
    if (!floater) return
    const t = window.setTimeout(() => setFloater((f) => (f && f.id === floater.id ? null : f)), 800)
    return () => window.clearTimeout(t)
  }, [floater])

  return (
    <div
      ref={cardRef}
      className={`actor-card ${accent} ${isMulti ? 'multi' : ''} ${isFailing ? 'failing' : ''}`}
      data-pulse={pulseKey}
    >
      {floater && (
        <div className="float-value" key={floater.id}>
          <ValueDisplay value={floater.value} eventName={floater.eventName} />
        </div>
      )}
      <div className="actor-header">
        <div className="actor-header-left">
          <span className="actor-name">
            {actor.name}
            {isMulti && <span className="multi-badge">{actor.eventNames.length} events</span>}
            {isFailing && <span className="failing-badge">⚠ 30% fail</span>}
          </span>
          <span className="actor-meta">
            {eventLabel}{' '}
            <span className="event-chip-row">
              {actor.eventNames.map((e) => (
                <span key={e} className={`event-chip event-chip-${eventTypeClass(e)}`}>
                  {e}
                </span>
              ))}
            </span>
          </span>
        </div>
        {onPublish && (
          <button
            className="actor-publish-btn"
            onClick={onPublish}
            disabled={isBusy}
          >
            Publish
          </button>
        )}
      </div>
      <ul className="message-list">
        {actor.messages.length === 0 ? (
          <li className="message empty">
            {onPublish ? 'no events yet — click Publish' : 'waiting for events…'}
          </li>
        ) : (
          actor.messages.map((m) => (
            <li
              key={`${m.timestamp}-${m.count}`}
              className={`message ${m.failed ? 'failed' : ''} ${!m.failed && m.attempt > 1 ? 'retried' : ''}`}
            >
              <span className="msg-time">{formatTime(m.timestamp)}</span>
              <span className="msg-count">#{pad(m.count)}</span>
              {isMulti && (
                <span className={`msg-event-chip event-chip event-chip-${eventTypeClass(m.eventName)}`}>{m.eventName}</span>
              )}
              <span className="msg-value">
                <ValueDisplay value={m.value} eventName={m.eventName} />
                {m.failed && <span className="msg-status fail">✗ failed 3x</span>}
                {!m.failed && m.attempt > 1 && (
                  <span className="msg-status retry">⟲ retry ×{m.attempt}</span>
                )}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

type DeadLetterItem = {
  id: string
  actor: string
  sourceEventName: string
  value: string
  attempts: number
  deadLetteredAt: string
}

function DeadLetterPanel() {
  const [items, setItems] = useState<DeadLetterItem[]>([])
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    fetch(`${API}/dead-letters`)
      .then((r) => r.json())
      .then((d: { items: DeadLetterItem[] }) => setItems(d.items ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 1500)
    return () => window.clearInterval(id)
  }, [load])

  const replay = async (dlId: string) => {
    await fetch(`${API}/dead-letters/${dlId}/replay`, { method: 'POST' }).catch(() => {})
    load()
  }
  const clearAll = async () => {
    await fetch(`${API}/dead-letters`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  return (
    <section className="dlq-panel" style={{ margin: '0.5rem 0' }}>
      <button
        className={`arch-toggle-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Dead-letter queue"
      >
        ☠ Dead-letters
        <span
          style={{
            marginLeft: 8, padding: '0 8px', borderRadius: 10,
            background: items.length ? '#ef4444' : '#374151', color: '#fff', fontSize: 12,
          }}
        >
          {items.length}
        </span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 8, padding: 12, border: '1px solid #374151',
            borderRadius: 8, background: 'rgba(17,24,39,0.6)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Dead-lettered messages</strong>
            <button className="actor-publish-btn" onClick={clearAll} disabled={items.length === 0}>
              Clear all
            </button>
          </div>
          {items.length === 0 ? (
            <p style={{ opacity: 0.6, margin: 0 }}>No dead-lettered messages — exhausted retries land here.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {items.map((it) => (
                <li
                  key={it.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.08)' }}
                >
                  <span className={`event-chip event-chip-${eventTypeClass(it.sourceEventName)}`}>{it.sourceEventName}</span>
                  <ValueDisplay value={it.value} eventName={it.sourceEventName} />
                  <span style={{ color: '#f87171', fontSize: 12 }}>✗ {it.attempts}× from {it.actor}</span>
                  <button className="actor-publish-btn" style={{ marginLeft: 'auto' }} onClick={() => replay(it.id)}>
                    ↻ Replay
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function ValueDisplay({ value, eventName }: { value: string; eventName: string }) {
  if (eventName === 'randomColor' || eventName === 'gotTheRandomColor') {
    return (
      <span className="value-color">
        <span className="color-swatch" style={{ background: value }} />
        <strong>{value}</strong>
      </span>
    )
  }
  if (eventName === 'randomEmoji' || eventName === 'gotTheRandomEmoji') {
    return <span className="value-emoji">{value}</span>
  }
  return <strong className="value-text">{value}</strong>
}

export default App
