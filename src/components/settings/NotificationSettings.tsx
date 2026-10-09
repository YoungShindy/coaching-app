import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, BellRing, Check, Droplets, Flame, MonitorSmartphone, PlusSquare, Share, Smartphone, Sparkles, Trash2, Zap } from 'lucide-react'
import { Toggle } from '../ui/Toggle'
import { Spinner } from '../ui/Spinner'
import { SegmentTabs } from '../ui/SegmentTabs'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import {
  disablePush, enablePush, getPushState, listDevices, removeDevice, sendPushToUser, type PushDevice, type PushState,
} from '../../hooks/usePushNotifications'
import {
  decideAppointmentPushes, decideHabitPushes, type Candidate, type DayFacts, type Settings as ReminderSettings,
} from '../../../supabase/functions/_shared/reminders'
import type { ClientSettings } from '../../types/database'

type Patch = Partial<ClientSettings>

// ─── Beispielnachrichten: werden mit derselben Logik erzeugt, die auch der Server nutzt ──────────

const NO_FACTS: DayFacts = { weight: false, sleep: false, training: false, mealsMain: 0, supplementsTotal: 0, supplementsTaken: 0, waterMl: 0 }
const EXAMPLE_SETTINGS: ReminderSettings = { timezone: 'Europe/Berlin', notif_daily_reminder: true, notif_reminder_time: '20:00', wasser_ziel_ml: 2500, notif_max_per_day: 3 }
const URL_BASE = ''

function example(nowIso: string, facts: Partial<DayFacts>, streak = { days: 0, includesToday: false }): Candidate | undefined {
  return decideHabitPushes({ now: new Date(nowIso), settings: EXAMPLE_SETTINGS, facts: { ...NO_FACTS, ...facts }, streak, sent: [], appUrl: URL_BASE })[0]
}

interface Sample { id: string; type: 'missing' | 'praise' | 'streak' | 'water' | 'appointment'; c: Candidate }

function buildSamples(): Sample[] {
  const list: (Sample | null)[] = [
    (c => c && { id: 'missing', type: 'missing' as const, c })(example('2026-07-01T18:05:00Z', {}, { days: 12, includesToday: false })),
    (c => c && { id: 'partial', type: 'missing' as const, c })(example('2026-07-01T18:05:00Z', { weight: true, mealsMain: 2 })),
    (c => c && { id: 'praise', type: 'praise' as const, c })(example('2026-07-01T10:30:00Z', { training: true, trainingMin: 45, trainingType: 'Krafttraining', trainingAt: '2026-07-01T09:00:00Z' })),
    (c => c && { id: 'streak', type: 'streak' as const, c })(example('2026-07-01T10:00:00Z', { weight: true }, { days: 7, includesToday: true })),
    (c => c && { id: 'water', type: 'water' as const, c })(example('2026-07-01T14:00:00Z', { waterMl: 600 })),
  ]
  const appt = decideAppointmentPushes(
    [{ id: 'x', titel: 'Upper Body', datum: '2026-07-01', uhrzeit: '17:30', vorlage_name: 'Push-Tag' }],
    new Date('2026-07-01T14:40:00Z'), EXAMPLE_SETTINGS, [], URL_BASE,
  )[0]
  const out = list.filter((x): x is Sample => !!x)
  if (appt) out.push({ id: 'appointment', type: 'appointment', c: appt })
  return out
}

function PreviewCard({ c, dim }: { c: Candidate; dim: boolean }) {
  return (
    <div className={cn('flex gap-3 rounded-2xl bg-bg-elevated border border-border p-3 transition-opacity duration-300', dim && 'opacity-45')}>
      <span className="w-9 h-9 rounded-xl bg-primary ring-1 ring-inset ring-brand/30 flex items-center justify-center shrink-0" aria-hidden="true">
        <Zap size={16} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[11px] font-semibold tracking-wide text-text-muted">
          <span>HLX TOGETHER</span><span>jetzt</span>
        </div>
        <div className="text-sm font-semibold text-text-primary leading-snug">{c.title}</div>
        <div className="text-sm text-text-secondary leading-snug">{c.body}</div>
      </div>
    </div>
  )
}

// ─── Zeilen ───────────────────────────────────────────────────────────────────

function Row({ icon, title, hint, children }: { icon?: React.ReactNode; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3.5 border-t border-border first:border-t-0">
      {icon && <span className="w-9 h-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0" aria-hidden="true">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary leading-snug">{hint}</div>
      </div>
      {children}
    </div>
  )
}

const LEADS = [
  { value: 15, label: '15 Minuten vorher' },
  { value: 30, label: '30 Minuten vorher' },
  { value: 60, label: '1 Stunde vorher' },
  { value: 120, label: '2 Stunden vorher' },
  { value: 1440, label: '1 Tag vorher' },
]

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function NotificationSettings({ userId, isCoach, settings, onPatch }: {
  userId: string
  isCoach: boolean
  settings: Partial<ClientSettings>
  onPatch: (patch: Patch) => void
}) {
  const [state, setState] = useState<PushState | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [saveError, setSaveError] = useState(false)
  const samples = useMemo(buildSamples, [])

  const refresh = useCallback(async () => {
    try { setState(await getPushState()) } catch { setState('unsupported') }
    try { setDevices(await listDevices(userId)) } catch { /* Geräteliste ist optional */ }
  }, [userId])
  useEffect(() => { void refresh() }, [refresh])

  // Änderungen sofort speichern, ohne dass man unten „Speichern“ drücken muss
  async function patch(p: Patch) {
    onPatch(p)
    setSaveError(false)
    const { error } = await supabase.from('client_settings').update(p).eq('user_id', userId)
    if (error) setSaveError(true)
  }

  async function turnOn() {
    setBusy(true); setMsg(null)
    const res = await enablePush(userId)
    setBusy(false)
    if (res === 'ok') setMsg({ tone: 'ok', text: 'Fertig: Dieses Gerät bekommt jetzt Nachrichten.' })
    else if (res === 'denied') setMsg({ tone: 'warn', text: 'Die Erlaubnis wurde verweigert. Du kannst sie in den Einstellungen deines Geräts oder Browsers wieder erlauben.' })
    else if (res === 'unsupported') setMsg({ tone: 'warn', text: 'Dieses Gerät oder dieser Browser unterstützt keine Push-Nachrichten.' })
    else setMsg({ tone: 'warn', text: 'Das hat nicht geklappt. Lade die App neu und versuche es noch einmal.' })
    await refresh()
  }

  async function turnOff() {
    setBusy(true); setMsg(null)
    await disablePush(userId)
    setBusy(false)
    await refresh()
  }

  async function test() {
    setBusy(true); setMsg(null)
    const { data, error } = await sendPushToUser(userId, 'Test erfolgreich', 'So meldet sich HLX Together bei dir.')
    setBusy(false)
    if (!error && data && (data.sent ?? 0) > 0) setMsg({ tone: 'ok', text: `Test gesendet an ${data.sent} Gerät${data.sent === 1 ? '' : 'e'}. Es sollte gleich ankommen.` })
    else setMsg({ tone: 'warn', text: 'Der Test konnte nicht zugestellt werden. Prüfe, ob dieses Gerät aktiviert ist.' })
  }

  async function dropDevice(d: PushDevice) {
    await removeDevice(d.id)
    await refresh()
  }

  const daily = settings.notif_daily_reminder !== false
  const flag = (k: 'notif_praise' | 'notif_streak' | 'notif_water') => settings[k] !== false
  const max = settings.notif_max_per_day ?? 3
  const tz = settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const dim = (type: Sample['type']) =>
    type === 'missing' ? !daily : type === 'praise' ? !flag('notif_praise') : type === 'streak' ? !flag('notif_streak')
      : type === 'water' ? !flag('notif_water') : settings.notif_appointments === false

  return (
    <div className="card space-y-5">
      <h2 className="font-semibold text-text-primary flex items-center gap-2">
        <Bell size={18} className="text-brand" aria-hidden="true" /> Benachrichtigungen
      </h2>

      {/* Dieses Gerät */}
      <div className="rounded-2xl bg-bg-elevated border border-border p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0', state === 'on' ? 'bg-success/15 text-success' : 'bg-brand/10 text-brand')} aria-hidden="true">
            {state === 'on' ? <BellRing size={20} /> : <Smartphone size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-text-primary">
              {state === 'on' ? 'Auf diesem Gerät aktiv' : state === 'loading' ? 'Prüfe Gerät …' : 'Auf diesem Gerät noch aus'}
            </div>
            <p className="text-xs text-text-secondary leading-relaxed mt-0.5">
              {state === 'on' && 'Du bekommst die gewählten Nachrichten auch bei geschlossener App.'}
              {state === 'off' && 'Aktiviere Nachrichten, damit dich HLX Together erinnert und lobt. Die Erlaubnis fragt dein Gerät einmalig ab.'}
              {state === 'denied' && 'Nachrichten sind für diese App blockiert. Erlaube sie in den Einstellungen deines Geräts oder Browsers und lade die App neu.'}
              {state === 'unsupported' && 'Dieser Browser unterstützt keine Push-Nachrichten. Chrome, Edge, Firefox und Safari (macOS 13 oder neuer) können es.'}
              {state === 'ios-old' && 'Push-Nachrichten brauchen auf iPhone und iPad mindestens iOS 16.4. Bitte aktualisiere dein Gerät.'}
              {state === 'ios-install' && 'Auf iPhone und iPad funktionieren Nachrichten, sobald die App auf dem Home-Bildschirm liegt:'}
            </p>
          </div>
        </div>

        {state === 'ios-install' && (
          <ol className="space-y-2 text-sm text-text-secondary" aria-label="So installierst du die App auf iPhone und iPad">
            {[
              { icon: <Share size={16} />, text: <>In Safari unten auf <strong className="text-text-primary">Teilen</strong> tippen</> },
              { icon: <PlusSquare size={16} />, text: <><strong className="text-text-primary">Zum Home-Bildschirm</strong> wählen und bestätigen</> },
              { icon: <Smartphone size={16} />, text: <>App <strong className="text-text-primary">vom Home-Bildschirm</strong> öffnen und hier „Aktivieren“ tippen</> },
            ].map((s, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0" aria-hidden="true">{s.icon}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap gap-2">
          {(state === 'off' || state === 'denied') && (
            <button onClick={turnOn} disabled={busy || state === 'denied'} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60">
              {busy ? <Spinner size={16} /> : <Bell size={16} aria-hidden="true" />} Auf diesem Gerät aktivieren
            </button>
          )}
          {state === 'on' && (
            <>
              <button onClick={test} disabled={busy} className="btn-secondary text-sm flex items-center gap-2">
                {busy ? <Spinner size={16} /> : <Sparkles size={16} aria-hidden="true" />} Test senden
              </button>
              <button onClick={turnOff} disabled={busy} className="btn-secondary text-sm">Auf diesem Gerät ausschalten</button>
            </>
          )}
        </div>

        {msg && (
          <p role="status" className={cn('text-xs leading-relaxed flex items-start gap-1.5', msg.tone === 'ok' ? 'text-success' : 'text-warning')}>
            {msg.tone === 'ok' && <Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}{msg.text}
          </p>
        )}

        {devices.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="text-xs font-semibold text-text-secondary mb-2">Angemeldete Geräte</div>
            <ul className="space-y-1.5">
              {devices.map(d => (
                <li key={d.id} className="flex items-center gap-2.5 text-sm">
                  <MonitorSmartphone size={16} className="text-text-muted shrink-0" aria-hidden="true" />
                  <span className="flex-1 min-w-0 truncate text-text-primary">{d.device_label ?? 'Gerät'}</span>
                  {d.thisDevice && <span className="badge bg-success/15 text-success">Dieses Gerät</span>}
                  {!d.thisDevice && (
                    <button onClick={() => dropDevice(d)} className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" aria-label={`${d.device_label ?? 'Gerät'} entfernen`}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!isCoach && (
        <>
          <div>
            <Row icon={<Bell size={18} />} title="Abendliche Erinnerung" hint="„Heute noch nichts eingetragen“, wenn dir noch etwas fehlt">
              <Toggle checked={daily} onChange={v => patch({ notif_daily_reminder: v })} label="Abendliche Erinnerung" />
            </Row>
            {daily && (
              <div className="pb-3.5 -mt-1 pl-12">
                <label htmlFor="notif-time" className="label !mb-1 !text-xs">Uhrzeit (deine Ortszeit)</label>
                <input
                  id="notif-time" type="time" className="input !w-40" value={settings.notif_reminder_time ?? '20:00'}
                  onChange={e => patch({ notif_reminder_time: e.target.value })}
                />
                <p className="text-xs text-text-muted mt-1.5">Zeitzone: {tz.replace('_', ' ')} (wird automatisch erkannt)</p>
              </div>
            )}
            <Row icon={<Sparkles size={18} />} title="Lob für Erledigtes" hint="Zum Beispiel nach dem Training: „Heute schon fleißig trainiert“">
              <Toggle checked={flag('notif_praise')} onChange={v => patch({ notif_praise: v })} label="Lob für Erledigtes" />
            </Row>
            <Row icon={<Flame size={18} />} title="Serien und Meilensteine" hint="Wenn du 3, 7, 14, 30 … Tage in Folge dabei bist">
              <Toggle checked={flag('notif_streak')} onChange={v => patch({ notif_streak: v })} label="Serien und Meilensteine" />
            </Row>
            <Row icon={<Droplets size={18} />} title="Wasser" hint="Ein sanfter Hinweis am Nachmittag, wenn du erst wenig getrunken hast">
              <Toggle checked={flag('notif_water')} onChange={v => patch({ notif_water: v })} label="Wasser-Erinnerung" />
            </Row>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-text-primary">Höchstens pro Tag</div>
            <p className="text-xs text-text-secondary">Empfohlen sind 3. Nie vor 8 Uhr und nach 22 Uhr, Terminerinnerungen zählen nicht mit.</p>
            <SegmentTabs
              tabs={[{ key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3', label: '3' }]}
              value={String(max)} onChange={k => patch({ notif_max_per_day: Number(k) })} label="Höchstzahl Nachrichten pro Tag" className="max-w-xs"
            />
          </div>

          <div>
            <Row icon={<Check size={18} />} title="Termin-Erinnerungen" hint="Vor jedem Termin im Kalender, bei jedem Termin einzeln einstellbar">
              <Toggle checked={settings.notif_appointments !== false} onChange={v => patch({ notif_appointments: v })} label="Termin-Erinnerungen" />
            </Row>
            {settings.notif_appointments !== false && (
              <div className="pb-1 pl-12">
                <label htmlFor="notif-lead" className="label !mb-1 !text-xs">Standard für neue Termine</label>
                <select
                  id="notif-lead" className="input !w-auto" value={settings.notif_appointment_minutes ?? 60}
                  onChange={e => patch({ notif_appointment_minutes: Number(e.target.value) })}
                >
                  {LEADS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {saveError && (
            <p role="alert" className="text-xs text-warning">Das konnte nicht gespeichert werden. Wenn das öfter passiert, fehlt in der Datenbank noch das Update für Benachrichtigungen.</p>
          )}

          <div className="space-y-2">
            <div className="text-sm font-semibold text-text-primary">So melden wir uns bei dir</div>
            <p className="text-xs text-text-secondary">Ruhig, freundlich und nur, wenn es etwas bringt. Ausgeschaltete Arten erscheinen blass.</p>
            <div className="space-y-2">
              {samples.map(s => <PreviewCard key={s.id} c={s.c} dim={dim(s.type)} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
