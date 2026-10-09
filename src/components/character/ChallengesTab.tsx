import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, ChevronDown, Coins, Flag, ListChecks, Play, Sparkles, Trash2, UserCheck, X } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Spinner } from '../ui/Spinner'
import { useAuth } from '../../hooks/useAuth'
import { useGame } from '../../hooks/useGame'
import { supabase } from '../../lib/supabase'
import { cn, formatDate, todayISO } from '../../lib/utils'
import {
  CHALLENGES, CHALLENGE_CATEGORIES, MAX_CHALLENGES_PER_DAY, challengeAward, challengeById, dailySuggestions, type ChallengeCategory, type ChallengeDef,
} from '../../lib/game'
import {
  doneThisWeek, loadChallenges, signProof, startedToday, uploadProof, type ChallengeRow,
} from '../../lib/challenges'

const emojiOf = (kategorie: string | null) => CHALLENGE_CATEGORIES.find(c => c.key === kategorie)?.emoji ?? '⭐'

function ProofThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let off = false; void signProof(path).then(u => { if (!off) setUrl(u) }); return () => { off = true } }, [path])
  if (!url) return null
  return <img src={url} alt="Dein Nachweis" className="w-14 h-14 rounded-2xl object-cover border border-border shrink-0" loading="lazy" />
}

/** Challenges: drei Vorschläge pro Tag, die eigenen laufenden, Aufgaben vom Coach und alle zum Aussuchen. */
export function ChallengesTab() {
  const { user } = useAuth()
  const { award, stats } = useGame()
  const [rows, setRows] = useState<ChallengeRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const [finishing, setFinishing] = useState<ChallengeRow | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [justDone, setJustDone] = useState<string | null>(null)
  const today = todayISO()

  const reload = useCallback(async () => {
    if (!user) return
    const r = await loadChallenges(user.id)
    if (r === null) setFailed(true); else { setRows(r); setFailed(false) }
  }, [user])
  useEffect(() => { void reload() }, [reload])

  const list = rows ?? []
  const weekDone = useMemo(() => doneThisWeek(list, today), [list, today])
  const active = list.filter(r => r.status === 'aktiv')
  const activeIds = new Set(active.map(r => r.vorlage_id).filter(Boolean) as string[])
  const fromCoach = active.filter(r => r.coach_id)
  const own = active.filter(r => !r.coach_id)
  const finished = list.filter(r => r.status === 'erledigt')
  const used = startedToday(list, today)
  const left = Math.max(0, MAX_CHALLENGES_PER_DAY - used)
  const suggestions = useMemo(() => dailySuggestions(today, new Set([...weekDone, ...activeIds])), [today, weekDone, active.length])  // eslint-disable-line react-hooks/exhaustive-deps

  async function start(def: ChallengeDef) {
    if (!user || busy) return
    if (left <= 0) { setNotice(`Heute sind ${MAX_CHALLENGES_PER_DAY} Challenges genug. Morgen gibt es neue.`); return }
    setBusy(def.id); setNotice(null)
    const { error } = await supabase.from('challenges').insert({
      user_id: user.id, vorlage_id: def.id, titel: def.titel, beschreibung: def.text, kategorie: def.kategorie, punkte: def.punkte,
    } as never)
    setBusy(null)
    if (error) { setNotice('Das hat nicht geklappt. Versuche es noch einmal.'); return }
    await reload()
  }

  async function drop(row: ChallengeRow) {
    setBusy(row.id)
    await supabase.from('challenges').delete().eq('id', row.id)
    setBusy(null)
    await reload()
  }

  async function finish(row: ChallengeRow, note: string, file: File | null): Promise<string | null> {
    if (!user) return 'Nicht angemeldet'
    let path: string | null = null
    if (file) {
      path = await uploadProof(user.id, row.id, file)
      if (!path) return 'Das Foto konnte nicht hochgeladen werden. Versuche es noch einmal oder schreib eine Notiz.'
    }
    // Erst prüfen, dass die Challenge noch läuft, dann die Punkte eintragen (jede Challenge zählt nur einmal), erst dann abhaken.
    // So geht nichts verloren, wenn die Verbindung dazwischen abbricht: ein zweiter Versuch trägt nichts doppelt ein.
    const still = await supabase.from('challenges').select('id').eq('id', row.id).eq('status', 'aktiv')
    if (still.error) return 'Das hat nicht geklappt. Versuche es noch einmal.'
    if (!(still.data ?? []).length) { await reload(); return 'Diese Challenge läuft nicht mehr.' }
    const added = await award([challengeAward(row.id, row.titel, row.punkte)])
    if (added === null) return 'Die Punkte konnten nicht gutgeschrieben werden. Versuche es noch einmal.'
    const { error } = await supabase.from('challenges').update({
      status: 'erledigt', nachweis_text: note.trim() || null, nachweis_pfad: path, erledigt_am: new Date().toISOString(),
    } as never).eq('id', row.id).eq('status', 'aktiv')
    if (error) return 'Das hat nicht geklappt. Versuche es noch einmal.'
    setJustDone(row.id)
    window.setTimeout(() => setJustDone(null), 1400)
    await reload()
    return null
  }

  if (failed) {
    return <p className="card text-sm text-text-secondary">Die Challenges sind noch nicht eingerichtet. Bitte später noch einmal versuchen.</p>
  }
  if (!rows) return <div className="flex justify-center py-10"><Spinner /></div>

  return (
    <div className="space-y-5">
      {notice && <p role="status" className="text-sm rounded-2xl px-4 py-2.5 border text-warning bg-warning/10 border-warning/30">{notice}</p>}

      {/* Aufgaben vom Coach */}
      {fromCoach.length > 0 && (
        <section aria-label="Aufgaben von deinem Coach" className="space-y-2">
          <h3 className="text-xs font-bold tracking-wider text-text-secondary uppercase flex items-center gap-1.5"><UserCheck size={13} aria-hidden="true" /> Von deinem Coach</h3>
          {fromCoach.map((r, i) => (
            <ActiveCard key={r.id} row={r} index={i} coach done={justDone === r.id} busy={busy === r.id} onFinish={() => setFinishing(r)} />
          ))}
        </section>
      )}

      {/* Laufende eigene Challenges */}
      {own.length > 0 && (
        <section aria-label="Deine laufenden Challenges" className="space-y-2">
          <h3 className="text-xs font-bold tracking-wider text-text-secondary uppercase flex items-center gap-1.5"><Flag size={13} aria-hidden="true" /> Läuft gerade</h3>
          {own.map((r, i) => (
            <ActiveCard key={r.id} row={r} index={i} done={justDone === r.id} busy={busy === r.id} onFinish={() => setFinishing(r)} onDrop={() => drop(r)} />
          ))}
        </section>
      )}

      {/* Heutige Vorschläge */}
      <section aria-label="Vorschläge für heute" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-bold tracking-wider text-text-secondary uppercase flex items-center gap-1.5"><Sparkles size={13} aria-hidden="true" /> Für heute</h3>
          <span className="text-xs text-text-secondary tabular-nums" aria-live="polite">{left > 0 ? `Noch ${left} von ${MAX_CHALLENGES_PER_DAY} frei` : 'Heute ist genug'}</span>
        </div>
        {suggestions.length === 0 && <p className="card text-sm text-text-secondary">Für heute gibt es keine neuen Vorschläge mehr. Stark!</p>}
        {suggestions.map((def, i) => (
          <div key={def.id} className="enter card !p-4 flex items-center gap-3" style={{ '--d': 40 + i * 60 } as React.CSSProperties}>
            <span className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center text-xl shrink-0" aria-hidden="true">{emojiOf(def.kategorie)}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-text-primary text-sm">{def.titel}</div>
              <div className="text-xs text-text-secondary leading-snug">{def.text}</div>
              <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-warning tabular-nums"><Coins size={12} aria-hidden="true" /> {def.punkte} Punkte</div>
            </div>
            <button
              onClick={() => start(def)} disabled={busy === def.id || left <= 0}
              className="btn-primary !px-4 !py-2 text-sm shrink-0 disabled:opacity-50 flex items-center gap-1.5"
              aria-label={`${def.titel} starten`}
            >
              <Play size={14} aria-hidden="true" /> Start
            </button>
          </div>
        ))}
        <button onClick={() => setAll(true)} className="w-full btn-secondary !py-2.5 text-sm flex items-center justify-center gap-2">
          <ListChecks size={16} aria-hidden="true" /> Alle Challenges ansehen
        </button>
      </section>

      {/* Erledigt */}
      {finished.length > 0 && (
        <section aria-label="Erledigte Challenges">
          <button
            onClick={() => setShowDone(v => !v)} aria-expanded={showDone}
            className="w-full flex items-center justify-between text-xs font-bold tracking-wider text-text-secondary uppercase py-3"
          >
            <span className="flex items-center gap-1.5"><Check size={13} aria-hidden="true" /> Geschafft ({finished.length})</span>
            <ChevronDown size={16} className={cn('transition-transform duration-300', showDone && 'rotate-180')} aria-hidden="true" />
          </button>
          {showDone && (
            <ul className="space-y-2 mt-2">
              {finished.slice(0, 20).map((r, i) => (
                <li key={r.id} className="enter card !p-3 flex items-center gap-3" style={{ '--d': i * 30 } as React.CSSProperties}>
                  {r.nachweis_pfad ? <ProofThumb path={r.nachweis_pfad} /> : (
                    <span className="w-11 h-11 rounded-2xl bg-success/15 text-success flex items-center justify-center shrink-0"><Check size={20} strokeWidth={3} aria-hidden="true" /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-text-primary text-sm truncate">{r.titel}</div>
                    <div className="text-xs text-text-secondary truncate">
                      {r.erledigt_am ? formatDate(r.erledigt_am, 'dd.MM.yyyy') : ''}{r.nachweis_text ? ` · ${r.nachweis_text}` : ''}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-warning tabular-nums shrink-0">+{r.punkte}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <AllSheet
        open={all} onClose={() => setAll(false)} weekDone={weekDone} activeIds={activeIds} left={left} busy={busy}
        onStart={async d => { await start(d); }}
      />
      <FinishSheet row={finishing} onClose={() => setFinishing(null)} onFinish={finish} points={stats.punkte} />
    </div>
  )
}

function ActiveCard({ row, index, coach, done, busy, onFinish, onDrop }: {
  row: ChallengeRow; index: number; coach?: boolean; done: boolean; busy: boolean; onFinish: () => void; onDrop?: () => void
}) {
  const late = !!row.frist && row.frist < todayISO()
  return (
    <div
      className={cn('enter card !p-4 space-y-3', coach && 'border-brand/40', done && 'pop-in')}
      style={{ '--d': 30 + index * 60 } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center text-xl shrink-0" aria-hidden="true">{coach ? '🏅' : emojiOf(row.kategorie)}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-text-primary text-sm">{row.titel}</div>
          {row.beschreibung && <div className="text-xs text-text-secondary leading-snug mt-0.5">{row.beschreibung}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-warning tabular-nums"><Coins size={12} aria-hidden="true" /> {row.punkte} Punkte</span>
            {row.frist && <span className={cn('font-semibold', late ? 'text-danger' : 'text-text-secondary')}>{late ? 'Frist vorbei: ' : 'Bis '}{formatDate(row.frist, 'dd.MM.')}</span>}
          </div>
          {coach && <p className="text-xs text-text-secondary mt-1.5">Dein Coach sieht deinen Nachweis.</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onFinish} disabled={busy} className="btn-primary flex-1 !py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          <Check size={16} aria-hidden="true" /> Erledigt
        </button>
        {onDrop && (
          <button
            onClick={onDrop} disabled={busy} aria-label={`${row.titel} abbrechen`}
            className="w-12 rounded-2xl bg-bg-elevated border border-border-input text-text-secondary hover:text-danger hover:border-danger/50 flex items-center justify-center transition-colors"
          ><Trash2 size={16} aria-hidden="true" /></button>
        )}
      </div>
    </div>
  )
}

/** Nachweis: ein Foto oder eine kurze Notiz, erst dann gibt es die Punkte. */
function FinishSheet({ row, onClose, onFinish, points }: {
  row: ChallengeRow | null
  onClose: () => void
  onFinish: (row: ChallengeRow, note: string, file: File | null) => Promise<string | null>
  points: number
}) {
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const last = useRef<ChallengeRow | null>(null)
  if (row) last.current = row
  const shown = row ?? last.current

  useEffect(() => { if (row) { setNote(''); setFile(null); setError(null); setSaving(false) } }, [row?.id])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const canSave = !!file || note.trim().length >= 3

  async function submit() {
    if (!row || !canSave || saving) return
    setSaving(true); setError(null)
    const err = await onFinish(row, note, file)
    setSaving(false)
    if (err) { setError(err); return }
    onClose()
  }

  return (
    <Sheet open={!!row} onClose={onClose} title="Geschafft? Zeig es kurz">
      {shown && (
        <div className="space-y-4 pb-3">
          <div className="card !p-3 flex items-center gap-3 bg-bg-elevated">
            <span className="text-xl" aria-hidden="true">{shown.coach_id ? '🏅' : emojiOf(shown.kategorie)}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-text-primary text-sm">{shown.titel}</div>
              <div className="text-xs text-warning font-semibold tabular-nums">+{shown.punkte} Punkte · du hast {points}</div>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="proof-note">Kurze Notiz</label>
            <textarea
              id="proof-note" className="input min-h-[84px]" maxLength={200} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Was hast du gemacht? Wie hat es sich angefühlt?"
            />
          </div>

          <div>
            <div className="label">Oder ein Foto</div>
            {preview ? (
              <div className="relative inline-block">
                <img src={preview} alt="Vorschau deines Nachweises" className="h-40 rounded-3xl object-cover border border-border" />
                <button
                  onClick={() => setFile(null)} aria-label="Foto entfernen"
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                ><X size={16} aria-hidden="true" /></button>
              </div>
            ) : (
              <label className="btn-secondary !py-2.5 text-sm flex items-center justify-center gap-2 cursor-pointer">
                <Camera size={16} aria-hidden="true" /> Foto aufnehmen oder wählen
                <input type="file" accept="image/*" className="sr-only" aria-label="Nachweis-Foto" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>

          <p className="text-xs text-text-secondary leading-relaxed">
            {shown.coach_id
              ? 'Diese Challenge hat dir dein Coach gesetzt, deshalb sieht er deinen Nachweis.'
              : 'Dein Nachweis bleibt privat. Nur du siehst ihn, auch dein Coach nicht.'}
          </p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <button onClick={submit} disabled={!canSave || saving} className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Spinner size={16} className="text-white" /> : <Check size={18} aria-hidden="true" />} Punkte abholen
          </button>
          {!canSave && <p className="text-xs text-text-muted text-center -mt-2">Eine Notiz (mindestens 3 Zeichen) oder ein Foto reicht.</p>}
        </div>
      )}
    </Sheet>
  )
}

/** Alle Challenges nach Bereich, zum Selbst-Aussuchen. */
function AllSheet({ open, onClose, weekDone, activeIds, left, busy, onStart }: {
  open: boolean; onClose: () => void; weekDone: Set<string>; activeIds: Set<string>; left: number; busy: string | null; onStart: (d: ChallengeDef) => Promise<void>
}) {
  const [cat, setCat] = useState<ChallengeCategory>('draussen')
  const items = CHALLENGES.filter(c => c.kategorie === cat)
  return (
    <Sheet open={open} onClose={onClose} title="Alle Challenges" tall>
      <div className="space-y-3 pb-3">
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1" role="group" aria-label="Bereich">
          {CHALLENGE_CATEGORIES.map(c => (
            <button
              key={c.key} onClick={() => setCat(c.key)} aria-pressed={cat === c.key}
              className={cn('shrink-0 px-3.5 py-2 rounded-full text-sm font-semibold border transition-all active:scale-95',
                cat === c.key ? 'bg-primary text-white border-brand' : 'bg-bg-elevated border-border text-text-secondary hover:text-text-primary')}
            ><span aria-hidden="true">{c.emoji}</span> {c.label}</button>
          ))}
        </div>
        <p className="text-xs text-text-secondary">{left > 0 ? `Heute kannst du noch ${left} starten.` : 'Heute sind es schon drei. Morgen geht es weiter.'} Jede Challenge zählt einmal pro Woche.</p>
        <ul key={cat} className="space-y-2">
          {items.map((def, i) => {
            const isActive = activeIds.has(def.id)
            const isDone = weekDone.has(def.id)
            const disabled = isActive || isDone || left <= 0 || busy === def.id
            return (
              <li key={def.id} className="enter card !p-3 flex items-center gap-3" style={{ '--d': i * 28 } as React.CSSProperties}>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-text-primary text-sm">{def.titel}</div>
                  <div className="text-xs text-text-secondary leading-snug">{challengeById(def.id)?.text}</div>
                  <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-warning tabular-nums"><Coins size={11} aria-hidden="true" /> {def.punkte}</div>
                </div>
                <button
                  onClick={() => void onStart(def)} disabled={disabled}
                  className={cn('shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold border transition-all active:scale-95',
                    disabled ? 'bg-bg-elevated text-text-muted border-border' : 'bg-primary text-white border-brand')}
                  aria-label={`${def.titel} starten`}
                >{isActive ? 'Läuft' : isDone ? 'Diese Woche geschafft' : 'Start'}</button>
              </li>
            )
          })}
        </ul>
      </div>
    </Sheet>
  )
}
