import { useEffect, useState } from 'react'
import { Save, Copy, Plus, Trash2, Settings as SettingsIcon, Key, Bell, CheckCircle, FileText, AlertTriangle, Shield, Calculator, Zap, Moon, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { bmi, bmiCategory, generateCode, berechneTDEE, type TDEEResult } from '../lib/utils'
import { Spinner } from '../components/ui/Spinner'
import { NotificationSettings } from '../components/settings/NotificationSettings'
import { useTheme, type Theme } from '../hooks/useTheme'
import type { ClientSettings, InviteCode, CoachPlan } from '../types/database'

const NEW_NOTIF_COLUMNS = ['timezone', 'notif_praise', 'notif_streak', 'notif_water', 'notif_max_per_day']

export function Settings() {
  const { user, profile, refreshProfile } = useAuth()
  const { theme, setTheme } = useTheme()
  const [settings, setSettings] = useState<Partial<ClientSettings>>({})
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [tdeePreview, setTdeePreview] = useState<TDEEResult | null>(null)

  const isCoach = profile?.role === 'coach'
  const [masterplan, setMasterplan] = useState<CoachPlan | null>(null)

  async function load() {
    if (!user) return
    const [settingsRes, planRes] = await Promise.all([
      supabase.from('client_settings').select('*').eq('user_id', user.id).single(),
      !isCoach ? supabase.from('coach_plans').select('*').eq('client_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    if (settingsRes.data) setSettings(settingsRes.data)
    setMasterplan(planRes.data ?? null)
    if (isCoach) {
      const codesRes = await supabase.from('invite_codes').select('*').eq('coach_id', user.id).order('created_at', { ascending: false })
      if (codesRes.data) setInviteCodes(codesRes.data as any[])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [user])
  useEffect(() => { setName(profile?.name ?? '') }, [profile])

  async function handleSave() {
    if (!user) return
    setSaving(true)
    const [, res] = await Promise.all([
      supabase.from('profiles').update({ name }).eq('id', user.id),
      supabase.from('client_settings').upsert({ ...settings, user_id: user.id }, { onConflict: 'user_id' }),
    ])
    if (res.error && /column|schema cache/i.test(res.error.message)) {
      // Datenbank ohne das Benachrichtigungs-Update: Rest der Einstellungen trotzdem speichern
      const rest = Object.fromEntries(Object.entries(settings).filter(([k]) => !NEW_NOTIF_COLUMNS.includes(k)))
      await supabase.from('client_settings').upsert({ ...rest, user_id: user.id }, { onConflict: 'user_id' })
    }
    await refreshProfile()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleDeleteAccount() {
    if (!user || deleteConfirm !== 'LÖSCHEN') return
    setDeletingAccount(true)
    // Delete profile row — cascades to ALL health/fitness data (ON DELETE CASCADE)
    // The auth.users entry remains but is effectively an empty shell
    await supabase.from('profiles').delete().eq('id', user.id)
    await supabase.auth.signOut()
    // Redirect is handled automatically by AuthProvider (user becomes null)
  }

  async function createInviteCode() {
    if (!user) return
    const code = generateCode()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)
    await supabase.from('invite_codes').insert({
      code,
      coach_id: user.id,
      used_by: null,
      expires_at: expiresAt.toISOString(),
    })
    await load()
  }

  async function deleteCode(id: string) {
    await supabase.from('invite_codes').delete().eq('id', id)
    setInviteCodes(c => c.filter(x => x.id !== id))
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
  }

  function handleBerechnen() {
    const g = settings.startgewicht
    const h = settings.koerpergroesse
    const a = settings.alter_jahre
    if (!g || !h || !a) return
    const result = berechneTDEE(
      g, h, a,
      settings.aktivitaetsniveau ?? 'maessig_aktiv',
      settings.sport_ziel ?? 'halten',
      settings.ernaehrungs_typ ?? 'standard',
    )
    setTdeePreview(result)
    setSettings(s => ({
      ...s,
      kalorie_tagesziel: result.kalorien,
      protein_ziel: result.protein,
      karbs_ziel: result.karbs,
      fett_ziel: result.fett,
    }))
  }

  const bmiVal = settings.startgewicht && settings.koerpergroesse
    ? bmi(settings.startgewicht, settings.koerpergroesse)
    : null

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="section-title text-2xl">Einstellungen</h1>
        <p className="text-text-secondary text-sm mt-0.5">Persönliche Daten & Coaching-Ziele</p>
      </div>

      {/* Profile */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-text-primary flex items-center gap-2">
          <SettingsIcon size={18} className="text-brand" /> Profil
        </h2>
        <div>
          <label className="label">Name</label>
          <input type="text" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name" />
        </div>
        <div>
          <label className="label">E-Mail</label>
          <input type="email" aria-label="E-Mail-Adresse" className="input opacity-60 cursor-not-allowed" value={user?.email ?? ''} disabled />
        </div>
        <div>
          <label className="label">Rolle</label>
          <div className="input text-text-secondary cursor-default capitalize">{profile?.role === 'coach' ? 'Coach' : 'Athlet / Klient'}</div>
        </div>
      </div>

      {/* Darstellung */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-text-primary flex items-center gap-2">
          {theme === 'dark' ? <Moon size={18} className="text-brand" /> : <Sun size={18} className="text-brand" />} Darstellung
        </h2>
        <div role="group" aria-label="Farbschema" className="grid grid-cols-2 gap-2 p-1 rounded-full bg-bg-elevated border border-border">
          {([['dark', 'Dunkel', Moon], ['light', 'Hell', Sun]] as [Theme, string, typeof Moon][]).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-semibold transition-all ${
                theme === value ? 'bg-primary text-white ring-1 ring-inset ring-brand/30' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">Standard ist der dunkle Modus. Die Auswahl wird auf diesem Gerät gespeichert.</p>
      </div>

      {/* Goals & Stats (only for clients) */}
      {!isCoach && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-text-primary">Ziele & Körperdaten</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Startgewicht (kg)</label>
              <input type="number" step="0.1" className="input" placeholder="75.0" value={settings.startgewicht ?? ''} onChange={e => setSettings(s => ({ ...s, startgewicht: parseFloat(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="label">Zielgewicht (kg)</label>
              <input type="number" step="0.1" className="input" placeholder="70.0" value={settings.zielgewicht ?? ''} onChange={e => setSettings(s => ({ ...s, zielgewicht: parseFloat(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="label">Körpergröße (cm)</label>
              <input type="number" className="input" placeholder="180" value={settings.koerpergroesse ?? ''} onChange={e => setSettings(s => ({ ...s, koerpergroesse: parseFloat(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="label">Alter (Jahre)</label>
              <input type="number" className="input" placeholder="30" value={settings.alter_jahre ?? ''} onChange={e => setSettings(s => ({ ...s, alter_jahre: parseInt(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="label">Kalorienziel (kcal/Tag)</label>
              <input type="number" className="input" placeholder="2000" value={settings.kalorie_tagesziel ?? ''} onChange={e => setSettings(s => ({ ...s, kalorie_tagesziel: parseInt(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="label">Trainings/Woche (Ziel)</label>
              <input type="number" className="input" placeholder="4" value={settings.trainings_pro_woche ?? ''} onChange={e => setSettings(s => ({ ...s, trainings_pro_woche: parseInt(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="label">Schlafziel (Stunden)</label>
              <input type="number" step="0.5" className="input" placeholder="8" value={settings.schlaf_ziel ?? ''} onChange={e => setSettings(s => ({ ...s, schlaf_ziel: parseFloat(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="label">Wasserziel (ml/Tag)</label>
              <input type="number" className="input" placeholder="2000" value={settings.wasser_ziel_ml ?? ''} onChange={e => setSettings(s => ({ ...s, wasser_ziel_ml: parseInt(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="label">Startdatum Coaching</label>
              <input type="date" aria-label="Startdatum" className="input" value={settings.startdatum ?? ''} onChange={e => setSettings(s => ({ ...s, startdatum: e.target.value }))} />
            </div>
          </div>

          {bmiVal && (
            <div className="p-4 bg-bg-elevated rounded-xl border border-border">
              <div className="text-sm text-text-muted mb-1">BMI (berechnet)</div>
              <div className="text-2xl font-bold text-text-primary">{bmiVal}</div>
              <div className="text-sm text-text-secondary">{bmiCategory(bmiVal)}</div>
            </div>
          )}
        </div>
      )}

      {/* Nutrition calculator (clients only) */}
      {!isCoach && (
        <div className="card space-y-5">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <Calculator size={18} className="text-brand" /> Ernährungsberechnung
          </h2>
          <p className="text-xs text-text-muted -mt-2">Wähle deine Ziele — die Kalorien & Makros werden automatisch berechnet.</p>

          {/* Aktivitätsniveau */}
          <div className="space-y-2">
            <label className="label">Aktivitätsniveau</label>
            <div className="grid grid-cols-1 gap-1.5">
              {([
                ['sitzend',      'Kaum Bewegung', 'Bürojob, keine Sport'],
                ['leicht_aktiv', 'Leicht aktiv',  '1–2× Sport/Woche'],
                ['maessig_aktiv','Moderat aktiv', '3–5× Sport/Woche'],
                ['sehr_aktiv',   'Sehr aktiv',    '6–7× Sport/Woche'],
                ['extrem_aktiv', 'Extrem aktiv',  'Profisportler / körperl. Arbeit'],
              ] as const).map(([val, label, sub]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, aktivitaetsniveau: val }))}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                    (settings.aktivitaetsniveau ?? 'maessig_aktiv') === val
                      ? 'border-brand bg-brand/10 text-text-primary'
                      : 'border-border text-text-secondary hover:border-brand/40'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                    (settings.aktivitaetsniveau ?? 'maessig_aktiv') === val ? 'border-brand bg-brand' : 'border-border'
                  }`} />
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-text-muted">{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Ziel */}
          <div className="space-y-2">
            <label className="label">Mein Ziel</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['abnehmen', 'Abnehmen', '−400 kcal'],
                ['halten',   'Halten',   '±0 kcal'],
                ['zunehmen', 'Zunehmen', '+350 kcal'],
              ] as const).map(([val, label, hint]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, sport_ziel: val }))}
                  className={`py-3 rounded-xl border text-center transition-colors ${
                    (settings.sport_ziel ?? 'halten') === val
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-border text-text-secondary hover:border-brand/40'
                  }`}
                >
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-text-muted mt-0.5">{hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Ernährungsweise */}
          <div className="space-y-2">
            <label className="label">Ernährungsweise</label>
            <div className="flex flex-wrap gap-2">
              {([
                ['standard',     'Ausgewogen'],
                ['low_carb',     'Low Carb'],
                ['high_protein', 'High Protein'],
                ['vegan',        'Vegan'],
                ['vegetarisch',  'Vegetarisch'],
                ['pescetarisch', 'Pescetarisch'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, ernaehrungs_typ: val }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    (settings.ernaehrungs_typ ?? 'standard') === val
                      ? 'bg-primary border-brand text-white'
                      : 'border-border text-text-secondary hover:border-brand/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Intervallfasten */}
          <div className="space-y-2">
            <label className="label">Intervallfasten</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['kein',  'Kein Fasten',   'Normale Mahlzeitenverteilung'],
                ['12:12', '12:12',          '12h fasten · 12h essen'],
                ['14:10', '14:10',          '14h fasten · 10h essen'],
                ['16:8',  '16:8',           '16h fasten · 8h essen'],
              ] as const).map(([val, label, sub]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, intervall_fasten: val }))}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-colors ${
                    (settings.intervall_fasten ?? 'kein') === val
                      ? 'border-brand bg-brand/10 text-text-primary'
                      : 'border-border text-text-secondary hover:border-brand/40'
                  }`}
                >
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-text-muted">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Calculate button */}
          {settings.startgewicht && settings.koerpergroesse && settings.alter_jahre ? (
            <button
              type="button"
              onClick={handleBerechnen}
              className="btn-primary flex items-center gap-2 w-full justify-center"
            >
              <Zap size={16} /> Ziele berechnen & übernehmen
            </button>
          ) : (
            <p className="text-xs text-text-muted text-center">Bitte zuerst Gewicht, Größe und Alter unter «Ziele & Körperdaten» eintragen.</p>
          )}

          {tdeePreview && (
            <div className="p-3 rounded-xl bg-success/10 border border-success/20 space-y-1.5">
              <div className="text-xs font-semibold text-success flex items-center gap-1"><CheckCircle size={13} /> Berechnet & gesetzt</div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div><div className="font-bold text-text-primary text-base">{tdeePreview.kalorien}</div><div className="text-text-muted">kcal</div></div>
                <div><div className="font-bold text-text-primary text-base">{tdeePreview.protein}g</div><div className="text-text-muted">Protein</div></div>
                <div><div className="font-bold text-text-primary text-base">{tdeePreview.karbs}g</div><div className="text-text-muted">Karbs</div></div>
                <div><div className="font-bold text-text-primary text-base">{tdeePreview.fett}g</div><div className="text-text-muted">Fett</div></div>
              </div>
              <p className="text-xs text-text-muted">Klicke «Einstellungen speichern» um die Werte zu sichern.</p>
            </div>
          )}
        </div>
      )}

      {/* Coach photo access (clients only) */}
      {!isCoach && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-text-primary">Körperfotos</h2>
          <label className="flex items-center justify-between cursor-pointer gap-4">
            <div>
              <div className="text-sm font-medium text-text-primary">Coach darf Körperfotos sehen</div>
              <div className="text-xs text-text-muted mt-0.5">Dein Coach kann deine Körperfotos im Gewichtsverlauf einsehen</div>
            </div>
            <div className="relative shrink-0">
              <input
                type="checkbox"
                className="sr-only"
                checked={!!settings.coach_foto_freigabe}
                onChange={e => setSettings(s => ({ ...s, coach_foto_freigabe: e.target.checked }))}
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${settings.coach_foto_freigabe ? 'bg-primary ring-1 ring-brand/40' : 'bg-border-input'}`} />
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.coach_foto_freigabe ? 'translate-x-5' : ''}`} />
            </div>
          </label>
        </div>
      )}

      {/* Masterplan Download (clients only) */}
      {!isCoach && masterplan && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <FileText size={18} className="text-brand" /> Mein Masterplan
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary">{masterplan.pdf_name ?? 'Coaching-Plan'}</div>
              <div className="text-xs text-text-muted mt-0.5">
                Erstellt: {masterplan.angewendet_am ? new Date(masterplan.angewendet_am).toLocaleDateString('de') : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Codes (Coach only) */}
      {isCoach && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary flex items-center gap-2">
              <Key size={18} className="text-brand" /> Einladungscodes
            </h2>
            <button onClick={createInviteCode} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={16} /> Code erstellen
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : inviteCodes.length === 0 ? (
            <p className="text-sm text-text-muted">Noch keine Codes erstellt.</p>
          ) : (
            <div className="space-y-2">
              {inviteCodes.map(code => (
                <div key={code.id} className="flex items-center gap-3 p-3 bg-bg-elevated rounded-xl border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-bold text-text-primary tracking-widest">{code.code}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {code.used_by
                        ? <span className="text-success">Verwendet</span>
                        : code.expires_at
                        ? <span>Läuft ab: {new Date(code.expires_at).toLocaleDateString('de')}</span>
                        : 'Unbegrenzt gültig'}
                    </div>
                  </div>
                  <button onClick={() => copyCode(code.code)} className="p-2 rounded-lg hover:bg-brand/10 hover:text-brand text-text-muted transition-colors" title="Kopieren">
                    <Copy size={14} />
                  </button>
                  <button onClick={() => deleteCode(code.id)} className="p-2 rounded-lg hover:bg-danger/10 hover:text-danger text-text-muted transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notification Settings */}
      {user && (
        <NotificationSettings
          userId={user.id} isCoach={isCoach} settings={settings}
          onPatch={p => setSettings(s => ({ ...s, ...p }))}
        />
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        className={`btn-primary flex items-center gap-2 ${saved ? 'bg-success hover:bg-success' : ''}`}
        disabled={saving}
      >
        {saving ? <Spinner size={18} /> : <Save size={18} />}
        {saved ? 'Gespeichert!' : saving ? 'Speichern...' : 'Einstellungen speichern'}
      </button>

      {/* DSGVO / Legal section */}
      <div className="card space-y-4 border-border/60">
        <h2 className="font-semibold text-text-primary flex items-center gap-2">
          <Shield size={18} className="text-brand" /> Datenschutz & Rechtliches
        </h2>

        {!isCoach && settings.consent_given_at && (
          <div className="p-3 rounded-xl bg-success/10 border border-success/20 text-xs text-text-secondary space-y-1">
            <div className="flex items-center gap-2 text-success font-semibold"><CheckCircle size={14} /> Einwilligungen erteilt</div>
            <div>DSGVO-Einwilligung: {settings.consent_dsgvo ? '✓' : '✗'}</div>
            <div>KI-Analyse: {settings.consent_ai ? '✓ aktiviert' : '✗ nicht erteilt'}</div>
            <div>Erteilt am: {new Date(settings.consent_given_at).toLocaleDateString('de', { dateStyle: 'long' })}</div>
          </div>
        )}

        {!isCoach && (
          <div className="p-3 rounded-xl bg-brand/5 border border-brand/20 flex items-start gap-2 text-xs text-text-secondary">
            <Zap size={14} className="text-brand shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-brand mb-0.5">KI-Analyse aktiv</div>
              Fotos werden zur automatischen Ernährungs- und Trainingsanalyse an Google Gemini übermittelt (gemäß deiner Einwilligung bei der Registrierung).
            </div>
          </div>
        )}

        <div className="flex gap-3 text-sm">
          <Link to="/legal" className="text-brand hover:underline flex items-center gap-1">
            <FileText size={14} /> Impressum
          </Link>
          <Link to="/legal" onClick={() => setTimeout(() => document.getElementById('datenschutz-tab')?.click(), 50)} className="text-brand hover:underline flex items-center gap-1">
            <Shield size={14} /> Datenschutzerklärung
          </Link>
        </div>
      </div>

      {/* Account deletion (DSGVO Art. 17 — Recht auf Löschung) */}
      <div className="card space-y-4 border-danger/20">
        <h2 className="font-semibold text-danger flex items-center gap-2">
          <AlertTriangle size={18} /> Konto löschen
        </h2>
        <p className="text-sm text-text-secondary">
          Durch das Löschen deines Kontos werden <strong className="text-text-primary">alle deine Daten unwiderruflich gelöscht</strong>:
          Gewicht, Training, Ernährung, Schlaf, Körperfotos und alle weiteren persönlichen Daten.
          Dies kann nicht rückgängig gemacht werden (DSGVO Art. 17).
        </p>
        <div className="space-y-2">
          <label className="text-xs text-text-muted">Tippe <strong className="text-danger font-mono">LÖSCHEN</strong> zur Bestätigung:</label>
          <input
            type="text"
            className="input border-danger/30 focus:border-danger"
            placeholder="LÖSCHEN"
            value={deleteConfirm}
            onChange={e => setDeleteConfirm(e.target.value)}
          />
        </div>
        <button
          onClick={handleDeleteAccount}
          disabled={deleteConfirm !== 'LÖSCHEN' || deletingAccount}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-danger/10 text-danger border border-danger/30 hover:bg-danger hover:text-bg transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deletingAccount ? <Spinner size={16} /> : <Trash2 size={16} />}
          {deletingAccount ? 'Wird gelöscht...' : 'Konto und alle Daten löschen'}
        </button>
      </div>
    </div>
  )
}
