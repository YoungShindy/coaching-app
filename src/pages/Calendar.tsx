import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, ChevronLeft, ChevronRight, Clock, Pencil, RefreshCw, Bell, Play, Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { sendPushToUser } from '../hooks/usePushNotifications'
import { formatDate, todayISO } from '../lib/utils'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { isColumnError, withoutKeys } from '../lib/dbCompat'
import type { KalenderEvent } from '../types/database'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, addDays,
  eachDayOfInterval, isSameMonth, isSameDay, parseISO,
} from 'date-fns'
import { de } from 'date-fns/locale'

const EVENT_COLORS: Record<string, string> = {
  coaching: 'bg-brand/20 text-brand border-brand/30',
  training: 'bg-success/20 text-success border-success/30',
  sonstiges: 'bg-warning/20 text-warning border-warning/30',
}

interface EventForm {
  titel: string; datum: string; uhrzeit: string; dauer_min: string
  typ: 'coaching' | 'training' | 'sonstiges'; notizen: string; client_id: string
  vorlage_id: string
  erinnerung: string // '' = Standard aus den Einstellungen, '0' = keine, sonst Minuten vorher
  recurring: boolean; recur_freq: 'weekly' | 'biweekly' | 'monthly'; recur_count: string
}

const EMPTY_FORM: EventForm = {
  titel: '', datum: todayISO(), uhrzeit: '', dauer_min: '',
  typ: 'training', notizen: '', client_id: '', vorlage_id: '', erinnerung: '',
  recurring: false, recur_freq: 'weekly', recur_count: '8',
}

const REMINDERS = [
  { value: '0', label: 'Keine Erinnerung' },
  { value: '15', label: '15 Minuten vorher' },
  { value: '30', label: '30 Minuten vorher' },
  { value: '60', label: '1 Stunde vorher' },
  { value: '120', label: '2 Stunden vorher' },
  { value: '1440', label: '1 Tag vorher' },
]
const reminderLabel = (min: number) => REMINDERS.find(r => r.value === String(min))?.label ?? `${min} Minuten vorher`

interface VorlageOption { id: string; name: string; plan_name?: string | null }
const vorlageTitle = (v: VorlageOption) => (v.plan_name && v.name.startsWith(`${v.plan_name} · `) ? v.name.slice(v.plan_name.length + 3) : v.name)

function generateRecurringDates(startDate: string, freq: string, count: number): string[] {
  const dates: string[] = []
  const start = parseISO(startDate)
  for (let i = 0; i < count; i++) {
    let d: Date
    if (freq === 'weekly') d = addWeeks(start, i)
    else if (freq === 'biweekly') d = addWeeks(start, i * 2)
    else d = addMonths(start, i)
    dates.push(format(d, 'yyyy-MM-dd'))
  }
  return dates
}

export function Calendar() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const isCoach = profile?.role === 'coach'
  const [vorlagen, setVorlagen] = useState<VorlageOption[]>([])
  const [defaultLead, setDefaultLead] = useState(60)
  const [notice, setNotice] = useState('')

  const [events, setEvents] = useState<KalenderEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<{ id: string; name: string | null; email: string }[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<EventForm>(EMPTY_FORM)

  async function load() {
    if (!user) return
    const { data } = await supabase
      .from('kalender_events')
      .select('*')
      .or(`coach_id.eq.${user.id},client_id.eq.${user.id}`)
      .order('datum', { ascending: true })
    setEvents(data ?? [])
    setLoading(false)
  }

  async function loadClients() {
    if (!user || !isCoach) return
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('coach_id', user.id)
      .eq('role', 'client')
    setClients(data ?? [])
  }

  async function loadOwn() {
    if (!user || isCoach) return
    const [v, st] = await Promise.all([
      supabase.from('training_vorlagen').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('client_settings').select('notif_appointment_minutes').eq('user_id', user.id).maybeSingle(),
    ])
    setVorlagen(((v.data ?? []) as VorlageOption[]))
    setDefaultLead(st.data?.notif_appointment_minutes ?? 60)
  }

  useEffect(() => { load(); loadClients(); loadOwn() }, [user, profile])

  function openAdd(date?: Date) {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, datum: date ? format(date, 'yyyy-MM-dd') : todayISO() })
    setOpen(true)
  }

  function openEdit(e: KalenderEvent) {
    setEditingId(e.id)
    setForm({
      titel: e.titel,
      datum: e.datum,
      uhrzeit: e.uhrzeit ?? '',
      dauer_min: e.dauer_min ? String(e.dauer_min) : '',
      typ: e.typ as EventForm['typ'],
      notizen: e.notizen ?? '',
      client_id: e.client_id ?? '',
      vorlage_id: e.vorlage_id ?? '',
      erinnerung: e.erinnerung_min == null ? '' : String(e.erinnerung_min),
      recurring: false, recur_freq: 'weekly', recur_count: '8',
    })
    setOpen(true)
  }

  async function handleSave() {
    if (!user || !form.titel) return
    setSaving(true)

    const base = {
      coach_id: isCoach ? user.id : (profile?.coach_id ?? user.id),
      client_id: isCoach ? (form.client_id || null) : user.id,
      titel: form.titel,
      uhrzeit: form.uhrzeit || null,
      dauer_min: form.dauer_min ? parseInt(form.dauer_min) : null,
      typ: form.typ,
      notizen: form.notizen || null,
      vorlage_id: !isCoach && form.vorlage_id ? form.vorlage_id : null,
      erinnerung_min: form.erinnerung === '' ? null : parseInt(form.erinnerung),
    }
    const NEW_COLS = ['vorlage_id', 'erinnerung_min']

    // Speichern; fehlt in der Datenbank noch das Update, wird ohne Vorlage und Einzel-Erinnerung gespeichert
    const write = async (strip: boolean) => {
      const clean = (row: Record<string, unknown>) => (strip ? withoutKeys(row, NEW_COLS) : row)
      if (editingId) return supabase.from('kalender_events').update(clean({ ...base, datum: form.datum }) as never).eq('id', editingId)
      if (form.recurring) {
        const dates = generateRecurringDates(form.datum, form.recur_freq, parseInt(form.recur_count) || 8)
        return supabase.from('kalender_events').insert(dates.map(datum => clean({ ...base, datum })) as never)
      }
      return supabase.from('kalender_events').insert(clean({ ...base, datum: form.datum }) as never)
    }
    let res = await write(false)
    if (isColumnError(res.error)) {
      res = await write(true)
      if (!res.error) setNotice('Gespeichert. Vorlage und eigene Erinnerung brauchen noch das Datenbank-Update.')
    }
    if (res.error) setNotice('Der Termin konnte nicht gespeichert werden. Bitte versuche es noch einmal.')

    // Notify client about new/updated appointment
    if (isCoach && base.client_id && base.client_id !== user.id) {
      const action = editingId ? 'aktualisiert' : 'erstellt'
      sendPushToUser(
        base.client_id,
        `Neuer Termin ${action}`,
        `${form.titel} am ${form.datum}${form.uhrzeit ? ' um ' + form.uhrzeit : ''}`,
        'https://justinkaram14.github.io/coaching-app/#/calendar'
      )
    }

    await load()
    setOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('kalender_events').delete().eq('id', id)
    setEvents(e => e.filter(x => x.id !== id))
  }

  // Calendar grid
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const canManage = (e: KalenderEvent) => (isCoach ? e.coach_id === user?.id : e.created_by === user?.id)
  const vorlageName = (id?: string | null) => { const v = vorlagen.find(x => x.id === id); return v ? vorlageTitle(v) : null }
  const today = todayISO()
  const startable = (e: KalenderEvent) => !isCoach && !!e.vorlage_id && e.datum === today && !!vorlagen.find(v => v.id === e.vorlage_id)
  const eventsForDay = (day: Date) => events.filter(e => isSameDay(parseISO(e.datum), day))
  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay) : []
  const upcomingEvents = events.filter(e => e.datum >= todayISO()).slice(0, 5)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title text-2xl">Kalender</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {isCoach ? 'Termine für deine Klienten' : 'Deine Termine und geplantes Training'}
          </p>
        </div>
        <button onClick={() => openAdd()} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> {isCoach ? 'Termin erstellen' : 'Training planen'}
        </button>
      </div>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-2xl bg-bg-elevated border border-border px-4 py-3 text-sm text-text-secondary">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-text-muted hover:text-text-primary shrink-0" aria-label="Hinweis schließen">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} aria-label="Vorheriger Monat" className="p-2 rounded-lg hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors">
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-semibold text-text-primary">
              {format(currentMonth, 'MMMM yyyy', { locale: de })}
            </h2>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} aria-label="Nächster Monat" className="p-2 rounded-lg hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
              <div key={d} className="text-center text-xs font-medium text-text-muted py-2">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map(day => {
              const dayEvents = eventsForDay(day)
              const isToday = isSameDay(day, new Date())
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const isSelected = selectedDay && isSameDay(day, selectedDay)

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={`min-h-[64px] p-1.5 rounded-lg cursor-pointer transition-all border
                    ${isCurrentMonth ? 'text-text-primary' : 'text-text-muted'}
                    ${isToday ? 'bg-brand/10 border-brand/30' : isSelected ? 'bg-bg-elevated border-border-light' : 'border-transparent hover:bg-bg-elevated'}`}
                >
                  <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-primary text-white' : ''}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map(e => (
                      <div key={e.id} className={`text-xs px-1 py-0.5 rounded truncate border ${EVENT_COLORS[e.typ] || EVENT_COLORS.sonstiges}`}>
                        {e.titel}
                      </div>
                    ))}
                    {dayEvents.length > 2 && <div className="text-xs text-text-muted px-1">+{dayEvents.length - 2}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {selectedDay && (
            <div className="card">
              <h3 className="font-semibold text-text-primary mb-3">
                {formatDate(selectedDay, 'EEEE, dd. MMM')}
              </h3>
              {selectedDayEvents.length === 0 ? (
                <div className="text-sm text-text-muted py-2">Keine Termine</div>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map(e => {
                    const clientName = clients.find(c => c.id === e.client_id)?.name
                    const vName = vorlageName(e.vorlage_id)
                    return (
                      <div key={e.id} className={`p-3 rounded-lg border ${EVENT_COLORS[e.typ] || EVENT_COLORS.sonstiges}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{e.titel}</div>
                            {clientName && <div className="text-xs mt-0.5">👤 {clientName}</div>}
                            {e.uhrzeit && (
                              <div className="flex items-center gap-1 text-xs mt-1">
                                <Clock size={11} /> {e.uhrzeit.slice(0, 5)} {e.dauer_min ? `(${e.dauer_min} min)` : ''}
                              </div>
                            )}
                            {vName && <div className="flex items-center gap-1 text-xs mt-1"><Layers size={11} aria-hidden="true" /> Vorlage: {vName}</div>}
                            {e.uhrzeit && e.erinnerung_min != null && e.erinnerung_min > 0 && (
                              <div className="flex items-center gap-1 text-xs mt-1"><Bell size={11} aria-hidden="true" /> {reminderLabel(e.erinnerung_min)}</div>
                            )}
                            {e.notizen && <div className="text-xs mt-1">{e.notizen}</div>}
                          </div>
                          {canManage(e) && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => openEdit(e)} className="p-1 rounded hover:bg-black/10 transition-colors" aria-label="Termin bearbeiten">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => handleDelete(e.id)} className="p-1 rounded hover:bg-black/10 transition-colors" aria-label="Termin löschen">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                        {startable(e) && (
                          <button
                            onClick={() => navigate(`/training?start=${e.vorlage_id}`)}
                            className="mt-2.5 w-full btn-primary !py-2 text-sm flex items-center justify-center gap-2"
                          >
                            <Play size={14} aria-hidden="true" /> Training starten
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <button onClick={() => openAdd(selectedDay)} className="btn-secondary w-full mt-3 text-sm flex items-center justify-center gap-2">
                <Plus size={14} /> {isCoach ? 'Termin für diesen Tag' : 'Training für diesen Tag planen'}
              </button>
            </div>
          )}

          <div className="card">
            <h3 className="font-semibold text-text-primary mb-3">Nächste Termine</h3>
            {loading ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : upcomingEvents.length === 0 ? (
              <div className="text-sm text-text-muted">Keine anstehenden Termine</div>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map(e => {
                  const clientName = isCoach ? clients.find(c => c.id === e.client_id)?.name : null
                  return (
                    <div key={e.id} className="flex items-start gap-3">
                      <div className="text-center shrink-0 w-10">
                        <div className="text-xs text-text-muted">{format(parseISO(e.datum), 'MMM', { locale: de })}</div>
                        <div className="text-lg font-bold text-text-primary leading-none">{format(parseISO(e.datum), 'd')}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-medium inline-block px-2 py-0.5 rounded-full border ${EVENT_COLORS[e.typ]}`}>
                          {e.typ}
                        </div>
                        <div className="text-sm text-text-primary mt-0.5 truncate">{e.titel}</div>
                        {clientName && <div className="text-xs text-text-muted">👤 {clientName}</div>}
                        {e.uhrzeit && <div className="text-xs text-text-muted">{e.uhrzeit.slice(0, 5)}</div>}
                        {vorlageName(e.vorlage_id) && <div className="text-xs text-text-muted flex items-center gap-1"><Layers size={11} aria-hidden="true" /> {vorlageName(e.vorlage_id)}</div>}
                      </div>
                      {startable(e) && (
                        <button onClick={() => navigate(`/training?start=${e.vorlage_id}`)} className="btn-primary !px-3 !py-1.5 text-xs flex items-center gap-1.5 shrink-0" aria-label={`Training starten: ${e.titel}`}>
                          <Play size={12} aria-hidden="true" /> Starten
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={open} onClose={() => { setOpen(false); setEditingId(null); setForm(EMPTY_FORM) }}
        title={editingId ? 'Termin bearbeiten' : isCoach ? 'Termin erstellen' : 'Training planen'}>
        <div className="space-y-4">
          <div>
            <label className="label">Titel *</label>
            <input type="text" className="input" placeholder="Z.B. Pull Day Training" value={form.titel}
              onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} autoFocus />
          </div>

          {/* Coach selects client */}
          {isCoach && clients.length > 0 && (
            <div>
              <label className="label">Klient</label>
              <select className="input" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                <option value="">— Kein Klient (nur für mich) —</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name ?? c.email}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Datum</label>
              <input type="date" className="input" value={form.datum}
                onChange={e => setForm(f => ({ ...f, datum: e.target.value }))} />
            </div>
            <div>
              <label className="label">Uhrzeit</label>
              <input type="time" className="input" value={form.uhrzeit}
                onChange={e => setForm(f => ({ ...f, uhrzeit: e.target.value }))} />
            </div>
            <div>
              <label className="label">Typ</label>
              <select className="input" value={form.typ}
                onChange={e => setForm(f => ({ ...f, typ: e.target.value as EventForm['typ'] }))}>
                <option value="training">Training</option>
                <option value="coaching">Coaching</option>
                <option value="sonstiges">Sonstiges</option>
              </select>
            </div>
            <div>
              <label className="label">Dauer (Min.)</label>
              <input type="number" className="input" placeholder="60" value={form.dauer_min}
                onChange={e => setForm(f => ({ ...f, dauer_min: e.target.value }))} />
            </div>
          </div>

          {!isCoach && (
            <div>
              <label className="label" htmlFor="cal-vorlage">Trainingsvorlage</label>
              {vorlagen.length > 0 ? (
                <select
                  id="cal-vorlage" className="input" value={form.vorlage_id}
                  onChange={e => {
                    const v = vorlagen.find(x => x.id === e.target.value)
                    setForm(f => {
                      const wasAuto = !f.titel || vorlagen.some(x => vorlageTitle(x) === f.titel)
                      return { ...f, vorlage_id: e.target.value, typ: v ? 'training' : f.typ, titel: v && wasAuto ? vorlageTitle(v) : f.titel }
                    })
                  }}
                >
                  <option value="">Keine Vorlage</option>
                  {Array.from(new Set(vorlagen.map(v => v.plan_name ?? ''))).map(plan => (
                    plan
                      ? <optgroup key={plan} label={plan}>{vorlagen.filter(v => v.plan_name === plan).map(v => <option key={v.id} value={v.id}>{vorlageTitle(v)}</option>)}</optgroup>
                      : vorlagen.filter(v => !v.plan_name).map(v => <option key={v.id} value={v.id}>{v.name}</option>)
                  ))}
                </select>
              ) : (
                <p className="text-xs text-text-secondary leading-relaxed">
                  Noch keine Vorlage vorhanden. Lege unter <button type="button" onClick={() => navigate('/training?tab=vorlagen')} className="text-brand font-semibold underline underline-offset-2">Training, Vorlagen</button> eine an, dann kannst du sie hier wählen und am Tag direkt starten.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="label" htmlFor="cal-remind">Erinnerung</label>
            <select id="cal-remind" className="input" value={form.erinnerung} disabled={!form.uhrzeit}
              onChange={e => setForm(f => ({ ...f, erinnerung: e.target.value }))}>
              <option value="">{isCoach ? 'Standard des Klienten' : `Standard (${reminderLabel(defaultLead)})`}</option>
              {REMINDERS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {!form.uhrzeit && <p className="text-xs text-text-muted mt-1">Trage eine Uhrzeit ein, dann erinnert dich HLX Together per Push.</p>}
          </div>

          <div>
            <label className="label">Notizen</label>
            <input type="text" className="input" placeholder="Optional" value={form.notizen}
              onChange={e => setForm(f => ({ ...f, notizen: e.target.value }))} />
          </div>

          {/* Wiederkehrend — nur für neue Termine */}
          {!editingId && (
            <div className="border border-border rounded-xl p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-brand" checked={form.recurring}
                  onChange={e => setForm(f => ({ ...f, recurring: e.target.checked }))} />
                <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                  <RefreshCw size={14} className="text-brand" /> Wiederkehrender Termin
                </span>
              </label>
              {form.recurring && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Frequenz</label>
                    <select className="input text-sm" value={form.recur_freq}
                      onChange={e => setForm(f => ({ ...f, recur_freq: e.target.value as EventForm['recur_freq'] }))}>
                      <option value="weekly">Wöchentlich</option>
                      <option value="biweekly">2-wöchentlich</option>
                      <option value="monthly">Monatlich</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Wie viele Termine?</label>
                    <input type="number" className="input text-sm" min="2" max="52" value={form.recur_count}
                      onChange={e => setForm(f => ({ ...f, recur_count: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => { setOpen(false); setEditingId(null); setForm(EMPTY_FORM) }} className="btn-secondary flex-1">Abbrechen</button>
            <button onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2"
              disabled={saving || !form.titel}>
              {saving && <Spinner size={16} />}
              {form.recurring && !editingId ? `${form.recur_count}× speichern` : 'Speichern'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
