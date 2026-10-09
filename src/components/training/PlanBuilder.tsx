import { useMemo, useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, Check, ChevronRight, GripVertical, Plus, Sparkles, Trash2, Dumbbell } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'
import { Sheet } from '../ui/Sheet'
import { Spinner } from '../ui/Spinner'
import { ExercisePicker } from './ExercisePicker'
import {
  GROUPS, groupLabel, imgUrl, loadExercises, type GroupKey, type PoolExercise,
} from '../../lib/exercises'
import { ROLE_LABEL, SPLITS, defaultsFor, suggestWeekdays, type Role, type SplitDef } from '../../lib/splits'

interface PlanSlot {
  id: string
  group: GroupKey
  role: Role
  ex?: { id: string; name: string; image: string }
  sets: string
  reps: string
}
interface PlanDay { id: string; name: string; weekdays: number[]; slots: PlanSlot[] }

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
let counter = 0
const uid = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`

function makeSlot(group: GroupKey, role: Role): PlanSlot {
  const d = defaultsFor(role, group)
  return { id: uid(), group, role, sets: String(d.sets), reps: d.reps }
}

function makeDays(split: SplitDef): PlanDay[] {
  const wd = suggestWeekdays(split.days.length)
  return split.days.map((d, i) => ({
    id: uid(), name: d.name, weekdays: [wd[i]], slots: d.slots.map(s => makeSlot(s.group, s.role)),
  }))
}

// ─── Sortierbares Element mit Griff ───────────────────────────────────────────

function Sortable({ id, children }: {
  id: string
  children: (h: { handle: React.ReactNode; dragging: boolean }) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const handle = (
    <button
      ref={setActivatorNodeRef} {...attributes} {...listeners}
      className="p-1.5 -ml-1 rounded-lg text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing touch-none shrink-0"
      aria-label="Zum Verschieben ziehen"
    >
      <GripVertical size={18} />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined, position: 'relative' }}
      className={cn(isDragging && 'opacity-90 shadow-glow rounded-3xl')}
    >
      {children({ handle, dragging: isDragging })}
    </div>
  )
}

function useDndSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

// ─── Platz in einem Trainingstag ──────────────────────────────────────────────

function SlotCard({ slot, handle, onPick, onChange, onRemove }: {
  slot: PlanSlot
  handle: React.ReactNode
  onPick: () => void
  onChange: (patch: Partial<PlanSlot>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-2xl bg-bg-elevated border border-border p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        {handle}
        <span className="badge bg-brand/10 text-brand">{groupLabel(slot.group)}</span>
        <button
          onClick={() => onChange({ role: slot.role === 'grund' ? 'iso' : 'grund', ...defaultsFor(slot.role === 'grund' ? 'iso' : 'grund', slot.group), sets: String(defaultsFor(slot.role === 'grund' ? 'iso' : 'grund', slot.group).sets) })}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
          title="Rolle wechseln"
        >
          {ROLE_LABEL[slot.role]}
        </button>
        <button onClick={onRemove} className="ml-auto p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" aria-label="Platz entfernen">
          <Trash2 size={15} />
        </button>
      </div>

      <button
        onClick={onPick}
        className={cn(
          'w-full flex items-center gap-3 rounded-xl text-left transition-all active:scale-[0.985]',
          slot.ex ? 'bg-bg-card border border-border p-2' : 'border-2 border-dashed border-brand/40 text-brand p-3 justify-center hover:bg-brand/5',
        )}
      >
        {slot.ex ? (
          <>
            <span className="w-11 h-11 rounded-lg bg-bg-elevated overflow-hidden shrink-0 flex items-center justify-center">
              <img src={imgUrl({ image: slot.ex.image })} alt="" loading="lazy" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-text-primary truncate">{slot.ex.name}</span>
              <span className="block text-xs text-text-muted">Antippen zum Tauschen</span>
            </span>
            <ChevronRight size={16} className="text-text-muted shrink-0" />
          </>
        ) : (
          <span className="flex items-center gap-2 text-sm font-semibold"><Plus size={16} /> Übung für {groupLabel(slot.group)} wählen</span>
        )}
      </button>

      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <input
          inputMode="numeric" aria-label="Sätze" className="input !w-14 !px-2 !py-1.5 text-center text-sm font-semibold"
          value={slot.sets} onChange={e => onChange({ sets: e.target.value.replace(/\D/g, '').slice(0, 2) })}
        />
        <span>Sätze ×</span>
        <input
          aria-label="Wiederholungen" className="input !w-20 !px-2 !py-1.5 text-center text-sm font-semibold"
          value={slot.reps} onChange={e => onChange({ reps: e.target.value.replace(/[^0-9-–]/g, '').slice(0, 7) })}
        />
        <span>Wdh.</span>
      </div>
    </div>
  )
}

// ─── Trainingstag ─────────────────────────────────────────────────────────────

function DayCard({ day, index, handle, onChange, onRemove, onPickSlot }: {
  day: PlanDay
  index: number
  handle: React.ReactNode
  onChange: (patch: Partial<PlanDay>) => void
  onRemove: () => void
  onPickSlot: (slotId: string) => void
}) {
  const sensors = useDndSensors()
  const [adding, setAdding] = useState(false)
  const filled = day.slots.filter(s => s.ex).length

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const from = day.slots.findIndex(s => s.id === e.active.id)
    const to = day.slots.findIndex(s => s.id === e.over!.id)
    onChange({ slots: arrayMove(day.slots, from, to) })
  }
  const patchSlot = (id: string, patch: Partial<PlanSlot>) => onChange({ slots: day.slots.map(s => s.id === id ? { ...s, ...patch } : s) })

  return (
    <div className="card enter space-y-3" style={{ '--d': 80 + index * 70 } as React.CSSProperties}>
      <div className="flex items-center gap-2">
        {handle}
        <input
          className="flex-1 min-w-0 bg-transparent text-lg font-bold text-text-primary tracking-tight outline-none focus:ring-1 focus:ring-brand rounded-lg px-1"
          value={day.name} onChange={e => onChange({ name: e.target.value })} aria-label="Name des Trainingstags"
        />
        <span className="text-xs text-text-muted whitespace-nowrap">{filled}/{day.slots.length}</span>
        <button onClick={onRemove} className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" aria-label="Tag entfernen">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Wochentage">
        {WEEKDAYS.map((w, i) => {
          const on = day.weekdays.includes(i + 1)
          return (
            <button
              key={w} aria-pressed={on}
              onClick={() => onChange({ weekdays: on ? day.weekdays.filter(x => x !== i + 1) : [...day.weekdays, i + 1].sort() })}
              className={cn('w-9 h-8 rounded-full text-xs font-bold border transition-all active:scale-90',
                on ? 'bg-primary border-brand text-white' : 'border-border text-text-muted hover:border-brand/40')}
            >{w}</button>
          )
        })}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={day.slots.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2.5">
            {day.slots.map(slot => (
              <Sortable key={slot.id} id={slot.id}>
                {({ handle: h }) => (
                  <SlotCard
                    slot={slot} handle={h}
                    onPick={() => onPickSlot(slot.id)}
                    onChange={p => patchSlot(slot.id, p)}
                    onRemove={() => onChange({ slots: day.slots.filter(s => s.id !== slot.id) })}
                  />
                )}
              </Sortable>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button onClick={() => setAdding(true)} className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
        <Plus size={15} /> Muskelgruppe hinzufügen
      </button>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Muskelgruppe hinzufügen">
        <div className="grid grid-cols-2 gap-2 pb-3">
          {GROUPS.filter(g => g.key !== 'sonstige').map(g => (
            <button
              key={g.key}
              onClick={() => { onChange({ slots: [...day.slots, makeSlot(g.key, 'iso')] }); setAdding(false) }}
              className="rounded-2xl bg-bg-elevated border border-border px-3 py-3 text-sm font-semibold text-text-primary hover:border-brand/50 active:scale-95 transition-all text-left"
            >{g.label}</button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function PlanBuilder({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth()
  const sensors = useDndSensors()
  const [split, setSplit] = useState<SplitDef | null>(null)
  const [planName, setPlanName] = useState('')
  const [days, setDays] = useState<PlanDay[]>([])
  const [picking, setPicking] = useState<{ dayId: string; slotId: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [filling, setFilling] = useState(false)
  const [error, setError] = useState('')

  const pickSlot = useMemo(() => {
    if (!picking) return null
    const day = days.find(d => d.id === picking.dayId)
    return day?.slots.find(s => s.id === picking.slotId) ?? null
  }, [picking, days])

  const total = days.reduce((a, d) => a + d.slots.length, 0)
  const filled = days.reduce((a, d) => a + d.slots.filter(s => s.ex).length, 0)

  function start(s: SplitDef) {
    setSplit(s)
    setPlanName(s.id === 'frei' ? 'Mein Plan' : s.name)
    setDays(makeDays(s))
    setError('')
  }

  const patchDay = (id: string, patch: Partial<PlanDay>) => setDays(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d))

  function onDaysDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    setDays(ds => arrayMove(ds, ds.findIndex(d => d.id === e.active.id), ds.findIndex(d => d.id === e.over!.id)))
  }

  function choose(ex: PoolExercise) {
    if (!picking) return
    patchDay(picking.dayId, {
      slots: days.find(d => d.id === picking.dayId)!.slots.map(s =>
        s.id === picking.slotId ? { ...s, ex: { id: ex.id, name: ex.name, image: ex.image } } : s),
    })
    setPicking(null)
  }

  /** Füllt leere Plätze mit bewährten Standardübungen (Grundübung zuerst, Hanteln und Maschinen bevorzugt). */
  async function autoFill() {
    setFilling(true)
    try {
      const pool = await loadExercises()
      const used = new Set(days.flatMap(d => d.slots.map(s => s.ex?.id)).filter(Boolean) as string[])
      const rank = (e: PoolExercise) => ({ Langhantel: 0, Kurzhantel: 1, Maschine: 2, Kabel: 3, 'Körpergewicht': 4 } as Record<string, number>)[e.equipment_group] ?? 5
      setDays(ds => ds.map(d => ({
        ...d,
        slots: d.slots.map(s => {
          if (s.ex) return s
          const options = pool
            .filter(e => e.group === s.group && !e.stretch && !used.has(e.id) && !/\(.*(pov|male|female).*\)/i.test(e.name_en) === true)
            .sort((a, b) => {
              const wantC = s.role === 'grund' ? 1 : 0
              return (a.compound === wantC ? 0 : 1) - (b.compound === wantC ? 0 : 1) || rank(a) - rank(b) || a.name.length - b.name.length
            })
          const pick = options[0]
          if (!pick) return s
          used.add(pick.id)
          return { ...s, ex: { id: pick.id, name: pick.name, image: pick.image } }
        }),
      })))
    } finally { setFilling(false) }
  }

  async function save() {
    if (!user) return
    const usable = days.map(d => ({ ...d, slots: d.slots.filter(s => s.ex) })).filter(d => d.slots.length)
    if (!usable.length) { setError('Wähle mindestens eine Übung aus.'); return }
    setSaving(true); setError('')
    try {
      for (let i = 0; i < usable.length; i++) {
        const d = usable[i]
        const row: Record<string, unknown> = {
          user_id: user.id, name: `${planName.trim() || 'Mein Plan'} · ${d.name}`, trainingstyp: 'Kraft',
          wochentage: d.weekdays.join(',') || null,
          plan_name: planName.trim() || 'Mein Plan', plan_split: split?.id ?? null, plan_reihenfolge: i,
        }
        const { data: v, error: e1 } = await insertCompat('training_vorlagen', row, ['plan_name', 'plan_split', 'plan_reihenfolge'])
        if (e1 || !v) throw new Error(e1?.message ?? 'Speichern fehlgeschlagen')
        const rows = d.slots.map((s, k) => ({
          vorlage_id: v.id, uebungsname: s.ex!.name, saetze: parseInt(s.sets) || null,
          wdh: parseInt(s.reps) || null, wdh_text: s.reps || null, gruppe: s.group, rolle: s.role, reihenfolge: k,
        }))
        const { error: e2 } = await insertCompat('vorlagen_uebungen', rows, ['wdh_text', 'gruppe', 'rolle'])
        if (e2) throw new Error(e2.message)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
    } finally { setSaving(false) }
  }

  // ─── Schritt 1: Split wählen ───
  if (!split) {
    return (
      <div className="space-y-4">
        <div className="enter">
          <h2 className="section-title">Eigenen Plan bauen</h2>
          <p className="text-sm text-text-secondary mt-1">
            Wähle einen Split. Die Vorlage legt Tage und Muskelgruppen fest, die Übungen suchst du dir selbst aus dem Pool aus.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SPLITS.map((s, i) => (
            <button
              key={s.id} onClick={() => start(s)}
              className="card enter text-left space-y-2 hover:border-brand/50 active:scale-[0.985] transition-all"
              style={{ '--d': 60 + i * 55 } as React.CSSProperties}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-text-primary">{s.name}</div>
                  <div className="text-xs text-brand font-semibold mt-0.5">{s.tagline}</div>
                </div>
                <ChevronRight size={18} className="text-text-muted shrink-0 mt-1" />
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{s.description}</p>
              <div className="flex gap-1.5 flex-wrap pt-1">
                {s.days.map((d, k) => <span key={k} className="badge bg-bg-elevated text-text-secondary border border-border">{d.name}</span>)}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ─── Schritt 2: Plan zusammenstellen ───
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3 enter">
        <button onClick={() => setSplit(null)} className="p-2 rounded-full bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors" aria-label="Zurück zur Split-Auswahl">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wide" htmlFor="plan-name">Name des Plans</label>
          <input id="plan-name" className="input mt-1" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="z. B. Mein 3er-Split" />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap enter" style={{ '--d': 40 } as React.CSSProperties}>
        <span className="text-sm text-text-secondary">{split.name} · {filled} von {total} Übungen gewählt</span>
        <button onClick={autoFill} disabled={filling} className="btn-secondary text-sm !px-4 !py-2 ml-auto flex items-center gap-2">
          {filling ? <Spinner size={14} /> : <Sparkles size={14} />} Leere Plätze vorschlagen
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDaysDragEnd}>
        <SortableContext items={days.map(d => d.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {days.map((d, i) => (
              <Sortable key={d.id} id={d.id}>
                {({ handle }) => (
                  <DayCard
                    day={d} index={i} handle={handle}
                    onChange={p => patchDay(d.id, p)}
                    onRemove={() => setDays(ds => ds.filter(x => x.id !== d.id))}
                    onPickSlot={slotId => setPicking({ dayId: d.id, slotId })}
                  />
                )}
              </Sortable>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        onClick={() => setDays(ds => [...ds, { id: uid(), name: `Tag ${ds.length + 1}`, weekdays: [], slots: [] }])}
        className="btn-secondary w-full flex items-center justify-center gap-2"
      >
        <Plus size={16} /> Trainingstag hinzufügen
      </button>

      {error && <div className="text-sm text-danger" role="alert">{error}</div>}

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)_-_2.5rem)] lg:bottom-4 z-10">
        <button onClick={save} disabled={saving || filled === 0} className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 shadow-glow disabled:opacity-50">
          {saving ? <Spinner size={16} /> : <Check size={18} />}
          Plan speichern ({days.filter(d => d.slots.some(s => s.ex)).length} Vorlagen)
        </button>
      </div>

      <ExercisePicker
        open={!!picking} onClose={() => setPicking(null)}
        group={pickSlot?.group ?? 'brust'} role={pickSlot?.role ?? 'grund'} onPick={choose}
      />
      {total === 0 && (
        <div className="card text-center text-sm text-text-secondary">
          <Dumbbell size={28} className="mx-auto mb-2 text-text-muted" />
          Noch keine Muskelgruppen. Tippe auf „Muskelgruppe hinzufügen“.
        </div>
      )}
    </div>
  )
}

/**
 * Speichert Zeilen mit optionalen Spalten. Kennt die Datenbank sie noch nicht (Migration fehlt),
 * wird ohne diese Spalten erneut gespeichert, damit der Plan nicht verloren geht.
 */
async function insertCompat(table: string, payload: Record<string, unknown> | Record<string, unknown>[], optional: string[]) {
  type Res = { data: { id: string } | null; error: { message: string; code?: string } | null }
  // Einzelne Zeile: Datensatz zurückholen (.single). Mehrere Zeilen: nur einfügen, sonst meldet PostgREST einen Fehler.
  const run = async (p: Record<string, unknown> | Record<string, unknown>[]): Promise<Res> => {
    if (Array.isArray(p)) {
      const { error } = await supabase.from(table).insert(p as never)
      return { data: null, error }
    }
    const { data, error } = await supabase.from(table).insert(p as never).select('id').single()
    return { data: data as { id: string } | null, error }
  }
  const first = await run(payload)
  if (!first.error) return first
  if (!/column|schema cache|PGRST204|42703/i.test(`${first.error.message} ${first.error.code ?? ''}`)) return first
  const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !optional.includes(k)))
  return run(Array.isArray(payload) ? payload.map(strip) : strip(payload))
}
