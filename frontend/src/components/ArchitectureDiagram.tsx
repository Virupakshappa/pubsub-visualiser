import { useMemo } from 'react'
import './ArchitectureDiagram.css'

interface ActorInfo {
  name: string
  eventNames: string[]
  isFailing?: boolean
}

interface Props {
  publishers: ActorInfo[]
  subscribers: ActorInfo[]
}

const EVENT_COLORS: Record<string, string> = {
  randomNumber: '#3b82f6',
  randomAlphabet: '#8b5cf6',
  randomColor: '#ec4899',
  randomEmoji: '#f59e0b',
}
const eventColor = (e: string) => EVENT_COLORS[e] ?? '#64748b'

// Palette for the non-event flows
const C_CONTROL = '#38bdf8' // sky  — REST / control
const C_SSE = '#a78bfa'     // violet — live SSE stream
const C_DELIVERY = '#34d399' // green — bus → subscriber
const C_CHAOS = '#fb923c'   // amber — ChaosService
const C_CONFIG = '#64748b'  // slate — Config influence

// ---- geometry helpers -------------------------------------------------
function hCurve(x1: number, y1: number, x2: number, y2: number): string {
  const c = Math.max(40, Math.abs(x2 - x1) * 0.5)
  const s = x2 >= x1 ? 1 : -1
  return `M ${x1} ${y1} C ${x1 + c * s} ${y1}, ${x2 - c * s} ${y2}, ${x2} ${y2}`
}
function vCurve(x1: number, y1: number, x2: number, y2: number): string {
  const c = Math.max(30, Math.abs(y2 - y1) * 0.5)
  const s = y2 >= y1 ? 1 : -1
  return `M ${x1} ${y1} C ${x1} ${y1 + c * s}, ${x2} ${y2 - c * s}, ${x2} ${y2}`
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
function distribute(count: number, top: number, bottom: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [(top + bottom) / 2]
  const span = bottom - top
  return Array.from({ length: count }, (_, i) => top + (span * i) / (count - 1))
}
const shortName = (n: string) => n.replace(/(Publisher|Subscriber)$/, '') || n

type NodeBox = {
  x: number; y: number; w: number; h: number
  title: string; subtitle?: string; color: string; delay: number
}
type Edge = {
  id: string; d: string; color: string
  flowDur: number; packet?: boolean; packetDur?: number; packets?: number
}

export function ArchitectureDiagram({ publishers, subscribers }: Props) {
  const model = useMemo(() => {
    const W = 1280
    const padTop = 64
    const padBottom = 48
    const rowH = 76
    const maxCount = Math.max(publishers.length, subscribers.length, 1)
    const H = Math.max(560, padTop + padBottom + maxCount * rowH)
    const midY = H / 2

    // ---- columns (center x) ----
    const feCx = 96, feW = 150, feH = 92
    const apiCx = 332, apiW = 150, apiNodeH = 56
    const pubCx = 568, pubW = 178, pubH = 54
    const busX = 786, busW = 116
    const subCx = 1078, subW = 200, subH = 52

    const busTop = padTop - 6
    const busBottom = H - padBottom + 6
    const busCx = busX + busW / 2

    // Frontend
    const frontend: NodeBox = {
      x: feCx - feW / 2, y: midY - feH / 2, w: feW, h: feH,
      title: 'React UI', subtitle: 'particles · wiring', color: C_SSE, delay: 0,
    }
    // API column: REST (top) + SSE (bottom)
    const rest: NodeBox = {
      x: apiCx - apiW / 2, y: midY - apiNodeH - 14, w: apiW, h: apiNodeH,
      title: 'REST API', subtitle: '/publish · /config', color: C_CONTROL, delay: 60,
    }
    const sse: NodeBox = {
      x: apiCx - apiW / 2, y: midY + 14, w: apiW, h: apiNodeH,
      title: 'SSE /events', subtitle: 'live stream', color: C_SSE, delay: 90,
    }

    // Publishers
    const pubYs = distribute(publishers.length, padTop + 34, H - padBottom - 6)
    const pubNodes: NodeBox[] = publishers.map((p, i) => ({
      x: pubCx - pubW / 2, y: pubYs[i] - pubH / 2, w: pubW, h: pubH,
      title: shortName(p.name), subtitle: p.eventNames[0], color: eventColor(p.eventNames[0]),
      delay: 140 + i * 60,
    }))

    // Subscribers
    const subYs = distribute(subscribers.length, padTop, H - padBottom - 34)
    const subNodes: NodeBox[] = subscribers.map((s, i) => {
      const sub = s.isFailing
        ? '⚠ 30% fail'
        : s.eventNames.length > 1 ? `${s.eventNames.length} events` : s.eventNames[0]
      return {
        x: subCx - subW / 2, y: subYs[i] - subH / 2, w: subW, h: subH,
        title: shortName(s.name), subtitle: sub,
        color: s.isFailing ? '#f87171' : C_DELIVERY,
        delay: 180 + i * 55,
      }
    })

    // ChaosService (above publishers) + Config (below subscribers)
    const chaos: NodeBox = {
      x: pubCx - 78, y: 14, w: 156, h: 42,
      title: 'ChaosService', subtitle: 'auto-fire', color: C_CHAOS, delay: 220,
    }
    const config: NodeBox = {
      x: subCx - 75, y: H - 50, w: 150, h: 40,
      title: 'Config', subtitle: 'subscriberDelayMs', color: C_CONFIG, delay: 260,
    }

    // ---- edges ----
    const edges: Edge[] = []
    // Frontend -> REST (control requests)
    edges.push({
      id: 'fe-rest', color: C_CONTROL, flowDur: 1.4, packet: true, packetDur: 1.7,
      d: hCurve(frontend.x + frontend.w, midY - feH / 4, rest.x, rest.y + rest.h / 2),
    })
    // SSE -> Frontend (live updates back to UI)
    edges.push({
      id: 'sse-fe', color: C_SSE, flowDur: 1.6, packet: true, packetDur: 2.0, packets: 2,
      d: hCurve(sse.x, sse.y + sse.h / 2, frontend.x + frontend.w, midY + feH / 4),
    })
    // REST -> each Publisher
    pubNodes.forEach((p, i) => {
      edges.push({
        id: `rest-pub-${i}`, color: C_CONTROL, flowDur: 1.5 + i * 0.1,
        d: hCurve(rest.x + rest.w, rest.y + rest.h / 2, p.x, p.y + p.h / 2),
      })
    })
    // Chaos -> each Publisher
    pubNodes.forEach((p, i) => {
      edges.push({
        id: `chaos-pub-${i}`, color: C_CHAOS, flowDur: 1.9 + i * 0.12,
        d: vCurve(chaos.x + chaos.w / 2, chaos.y + chaos.h, p.x + p.w / 2, p.y),
      })
    })
    // each Publisher -> Bus
    pubNodes.forEach((p, i) => {
      const py = p.y + p.h / 2
      edges.push({
        id: `pub-bus-${i}`, color: p.color, flowDur: 1.1 + i * 0.08,
        packet: true, packetDur: 1.5 + i * 0.12,
        d: hCurve(p.x + p.w, py, busX, clamp(py, busTop + 14, busBottom - 14)),
      })
    })
    // Bus -> each Subscriber
    subNodes.forEach((s, i) => {
      const sy = s.y + s.h / 2
      edges.push({
        id: `bus-sub-${i}`, color: C_DELIVERY, flowDur: 1.3 + i * 0.07,
        packet: true, packetDur: 1.7 + i * 0.1,
        d: hCurve(busX + busW, clamp(sy, busTop + 14, busBottom - 14), s.x, sy),
      })
    })
    // Bus -> SSE (SSE reads every event off the bus)
    edges.push({
      id: 'bus-sse', color: C_SSE, flowDur: 1.7,
      d: hCurve(busX, busTop + 26, sse.x + sse.w, sse.y + sse.h / 2),
    })
    // Config -> each Subscriber (influence, dashed-feel)
    subNodes.forEach((s, i) => {
      edges.push({
        id: `cfg-sub-${i}`, color: C_CONFIG, flowDur: 2.4 + i * 0.1,
        d: vCurve(config.x + config.w / 2, config.y, s.x + s.w / 2, s.y + s.h),
      })
    })

    return {
      W, H, busX, busW, busTop, busBottom, busCx,
      frontend, rest, sse, chaos, config, pubNodes, subNodes, edges,
      panels: [
        { x: feCx - 92, w: 184, label: 'Browser', color: C_SSE },
        { x: apiCx - 92, w: 184, label: 'ASP.NET Core', color: C_CONTROL },
        { x: pubCx - 104, w: 208, label: 'Publishers', color: '#3b82f6' },
        { x: busX - 18, w: busW + 36, label: '', color: C_DELIVERY },
        { x: subCx - 116, w: 232, label: 'Subscribers', color: C_DELIVERY },
      ],
    }
  }, [publishers, subscribers])

  if (publishers.length === 0) {
    return <div className="arch-stage-wrap" style={{ padding: '2rem', color: '#64748b' }}>loading architecture…</div>
  }

  const { W, H } = model

  return (
    <>
      <div className="arch-stage-wrap">
        <svg
          className="arch-stage"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Animated system architecture diagram"
        >
          <defs>
            <linearGradient id="arch-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0b1120" />
              <stop offset="100%" stopColor="#131a2e" />
            </linearGradient>
            <linearGradient id="arch-bus-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#273449" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <filter id="arch-blur" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>

          {/* canvas */}
          <rect x={0} y={0} width={W} height={H} fill="url(#arch-bg)" rx={16} />

          {/* column panels */}
          {model.panels.map((p, i) => (
            <g key={`panel-${i}`}>
              <rect
                x={p.x} y={28} width={p.w} height={H - 56} rx={14}
                fill={p.color} opacity={0.04}
                stroke={p.color} strokeOpacity={0.15} strokeWidth={1}
              />
              {p.label && (
                <text
                  className="arch-panel-label" x={p.x + p.w / 2} y={46}
                  textAnchor="middle" fill={p.color} opacity={0.65}
                >
                  {p.label}
                </text>
              )}
            </g>
          ))}

          {/* edges: base + flowing overlay */}
          <g fill="none">
            {model.edges.map((e) => (
              <path key={`base-${e.id}`} d={e.d} stroke={e.color} strokeOpacity={0.16} strokeWidth={2} />
            ))}
            {model.edges.map((e) => (
              <path
                key={`flow-${e.id}`} d={e.d} className="arch-flow"
                stroke={e.color} strokeWidth={2.4} color={e.color}
                style={{ animationDuration: `${e.flowDur}s` }}
              />
            ))}
          </g>

          {/* hidden motion paths */}
          <defs>
            {model.edges.filter((e) => e.packet).map((e) => (
              <path key={`mp-${e.id}`} id={`mp-${e.id}`} d={e.d} />
            ))}
          </defs>

          {/* travelling packets */}
          {model.edges.filter((e) => e.packet).map((e) =>
            Array.from({ length: e.packets ?? 1 }).map((_, k) => (
              <circle key={`pk-${e.id}-${k}`} r={4.5} fill={e.color} color={e.color} className="arch-packet">
                <animateMotion
                  dur={`${e.packetDur ?? 1.8}s`}
                  begin={`-${k * ((e.packetDur ?? 1.8) / (e.packets ?? 1))}s`}
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href={`#mp-${e.id}`} />
                </animateMotion>
              </circle>
            )),
          )}

          {/* MessagePipe bus pillar */}
          <g className="arch-node" style={{ animationDelay: '120ms' }}>
            <rect
              x={model.busX - 3} y={model.busTop - 3}
              width={model.busW + 6} height={model.busBottom - model.busTop + 6}
              rx={22} fill={C_DELIVERY} className="arch-glow" filter="url(#arch-blur)"
              style={{ animationDuration: '2.6s' }}
            />
            <rect
              x={model.busX} y={model.busTop} width={model.busW}
              height={model.busBottom - model.busTop} rx={20}
              fill="url(#arch-bus-grad)" stroke={C_DELIVERY} strokeOpacity={0.55} strokeWidth={1.5}
            />
            <text
              className="arch-bus-label" fill="#e2e8f0"
              transform={`translate(${model.busCx} ${(model.busTop + model.busBottom) / 2}) rotate(-90)`}
              textAnchor="middle" dominantBaseline="central"
            >
              MessagePipe Bus
            </text>
          </g>

          {/* all the box nodes */}
          {[
            model.frontend, model.rest, model.sse, model.chaos, model.config,
            ...model.pubNodes, ...model.subNodes,
          ].map((n, i) => (
            <ArchNode key={`n-${i}`} node={n} />
          ))}
        </svg>
      </div>

      <div className="arch-legend">
        <LegendItem color={C_CONTROL} label="REST / control" />
        <LegendItem color="#3b82f6" label="publish → bus" />
        <LegendItem color={C_DELIVERY} label="bus → subscriber" />
        <LegendItem color={C_SSE} label="SSE live stream" />
        <LegendItem color={C_CHAOS} label="chaos auto-fire" />
        <LegendItem color={C_CONFIG} label="config" />
      </div>
    </>
  )
}

function ArchNode({ node }: { node: NodeBox }) {
  const cx = node.x + node.w / 2
  return (
    <g className="arch-node" style={{ animationDelay: `${node.delay}ms` }}>
      <rect
        x={node.x - 2} y={node.y - 2} width={node.w + 4} height={node.h + 4} rx={13}
        fill={node.color} className="arch-glow" filter="url(#arch-blur)"
        style={{ animationDuration: `${2.2 + (node.delay % 7) * 0.18}s` }}
      />
      <rect
        x={node.x} y={node.y} width={node.w} height={node.h} rx={11}
        fill="#0f1729" stroke={node.color} strokeWidth={1.6} strokeOpacity={0.85}
      />
      <rect x={node.x} y={node.y} width={4} height={node.h} rx={2} fill={node.color} />
      <text
        className="arch-node-title" x={cx} y={node.subtitle ? node.y + node.h / 2 - 6 : node.y + node.h / 2}
        textAnchor="middle" dominantBaseline="central" fill="#f1f5f9"
      >
        {node.title}
      </text>
      {node.subtitle && (
        <text
          className="arch-node-sub" x={cx} y={node.y + node.h / 2 + 11}
          textAnchor="middle" dominantBaseline="central" fill={node.color}
        >
          {node.subtitle}
        </text>
      )}
    </g>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="arch-legend-item">
      <span className="arch-legend-swatch" style={{ background: color }} />
      {label}
    </span>
  )
}
