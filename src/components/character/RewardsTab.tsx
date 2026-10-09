import { useCallback, useEffect, useState } from 'react'
import { Check, Coins, Gift, Pencil, Plus, Ticket, Trash2 } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Spinner } from '../ui/Spinner'
import { useAuth } from '../../hooks/useAuth'
import { useGame } from '../../hooks/useGame'
import { supabase } from '../../lib/supabase'
import { cn, formatDate } from '../../lib/utils'
import { REWARD_IDEAS } from '../../lib/game'

interface Reward { id: string; titel: string; preis: number; emoji: string | null }
interface Voucher { id: string; titel: string; preis: number; emoji: string | null; eingeloest_am: string; genutzt: boolean }

const EMOJIS = ['🍦', '🍰', '🍕', '📱', '📺', '🎧', '🎬', '😴', '🍽️', '💆', '👟', '🎁']

/** Belohnungen: eigene Wünsche mit Preis, einlösen mit Punkten, Gutscheine abhaken. Nur Gutscheine, keine Kalorien. */
export function RewardsTab() {
  const { user } = useAuth()
  const { stats, spend } = useGame()
  const [rewards, setRewards] = useState<Reward[] | null>(null)
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<Reward | 'new' | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const reload = useCallback(async () => {
    if (!user) return
    const [r, v] = await Promise.all([
      supabase.from('belohnungen').select('id,titel,preis,emoji').eq('user_id', user.id).order('preis', { ascending: true }),
      supabase.from('einloesungen').select('*').eq('user_id', user.id).order('eingeloest_am', { ascending: false }).limit(60),
    ])
    if (r.error) { setFailed(true); return }
    setFailed(false)
    setRewards((r.data ?? []) as unknown as Reward[])
    setVouchers(((v.error ? [] : v.data) ?? []) as unknown as Voucher[])
  }, [user])
  useEffect(() => { void reload() }, [reload])

  async function redeem(r: Reward) {
    if (!user || busy) return
    setBusy(r.id); setMsg(null)
    // Erst den Gutschein anlegen, dann bezahlen. Klappt das Bezahlen nicht, verschwindet er wieder.
    const ins = await supabase.from('einloesungen').insert({ user_id: user.id, titel: r.titel, preis: r.preis, emoji: r.emoji } as never).select('id').single()
    if (ins.error || !ins.data) { setBusy(null); setMsg({ tone: 'warn', text: 'Das hat nicht geklappt. Versuche es noch einmal.' }); return }
    const id = (ins.data as { id: string }).id
    const err = await spend('belohnung', id, r.preis, `${r.titel} eingelöst`)
    if (err) {
      await supabase.from('einloesungen').delete().eq('id', id)
      setBusy(null); setMsg({ tone: 'warn', text: err }); return
    }
    setBusy(null); setFresh(id)
    window.setTimeout(() => setFresh(null), 1200)
    setMsg({ tone: 'ok', text: `„${r.titel}“ ist jetzt dein Gutschein. Genieß es!` })
    await reload()
  }

  async function markUsed(v: Voucher) {
    await supabase.from('einloesungen').update({ genutzt: true } as never).eq('id', v.id)
    await reload()
  }

  async function save(draft: { id?: string; titel: string; preis: number; emoji: string | null }): Promise<boolean> {
    if (!user) return false
    const row = { titel: draft.titel.trim(), preis: draft.preis, emoji: draft.emoji }
    const { error } = draft.id
      ? await supabase.from('belohnungen').update(row as never).eq('id', draft.id)
      : await supabase.from('belohnungen').insert({ user_id: user.id, ...row } as never)
    if (error) return false
    await reload()
    return true
  }

  async function remove(r: Reward) {
    await supabase.from('belohnungen').delete().eq('id', r.id)
    setEditing(null)
    await reload()
  }

  if (failed) return <p className="card text-sm text-text-secondary">Die Belohnungen sind noch nicht eingerichtet. Bitte später noch einmal versuchen.</p>
  if (!rewards) return <div className="flex justify-center py-10"><Spinner /></div>

  const open = vouchers.filter(v => !v.genutzt)
  const used = vouchers.filter(v => v.genutzt)
  const mine = new Set(rewards.map(r => r.titel))
  const ideas = REWARD_IDEAS.filter(i => !mine.has(i.titel))

  return (
    <div className="space-y-5">
      <div className="card !p-4 flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-warning/15 text-warning flex items-center justify-center shrink-0"><Coins size={22} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-extrabold text-text-primary tabular-nums">{stats.punkte} <span className="text-sm font-semibold text-text-secondary">Punkte</span></div>
          <p className="text-xs text-text-secondary">Löse sie gegen Dinge ein, die du dir wirklich wünschst. Du bekommst einen Gutschein, Kalorien werden nicht gezählt.</p>
        </div>
      </div>

      {msg && <p role="status" className={cn('text-sm rounded-2xl px-4 py-2.5 border', msg.tone === 'ok' ? 'text-success bg-success/10 border-success/30' : 'text-warning bg-warning/10 border-warning/30')}>{msg.text}</p>}

      {/* Gutscheine */}
      {open.length > 0 && (
        <section aria-label="Deine Gutscheine" className="space-y-2">
          <h3 className="text-xs font-bold tracking-wider text-text-secondary uppercase flex items-center gap-1.5"><Ticket size={13} aria-hidden="true" /> Deine Gutscheine</h3>
          {open.map((v, i) => (
            <div
              key={v.id} style={{ '--d': i * 50 } as React.CSSProperties}
              className={cn('enter relative card !p-4 flex items-center gap-3 border-dashed border-brand/50 bg-brand/5', fresh === v.id && 'pop-in')}
            >
              <span className="text-3xl" aria-hidden="true">{v.emoji ?? '🎁'}</span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-text-primary text-sm">{v.titel}</div>
                <div className="text-xs text-text-secondary">Eingelöst am {formatDate(v.eingeloest_am, 'dd.MM.yyyy')}</div>
              </div>
              <button onClick={() => markUsed(v)} className="btn-secondary !px-3.5 !py-2 text-sm flex items-center gap-1.5 shrink-0" aria-label={`${v.titel} als genutzt markieren`}>
                <Check size={14} aria-hidden="true" /> Genutzt
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Meine Belohnungen */}
      <section aria-label="Deine Belohnungen" className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-wider text-text-secondary uppercase flex items-center gap-1.5"><Gift size={13} aria-hidden="true" /> Meine Belohnungen</h3>
          <button onClick={() => setEditing('new')} className="text-sm font-semibold text-brand flex items-center gap-1 hover:underline"><Plus size={15} aria-hidden="true" /> Neu</button>
        </div>
        {rewards.length === 0 && <p className="card text-sm text-text-secondary">Noch keine eigene Belohnung. Wähle unten eine Idee oder lege selbst eine an.</p>}
        {rewards.map((r, i) => {
          const can = stats.punkte >= r.preis
          return (
            <div key={r.id} className="enter card !p-3.5 flex items-center gap-3" style={{ '--d': i * 40 } as React.CSSProperties}>
              <span className="text-2xl w-9 text-center" aria-hidden="true">{r.emoji ?? '🎁'}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-text-primary text-sm">{r.titel}</div>
                {can ? (
                  <div className="text-xs font-semibold text-warning tabular-nums inline-flex items-center gap-1"><Coins size={11} aria-hidden="true" /> {r.preis}</div>
                ) : (
                  <div className="mt-1">
                    <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden" aria-hidden="true"><div className="h-full bg-brand/70 rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, (stats.punkte / r.preis) * 100)}%` }} /></div>
                    <div className="text-xs text-text-secondary mt-1 tabular-nums">Noch {r.preis - stats.punkte} Punkte ({r.preis})</div>
                  </div>
                )}
              </div>
              <button onClick={() => setEditing(r)} aria-label={`${r.titel} bearbeiten`} className="w-9 h-9 rounded-full text-text-secondary hover:text-brand hover:bg-bg-elevated flex items-center justify-center transition-colors"><Pencil size={15} aria-hidden="true" /></button>
              <button
                onClick={() => redeem(r)} disabled={!can || busy === r.id}
                className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-semibold border transition-all active:scale-95 disabled:cursor-not-allowed',
                  can ? 'bg-primary text-white border-brand' : 'bg-bg-elevated text-text-muted border-border')}
              >{busy === r.id ? <Spinner size={14} className="text-white" /> : 'Einlösen'}</button>
            </div>
          )
        })}
      </section>

      {/* Ideen */}
      {ideas.length > 0 && (
        <section aria-label="Ideen für Belohnungen" className="space-y-2">
          <h3 className="text-xs font-bold tracking-wider text-text-secondary uppercase">Ideen</h3>
          <div className="flex flex-wrap gap-2">
            {ideas.map(i => (
              <button
                key={i.titel} disabled={adding}
                onClick={async () => { if (adding) return; setAdding(true); await save({ titel: i.titel, preis: i.preis, emoji: i.emoji }); setAdding(false) }}
                className="px-3 py-2 rounded-2xl border border-border bg-bg-elevated text-sm text-text-primary hover:border-brand/50 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-60"
                aria-label={`${i.titel} für ${i.preis} Punkte hinzufügen`}
              >
                <span aria-hidden="true">{i.emoji}</span> {i.titel} <span className="text-xs text-warning font-semibold tabular-nums">{i.preis}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {used.length > 0 && (
        <section aria-label="Genutzte Gutscheine" className="space-y-1.5">
          <h3 className="text-xs font-bold tracking-wider text-text-secondary uppercase">Schon genossen</h3>
          {used.slice(0, 10).map(v => (
            <div key={v.id} className="flex items-center gap-3 px-1 text-sm text-text-secondary">
              <span aria-hidden="true">{v.emoji ?? '🎁'}</span>
              <span className="flex-1 truncate">{v.titel}</span>
              <span className="text-xs tabular-nums">{formatDate(v.eingeloest_am, 'dd.MM.')}</span>
            </div>
          ))}
        </section>
      )}

      <RewardSheet target={editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />
    </div>
  )
}

function RewardSheet({ target, onClose, onSave, onDelete }: {
  target: Reward | 'new' | null
  onClose: () => void
  onSave: (d: { id?: string; titel: string; preis: number; emoji: string | null }) => Promise<boolean>
  onDelete: (r: Reward) => Promise<void>
}) {
  const [titel, setTitel] = useState('')
  const [preis, setPreis] = useState('100')
  const [emoji, setEmoji] = useState<string | null>('🎁')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNew = target === 'new'

  useEffect(() => {
    if (!target) return
    setError(null); setSaving(false)
    if (target === 'new') { setTitel(''); setPreis('100'); setEmoji('🎁') }
    else { setTitel(target.titel); setPreis(String(target.preis)); setEmoji(target.emoji) }
  }, [target])

  const price = Math.round(Number(preis))
  const valid = titel.trim().length >= 2 && price >= 10 && price <= 5000

  async function submit() {
    if (!valid || saving) return
    setSaving(true); setError(null)
    const ok = await onSave({ id: target && target !== 'new' ? target.id : undefined, titel, preis: price, emoji })
    setSaving(false)
    if (!ok) { setError('Das hat nicht geklappt. Versuche es noch einmal.'); return }
    onClose()
  }

  return (
    <Sheet open={!!target} onClose={onClose} title={isNew ? 'Neue Belohnung' : 'Belohnung bearbeiten'}>
      <div className="space-y-4 pb-3">
        <div>
          <label className="label" htmlFor="rw-titel">Was wünschst du dir?</label>
          <input id="rw-titel" className="input" maxLength={60} value={titel} onChange={e => setTitel(e.target.value)} placeholder="z. B. Ein Stück Kuchen" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="rw-preis">Preis in Punkten (10 bis 5000)</label>
          <input id="rw-preis" className="input tabular-nums" type="number" inputMode="numeric" min={10} max={5000} step={5} value={preis} onChange={e => setPreis(e.target.value)} />
        </div>
        <div>
          <div className="label">Symbol</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Symbol">
            {EMOJIS.map(e => (
              <button
                key={e} type="button" onClick={() => setEmoji(e)} aria-pressed={emoji === e} aria-label={`Symbol ${e}`}
                className={cn('w-11 h-11 rounded-2xl border text-xl transition-all active:scale-90', emoji === e ? 'border-brand bg-brand/10 scale-105' : 'border-border bg-bg-elevated')}
              >{e}</button>
            ))}
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          {!isNew && target && (
            <button onClick={() => void onDelete(target)} aria-label="Belohnung löschen" className="w-12 rounded-2xl bg-bg-elevated border border-border-input text-text-secondary hover:text-danger hover:border-danger/50 flex items-center justify-center transition-colors"><Trash2 size={18} aria-hidden="true" /></button>
          )}
          <button onClick={submit} disabled={!valid || saving} className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Spinner size={16} className="text-white" /> : <Check size={18} aria-hidden="true" />} Speichern
          </button>
        </div>
      </div>
    </Sheet>
  )
}
