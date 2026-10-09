import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, Coins, Plus, Star, Trash2, Trophy } from 'lucide-react'
import { Avatar } from '../../components/character/Avatar'
import { DEFAULT_AVATAR, type AvatarConfig } from '../../components/character/avatarConfig'
import { Spinner } from '../../components/ui/Spinner'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { isMissingTable } from '../../lib/dbCompat'
import { loadChallenges, signProof, type ChallengeRow } from '../../lib/challenges'
import { levelInfo, levelTitle, type Equipped } from '../../lib/game'
import { cn, formatDate, todayISO } from '../../lib/utils'
import type { Kennenlernen } from '../../hooks/useGame'

// Coach-Ansicht: Figur und Level des Klienten, die Antworten aus dem Kennenlernen und eigene Challenges.

export interface ClientGame {
  loaded: boolean
  available: boolean
  name: string | null
  config: AvatarConfig
  equipped: Equipped
  kennenlernen: Kennenlernen | null
  xp: number
  punkte: number
}

const EMPTY: ClientGame = { loaded: false, available: false, name: null, config: DEFAULT_AVATAR, equipped: {}, kennenlernen: null, xp: 0, punkte: 0 }

export function useClientGame(clientId: string | undefined): ClientGame {
  const [game, setGame] = useState<ClientGame>(EMPTY)
  useEffect(() => {
    if (!clientId) return
    let off = false
    void (async () => {
      const [c, s] = await Promise.all([
        supabase.from('characters').select('*').eq('user_id', clientId).maybeSingle(),
        supabase.from('character_stats').select('xp,punkte').eq('user_id', clientId).maybeSingle(),
      ])
      if (off) return
      if (c.error && isMissingTable(c.error)) { setGame({ ...EMPTY, loaded: true }); return }
      const row = c.data as { name: string; config: Partial<AvatarConfig>; equipped: Equipped; kennenlernen: Kennenlernen | null } | null
      const st = (s.data as { xp?: number; punkte?: number } | null) ?? {}
      setGame({
        loaded: true, available: true, name: row?.name ?? null, config: { ...DEFAULT_AVATAR, ...(row?.config ?? {}) },
        equipped: row?.equipped ?? {}, kennenlernen: row?.kennenlernen ?? null, xp: st.xp ?? 0, punkte: st.punkte ?? 0,
      })
    })()
    return () => { off = true }
  }, [clientId])
  return game
}

function Proof({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let off = false; void signProof(path).then(u => { if (!off) setUrl(u) }); return () => { off = true } }, [path])
  if (!url) return <div className="w-24 h-24 rounded-2xl bg-bg-elevated" />
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Nachweis des Klienten" className="w-24 h-24 rounded-2xl object-cover border border-border" loading="lazy" /></a>
}

export function GameTab({ clientId, clientName, game }: { clientId: string; clientName: string; game: ClientGame }) {
  const { user } = useAuth()
  const [rows, setRows] = useState<ChallengeRow[] | null>(null)
  const [form, setForm] = useState({ titel: '', beschreibung: '', punkte: '25', frist: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const r = await loadChallenges(clientId)
    setRows((r ?? []).filter(x => x.coach_id === user?.id))
  }, [clientId, user?.id])
  useEffect(() => { if (game.available) void reload() }, [game.available, reload])

  if (!game.loaded) return <div className="flex justify-center py-10"><Spinner /></div>
  if (!game.available) return <p className="card text-sm text-text-secondary">Die Figuren sind noch nicht eingerichtet (Datenbank-Update fehlt).</p>

  const lvl = levelInfo(game.xp)
  const pts = Math.round(Number(form.punkte))
  const valid = form.titel.trim().length >= 2 && pts >= 5 && pts <= 100

  async function create() {
    if (!user || !valid || saving) return
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('challenges').insert({
      user_id: clientId, coach_id: user.id, titel: form.titel.trim(), beschreibung: form.beschreibung.trim() || null,
      punkte: pts, frist: form.frist || null,
    } as never)
    setSaving(false)
    if (err) { setError('Das hat nicht geklappt. Versuche es noch einmal.'); return }
    setForm({ titel: '', beschreibung: '', punkte: '25', frist: '' })
    await reload()
  }

  async function remove(r: ChallengeRow) {
    await supabase.from('challenges').delete().eq('id', r.id)
    await reload()
  }

  const open = (rows ?? []).filter(r => r.status === 'aktiv')
  const done = (rows ?? []).filter(r => r.status === 'erledigt')
  const k = game.kennenlernen

  return (
    <div className="space-y-5">
      <div className="card flex items-center gap-5">
        {game.name ? (
          <>
            <div className="relative shrink-0">
              <Avatar config={game.config} equipped={game.equipped} size={120} idle label={`${game.name}, Level ${lvl.level}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-extrabold text-text-primary truncate">{game.name}</div>
              <div className="text-sm font-semibold text-brand">Level {lvl.level} · {levelTitle(lvl.level)}</div>
              <div className="mt-2 h-2.5 rounded-full bg-bg-elevated overflow-hidden max-w-xs" role="progressbar" aria-valuemin={0} aria-valuemax={lvl.xpNeed} aria-valuenow={lvl.xpInto} aria-label="Fortschritt zum nächsten Level">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-brand" style={{ width: `${Math.max(4, lvl.pct)}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold tabular-nums text-text-secondary">
                <span className="inline-flex items-center gap-1"><Star size={12} className="text-warning" aria-hidden="true" /> {game.xp} XP</span>
                <span className="inline-flex items-center gap-1"><Coins size={12} className="text-warning" aria-hidden="true" /> {game.punkte} Punkte</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-text-secondary">{clientName} hat noch keine Figur erstellt.</p>
        )}
      </div>

      {k && (
        <div className="card space-y-3">
          <h3 className="text-sm font-bold text-text-primary">Kennenlernen</h3>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-xs text-text-muted">Ansprache</dt><dd className="text-text-primary font-medium">{k.anrede || '–'}</dd></div>
            <div><dt className="text-xs text-text-muted">Ziele</dt><dd className="text-text-primary font-medium">{k.ziele?.join(', ') || '–'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-text-muted">Warum</dt><dd className="text-text-primary">{k.warum || '–'}</dd></div>
            <div><dt className="text-xs text-text-muted">Erfahrung</dt><dd className="text-text-primary font-medium">{k.erfahrung || '–'}</dd></div>
            <div><dt className="text-xs text-text-muted">Zeit</dt><dd className="text-text-primary font-medium">{k.zeit || '–'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-text-muted">Fällt schwer</dt><dd className="text-text-primary font-medium">{k.schwierigkeiten?.join(', ') || '–'}</dd></div>
          </dl>
        </div>
      )}

      <div className="card space-y-4">
        <div>
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2"><Trophy size={15} className="text-warning" aria-hidden="true" /> Challenge für {clientName} setzen</h3>
          <p className="text-xs text-text-secondary mt-1">Bei deinen Challenges siehst du den Nachweis (Foto oder Notiz). Die eigenen Challenges deines Klienten bleiben privat.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ch-titel">Titel</label>
            <input id="ch-titel" className="input" maxLength={120} value={form.titel} onChange={e => setForm({ ...form, titel: e.target.value })} placeholder="z. B. 3 × diese Woche Spazieren gehen" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ch-text">Beschreibung (freiwillig)</label>
            <textarea id="ch-text" className="input min-h-[72px]" maxLength={300} value={form.beschreibung} onChange={e => setForm({ ...form, beschreibung: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="ch-punkte">Punkte (5 bis 100)</label>
            <input id="ch-punkte" className="input tabular-nums" type="number" min={5} max={100} step={5} value={form.punkte} onChange={e => setForm({ ...form, punkte: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="ch-frist">Frist (freiwillig)</label>
            <input id="ch-frist" className="input" type="date" min={todayISO()} value={form.frist} onChange={e => setForm({ ...form, frist: e.target.value })} />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button onClick={create} disabled={!valid || saving} className="btn-primary disabled:opacity-50 flex items-center gap-2"><Plus size={16} aria-hidden="true" /> Challenge senden</button>
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-bold text-text-primary">Deine Challenges</h3>
        {rows === null && <Spinner />}
        {rows !== null && rows.length === 0 && <p className="text-sm text-text-secondary">Noch keine gesetzt.</p>}
        {open.map(r => (
          <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-bg-elevated px-3.5 py-3">
            <Clock size={16} className="text-text-secondary shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-text-primary truncate">{r.titel}</div>
              <div className="text-xs text-text-secondary">Offen · {r.punkte} Punkte{r.frist ? ` · bis ${formatDate(r.frist, 'dd.MM.')}` : ''}</div>
            </div>
            <button onClick={() => remove(r)} aria-label={`${r.titel} zurückziehen`} className="p-2 rounded-full text-text-secondary hover:text-danger transition-colors"><Trash2 size={16} aria-hidden="true" /></button>
          </div>
        ))}
        {done.map(r => (
          <div key={r.id} className={cn('flex items-start gap-3 rounded-2xl border border-success/30 bg-success/5 px-3.5 py-3')}>
            <span className="w-8 h-8 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0"><Check size={16} strokeWidth={3} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-text-primary">{r.titel}</div>
              <div className="text-xs text-text-secondary">Geschafft{r.erledigt_am ? ` am ${formatDate(r.erledigt_am, 'dd.MM.yyyy')}` : ''} · {r.punkte} Punkte</div>
              {r.nachweis_text && <p className="text-sm text-text-primary mt-1.5">„{r.nachweis_text}“</p>}
            </div>
            {r.nachweis_pfad && <Proof path={r.nachweis_pfad} />}
          </div>
        ))}
      </div>
    </div>
  )
}
