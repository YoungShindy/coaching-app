import { useEffect, useState } from 'react'
import { Plus, Trash2, BookOpen, ChevronDown, ChevronUp, ArrowLeft, CalendarDays, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format, addWeeks, parseISO, getDay, addDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'

const TRAINING_TYPES = ['Kraft', 'Cardio', 'HIIT', 'Yoga', 'Stretching', 'Schwimmen', 'Radfahren', 'Laufen', 'Sonstiges']
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
// JS getDay: 0=Sun,1=Mon...6=Sat → we store 1=Mon...7=Sun
const JS_TO_OUR: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 0: 7 }
const OUR_TO_JS: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 }

interface UebungRow {
  id?: string; uebungsname: string; saetze: string; wdh: string; gewicht_kg: string; wdh_text?: string | null
}

interface Vorlage {
  id: string; name: string; trainingstyp: string | null; wochentage: string | null; created_at: string
  plan_name?: string | null; plan_reihenfolge?: number | null
  uebungen?: UebungRow[]; expanded?: boolean
}

/** Im Plan-Block steht der Planname schon in der Überschrift, die Karte zeigt nur den Tag. */
function displayName(v: Vorlage): string {
  const prefix = v.plan_name ? `${v.plan_name} · ` : ''
  return prefix && v.name.startsWith(prefix) && v.name.length > prefix.length ? v.name.slice(prefix.length) : v.name
}

function parseDays(wochentage: string | null): number[] {
  if (!wochentage) return []
  return wochentage.split(',').map(Number).filter(Boolean)
}

export function TrainingVorlagen({ embedded = false, onBuildPlan }: { embedded?: boolean; onBuildPlan?: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', trainingstyp: 'Kraft', wochentage: [] as number[] })
  const [uebungen, setUebungen] = useState<UebungRow[]>([{ uebungsname: '', saetze: '', wdh: '', gewicht_kg: '' }])

  // Calendar generation modal
  const [calModalVorlage, setCalModalVorlage] = useState<Vorlage | null>(null)
  const [calWeeks, setCalWeeks] = useState('8')
  const [calStart, setCalStart] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [calSaving, setCalSaving] = useState(false)
  const [notice, setNotice] = useState('')

  async function load() {
    if (!user) return
    const { data: vData } = await supabase.from('training_vorlagen').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (!vData?.length) { setVorlagen([]); setLoading(false); return }

    const ids = vData.map((v: any) => v.id)
    const { data: uData } = await supabase.from('vorlagen_uebungen').select('*').in('vorlage_id', ids).order('reihenfolge')
    const uMap = (uData ?? []).reduce<Record<string, UebungRow[]>>((acc, u: any) => {
      if (!acc[u.vorlage_id]) acc[u.vorlage_id] = []
      acc[u.vorlage_id].push({ id: u.id, uebungsname: u.uebungsname, wdh_text: u.wdh_text ?? null, saetze: String(u.saetze ?? ''), wdh: String(u.wdh ?? ''), gewicht_kg: String(u.gewicht_kg ?? '') })
      return acc
    }, {})

    setVorlagen(vData.map((v: any) => ({ ...v, uebungen: uMap[v.id] ?? [] })))
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  function toggleDay(day: number) {
    setForm(f => ({
      ...f,
      wochentage: f.wochentage.includes(day) ? f.wochentage.filter(d => d !== day) : [...f.wochentage, day].sort(),
    }))
  }

  function addUebung() { setUebungen(u => [...u, { uebungsname: '', saetze: '', wdh: '', gewicht_kg: '' }]) }
  function removeUebung(i: number) { setUebungen(u => u.filter((_, idx) => idx !== i)) }
  function updateUebung(i: number, field: string, val: string) {
    setUebungen(u => { const n = [...u]; n[i] = { ...n[i], [field]: val }; return n })
  }

  async function handleSave() {
    if (!user || !form.name) return
    setSaving(true)
    const { data: vorlage } = await supabase
      .from('training_vorlagen')
      .insert({ user_id: user.id, name: form.name, trainingstyp: form.trainingstyp, wochentage: form.wochentage.join(',') || null })
      .select().single()

    if (vorlage) {
      const valid = uebungen.filter(u => u.uebungsname.trim())
      if (valid.length) {
        await supabase.from('vorlagen_uebungen').insert(
          valid.map((u, i) => ({
            vorlage_id: vorlage.id, uebungsname: u.uebungsname,
            saetze: u.saetze ? parseInt(u.saetze) : null, wdh: u.wdh ? parseInt(u.wdh) : null,
            gewicht_kg: u.gewicht_kg ? parseFloat(u.gewicht_kg) : null, reihenfolge: i,
          }))
        )
      }
    }

    await load()
    setOpen(false)
    setForm({ name: '', trainingstyp: 'Kraft', wochentage: [] })
    setUebungen([{ uebungsname: '', saetze: '', wdh: '', gewicht_kg: '' }])
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('training_vorlagen').delete().eq('id', id)
    setVorlagen(v => v.filter(x => x.id !== id))
  }

  function toggle(id: string) {
    setVorlagen(v => v.map(x => x.id === id ? { ...x, expanded: !x.expanded } : x))
  }

  async function createCalendarEvents() {
    if (!user || !calModalVorlage) return
    const days = parseDays(calModalVorlage.wochentage)
    if (!days.length) return
    setCalSaving(true)

    const weeks = parseInt(calWeeks) || 8
    const events: { user_id: string; coach_id: string; client_id: string; titel: string; datum: string; typ: string }[] = []
    const start = parseISO(calStart)

    for (let w = 0; w < weeks; w++) {
      for (const day of days) {
        const weekStart = addWeeks(start, w)
        // Find the correct day in that week
        const currentDay = JS_TO_OUR[getDay(weekStart)]
        let diff = day - currentDay
        if (diff < 0) diff += 7
        const eventDate = addDays(weekStart, diff)
        // Only add if on or after start date
        if (format(eventDate, 'yyyy-MM-dd') >= calStart) {
          events.push({
            user_id: user.id,
            coach_id: user.id,
            client_id: user.id,
            titel: calModalVorlage.name,
            datum: format(eventDate, 'yyyy-MM-dd'),
            typ: 'training',
          })
        }
      }
    }

    // Deduplicate by datum+titel
    const unique = events.filter((e, i, arr) => arr.findIndex(x => x.datum === e.datum) === i || true)
    await supabase.from('kalender_events').insert(unique)

    setCalSaving(false)
    setCalModalVorlage(null)
    setNotice(`${unique.length} Kalendereinträge erstellt.`)
    window.setTimeout(() => setNotice(''), 4000)
  }

  // Vorlagen aus dem Plan-Baukasten werden unter dem Namen ihres Plans gesammelt
  const sections = (() => {
    const plans = new Map<string, Vorlage[]>()
    const single: Vorlage[] = []
    for (const v of vorlagen) {
      if (v.plan_name) (plans.get(v.plan_name) ?? plans.set(v.plan_name, []).get(v.plan_name)!).push(v)
      else single.push(v)
    }
    for (const list of plans.values()) list.sort((a, b) => (a.plan_reihenfolge ?? 0) - (b.plan_reihenfolge ?? 0))
    return { plans: [...plans], single }
  })()

  const renderCard = (v: Vorlage, index: number) => {
    const days = parseDays(v.wochentage)
    return (
      <div key={v.id} className="card enter" style={{ '--d': 60 + index * 55 } as React.CSSProperties}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
            <BookOpen size={18} className="text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-text-primary truncate">{displayName(v)}</div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-xs text-text-muted">{v.trainingstyp} · {v.uebungen?.length ?? 0} Übungen</span>
              {days.length > 0 && (
                <div className="flex gap-1">
                  {WEEKDAYS.map((d, i) => (
                    <span key={d} className={`text-xs w-5 h-5 rounded flex items-center justify-center font-medium ${days.includes(i + 1) ? 'bg-brand/20 text-brand' : 'text-text-muted'}`}>
                      {d[0]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {days.length > 0 && (
              <button onClick={() => setCalModalVorlage(v)} className="p-1.5 rounded-lg hover:bg-success/10 hover:text-success text-text-muted transition-colors" title="Im Kalender eintragen" aria-label="Im Kalender eintragen">
                <CalendarDays size={16} />
              </button>
            )}
            <button onClick={() => toggle(v.id)} className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors" aria-label={v.expanded ? 'Übungen ausblenden' : 'Übungen anzeigen'}>
              {v.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button onClick={() => handleDelete(v.id)} className="p-1.5 rounded-lg hover:bg-danger/10 hover:text-danger text-text-muted transition-colors" aria-label="Vorlage löschen">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {v.expanded && (v.uebungen?.length ?? 0) > 0 && (
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            {v.uebungen!.map((u, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm p-2.5 rounded-xl bg-bg-elevated">
                <span className="font-medium text-text-primary min-w-0 truncate">{u.uebungsname}</span>
                <span className="text-text-secondary text-xs whitespace-nowrap">
                  {u.saetze && (u.wdh_text || u.wdh) ? `${u.saetze}×${u.wdh_text || u.wdh}` : ''}
                  {u.gewicht_kg ? ` @ ${u.gewicht_kg}kg` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {embedded ? (
          <p className="text-text-secondary text-sm">Deine Trainingstage zum Starten und für den Kalender.</p>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/training')} className="p-2 rounded-lg hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors" aria-label="Zurück">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="section-title text-2xl">Trainingsvorlagen</h1>
              <p className="text-text-secondary text-sm mt-0.5">Push Day, Pull Day, Legs…</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {onBuildPlan && (
            <button onClick={onBuildPlan} className="btn-secondary flex items-center gap-2 text-sm">
              <Layers size={16} /> Eigenen Plan bauen
            </button>
          )}
          <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Vorlage erstellen
          </button>
        </div>
      </div>

      {notice && <div className="card !p-4 border-success/40 bg-success/5 text-sm text-text-primary enter" role="status">{notice}</div>}

      <div className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : vorlagen.length === 0 ? (
          <div className="card">
            <EmptyState icon={BookOpen} title="Noch keine Vorlagen"
              description="Erstelle eine Vorlage für deinen typischen Trainingstag oder baue dir einen kompletten Plan aus dem Übungspool."
              action={onBuildPlan ? <button onClick={onBuildPlan} className="btn-primary flex items-center gap-2 mx-auto"><Layers size={16} /> Eigenen Plan bauen</button>
                : <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2 mx-auto"><Plus size={16} /> Erste Vorlage erstellen</button>} />
          </div>
        ) : (
          <>
            {sections.plans.map(([plan, list]) => (
              <section key={plan} className="space-y-3" aria-label={`Plan ${plan}`}>
                <div className="flex items-center gap-2 px-1">
                  <Layers size={16} className="text-brand" aria-hidden="true" />
                  <h2 className="section-title text-base">{plan}</h2>
                  <span className="text-xs text-text-muted">{list.length} {list.length === 1 ? 'Tag' : 'Tage'}</span>
                </div>
                {list.map((v, i) => renderCard(v, i))}
              </section>
            ))}
            {sections.single.length > 0 && (
              <section className="space-y-3" aria-label="Einzelne Vorlagen">
                {sections.plans.length > 0 && <h2 className="section-title text-base px-1">Einzelne Vorlagen</h2>}
                {sections.single.map((v, i) => renderCard(v, i))}
              </section>
            )}
          </>
        )}
      </div>

      {/* Create Vorlage Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Vorlage erstellen" size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Name *</label>
              <input type="text" className="input" placeholder="z.B. Push Day" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div>
              <label className="label">Typ</label>
              <select className="input" value={form.trainingstyp} onChange={e => setForm(f => ({ ...f, trainingstyp: e.target.value }))}>
                {TRAINING_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Weekday selector */}
          <div>
            <label className="label">Wiederkehrende Tage (optional)</label>
            <div className="flex gap-2">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(i + 1)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all border ${
                    form.wochentage.includes(i + 1)
                      ? 'bg-brand/20 text-brand border-brand/40'
                      : 'bg-bg-elevated text-text-muted border-border hover:border-border-light'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            {form.wochentage.length > 0 && (
              <p className="text-xs text-text-muted mt-1.5">
                Jede Woche: {form.wochentage.map(d => WEEKDAYS[d - 1]).join(', ')} — du kannst diese Tage dann automatisch im Kalender eintragen lassen.
              </p>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-sm font-medium text-text-primary mb-3">Übungen</div>
            <div className="space-y-3">
              {uebungen.map((u, i) => (
                <div key={i} className="p-3 bg-bg-elevated rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <input className="input flex-1 text-sm py-2" placeholder="Übungsname (z.B. Bankdrücken)" value={u.uebungsname}
                      onChange={e => updateUebung(i, 'uebungsname', e.target.value)} />
                    <button onClick={() => removeUebung(i)} className="p-2 rounded hover:bg-danger/10 hover:text-danger text-text-muted"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Sätze</label>
                      <input type="number" className="input text-sm py-2" placeholder="4" value={u.saetze} onChange={e => updateUebung(i, 'saetze', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Wdh.</label>
                      <input type="number" className="input text-sm py-2" placeholder="8" value={u.wdh} onChange={e => updateUebung(i, 'wdh', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Gewicht (kg)</label>
                      <input type="number" step="0.5" className="input text-sm py-2" placeholder="80" value={u.gewicht_kg} onChange={e => updateUebung(i, 'gewicht_kg', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addUebung} className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
                <Plus size={14} /> Übung hinzufügen
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-border">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Abbrechen</button>
            <button onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={saving || !form.name}>
              {saving && <Spinner size={16} />}
              Vorlage speichern
            </button>
          </div>
        </div>
      </Modal>

      {/* Calendar Events Modal */}
      <Modal open={!!calModalVorlage} onClose={() => setCalModalVorlage(null)} title="Im Kalender eintragen">
        {calModalVorlage && (
          <div className="space-y-4">
            <div className="p-3 bg-brand/5 border border-brand/20 rounded-xl">
              <div className="font-medium text-text-primary">{calModalVorlage.name}</div>
              <div className="text-xs text-text-muted mt-0.5">
                Tage: {parseDays(calModalVorlage.wochentage).map(d => WEEKDAYS[d - 1]).join(', ')}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Startdatum</label>
                <input type="date" className="input" value={calStart} onChange={e => setCalStart(e.target.value)} />
              </div>
              <div>
                <label className="label">Wie viele Wochen?</label>
                <input type="number" className="input" min="1" max="52" value={calWeeks}
                  onChange={e => setCalWeeks(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-text-muted">
              Es werden ca. {parseDays(calModalVorlage.wochentage).length * (parseInt(calWeeks) || 8)} Kalendereinträge erstellt. Jeder kann danach einzeln bearbeitet oder gelöscht werden.
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setCalModalVorlage(null)} className="btn-secondary flex-1">Abbrechen</button>
              <button onClick={createCalendarEvents} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={calSaving}>
                {calSaving && <Spinner size={16} />}
                Einträge erstellen
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
