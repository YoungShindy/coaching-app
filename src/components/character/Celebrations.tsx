import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Coins, Sparkles, Star } from 'lucide-react'
import { Avatar, type AvatarHandle } from './Avatar'
import { DEFAULT_AVATAR } from './avatarConfig'
import { useGame } from '../../hooks/useGame'
import { SHOP, levelTitle } from '../../lib/game'

// Kleine Hinweise bei verdienten XP und Punkten, plus die große Level-up-Feier.

const CONFETTI_COLORS = ['rgb(var(--c-brand))', 'rgb(var(--c-warning))', 'rgb(var(--c-accent))', 'rgb(var(--c-info))', 'rgb(var(--c-success))']

function Confetti({ count = 44 }: { count?: number }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.18
    const dist = 130 + ((i * 53) % 140)
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 60,
      rot: ((i * 97) % 720) - 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      w: (i % 6) * 0.04,
      t: 1.3 + ((i * 7) % 8) / 10,
      shape: i % 3 === 0 ? 'rounded-full' : 'rounded-[2px]',
      size: 6 + (i % 4) * 2,
    }
  }), [count])
  return (
    <div className="pointer-events-none absolute left-1/2 top-[38%] w-0 h-0" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`confetti absolute block ${p.shape}`}
          style={{
            width: p.size, height: p.size * (p.shape === 'rounded-full' ? 1 : 1.7), backgroundColor: p.color,
            '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, '--w': `${p.w}s`, '--t': `${p.t}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

export function Celebrations() {
  const { toasts, levelUp, dismissLevelUp, character, available } = useGame()
  const avatar = useRef<AvatarHandle>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const compact = typeof window !== 'undefined' && window.innerHeight < 700

  useEffect(() => {
    if (!levelUp) return
    try { navigator.vibrate?.([40, 60, 40, 60, 90]) } catch { /* nicht überall verfügbar */ }
    const t = window.setTimeout(() => { void avatar.current?.cheer() }, 450)
    const again = window.setTimeout(() => { void avatar.current?.cheer() }, 2300)
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissLevelUp() }
    document.addEventListener('keydown', onKey)
    return () => { window.clearTimeout(t); window.clearTimeout(again); document.removeEventListener('keydown', onKey) }
  }, [levelUp, dismissLevelUp])

  if (!available || !character) return null
  const unlocked = levelUp ? SHOP.filter(i => i.minLevel === levelUp) : []

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
        role="status" aria-live="polite"
      >
        {toasts.map(t => (
          <div key={t.id} className="toast-pop flex items-center gap-3 rounded-full bg-bg-card border border-brand/40 shadow-glow pl-2 pr-4 py-2 max-w-full">
            <span className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shrink-0"><Star size={18} aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-text-primary tabular-nums">
                +{t.xp} XP{t.punkte > 0 && <span className="text-warning"> · +{t.punkte} Punkte</span>}
              </span>
              <span className="block text-xs text-text-secondary truncate">{t.titel.length > 2 ? `${t.titel.slice(0, 2).join(', ')} und mehr` : t.titel.join(', ')}</span>
            </span>
          </div>
        ))}
      </div>

      {levelUp && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Level ${levelUp} erreicht`}>
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm fade-in" onClick={dismissLevelUp} />
          {/* Auf kleinen Handys scrollt der Inhalt, damit "Weiter" immer erreichbar bleibt */}
          <div className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain" onClick={e => { if (e.target === e.currentTarget) dismissLevelUp() }}>
          <div className="min-h-full flex items-center justify-center p-5 py-[max(1.25rem,env(safe-area-inset-top))]" onClick={e => { if (e.target === e.currentTarget) dismissLevelUp() }}>
          <div className="relative w-full max-w-sm modal-in text-center">
            {/* Strahlen hinter der Figur */}
            <div className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 w-[440px] h-[440px] max-w-[130vw] pointer-events-none" aria-hidden="true">
              <div
                className="rays w-full h-full rounded-full opacity-30"
                style={{
                  background: 'repeating-conic-gradient(from 0deg, rgb(var(--c-warning)) 0deg 9deg, transparent 9deg 24deg)',
                  WebkitMaskImage: 'radial-gradient(circle, #000 12%, transparent 68%)', maskImage: 'radial-gradient(circle, #000 12%, transparent 68%)',
                }}
              />
            </div>
            <Confetti />

            <div className="relative flex flex-col items-center">
              <div className="level-pop text-xs font-extrabold tracking-[0.3em] text-warning uppercase mb-1">Level-up</div>
              <div className="relative">
                <Avatar ref={avatar} config={character.config ?? DEFAULT_AVATAR} equipped={character.equipped} size={compact ? 140 : 190} idle label={`${character.name} jubelt`} />
                <span className="level-pop absolute -bottom-2 left-1/2 -translate-x-1/2 min-w-[84px] px-4 py-1.5 rounded-full bg-primary text-white text-2xl font-extrabold tabular-nums ring-4 ring-bg-card border border-brand/50 shadow-glow">
                  {levelUp}
                </span>
              </div>
              <h2 className="enter mt-6 text-2xl font-extrabold text-text-primary" style={{ '--d': 420 } as React.CSSProperties}>
                {character.name} ist jetzt {levelTitle(levelUp)}!
              </h2>
              <p className="enter text-sm text-text-secondary mt-1" style={{ '--d': 520 } as React.CSSProperties}>
                Du hast Level {levelUp} erreicht. Stark, dass du so dranbleibst.
              </p>

              {unlocked.length > 0 && (
                <div className="enter mt-4 w-full rounded-3xl bg-bg-card/90 border border-border p-3 text-left" style={{ '--d': 640 } as React.CSSProperties}>
                  <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-text-secondary uppercase mb-2"><Sparkles size={13} className="text-warning" aria-hidden="true" /> Neu im Shop</div>
                  <ul className="space-y-1">
                    {unlocked.map(i => (
                      <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-text-primary">{i.name}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning tabular-nums"><Coins size={12} aria-hidden="true" /> {i.preis}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="enter mt-5 w-full flex flex-col gap-2" style={{ '--d': 760 } as React.CSSProperties}>
                <button ref={closeRef} onClick={dismissLevelUp} className="btn-primary w-full">Weiter</button>
                {unlocked.length > 0 && (
                  <Link to="/charakter?tab=shop" onClick={dismissLevelUp} className="btn-secondary w-full text-center">Zum Shop</Link>
                )}
              </div>
            </div>
          </div>
          </div>
          </div>
        </div>
      )}
    </>
  )
}
