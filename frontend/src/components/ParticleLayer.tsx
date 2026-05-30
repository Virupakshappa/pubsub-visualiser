import { useEffect, useRef } from 'react'

export type Particle = {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  color: string
  emoji?: string
  durationMs: number
  bornAt: number
}

function curvedPath(p: Particle): string {
  const midX = (p.fromX + p.toX) / 2
  const midY = (p.fromY + p.toY) / 2
  const dx = p.toX - p.fromX
  const dy = p.toY - p.fromY
  const len = Math.hypot(dx, dy) || 1
  // Perpendicular offset for a graceful arc.
  const arc = Math.min(Math.max(len * 0.25, 40), 180)
  const cx = midX + (-dy / len) * arc
  const cy = midY + (dx / len) * arc
  return `M ${p.fromX} ${p.fromY} Q ${cx} ${cy} ${p.toX} ${p.toY}`
}

export function ParticleLayer({
  particles,
  onComplete,
}: {
  particles: Particle[]
  onComplete: (id: string) => void
}) {
  return (
    <svg className="particle-layer" aria-hidden>
      {particles.map((p) => (
        <ParticleElement key={p.id} particle={p} onComplete={onComplete} />
      ))}
    </svg>
  )
}

function ParticleElement({
  particle,
  onComplete,
}: {
  particle: Particle
  onComplete: (id: string) => void
}) {
  const ref = useRef<SVGGElement | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => onComplete(particle.id), particle.durationMs + 50)
    return () => window.clearTimeout(t)
  }, [particle, onComplete])

  const d = curvedPath(particle)
  const dur = `${particle.durationMs}ms`
  const trailColor = particle.color
  const isEmoji = !!particle.emoji

  return (
    <g ref={ref}>
      <path
        d={d}
        fill="none"
        stroke={trailColor}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0}
      >
        <animate
          attributeName="opacity"
          values="0;0.55;0.55;0"
          keyTimes="0;0.15;0.7;1"
          dur={dur}
          begin="0s"
          fill="freeze"
        />
        <animate
          attributeName="stroke-dasharray"
          from={`0 9999`}
          to={`9999 0`}
          dur={dur}
          begin="0s"
          fill="freeze"
        />
      </path>
      {isEmoji ? (
        <text
          fontSize="28"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}
        >
          <animateMotion dur={dur} begin="0s" rotate="auto" fill="freeze">
            <mpath href={`#${pathId(particle.id)}`} />
          </animateMotion>
          {particle.emoji}
        </text>
      ) : (
        <>
          <circle r={11} fill={trailColor} opacity={0.25}>
            <animateMotion dur={dur} begin="0s" fill="freeze">
              <mpath href={`#${pathId(particle.id)}`} />
            </animateMotion>
          </circle>
          <circle r={6} fill={trailColor}>
            <animateMotion dur={dur} begin="0s" fill="freeze">
              <mpath href={`#${pathId(particle.id)}`} />
            </animateMotion>
            <animate
              attributeName="r"
              values="6;8;6;5"
              keyTimes="0;0.3;0.6;1"
              dur={dur}
              begin="0s"
              fill="freeze"
            />
          </circle>
        </>
      )}
      <path id={pathId(particle.id)} d={d} fill="none" stroke="none" />
    </g>
  )
}

const pathId = (id: string) => `pp-${id}`
