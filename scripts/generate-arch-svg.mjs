#!/usr/bin/env node
// Generates a standalone, self-animating architecture SVG for the README.
// Mirrors the geometry of frontend/src/components/ArchitectureDiagram.tsx but
// emits a static .svg file whose CSS @keyframes + SMIL <animateMotion> play
// when embedded as an <img> on GitHub. No scripts (GitHub strips them).
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../docs/architecture.svg')

// ---- real actors (from backend/Program.cs) ----
const publishers = [
  { name: 'NumberPublisher', eventNames: ['randomNumber'] },
  { name: 'AlphabetPublisher', eventNames: ['randomAlphabet'] },
  { name: 'ColorPublisher', eventNames: ['randomColor'] },
  { name: 'EmojiPublisher', eventNames: ['randomEmoji'] },
]
const subscribers = [
  { name: 'NumberSubscriber', eventNames: ['randomNumber'] },
  { name: 'AlphabetSubscriber', eventNames: ['randomAlphabet'] },
  { name: 'ColorSubscriber', eventNames: ['randomColor'] },
  { name: 'EmojiSubscriber', eventNames: ['randomEmoji'] },
  { name: 'AnyEventLogger', eventNames: ['randomNumber', 'randomAlphabet', 'randomColor', 'randomEmoji'] },
  { name: 'AlphanumericSubscriber', eventNames: ['randomNumber', 'randomAlphabet'] },
  { name: 'FailingSubscriber', eventNames: ['randomNumber', 'randomAlphabet', 'randomColor', 'randomEmoji'], isFailing: true },
]

const EVENT_COLORS = {
  randomNumber: '#3b82f6', randomAlphabet: '#8b5cf6',
  randomColor: '#ec4899', randomEmoji: '#f59e0b',
}
const eventColor = (e) => EVENT_COLORS[e] ?? '#64748b'
const C_CONTROL = '#38bdf8', C_SSE = '#a78bfa', C_DELIVERY = '#34d399', C_CHAOS = '#fb923c', C_CONFIG = '#64748b'

const r = (n) => Math.round(n * 100) / 100
function hCurve(x1, y1, x2, y2) {
  const c = Math.max(40, Math.abs(x2 - x1) * 0.5); const s = x2 >= x1 ? 1 : -1
  return `M ${r(x1)} ${r(y1)} C ${r(x1 + c * s)} ${r(y1)}, ${r(x2 - c * s)} ${r(y2)}, ${r(x2)} ${r(y2)}`
}
function vCurve(x1, y1, x2, y2) {
  const c = Math.max(30, Math.abs(y2 - y1) * 0.5); const s = y2 >= y1 ? 1 : -1
  return `M ${r(x1)} ${r(y1)} C ${r(x1)} ${r(y1 + c * s)}, ${r(x2)} ${r(y2 - c * s)}, ${r(x2)} ${r(y2)}`
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
function distribute(count, top, bottom) {
  if (count <= 0) return []
  if (count === 1) return [(top + bottom) / 2]
  const span = bottom - top
  return Array.from({ length: count }, (_, i) => top + (span * i) / (count - 1))
}
const shortName = (n) => n.replace(/(Publisher|Subscriber)$/, '') || n
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ---- layout (identical constants to the component) ----
const W = 1280, padTop = 64, padBottom = 48, rowH = 76
const maxCount = Math.max(publishers.length, subscribers.length, 1)
const H = Math.max(560, padTop + padBottom + maxCount * rowH)
const midY = H / 2
const feCx = 96, feW = 150, feH = 92
const apiCx = 332, apiW = 150, apiNodeH = 56
const pubCx = 568, pubW = 178, pubH = 54
const busX = 786, busW = 116
const subCx = 1078, subW = 200, subH = 52
const busTop = padTop - 6, busBottom = H - padBottom + 6, busCx = busX + busW / 2

const frontend = { x: feCx - feW / 2, y: midY - feH / 2, w: feW, h: feH, title: 'React UI', subtitle: 'particles · wiring', color: C_SSE }
const rest = { x: apiCx - apiW / 2, y: midY - apiNodeH - 14, w: apiW, h: apiNodeH, title: 'REST API', subtitle: '/publish · /config', color: C_CONTROL }
const sse = { x: apiCx - apiW / 2, y: midY + 14, w: apiW, h: apiNodeH, title: 'SSE /events', subtitle: 'live stream', color: C_SSE }

const pubYs = distribute(publishers.length, padTop + 34, H - padBottom - 6)
const pubNodes = publishers.map((p, i) => ({
  x: pubCx - pubW / 2, y: pubYs[i] - pubH / 2, w: pubW, h: pubH,
  title: shortName(p.name), subtitle: p.eventNames[0], color: eventColor(p.eventNames[0]),
}))
const subYs = distribute(subscribers.length, padTop, H - padBottom - 34)
const subNodes = subscribers.map((s, i) => ({
  x: subCx - subW / 2, y: subYs[i] - subH / 2, w: subW, h: subH,
  title: shortName(s.name),
  subtitle: s.isFailing ? '⚠ 30% fail' : s.eventNames.length > 1 ? `${s.eventNames.length} events` : s.eventNames[0],
  color: s.isFailing ? '#f87171' : C_DELIVERY,
}))
const chaos = { x: pubCx - 78, y: 14, w: 156, h: 42, title: 'ChaosService', subtitle: 'auto-fire', color: C_CHAOS }
const config = { x: subCx - 75, y: H - 50, w: 150, h: 40, title: 'Config', subtitle: 'subscriberDelayMs', color: C_CONFIG }

// ---- edges ----
const edges = []
edges.push({ id: 'fe-rest', color: C_CONTROL, flowDur: 1.4, packet: true, packetDur: 1.7, d: hCurve(frontend.x + frontend.w, midY - feH / 4, rest.x, rest.y + rest.h / 2) })
edges.push({ id: 'sse-fe', color: C_SSE, flowDur: 1.6, packet: true, packetDur: 2.0, packets: 2, d: hCurve(sse.x, sse.y + sse.h / 2, frontend.x + frontend.w, midY + feH / 4) })
pubNodes.forEach((p, i) => edges.push({ id: `rest-pub-${i}`, color: C_CONTROL, flowDur: 1.5 + i * 0.1, d: hCurve(rest.x + rest.w, rest.y + rest.h / 2, p.x, p.y + p.h / 2) }))
pubNodes.forEach((p, i) => edges.push({ id: `chaos-pub-${i}`, color: C_CHAOS, flowDur: 1.9 + i * 0.12, d: vCurve(chaos.x + chaos.w / 2, chaos.y + chaos.h, p.x + p.w / 2, p.y) }))
pubNodes.forEach((p, i) => {
  const py = p.y + p.h / 2
  edges.push({ id: `pub-bus-${i}`, color: p.color, flowDur: 1.1 + i * 0.08, packet: true, packetDur: 1.5 + i * 0.12, d: hCurve(p.x + p.w, py, busX, clamp(py, busTop + 14, busBottom - 14)) })
})
subNodes.forEach((s, i) => {
  const sy = s.y + s.h / 2
  edges.push({ id: `bus-sub-${i}`, color: C_DELIVERY, flowDur: 1.3 + i * 0.07, packet: true, packetDur: 1.7 + i * 0.1, d: hCurve(busX + busW, clamp(sy, busTop + 14, busBottom - 14), s.x, sy) })
})
edges.push({ id: 'bus-sse', color: C_SSE, flowDur: 1.7, d: hCurve(busX, busTop + 26, sse.x + sse.w, sse.y + sse.h / 2) })
subNodes.forEach((s, i) => edges.push({ id: `cfg-sub-${i}`, color: C_CONFIG, flowDur: 2.4 + i * 0.1, d: vCurve(config.x + config.w / 2, config.y, s.x + s.w / 2, s.y + s.h) }))

const panels = [
  { x: feCx - 92, w: 184, label: 'BROWSER', color: C_SSE },
  { x: apiCx - 92, w: 184, label: 'ASP.NET CORE', color: C_CONTROL },
  { x: pubCx - 104, w: 208, label: 'PUBLISHERS', color: '#3b82f6' },
  { x: busX - 18, w: busW + 36, label: '', color: C_DELIVERY },
  { x: subCx - 116, w: 232, label: 'SUBSCRIBERS', color: C_DELIVERY },
]

// ---- node renderer ----
function node(n, glowDur) {
  const cx = n.x + n.w / 2
  const titleY = n.subtitle ? n.y + n.h / 2 - 6 : n.y + n.h / 2
  return `
    <g>
      <rect x="${r(n.x - 2)}" y="${r(n.y - 2)}" width="${n.w + 4}" height="${n.h + 4}" rx="13" fill="${n.color}" class="glow" filter="url(#blur)" style="animation-duration:${glowDur}s"/>
      <rect x="${r(n.x)}" y="${r(n.y)}" width="${n.w}" height="${n.h}" rx="11" fill="#0f1729" stroke="${n.color}" stroke-width="1.6" stroke-opacity="0.85"/>
      <rect x="${r(n.x)}" y="${r(n.y)}" width="4" height="${n.h}" rx="2" fill="${n.color}"/>
      <text class="t" x="${r(cx)}" y="${r(titleY)}" text-anchor="middle" dominant-baseline="central">${esc(n.title)}</text>
      ${n.subtitle ? `<text class="s" x="${r(cx)}" y="${r(n.y + n.h / 2 + 11)}" text-anchor="middle" dominant-baseline="central" fill="${n.color}">${esc(n.subtitle)}</text>` : ''}
    </g>`
}

const allNodes = [frontend, rest, sse, chaos, config, ...pubNodes, ...subNodes]

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Animated pub/sub architecture diagram">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1120"/><stop offset="100%" stop-color="#131a2e"/>
    </linearGradient>
    <linearGradient id="busg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b"/><stop offset="50%" stop-color="#273449"/><stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <filter id="blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
    <style>
      text { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
      .t  { font-weight: 600; font-size: 13px; fill: #f1f5f9; }
      .s  { font-weight: 500; font-size: 10.5px; font-family: ui-monospace, Menlo, monospace; }
      .pl { font-weight: 700; font-size: 11px; letter-spacing: .16em; }
      .bl { font-weight: 800; font-size: 15px; letter-spacing: .22em; fill: #e2e8f0; }
      .flow { stroke-linecap: round; stroke-dasharray: 4 10; animation: dash linear infinite; }
      @keyframes dash { to { stroke-dashoffset: -560; } }
      .glow { animation: pulse ease-in-out infinite; }
      @keyframes pulse { 0%,100% { opacity: .30; } 50% { opacity: .72; } }
      @media (prefers-reduced-motion: reduce) { .flow, .glow { animation: none; } }
    </style>
  </defs>

  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)" rx="16"/>

  ${panels.map((p) => `
  <g>
    <rect x="${r(p.x)}" y="28" width="${p.w}" height="${H - 56}" rx="14" fill="${p.color}" opacity="0.04" stroke="${p.color}" stroke-opacity="0.15"/>
    ${p.label ? `<text class="pl" x="${r(p.x + p.w / 2)}" y="46" text-anchor="middle" fill="${p.color}" opacity="0.65">${p.label}</text>` : ''}
  </g>`).join('')}

  <g fill="none">
    ${edges.map((e) => `<path d="${e.d}" stroke="${e.color}" stroke-opacity="0.16" stroke-width="2"/>`).join('\n    ')}
    ${edges.map((e) => `<path d="${e.d}" class="flow" stroke="${e.color}" stroke-width="2.4" style="animation-duration:${r(e.flowDur)}s"/>`).join('\n    ')}
  </g>

  <defs>
    ${edges.filter((e) => e.packet).map((e) => `<path id="mp-${e.id}" d="${e.d}"/>`).join('\n    ')}
  </defs>

  ${edges.filter((e) => e.packet).flatMap((e) => {
    const count = e.packets ?? 1
    return Array.from({ length: count }, (_, k) => {
      const dur = e.packetDur ?? 1.8
      const begin = -(k * (dur / count))
      return `<circle r="4.5" fill="${e.color}"><animateMotion dur="${r(dur)}s" begin="${r(begin)}s" repeatCount="indefinite" rotate="auto"><mpath xlink:href="#mp-${e.id}" href="#mp-${e.id}"/></animateMotion></circle>`
    })
  }).join('\n  ')}

  <g>
    <rect x="${r(busX - 3)}" y="${r(busTop - 3)}" width="${busW + 6}" height="${r(busBottom - busTop + 6)}" rx="22" fill="${C_DELIVERY}" class="glow" filter="url(#blur)" style="animation-duration:2.6s"/>
    <rect x="${busX}" y="${busTop}" width="${busW}" height="${r(busBottom - busTop)}" rx="20" fill="url(#busg)" stroke="${C_DELIVERY}" stroke-opacity="0.55" stroke-width="1.5"/>
    <text class="bl" transform="translate(${r(busCx)} ${r((busTop + busBottom) / 2)}) rotate(-90)" text-anchor="middle" dominant-baseline="central">MESSAGEPIPE BUS</text>
  </g>

  ${allNodes.map((n, i) => node(n, r(2.2 + (i % 7) * 0.18))).join('')}
</svg>
`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, svg, 'utf8')
console.log(`Wrote ${OUT} (${svg.length} bytes, ${edges.length} edges, ${allNodes.length} nodes)`)
