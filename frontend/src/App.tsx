import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useCardPositions } from './hooks/useCardPositions'
import { ParticleLayer, type Particle } from './components/ParticleLayer'
import { WiringLayer, type WiringEdge } from './components/WiringLayer'
import { StatsBar, eventTypeClass } from './components/StatsBar'
import { ArchitectureDiagram } from './components/ArchitectureDiagram'

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
  const [now, setNow] = useState(Date.now())
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
  const cardRef = useCallback(register(actor.name), [register, actor.name])
  const [pulseKey, setPulseKey] = useState(0)
  const [floater, setFloater] = useState<{ id: number; value: string; eventName: string } | null>(null)
  const latestMsg = actor.messages[0]
  const latestSig = latestMsg ? `${latestMsg.count}-${latestMsg.timestamp}` : ''
  const lastSigRef = useRef('')

  useEffect(() => {
    if (latestMsg && latestSig !== lastSigRef.current) {
      lastSigRef.current = latestSig
      setPulseKey((k) => k + 1)
      if (accent === 'pub') {
        const id = Date.now() + Math.random()
        setFloater({ id, value: latestMsg.value, eventName: latestMsg.eventName })
        window.setTimeout(() => {
          setFloater((f) => (f && f.id === id ? null : f))
        }, 800)
      }
    }
  }, [latestSig, latestMsg, accent])

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
