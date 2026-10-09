import { useCallback, useEffect, useRef, useState } from 'react'
import { Droplets, Minus, Plus, Undo2 } from 'lucide-react'
import { Avatar, type AvatarHandle } from '../character/Avatar'
import { DEFAULT_AVATAR, type AvatarConfig } from '../character/avatarConfig'
import type { Equipped } from '../../lib/game'
import { cn } from '../../lib/utils'

const BOTTLES = [330, 500, 750, 1000]
const QUICK = [250, 500, 750]

const liters = (ml: number) => (ml / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })

function message(pct: number, restMl: number): string {
  if (pct >= 100) return 'Tagesziel geschafft, stark!'
  if (pct === 0) return 'Los geht’s: Die erste Flasche wartet.'
  if (pct < 50) return `Guter Start! Noch ${liters(restMl)} l.`
  if (pct === 50) return `Halbzeit! Noch ${liters(restMl)} l.`
  return `Über die Hälfte, weiter so! Noch ${liters(restMl)} l.`
}

/** Dein Charakter trinkt aus der Flasche, der Tank füllt sich mit Wellen. */
export function WaterCard({ totalMl, goalMl, entries, bottleMl, onBottleChange, onAdd, onRemoveLast, avatar = DEFAULT_AVATAR, equipped }: {
  totalMl: number
  goalMl: number
  entries: number
  bottleMl: number
  onBottleChange: (ml: number) => void
  onAdd: (ml: number) => void
  onRemoveLast: () => void
  avatar?: AvatarConfig
  equipped?: Equipped
}) {
  const avatarRef = useRef<AvatarHandle>(null)
  const [shown, setShown] = useState(0)
  const [busy, setBusy] = useState(0) // laufende Trink-Animationen
  const [custom, setCustom] = useState(false)
  const totalRef = useRef(totalMl)
  totalRef.current = totalMl

  // Beim Öffnen füllt sich der Tank von leer auf den heutigen Stand
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(totalRef.current))
    return () => cancelAnimationFrame(id)
  }, [])
  // Änderungen von außen (zurücknehmen, anderer Tag) ziehen sofort nach, solange nicht getrunken wird
  useEffect(() => { if (busy === 0) setShown(totalMl) }, [totalMl, busy])

  const drink = useCallback(async (ml: number) => {
    onAdd(ml)
    setBusy(b => b + 1)
    const wasDone = totalRef.current >= goalMl
    try {
      await avatarRef.current?.drink(ml, bottleMl, { onSip: () => setShown(s => s + ml) })
      if (!wasDone && totalRef.current + ml >= goalMl) await avatarRef.current?.cheer()
    } finally {
      setBusy(b => b - 1)
      setShown(totalRef.current)
    }
  }, [bottleMl, goalMl, onAdd])

  const pct = Math.min(100, Math.round((shown / Math.max(goalMl, 1)) * 100))
  const realPct = Math.min(100, Math.round((totalMl / Math.max(goalMl, 1)) * 100))
  const rest = Math.max(0, goalMl - totalMl)

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets size={16} className="text-info" aria-hidden="true" />
          <h3 className="font-semibold text-text-primary text-sm">Wasser</h3>
        </div>
        <span className="text-xs text-text-secondary tabular-nums">{liters(totalMl)} / {liters(goalMl)} l</span>
      </div>

      <div className="max-w-md mx-auto w-full space-y-4">
      <div className="flex items-end justify-center gap-3">
        <Avatar ref={avatarRef} config={avatar} equipped={equipped} holdBottle bottleMl={bottleMl} size={176} label="Deine Figur trinkt aus der Flasche" />

        {/* Tank */}
        <div className="flex flex-col items-center gap-1.5 pb-1">
          <div
            role="img" aria-label={`${liters(totalMl)} von ${liters(goalMl)} Litern getrunken, ${realPct} Prozent`}
            className="relative w-[96px] h-[184px] rounded-[30px] border-2 border-info/50 bg-bg-elevated overflow-hidden"
          >
            <div
              className="absolute inset-x-0 bottom-0 h-full"
              style={{ transform: `translate3d(0, ${100 - pct}%, 0)`, transition: 'transform 1.4s cubic-bezier(0.22, 1, 0.36, 1)', willChange: 'transform' }}
            >
              <div className="water-wave absolute -top-3 left-0 w-[200%] h-4 text-info/80" aria-hidden="true">
                <svg viewBox="0 0 200 16" preserveAspectRatio="none" className="w-full h-full" fill="currentColor">
                  <path d="M0 8 C 12 0, 38 0, 50 8 S 88 16, 100 8 C 112 0, 138 0, 150 8 S 188 16, 200 8 V16 H0 Z" />
                </svg>
              </div>
              <div className="absolute inset-0 bg-info/80" />
              {busy > 0 && [0, 1, 2].map(i => (
                <span key={i} className="water-bubble absolute bottom-2 w-1.5 h-1.5 rounded-full bg-white/70" style={{ left: `${22 + i * 26}%`, animationDelay: `${i * 380}ms` }} />
              ))}
            </div>
            {/* Literstriche */}
            <div className="absolute left-0 inset-y-0 w-2.5 pointer-events-none" aria-hidden="true">
              {Array.from({ length: Math.max(0, Math.floor(goalMl / 500) - 1) }).map((_, i, a) => (
                <span key={i} className="absolute left-0 h-0.5 w-2.5 rounded-r bg-text-muted/70" style={{ top: `${((i + 1) / (a.length + 1)) * 100}%` }} />
              ))}
            </div>
          </div>
          <span className="text-lg font-bold text-text-primary tabular-nums leading-none">{pct}%</span>
        </div>
      </div>

      <p className="text-sm text-text-secondary text-center" aria-live="polite">{message(realPct, rest)}</p>

      <button onClick={() => drink(bottleMl)} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
        <Droplets size={18} aria-hidden="true" /> Flasche getrunken · {bottleMl} ml
      </button>

      <div className="flex items-center gap-2 flex-wrap">
        {QUICK.map(ml => (
          <button key={ml} onClick={() => drink(ml)} className="btn-secondary !px-4 !py-1.5 text-sm flex items-center gap-1">
            <Plus size={13} aria-hidden="true" /> {ml} ml
          </button>
        ))}
        {entries > 0 && (
          <button onClick={onRemoveLast} className="ml-auto text-xs text-text-muted hover:text-danger transition-colors flex items-center gap-1 px-2.5 py-2.5 rounded-lg" aria-label="Letzten Eintrag rückgängig machen">
            <Undo2 size={13} aria-hidden="true" /> Rückgängig
          </button>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <div className="text-xs font-semibold text-text-secondary mb-2">Meine Flasche</div>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Flaschengröße">
          {BOTTLES.map(ml => (
            <button
              key={ml} aria-pressed={bottleMl === ml && !custom} onClick={() => { setCustom(false); onBottleChange(ml) }}
              className={cn('px-3.5 py-2.5 rounded-full text-xs font-semibold border transition-all active:scale-95',
                bottleMl === ml && !custom ? 'bg-primary border-brand text-white' : 'border-border text-text-secondary hover:border-brand/40')}
            >{ml >= 1000 ? `${ml / 1000} l` : `${ml} ml`}</button>
          ))}
          <button
            aria-pressed={custom || !BOTTLES.includes(bottleMl)} onClick={() => setCustom(true)}
            className={cn('px-3.5 py-2.5 rounded-full text-xs font-semibold border transition-all active:scale-95',
              custom || !BOTTLES.includes(bottleMl) ? 'bg-primary border-brand text-white' : 'border-border text-text-secondary hover:border-brand/40')}
          >Andere</button>
        </div>
        {(custom || !BOTTLES.includes(bottleMl)) && (
          <div className="flex items-center gap-2 mt-2">
            <button className="p-2 rounded-xl bg-bg-elevated border border-border text-text-secondary" aria-label="50 ml weniger" onClick={() => onBottleChange(Math.max(100, bottleMl - 50))}><Minus size={14} /></button>
            <label className="sr-only" htmlFor="bottle-ml">Flaschengröße in Millilitern</label>
            <input
              id="bottle-ml" type="number" inputMode="numeric" min={100} max={2000} step={50} className="input !w-28 !py-2 text-center" value={bottleMl}
              onChange={e => { const v = parseInt(e.target.value); if (v >= 100 && v <= 2000) onBottleChange(v) }}
            />
            <span className="text-sm text-text-secondary">ml</span>
            <button className="p-2 rounded-xl bg-bg-elevated border border-border text-text-secondary" aria-label="50 ml mehr" onClick={() => onBottleChange(Math.min(2000, bottleMl + 50))}><Plus size={14} /></button>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
