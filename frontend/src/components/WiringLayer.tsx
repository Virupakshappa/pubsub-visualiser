import type { CardPositions } from '../hooks/useCardPositions'

export type WiringEdge = {
  id: string                 // `${publisherName}->${subscriberName}::${eventName}`
  publisherName: string
  subscriberName: string
  eventName: string
  color: string
  lastFiredAt: number        // 0 if never
}

function curve(
  fromX: number, fromY: number,
  toX: number, toY: number,
): string {
  const midX = (fromX + toX) / 2
  const midY = (fromY + toY) / 2
  const dx = toX - fromX
  const dy = toY - fromY
  const len = Math.hypot(dx, dy) || 1
  const arc = Math.min(Math.max(len * 0.2, 30), 140)
  const cx = midX + (-dy / len) * arc
  const cy = midY + (dx / len) * arc
  return `M ${fromX} ${fromY} Q ${cx} ${cy} ${toX} ${toY}`
}

export function WiringLayer({
  edges,
  positions,
  now,
}: {
  edges: WiringEdge[]
  positions: CardPositions
  now: number
}) {
  return (
    <svg className="wiring-layer" aria-hidden>
      {edges.map((e) => {
        const from = positions[e.publisherName]
        const to = positions[e.subscriberName]
        if (!from || !to) return null
        const age = now - e.lastFiredAt
        const active = e.lastFiredAt > 0 && age < 700
        const t = active ? 1 - age / 700 : 0
        const d = curve(from.centerX, from.centerY, to.centerX, to.centerY)
        return (
          <path
            key={e.id}
            d={d}
            fill="none"
            stroke={e.color}
            strokeWidth={active ? 1.5 + t * 2 : 1}
            opacity={active ? 0.15 + t * 0.55 : 0.08}
          />
        )
      })}
    </svg>
  )
}
