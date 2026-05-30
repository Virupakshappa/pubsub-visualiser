import { useCallback, useEffect, useRef, useState } from 'react'

export type CardPosition = {
  centerX: number
  centerY: number
  top: number
  left: number
  width: number
  height: number
}

export type CardPositions = Record<string, CardPosition>

export function useCardPositions() {
  const refs = useRef<Map<string, HTMLElement>>(new Map())
  const [positions, setPositions] = useState<CardPositions>({})
  const rafRef = useRef<number | null>(null)

  const measure = useCallback(() => {
    const next: CardPositions = {}
    for (const [name, el] of refs.current) {
      const r = el.getBoundingClientRect()
      next[name] = {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        centerX: r.left + r.width / 2,
        centerY: r.top + r.height / 2,
      }
    }
    setPositions(next)
  }, [])

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      measure()
    })
  }, [measure])

  const register = useCallback(
    (name: string) => (el: HTMLElement | null) => {
      if (el) {
        refs.current.set(name, el)
        scheduleMeasure()
      } else {
        refs.current.delete(name)
      }
    },
    [scheduleMeasure],
  )

  useEffect(() => {
    const observer = new ResizeObserver(scheduleMeasure)
    for (const el of refs.current.values()) observer.observe(el)
    window.addEventListener('resize', scheduleMeasure)
    window.addEventListener('scroll', scheduleMeasure, { passive: true })
    scheduleMeasure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      window.removeEventListener('scroll', scheduleMeasure)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [scheduleMeasure])

  return { positions, register, remeasure: scheduleMeasure }
}
