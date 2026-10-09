import { useEffect, useRef, useState } from 'react'

// Während die Startanimation läuft, hält index.html die Klasse sp-hold auf <html>.
// Zahlen warten dann auf das Signal "app-reveal", damit man das Hochzählen auch sieht.
const holding = () => document.documentElement.classList.contains('sp-hold')
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Zählt weich von der aktuell angezeigten Zahl zum Zielwert (ease-out).
 * Ändert sich das Ziel mitten in der Bewegung, geht es von der gerade sichtbaren Zahl weiter.
 */
export function useCountUp(target: number, { duration = 1000, delay = 0 }: { duration?: number; delay?: number } = {}) {
  const [value, setValue] = useState(0)
  const shown = useRef(0)

  useEffect(() => {
    if (reducedMotion() || shown.current === target) {
      shown.current = target
      setValue(target)
      return
    }
    const from = shown.current
    let raf = 0
    let cancelled = false

    const run = () => {
      const start = performance.now() + delay
      const tick = (now: number) => {
        if (cancelled) return
        const p = Math.min(1, Math.max(0, (now - start) / duration))
        const eased = 1 - Math.pow(1 - p, 4)
        const v = p >= 1 ? target : from + (target - from) * eased
        shown.current = v
        setValue(v)
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    if (holding()) window.addEventListener('app-reveal', run, { once: true })
    else run()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('app-reveal', run)
    }
  }, [target, duration, delay])

  return value
}
