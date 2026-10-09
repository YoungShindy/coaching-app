import { useState } from 'react'
import { Check, Coins, Lock, Shirt } from 'lucide-react'
import { Avatar } from './Avatar'
import { SegmentTabs } from '../ui/SegmentTabs'
import { useGame } from '../../hooks/useGame'
import { cn } from '../../lib/utils'
import {
  CATEGORY_LABEL, CATEGORY_SLOTS, SHOP, itemState, toggleEquip, type ShopCategory, type ShopItem,
} from '../../lib/game'

const CATEGORIES = (Object.keys(CATEGORY_LABEL) as ShopCategory[]).map(k => ({ key: k, label: CATEGORY_LABEL[k] }))

/** Shop: Dinge mit Punkten kaufen (ab einem bestimmten Level) und der Figur anziehen. */
export function ShopTab() {
  const { character, stats, level, owned, buy, equip } = useGame()
  const [cat, setCat] = useState<ShopCategory>('kleidung')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [popId, setPopId] = useState<string | null>(null)
  const [buying, setBuying] = useState(false)
  if (!character) return null

  const items = SHOP.filter(i => CATEGORY_SLOTS[cat].includes(i.slot)).sort((a, b) => a.minLevel - b.minLevel || a.preis - b.preis)
  const worn = Object.values(character.equipped).filter(Boolean).length

  async function onBuy(item: ShopItem) {
    if (buying) return
    setBuying(true); setMsg(null)
    const err = await buy(item)
    if (err) { setBuying(false); setMsg({ tone: 'warn', text: err }); return }
    setPopId(item.id)
    window.setTimeout(() => setPopId(null), 900)
    await equip(toggleEquip(character!.equipped, item))
    setBuying(false)
    setMsg({ tone: 'ok', text: `${item.name} gehört jetzt dir und ist angezogen.` })
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-4 !p-4">
        <div className="shrink-0 rounded-3xl bg-brand/10 px-2 pt-1">
          <Avatar config={character.config} equipped={character.equipped} size={92} view="head" label="So siehst du aus" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-lg font-extrabold text-text-primary tabular-nums">
            <Coins size={18} className="text-warning" aria-hidden="true" /> {stats.punkte} <span className="text-sm font-semibold text-text-secondary">Punkte</span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">Level {level.level}. Neue Dinge schalten mit dem Level frei, bezahlt wird mit Punkten.</p>
          {worn > 0 && (
            <button
              onClick={() => equip({})}
              className="mt-2 text-xs font-semibold text-brand flex items-center gap-1 hover:underline"
            ><Shirt size={13} aria-hidden="true" /> Alles ausziehen</button>
          )}
        </div>
      </div>

      <SegmentTabs tabs={CATEGORIES} value={cat} onChange={k => setCat(k as ShopCategory)} label="Shop-Bereich" />

      {msg && (
        <p role="status" className={cn('text-sm rounded-2xl px-4 py-2.5 border', msg.tone === 'ok' ? 'text-success bg-success/10 border-success/30' : 'text-warning bg-warning/10 border-warning/30')}>{msg.text}</p>
      )}

      <div key={cat} className="grid grid-cols-2 gap-3">
        {items.map((item, i) => {
          const state = itemState(item, owned, level.level, stats.punkte)
          const wearing = character.equipped[item.slot] === item.id
          return (
            <div
              key={item.id} style={{ '--d': 40 + i * 50 } as React.CSSProperties}
              className={cn('enter card !p-3 flex flex-col items-center text-center gap-2', wearing && 'border-brand/60 ring-1 ring-brand/30')}
            >
              <div className={cn('rounded-3xl bg-bg-elevated px-2 pt-1 transition-transform', state === 'locked' && 'opacity-50 grayscale', popId === item.id && 'pop-in')}>
                <Avatar view="head" size={96} config={character.config} equipped={{ ...character.equipped, [item.slot]: item.id }} label={`${item.name} Vorschau`} />
              </div>
              <div>
                <div className="font-bold text-text-primary text-sm">{item.name}</div>
                <div className="text-xs text-text-secondary leading-snug">{item.text}</div>
              </div>

              {state === 'owned' && (
                <button
                  onClick={() => equip(toggleEquip(character.equipped, item))}
                  className={cn('w-full rounded-full py-2 text-sm font-semibold border transition-all active:scale-95',
                    wearing ? 'bg-primary text-white border-brand' : 'bg-bg-elevated text-text-primary border-border-light hover:border-brand/50')}
                  aria-pressed={wearing}
                >
                  {wearing ? <span className="inline-flex items-center gap-1.5"><Check size={14} aria-hidden="true" /> Getragen</span> : 'Anziehen'}
                </button>
              )}
              {state === 'buyable' && (
                <button onClick={() => onBuy(item)} disabled={buying} className="btn-primary w-full !py-2 text-sm flex items-center justify-center gap-1.5 disabled:opacity-60">
                  <Coins size={14} aria-hidden="true" /> Kaufen · {item.preis}
                </button>
              )}
              {state === 'poor' && (
                <div className="w-full">
                  <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-brand/70 rounded-full" style={{ width: `${Math.min(100, (stats.punkte / item.preis) * 100)}%` }} />
                  </div>
                  <div className="text-xs text-text-secondary mt-1.5 tabular-nums">Noch {item.preis - stats.punkte} Punkte ({item.preis})</div>
                </div>
              )}
              {state === 'locked' && (
                <div className="w-full rounded-full py-2 text-xs font-semibold bg-bg-elevated text-text-secondary flex items-center justify-center gap-1.5">
                  <Lock size={13} aria-hidden="true" /> Ab Level {item.minLevel}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
