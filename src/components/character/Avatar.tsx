import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { DEFAULT_AVATAR, shade, type AvatarConfig } from './avatarConfig'
import type { Equipped } from '../../lib/game'
import { BackItem, ClothesFront, FaceItem, HeadItem, NeckItem, PetItem, TORSO_PATH, clothesInfo } from './items'

// Figur mit Kopf und Oberkörper (Mii-ähnlich). Mit `holdBottle` hält sie eine Flasche und kann daraus trinken.
// Die Bewegung läuft über requestAnimationFrame direkt am SVG: kein Neurendern pro Bild, daher flüssig.

export interface AvatarHandle {
  /** Trinkt `ml` aus einer Flasche mit `capacityMl`. `onSip` kommt, sobald getrunken wird (Füllstand dann nachziehen). */
  drink: (ml: number, capacityMl: number, opts?: { onSip?: () => void }) => Promise<void>
  /** Freudensprung, z. B. bei erreichtem Ziel. */
  cheer: () => Promise<void>
}

interface Props {
  config?: AvatarConfig
  /** Breite in Pixeln, die Höhe folgt (Oberkörper 4:5, Kopf-Ausschnitt etwa 1:1) */
  size?: number
  /** Ganzer Oberkörper oder nur der Kopf (für kleine Symbole) */
  view?: 'bust' | 'head'
  holdBottle?: boolean
  /** Größe der gehaltenen Flasche in ml (bestimmt auch die gezeichnete Größe) */
  bottleMl?: number
  /** Gekaufte Dinge, die die Figur trägt */
  equipped?: Equipped
  /** Sanftes Atmen und Blinzeln */
  idle?: boolean
  className?: string
  label?: string
}

// ─── Geometrie ────────────────────────────────────────────────────────────────

const SHOULDER = { x: 156, y: 186 }
const UPPER = 36
const FORE = 36
const MOUTH = { x: 103, y: 127 }
const IDLE_HAND = { x: 140, y: 208 }
const FREE_HAND = { x: 172, y: 262 } // ohne Flasche hängt der Arm seitlich herab (Hand außerhalb des Bildes)
const PHI_RAISE = -62
const PHI_DRINK = -97

const BOTTLE_BODY = 'M-12 -22 L-12 22 Q-12 26 -8 26 L8 26 Q12 26 12 22 L12 -22 C12 -28 5 -30 5 -34 L5 -37 L-5 -37 L-5 -34 C-5 -30 -12 -28 -12 -22 Z'
// Probepunkte im Flaschenkörper, aus denen der Wasserstand berechnet wird (waagerechte Oberfläche)
const SAMPLES: [number, number][] = (() => {
  const pts: [number, number][] = []
  for (let x = -11; x <= 11; x += 2) for (let y = -21; y <= 25; y += 2) pts.push([x, y])
  for (let x = -4; x <= 4; x += 2) for (let y = -36; y <= -23; y += 2) pts.push([x, y])
  return pts
})()

const rad = (d: number) => (d * Math.PI) / 180
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeIn = (t: number) => t * t * t
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))

/** Elbogen für eine Zwei-Knochen-Kette von der Schulter zur Hand; der Ellbogen zeigt nach außen (rechts). */
function elbow(s: { x: number; y: number }, h: { x: number; y: number }) {
  const dx = h.x - s.x, dy = h.y - s.y
  const dist = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(UPPER - FORE) + 0.01), UPPER + FORE - 0.01)
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len
  const a = (UPPER * UPPER - FORE * FORE + dist * dist) / (2 * dist)
  const hgt = Math.sqrt(Math.max(0, UPPER * UPPER - a * a))
  const mx = s.x + ux * a, my = s.y + uy * a
  const c1 = { x: mx - uy * hgt, y: my + ux * hgt }
  const c2 = { x: mx + uy * hgt, y: my - ux * hgt }
  return c1.x >= c2.x ? c1 : c2
}

function bottleScale(ml: number) { return ml <= 350 ? 0.86 : ml <= 550 ? 1 : ml <= 800 ? 1.1 : 1.2 }

/** Wasserstand in der (gedrehten) Flasche: Oberfläche bleibt waagerecht, Menge = `fill` des Volumens. */
function waterLevel(phiDeg: number, fill: number): number {
  if (fill >= 0.999) return -60
  if (fill <= 0.001) return 60
  const s = Math.sin(rad(phiDeg)), c = Math.cos(rad(phiDeg))
  const ys = SAMPLES.map(([x, y]) => x * s + y * c).sort((p, q) => p - q)
  return ys[Math.min(ys.length - 1, Math.floor((1 - fill) * ys.length))]
}

// ─── Gesicht ──────────────────────────────────────────────────────────────────

function FaceShapeEl({ shape, fill }: { shape: AvatarConfig['face']; fill: string }) {
  if (shape === 'oval') return <ellipse cx="100" cy="94" rx="42" ry="54" fill={fill} />
  if (shape === 'square') return <rect x="56" y="42" width="88" height="102" rx="32" fill={fill} />
  return <ellipse cx="100" cy="94" rx="47" ry="49" fill={fill} />
}

function BackHair({ c }: { c: AvatarConfig }) {
  const f = c.hairColor
  if (c.hairStyle === 'long') return <path d="M48 92 C36 140 44 176 58 190 L142 190 C156 176 164 140 152 92 Z" fill={f} />
  if (c.hairStyle === 'ponytail') return <path d="M140 66 C176 62 190 108 172 150 C170 124 160 104 142 94 Z" fill={f} />
  if (c.hairStyle === 'bun') return <circle cx="100" cy="34" r="17" fill={f} />
  return null
}

function FrontHair({ c }: { c: AvatarConfig }) {
  const f = c.hairColor
  switch (c.hairStyle) {
    case 'bald': return null
    case 'buzz': return <path d="M54 88 C50 52 76 38 100 38 C124 38 150 52 146 88 C139 70 122 64 100 64 C78 64 61 70 54 88 Z" fill={f} opacity="0.92" />
    case 'side': return <path d="M52 90 C44 52 74 34 104 36 C132 38 152 56 148 90 C142 74 126 62 104 62 C92 74 74 76 52 90 Z" fill={f} />
    case 'curly': return (
      <g fill={f}>
        {[[56, 70, 15], [70, 52, 16], [90, 44, 16], [112, 44, 16], [132, 52, 16], [146, 70, 15], [100, 56, 14]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
      </g>
    )
    case 'long':
    case 'ponytail':
    case 'bun':
    case 'short':
    default: return <path d="M54 90 C48 52 76 36 100 36 C124 36 152 52 146 90 C140 72 124 62 100 62 C76 62 60 72 54 90 Z" fill={f} />
  }
}

function Eyes({ style, closed }: { style: AvatarConfig['eyes']; closed: boolean }) {
  const dark = '#1d1b1a'
  if (closed) {
    return (
      <g fill="none" stroke={dark} strokeWidth="3.2" strokeLinecap="round">
        <path d="M75 95 Q82 101 89 95" /><path d="M111 95 Q118 101 125 95" />
      </g>
    )
  }
  switch (style) {
    case 'happy': return (
      <g fill="none" stroke={dark} strokeWidth="3.4" strokeLinecap="round">
        <path d="M75 97 Q82 88 89 97" /><path d="M111 97 Q118 88 125 97" />
      </g>
    )
    case 'wide': return (
      <g>
        <ellipse cx="82" cy="95" rx="7.5" ry="8.5" fill="#fff" stroke={dark} strokeWidth="1.6" /><circle cx="83" cy="96" r="4.2" fill={dark} />
        <ellipse cx="118" cy="95" rx="7.5" ry="8.5" fill="#fff" stroke={dark} strokeWidth="1.6" /><circle cx="119" cy="96" r="4.2" fill={dark} />
      </g>
    )
    case 'calm': return (
      <g>
        <ellipse cx="82" cy="96" rx="5.5" ry="4" fill={dark} /><ellipse cx="118" cy="96" rx="5.5" ry="4" fill={dark} />
        <path d="M75 92 Q82 89 89 92" fill="none" stroke={dark} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M111 92 Q118 89 125 92" fill="none" stroke={dark} strokeWidth="2.4" strokeLinecap="round" />
      </g>
    )
    default: return <g fill={dark}><circle cx="82" cy="96" r="4.8" /><circle cx="118" cy="96" r="4.8" /></g>
  }
}

function Brows({ style, color }: { style: AvatarConfig['brows']; color: string }) {
  if (style === 'strong') return (
    <g fill="none" stroke={color} strokeWidth="5" strokeLinecap="round">
      <path d="M73 83 L90 80" /><path d="M110 80 L127 83" />
    </g>
  )
  if (style === 'thin') return (
    <g fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round">
      <path d="M74 82 Q82 77 90 80" /><path d="M110 80 Q118 77 126 82" />
    </g>
  )
  return (
    <g fill="none" stroke={color} strokeWidth="3.6" strokeLinecap="round">
      <path d="M74 83 Q82 77 90 81" /><path d="M110 81 Q118 77 126 83" />
    </g>
  )
}

function Mouth({ style }: { style: AvatarConfig['mouth'] }) {
  const dark = '#1d1b1a'
  switch (style) {
    case 'grin': return <path d="M86 122 Q100 142 114 122 Z" fill="#fff" stroke={dark} strokeWidth="2.6" strokeLinejoin="round" />
    case 'soft': return <path d="M92 127 Q100 131 108 127" fill="none" stroke={dark} strokeWidth="3" strokeLinecap="round" />
    case 'open': return <g><ellipse cx="100" cy="128" rx="8" ry="7" fill={dark} /><ellipse cx="100" cy="132" rx="4.5" ry="2.8" fill="#e0707a" /></g>
    default: return <path d="M88 124 Q100 137 112 124" fill="none" stroke={dark} strokeWidth="3.4" strokeLinecap="round" />
  }
}

function Beard({ style, color, skin }: { style: AvatarConfig['beard']; color: string; skin: string }) {
  if (style === 'none') return null
  const jaw = 'M54 100 Q58 146 100 148 Q142 146 146 100 Q132 120 100 120 Q68 120 54 100 Z'
  if (style === 'mustache') return <path d="M84 118 Q92 112 100 116 Q108 112 116 118 Q108 122 100 120 Q92 122 84 118 Z" fill={color} />
  if (style === 'stubble') return <path d={jaw} fill={color} opacity="0.28" />
  const full = style === 'full'
  return (
    <g>
      <path d={full ? 'M52 96 Q54 154 100 158 Q146 154 148 96 Q134 124 100 122 Q66 124 52 96 Z' : jaw} fill={color} />
      <ellipse cx="100" cy="127" rx="14" ry="9" fill={skin} />
    </g>
  )
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export const Avatar = forwardRef<AvatarHandle, Props>(function Avatar(
  { config = DEFAULT_AVATAR, size = 160, view = 'bust', holdBottle = false, bottleMl = 500, equipped, idle = false, className, label = 'Deine Figur' }, ref,
) {
  const c = config
  const uid = useId().replace(/:/g, '')
  const scale = bottleScale(bottleMl)
  const skinShade = shade(c.skin, 0.13)
  const eq = equipped ?? {}
  const box = view === 'head' ? { x: 22, y: 14, w: 156, h: 150 } : { x: 0, y: 0, w: 200, h: 250 }
  const info = clothesInfo(eq.kleidung, c.shirt, c.skin)
  const sleeve = info.sleeve
  // Lange Ärmel (Hoodie, Jacke, Anzug) bedecken auch den Unterarm
  const foreColor = eq.kleidung && eq.kleidung !== 'tank' ? info.sleeve : c.skin

  const el = useRef<Record<string, SVGElement | null>>({})
  const reg = (k: string) => (node: SVGElement | null) => { el.current[k] = node }
  const raf = useRef<number | undefined>(undefined)
  const busy = useRef<Promise<void>>(Promise.resolve())
  const reduced = useRef(false)
  const animating = useRef(false)
  const base = useRef({ holdBottle, scale })
  base.current = { holdBottle, scale }

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    reduced.current = !!mq?.matches
    const onChange = () => { reduced.current = !!mq?.matches }
    mq?.addEventListener?.('change', onChange)
    return () => { mq?.removeEventListener?.('change', onChange); if (raf.current) cancelAnimationFrame(raf.current) }
  }, [])

  const set = (k: string, name: string, v: string | number) => el.current[k]?.setAttribute(name, String(v))

  /** Setzt eine Pose: Hand, Flaschenwinkel, Füllstand, Augen, Kopf, Schluck, Funken. */
  const applyPose = useCallback((p: { hx: number; hy: number; phi: number; fill: number; closed: number; head: number; gulp: number; spark: number; hop: number }) => {
    const sc = base.current.scale
    const e = elbow(SHOULDER, { x: p.hx, y: p.hy })
    set('upper', 'x1', SHOULDER.x); set('upper', 'y1', SHOULDER.y); set('upper', 'x2', e.x); set('upper', 'y2', e.y)
    set('fore', 'x1', e.x); set('fore', 'y1', e.y); set('fore', 'x2', p.hx); set('fore', 'y2', p.hy)
    set('hand', 'cx', p.hx); set('hand', 'cy', p.hy)
    set('bottle', 'transform', `translate(${p.hx} ${p.hy}) rotate(${p.phi}) scale(${sc})`)
    set('waterRot', 'transform', `rotate(${-p.phi})`)
    set('water', 'y', waterLevel(p.phi, p.fill))
    set('eyesOpen', 'opacity', 1 - p.closed)
    set('eyesClosed', 'opacity', p.closed)
    set('head', 'transform', `translate(0 ${-p.head * 3}) rotate(${-p.head * 3} 100 150)`)
    set('gulp', 'opacity', p.gulp > 0 ? 0.9 : 0)
    set('gulp', 'cy', 156 + p.gulp * 14)
    set('gulp', 'r', 3 + Math.sin(p.gulp * Math.PI) * 2.4)
    set('sparks', 'opacity', p.spark)
    set('sparks', 'transform', `translate(0 ${(1 - p.spark) * 8})`)
    set('body', 'transform', `translate(0 ${-p.hop})`)
  }, [])

  const restPose = useCallback(() => {
    const hold = base.current.holdBottle
    const h = hold ? IDLE_HAND : FREE_HAND
    applyPose({ hx: h.x, hy: h.y, phi: 0, fill: 1, closed: 0, head: 0, gulp: 0, spark: 0, hop: 0 })
    set('bottle', 'opacity', hold ? 1 : 0)
  }, [applyPose])

  useLayoutEffect(() => { restPose() }, [restPose, holdBottle, bottleMl])

  const run = useCallback((duration: number, frame: (t: number) => void) => new Promise<void>(resolve => {
    const t0 = performance.now()
    animating.current = true
    const tick = (now: number) => {
      const t = clamp01((now - t0) / duration)
      frame(t)
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else { animating.current = false; resolve() }
    }
    raf.current = requestAnimationFrame(tick)
  }), [])

  // Blinzeln im Ruhezustand
  useEffect(() => {
    if (!idle) return
    let timer: number
    const blink = () => {
      if (!reduced.current && !animating.current) {
        set('eyesOpen', 'opacity', 0); set('eyesClosed', 'opacity', 1)
        window.setTimeout(() => { if (!animating.current) { set('eyesOpen', 'opacity', 1); set('eyesClosed', 'opacity', 0) } }, 140)
      }
      timer = window.setTimeout(blink, 2600 + Math.random() * 3200)
    }
    timer = window.setTimeout(blink, 1800 + Math.random() * 2000)
    return () => window.clearTimeout(timer)
  }, [idle])

  const mouthPoint = useCallback((phi: number) => {
    const tip = 43 * base.current.scale
    return { x: MOUTH.x - tip * Math.sin(rad(phi)), y: MOUTH.y + tip * Math.cos(rad(phi)) }
  }, [])

  const drink = useCallback(async (ml: number, capacityMl: number, opts?: { onSip?: () => void }) => {
    const job = async () => {
      if (!base.current.holdBottle) return
      if (reduced.current) { opts?.onSip?.(); return }
      const endFill = clamp01(1 - ml / Math.max(capacityMl, ml))
      const duration = 1700 + Math.min(ml, 1000) * 2
      let sipped = false
      await run(duration, (t) => {
        // Hand: erst hoch zum Mund, dann Flasche kippen, danach zurück
        const up = easeOut(seg(t, 0, 0.24))
        const back = easeIn(seg(t, 0.84, 1))
        const attach = up * (1 - back)
        const phi = (up * PHI_RAISE + easeInOut(seg(t, 0.3, 0.8)) * (PHI_DRINK - PHI_RAISE)) * (1 - back)
        const target = mouthPoint(phi)
        const idle = IDLE_HAND
        const hx = lerp(idle.x, target.x, attach), hy = lerp(idle.y, target.y, attach)
        const drinkingT = seg(t, 0.3, 0.82)
        const fill = lerp(1, endFill, easeInOut(drinkingT))
        const closed = easeInOut(seg(t, 0.2, 0.32)) * (1 - easeInOut(seg(t, 0.84, 0.92)))
        const head = easeInOut(seg(t, 0.28, 0.5)) * (1 - easeInOut(seg(t, 0.8, 0.95)))
        // drei Schlucke
        const g = drinkingT > 0 && drinkingT < 1 ? (drinkingT * 3) % 1 : 0
        const gulp = g > 0.05 && g < 0.55 ? seg(g, 0.05, 0.55) : 0
        const spark = easeOut(seg(t, 0.86, 0.95)) * (1 - seg(t, 0.97, 1))
        if (!sipped && t > 0.3) { sipped = true; opts?.onSip?.() }
        applyPose({ hx, hy, phi, fill, closed, head, gulp, spark, hop: 0 })
      })
      restPose()
    }
    busy.current = busy.current.then(job, job)
    return busy.current
  }, [applyPose, mouthPoint, restPose, run])

  const cheer = useCallback(async () => {
    const job = async () => {
      if (reduced.current) return
      const hold = base.current.holdBottle ? IDLE_HAND : FREE_HAND
      await run(900, (t) => {
        const hop = Math.abs(Math.sin(t * Math.PI * 2)) * 10 * (1 - t)
        const spark = Math.sin(t * Math.PI)
        applyPose({ hx: hold.x, hy: hold.y - Math.sin(t * Math.PI) * 30, phi: 0, fill: 1, closed: 0, head: 0, gulp: 0, spark, hop })
      })
      restPose()
    }
    busy.current = busy.current.then(job, job)
    return busy.current
  }, [applyPose, restPose, run])

  useImperativeHandle(ref, () => ({ drink, cheer }), [drink, cheer])

  const bolt = 'M104 196 L92 212 L100 212 L96 226 L110 208 L102 208 Z'

  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} width={size} height={(size * box.h) / box.w} className={className} role="img" aria-label={label}>
      <defs>
        <clipPath id={`${uid}-bottle`}><path d={BOTTLE_BODY} /></clipPath>
      </defs>

      <g className={idle ? 'avatar-bob' : undefined}>
      <g ref={reg('body')}>
        <BackItem clothes={eq.kleidung} shirt={c.shirt} />
        <BackHair c={c} />

        {/* Oberkörper */}
        {eq.kleidung ? <ClothesFront clothes={eq.kleidung} shirt={c.shirt} skin={c.skin} /> : <path d={TORSO_PATH} fill={c.shirt} />}
        <path d="M44 190 C30 204 24 228 26 250 L56 250 C54 228 56 208 62 194 Z" fill={info.leftSleeve} />
        {!eq.kleidung && <path d={bolt} fill="#fff" opacity="0.85" />}
        <rect x="87" y="136" width="26" height="46" rx="10" fill={skinShade} />
        <path d="M84 178 Q100 198 116 178 Q100 184 84 178 Z" fill={skinShade} />
        <NeckItem item={eq.hals} />
        <PetItem item={eq.tier} />

        {/* Kopf */}
        <g ref={reg('head')}>
          <circle cx="53" cy="98" r="9" fill={c.skin} /><circle cx="147" cy="98" r="9" fill={c.skin} />
          <FaceShapeEl shape={c.face} fill={c.skin} />
          <ellipse cx="72" cy="113" rx="9" ry="5.5" fill="#ff7a8a" opacity="0.18" /><ellipse cx="128" cy="113" rx="9" ry="5.5" fill="#ff7a8a" opacity="0.18" />
          <path d="M98 104 Q95 112 100 114" fill="none" stroke={skinShade} strokeWidth="2.6" strokeLinecap="round" />
          <Beard style={c.beard} color={c.hairColor} skin={c.skin} />
          <g ref={reg('mouth')}><Mouth style={c.mouth} /></g>
          <g ref={reg('eyesOpen')}><Eyes style={c.eyes} closed={false} /></g>
          <g ref={reg('eyesClosed')} opacity="0"><Eyes style={c.eyes} closed /></g>
          <Brows style={c.brows} color={c.hairStyle === 'bald' ? shade(c.skin, 0.4) : c.hairColor} />
          <FrontHair c={c} />
          <FaceItem item={eq.brille} />
          <HeadItem item={eq.kopf} />
        </g>

        {/* Schluck am Hals */}
        <circle ref={reg('gulp')} cx="100" cy="156" r="3" fill={shade(c.skin, 0.28)} opacity="0" />

        {/* Funken nach dem Trinken */}
        <g ref={reg('sparks')} opacity="0">
          {[[44, 56, 1], [158, 48, 1.15], [30, 100, 0.8]].map(([x, y, s], i) => (
            <path key={i} transform={`translate(${x} ${y}) scale(${s})`} d="M0 -9 C4 -3 7 0 0 7 C-7 0 -4 -3 0 -9 Z" fill="#74b2fb" />
          ))}
        </g>

        {/* Rechter Arm mit Flasche */}
        <line ref={reg('upper')} x1="156" y1="186" x2="175" y2="214" stroke={sleeve} strokeWidth="21" strokeLinecap="round" />
        <line ref={reg('fore')} x1="175" y1="214" x2="140" y2="208" stroke={foreColor} strokeWidth={foreColor === c.skin ? 14 : 19} strokeLinecap="round" />
        <g ref={reg('bottle')} transform={`translate(${IDLE_HAND.x} ${IDLE_HAND.y}) scale(${scale})`}>
          <path d={BOTTLE_BODY} fill="#dcecf6" fillOpacity="0.55" />
          <g clipPath={`url(#${uid}-bottle)`}>
            <g ref={reg('waterRot')}>
              <rect ref={reg('water')} x="-60" y="-60" width="120" height="140" fill="#3b9bf0" fillOpacity="0.88" />
            </g>
            <rect x="-12" y="-6" width="24" height="9" fill="#fff" fillOpacity="0.2" />
          </g>
          <path d={BOTTLE_BODY} fill="none" stroke="#9ec4dd" strokeWidth="1.8" strokeLinejoin="round" />
          <rect x="-6.5" y="-44" width="13" height="8" rx="2.5" fill="#075640" />
          <path d="M-8 -20 L-8 14" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round" />
        </g>
        <circle ref={reg('hand')} cx={IDLE_HAND.x} cy={IDLE_HAND.y} r="9" fill={c.skin} />
      </g>
      </g>
    </svg>
  )
})
