import { KoerperFotos } from '../../components/photos/KoerperFotos'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Scale, Dumbbell, Moon, Apple, Pill, Target, FileText, Upload, CheckCircle, X, Download, Sparkles, RefreshCw, ChevronDown, ChevronUp, Home } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { formatDate, calcSleepHours } from '../../lib/utils'
import { Spinner } from '../../components/ui/Spinner'
import type { Profile, GewichtEntry, TrainingEntry, SchlafEntry, ErnaehrungEntry, ClientSettings, CoachPlan } from '../../types/database'
import { HaushaltTab } from './HaushaltTab'
import { GameTab, useClientGame } from './GameTab'
import { Avatar } from '../../components/character/Avatar'
import { levelInfo } from '../../lib/game'
import { useTheme } from '../../hooks/useTheme'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

const CT = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card !p-3 text-xs">
      <div className="text-text-muted mb-1">{label}</div>
      {payload.map((p: any) => <div key={p.dataKey} className="text-text-primary font-bold">{p.value}</div>)}
    </div>
  )
}

interface ExtractedVorlage {
  name: string
  trainingstyp: string
  wochentag: number
  uebungen: { uebungsname: string; saetze: number | null; wdh: number | null; gewicht_kg: number | null }[]
}

interface ExtractedRezept {
  name: string
  kalorien: number
  protein_g: number | null
  kohlenhydrate_g: number | null
  fett_g: number | null
  zutaten_text: string | null
  kochanleitung: string | null
}

interface ExtractedPlan {
  kalorie_tagesziel: number | null
  protein_ziel: number | null
  karbs_ziel: number | null
  fett_ziel: number | null
  wasser_ziel_ml: number | null
  schlaf_ziel: number | null
  praeferenzen: string | null
  trainingsvorlagen: ExtractedVorlage[]
  rezepte: ExtractedRezept[]
}

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Montag', 2: 'Dienstag', 3: 'Mittwoch', 4: 'Donnerstag',
  5: 'Freitag', 6: 'Samstag', 7: 'Sonntag',
}

function MasterplanTab({ clientId, settings, onApplied }: { clientId: string; settings: ClientSettings | null; onApplied: () => void }) {
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [existingPlan, setExistingPlan] = useState<CoachPlan | null>(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedPlan | null>(null)
  const [edited, setEdited] = useState<ExtractedPlan | null>(null)
  const [replaceVorlagen, setReplaceVorlagen] = useState(true)
  const [replaceRezepte, setReplaceRezepte] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applyDone, setApplyDone] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [expandedVorlage, setExpandedVorlage] = useState<number | null>(null)

  useEffect(() => {
    supabase.from('coach_plans').select('*').eq('client_id', clientId).maybeSingle()
      .then(({ data }) => { setExistingPlan(data); setPlanLoading(false) })
  }, [clientId])

  async function handleAnalyse() {
    if (!pdfFile || !user) return
    setAnalysing(true)
    setAnalysisError(null)
    setExtracted(null)

    const pdfBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(pdfFile)
    })

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setAnalysisError('Nicht angemeldet'); setAnalysing(false); return }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/parse-masterplan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pdfBase64, clientId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setAnalysisError(json.error ?? 'Fehler bei der Analyse'); setAnalysing(false); return }
      const result: ExtractedPlan = {
        kalorie_tagesziel: json.result.kalorie_tagesziel ?? null,
        protein_ziel: json.result.protein_ziel ?? null,
        karbs_ziel: json.result.karbs_ziel ?? null,
        fett_ziel: json.result.fett_ziel ?? null,
        wasser_ziel_ml: json.result.wasser_ziel_ml ?? null,
        schlaf_ziel: json.result.schlaf_ziel ?? null,
        praeferenzen: json.result.praeferenzen ?? settings?.ernaehrungs_notizen ?? null,
        trainingsvorlagen: json.result.trainingsvorlagen ?? [],
        rezepte: json.result.rezepte ?? [],
      }
      setExtracted(result)
      setEdited(JSON.parse(JSON.stringify(result)))
    } catch (e: any) {
      setAnalysisError(e.message ?? 'Netzwerkfehler')
    }
    setAnalysing(false)
  }

  async function handleApply() {
    if (!edited || !user || !pdfFile) return
    setApplying(true)
    setApplyError(null)

    // 1. Upsert coach_plans (no PDF stored, just metadata)
    await supabase.from('coach_plans').upsert(
      { client_id: clientId, coach_id: user.id, pdf_storage_path: null, pdf_name: pdfFile.name, angewendet_am: new Date().toISOString() },
      { onConflict: 'client_id' }
    )

    // 3. Update client_settings
    await supabase.from('client_settings').update({
      kalorie_tagesziel: edited.kalorie_tagesziel ?? undefined,
      protein_ziel: edited.protein_ziel ?? undefined,
      karbs_ziel: edited.karbs_ziel ?? undefined,
      fett_ziel: edited.fett_ziel ?? undefined,
      wasser_ziel_ml: edited.wasser_ziel_ml ?? undefined,
      schlaf_ziel: edited.schlaf_ziel ?? undefined,
      ernaehrungs_notizen: edited.praeferenzen?.trim() ? edited.praeferenzen.trim() : undefined,
    }).eq('user_id', clientId)

    // 4. Replace training templates if toggled
    if (replaceVorlagen && edited.trainingsvorlagen.length > 0) {
      // Delete existing templates for client
      const { data: oldVorlagen } = await supabase.from('training_vorlagen').select('id').eq('user_id', clientId)
      if (oldVorlagen && oldVorlagen.length > 0) {
        const ids = oldVorlagen.map(v => v.id)
        await supabase.from('vorlagen_uebungen').delete().in('vorlage_id', ids)
        await supabase.from('training_vorlagen').delete().eq('user_id', clientId)
      }

      // Insert new templates
      for (const v of edited.trainingsvorlagen) {
        const { data: vorlage } = await supabase.from('training_vorlagen').insert({
          user_id: clientId,
          name: v.name,
          trainingstyp: v.trainingstyp,
          wochentage: String(v.wochentag),
        }).select().single()
        if (vorlage && v.uebungen.length > 0) {
          await supabase.from('vorlagen_uebungen').insert(
            v.uebungen.map((u, i) => ({
              vorlage_id: vorlage.id,
              uebungsname: u.uebungsname,
              saetze: u.saetze,
              wdh: u.wdh,
              gewicht_kg: u.gewicht_kg,
              reihenfolge: i,
            }))
          )
        }
      }
    }

    // 5. Import recipes from masterplan
    if (edited.rezepte && edited.rezepte.length > 0) {
      if (replaceRezepte) {
        await supabase.from('rezepte').delete().eq('user_id', clientId)
      }
      const { data: insertedRezepte } = await supabase.from('rezepte').insert(
        edited.rezepte.map(r => ({
          user_id: clientId,
          name: r.name,
          portionen: 1,
          kalorien: r.kalorien,
          protein_g: r.protein_g,
          kohlenhydrate_g: r.kohlenhydrate_g,
          fett_g: r.fett_g,
          zutaten_text: r.zutaten_text ?? null,
          kochanleitung: r.kochanleitung ?? null,
        }))
      ).select('id, name, zutaten_text')

      // Auto-generate images in background (fire-and-forget, non-blocking)
      if (insertedRezepte && insertedRezepte.length > 0) {
        Promise.all(
          insertedRezepte.map(async (r) => {
            try {
              const { data: imgData } = await supabase.functions.invoke('generate-recipe-image', {
                body: { rezeptName: r.name, zutaten: r.zutaten_text ?? undefined },
              })
              if (imgData?.imageDataUrl) {
                await supabase.from('rezepte').update({ bild_url: imgData.imageDataUrl }).eq('id', r.id)
              }
            } catch { /* ignore individual failures */ }
          })
        ).catch(() => { /* ignore */ })
      }
    }

    // Refresh existing plan
    const { data } = await supabase.from('coach_plans').select('*').eq('client_id', clientId).maybeSingle()
    setExistingPlan(data)
    setApplyDone(true)
    setApplying(false)
    onApplied()
    setTimeout(() => setApplyDone(false), 4000)
  }

  async function handleDownload() {
    if (!existingPlan?.pdf_storage_path) return
    const { data, error } = await supabase.storage
      .from('masterplans').createSignedUrl(existingPlan.pdf_storage_path, 3600)
    if (error || !data?.signedUrl) {
      setApplyError(`Download fehlgeschlagen: ${error?.message ?? 'Signed URL konnte nicht erstellt werden'}`)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  function updateField(key: keyof Omit<ExtractedPlan, 'trainingsvorlagen' | 'rezepte' | 'praeferenzen'>, value: string) {
    setEdited(e => e ? { ...e, [key]: parseFloat(value) || null } : null)
  }

  function updatePraeferenzen(value: string) {
    setEdited(e => e ? { ...e, praeferenzen: value } : null)
  }

  if (planLoading) return <div className="flex justify-center py-10"><Spinner size={32} /></div>

  return (
    <div className="space-y-6">
      {/* Existing plan banner */}
      {existingPlan && (
        <div className="card border border-success/30 bg-success/5 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-success/10 text-success"><FileText size={20} /></div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-text-primary">{existingPlan.pdf_name ?? 'Masterplan'}</div>
            <div className="text-xs text-text-muted mt-0.5">
              Angewendet: {existingPlan.angewendet_am ? formatDate(existingPlan.angewendet_am) : '—'}
            </div>
          </div>
          <button onClick={handleDownload} className="btn-primary flex items-center gap-2 text-sm shrink-0">
            <Download size={16} /> PDF
          </button>
        </div>
      )}

      {/* Upload + Analyse */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-text-primary flex items-center gap-2">
          <Upload size={18} className="text-brand" />
          {existingPlan ? 'Plan ersetzen' : 'Masterplan hochladen'}
        </h3>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border hover:border-brand/50 rounded-xl p-8 text-center cursor-pointer transition-colors group"
        >
          <FileText size={32} className="mx-auto text-text-muted group-hover:text-brand mb-2 transition-colors" />
          {pdfFile ? (
            <div>
              <div className="font-medium text-text-primary">{pdfFile.name}</div>
              <div className="text-xs text-text-muted mt-1">{(pdfFile.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
          ) : (
            <div>
              <div className="text-text-secondary text-sm">PDF hierher ziehen oder klicken</div>
              <div className="text-xs text-text-muted mt-1">Max. 7 MB</div>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { setPdfFile(f); setExtracted(null); setEdited(null); setAnalysisError(null) } }}
          />
        </div>

        {analysisError && (
          <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 rounded-xl px-4 py-3">
            <X size={16} /> {analysisError}
          </div>
        )}

        <button
          onClick={handleAnalyse}
          disabled={!pdfFile || analysing}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {analysing ? <><Spinner size={18} /> KI analysiert den Plan...</> : <><Sparkles size={18} /> Plan analysieren</>}
        </button>
      </div>

      {/* Confirmation form */}
      {edited && (
        <div className="space-y-4">
          {/* Nutrition goals */}
          <div className="card space-y-4">
            <h3 className="font-semibold text-text-primary">Ernährungsziele (extrahiert)</h3>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['kalorie_tagesziel', 'Kalorien (kcal/Tag)'],
                ['protein_ziel', 'Protein (g)'],
                ['karbs_ziel', 'Kohlenhydrate (g)'],
                ['fett_ziel', 'Fett (g)'],
                ['wasser_ziel_ml', 'Wasser (ml/Tag)'],
                ['schlaf_ziel', 'Schlaf (Stunden)'],
              ] as [keyof Omit<ExtractedPlan, 'trainingsvorlagen' | 'rezepte' | 'praeferenzen'>, string][]).map(([key, label]) => (
                <div key={key}>
                  <label className="label text-xs">{label}</label>
                  <input
                    type="number"
                    className="input"
                    value={edited[key] ?? ''}
                    onChange={e => updateField(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Präferenzen / Ernährungsnotizen (extrahiert) */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text-primary">Präferenzen & Besonderheiten (extrahiert)</h3>
              <span className="text-xs text-text-muted">Wird im Haushalt & KI-Planer verwendet</span>
            </div>
            <textarea
              className="input resize-none text-sm w-full"
              rows={3}
              placeholder="z.B. Magenprobleme → viel Kiwi, leicht verdaulich. Kein Gluten. Isst gerne deftig und viel Protein..."
              value={edited.praeferenzen ?? ''}
              onChange={e => updatePraeferenzen(e.target.value)}
            />
          </div>

          {/* Training templates */}
          {edited.trainingsvorlagen.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-text-primary">Trainingsvorlagen ({edited.trainingsvorlagen.length})</h3>
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceVorlagen}
                    onChange={e => setReplaceVorlagen(e.target.checked)}
                    className="rounded"
                  />
                  Vorhandene ersetzen
                </label>
              </div>
              <div className="space-y-2">
                {edited.trainingsvorlagen.map((v, i) => (
                  <div key={i} className="border border-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedVorlage(expandedVorlage === i ? null : i)}
                      className="w-full flex items-center justify-between p-3 hover:bg-bg-elevated transition-colors text-left"
                    >
                      <div>
                        <span className="font-medium text-text-primary text-sm">{v.name}</span>
                        <span className="ml-2 text-xs text-text-muted">{WEEKDAY_LABELS[v.wochentag] ?? `Tag ${v.wochentag}`} · {v.trainingstyp}</span>
                      </div>
                      <div className="flex items-center gap-2 text-text-muted">
                        <span className="text-xs">{v.uebungen.length} Übungen</span>
                        {expandedVorlage === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </button>
                    {expandedVorlage === i && (
                      <div className="px-3 pb-3 space-y-1 border-t border-border">
                        {v.uebungen.map((u, j) => (
                          <div key={j} className="flex items-center justify-between py-1.5 text-sm border-b border-border/40 last:border-0">
                            <span className="text-text-primary">{u.uebungsname}</span>
                            <span className="text-text-muted text-xs">
                              {u.saetze ? `${u.saetze}×` : ''}{u.wdh ? `${u.wdh} Wdh` : ''}{u.gewicht_kg ? ` · ${u.gewicht_kg}kg` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recipes from masterplan */}
          {edited.rezepte && edited.rezepte.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-text-primary">Rezepte ({edited.rezepte.length})</h3>
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceRezepte}
                    onChange={e => setReplaceRezepte(e.target.checked)}
                    className="rounded"
                  />
                  Vorhandene ersetzen
                </label>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {edited.rezepte.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-bg text-sm">
                    <span className="text-text-primary truncate flex-1 min-w-0 mr-2">
                      {r.name}
                      {r.zutaten_text && <span title="Zutaten vorhanden" className="ml-1.5 text-text-muted">🛒</span>}
                      {r.kochanleitung && <span title="Kochanleitung vorhanden" className="ml-1 text-text-muted">📖</span>}
                    </span>
                    <span className="text-text-muted text-xs shrink-0">
                      {r.kalorien} kcal
                      {r.protein_g != null ? ` · P:${r.protein_g}g` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Apply error */}
          {applyError && (
            <div className="flex items-start gap-2 text-sm text-danger bg-danger/10 rounded-xl px-4 py-3">
              <X size={16} className="shrink-0 mt-0.5" /> {applyError}
            </div>
          )}

          {/* Apply button */}
          <button
            onClick={handleApply}
            disabled={applying}
            className={`btn-primary w-full flex items-center justify-center gap-2 ${applyDone ? 'bg-success hover:bg-success' : ''}`}
          >
            {applying ? (
              <><Spinner size={18} /> Wird angewendet...</>
            ) : applyDone ? (
              <><CheckCircle size={18} /> Plan erfolgreich angewendet!</>
            ) : (
              <><CheckCircle size={18} /> Plan anwenden & speichern</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>()
  const { colors } = useTheme()
  const navigate = useNavigate()
  const [client, setClient] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<ClientSettings | null>(null)
  const [weights, setWeights] = useState<GewichtEntry[]>([])
  const [trainings, setTrainings] = useState<TrainingEntry[]>([])
  const [schlaf, setSchlaf] = useState<SchlafEntry[]>([])
  const [foodLog, setFoodLog] = useState<{ id: string; datum: string; name: string; kalorien: number | null; protein_g: number | null; kohlenhydrate_g: number | null; fett_g: number | null }[]>([])
  const [uebungenMap, setUebungenMap] = useState<Record<string, { id: string; uebungsname: string; saetze: number | null; wdh: number | null; gewicht_kg: number | null; saetze_log: { wdh: number | null; kg: number | null }[] | null; notizen?: string | null }[]>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'anamnese' | 'weight' | 'training' | 'sleep' | 'nutrition' | 'masterplan' | 'haushalt' | 'figur'>('overview')
  const game = useClientGame(clientId)
  const [notizen, setNotizen] = useState('')
  const [notizenSaving, setNotizenSaving] = useState(false)
  const [selectedTrainingId, setSelectedTrainingId] = useState<string | null>(null)
  const [nutritionFilter, setNutritionFilter] = useState('')
  const [expandedNutritionDay, setExpandedNutritionDay] = useState<string | null>(null)
  const [trainingFilter, setTrainingFilter] = useState('')

  async function reloadSettings() {
    if (!clientId) return
    const { data } = await supabase.from('client_settings').select('*').eq('user_id', clientId).single()
    setSettings(data)
    setNotizen(data?.ernaehrungs_notizen ?? '')
  }

  useEffect(() => {
    if (!clientId) return
    async function load() {
      const [profileRes, settingsRes, weightRes, trainingRes, schlafRes, foodLogRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', clientId!).single(),
        supabase.from('client_settings').select('*').eq('user_id', clientId!).single(),
        supabase.from('gewicht').select('*').eq('user_id', clientId!).order('datum', { ascending: true }),
        supabase.from('training').select('*').eq('user_id', clientId!).order('datum', { ascending: false }),
        supabase.from('schlaf').select('*').eq('user_id', clientId!).order('datum', { ascending: true }),
        supabase.from('food_log').select('id,datum,name,kalorien,protein_g,kohlenhydrate_g,fett_g').eq('user_id', clientId!).order('datum', { ascending: false }),
      ])
      setClient(profileRes.data)
      setSettings(settingsRes.data)
      setNotizen(settingsRes.data?.ernaehrungs_notizen ?? '')
      setWeights(weightRes.data ?? [])
      const trainingData = trainingRes.data ?? []
      setTrainings(trainingData)
      setSchlaf(schlafRes.data ?? [])
      setFoodLog(foodLogRes.data ?? [])

      // Load exercises for all training sessions
      if (trainingData.length > 0) {
        const { data: uebungen } = await supabase
          .from('uebungen')
          .select('id, training_id, uebungsname, saetze, wdh, gewicht_kg, saetze_log, notizen')
          .in('training_id', trainingData.map(t => t.id))
        const map: typeof uebungenMap = {}
        for (const u of (uebungen ?? [])) {
          const tid = (u as any).training_id as string
          if (!map[tid]) map[tid] = []
          map[tid].push(u as any)
        }
        setUebungenMap(map)
      }
      setLoading(false)
    }
    load()
  }, [clientId])

  const currentWeight = weights.at(-1)?.gewicht
  const startWeight = weights[0]?.gewicht
  const weightChange = currentWeight && startWeight ? currentWeight - startWeight : null
  const avgSleep = schlaf.filter(s => s.einschlafzeit && s.aufwachzeit).length > 0
    ? Math.round(schlaf.filter(s => s.einschlafzeit && s.aufwachzeit)
        .reduce((a, s) => a + calcSleepHours(s.einschlafzeit!, s.aufwachzeit!), 0)
        / schlaf.filter(s => s.einschlafzeit && s.aufwachzeit).length * 10) / 10
    : null

  const weightChartData = weights.slice(-30).map(w => ({ datum: formatDate(w.datum, 'dd.MM'), gewicht: w.gewicht }))
  const sleepChartData = schlaf.filter(s => s.einschlafzeit && s.aufwachzeit).slice(-21).map(s => ({
    datum: formatDate(s.datum, 'dd.MM'),
    stunden: calcSleepHours(s.einschlafzeit!, s.aufwachzeit!),
  }))

  const tabs = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'anamnese', label: 'Anamnese' },
    { id: 'weight', label: 'Gewicht' },
    { id: 'training', label: 'Training' },
    { id: 'sleep', label: 'Schlaf' },
    { id: 'nutrition', label: 'Ernährung' },
    { id: 'masterplan', label: 'Masterplan' },
    { id: 'haushalt', label: 'Haushalt' },
    { id: 'figur', label: 'Figur & Challenges' },
  ] as const

  if (loading) return <div className="flex justify-center py-20"><Spinner size={36} /></div>

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => navigate('/coach')} className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors text-sm">
        <ArrowLeft size={16} /> Alle Klienten
      </button>

      {/* Client Header */}
      <div className="card">
        <div className="flex items-center gap-4">
          {game.name ? (
            <button
              onClick={() => setTab('figur')} aria-label={`${game.name}, Level ${levelInfo(game.xp).level}. Figur ansehen`}
              className="relative shrink-0 rounded-2xl bg-brand/10 border border-brand/30 transition-transform active:scale-95"
            >
              <Avatar view="head" config={game.config} equipped={game.equipped} size={64} label="" />
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-extrabold ring-2 ring-bg-card tabular-nums">Level {levelInfo(game.xp).level}</span>
            </button>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-brand/20 border border-brand/30 flex items-center justify-center text-brand font-bold text-2xl shrink-0">
              {client?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-text-primary">{client?.name ?? 'Unbekannt'}</h1>
            <div className="text-text-secondary text-sm">{client?.email}</div>
            {settings?.startdatum && (
              <div className="text-xs text-text-muted mt-1">
                Coaching seit: {formatDate(settings.startdatum)}
              </div>
            )}
          </div>
          {/* Goals */}
          <div className="ml-auto hidden lg:flex gap-6">
            <div className="text-center">
              <div className="text-lg font-bold text-text-primary">{settings?.zielgewicht ? `${settings.zielgewicht} kg` : '--'}</div>
              <div className="text-xs text-text-muted">Zielgewicht</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-text-primary">{settings?.kalorie_tagesziel ?? '--'}</div>
              <div className="text-xs text-text-muted">Kalorien-Ziel</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-text-primary">{settings?.trainings_pro_woche ?? '--'}</div>
              <div className="text-xs text-text-muted">Trainings/Woche</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-bg-card border border-border rounded-xl overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-primary text-white shadow-glow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Aktuelles Gewicht', value: currentWeight ? `${currentWeight} kg` : '--', icon: Scale, color: 'text-brand bg-brand/10' },
            { label: 'Gewichtsveränderung', value: weightChange !== null ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg` : '--', icon: Target, color: 'text-accent bg-accent/10' },
            { label: 'Trainingseinheiten', value: trainings.length || '--', icon: Dumbbell, color: 'text-success bg-success/10' },
            { label: 'Ø Schlafdauer', value: avgSleep ? `${avgSleep}h` : '--', icon: Moon, color: 'text-brand bg-brand/10' },
          ].map(s => (
            <div key={s.label} className="card">
              <div className={`p-2.5 rounded-xl ${s.color} inline-flex mb-3`}>
                <s.icon size={18} />
              </div>
              <div className="text-2xl font-bold text-text-primary">{s.value}</div>
              <div className="text-xs text-text-muted mt-1">{s.label}</div>
            </div>
          ))}

          {/* Weight Chart */}
          {weightChartData.length > 1 && (
            <div className="col-span-2 card">
              <h3 className="font-semibold text-text-primary mb-4">Gewichtsverlauf</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={weightChartData}>
                  <defs>
                    <linearGradient id="wg2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colors.brand} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={colors.brand} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="datum" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip content={<CT />} />
                  <Area isAnimationActive={false} type="monotone" dataKey="gewicht" stroke={colors.brand} strokeWidth={2} fill="url(#wg2)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {sleepChartData.length > 1 && (
            <div className="col-span-2 card">
              <h3 className="font-semibold text-text-primary mb-4">Schlafverlauf</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sleepChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="datum" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 12]} />
                  <Tooltip content={<CT />} />
                  <Bar isAnimationActive={false} dataKey="stunden" fill={colors.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Ernährungsnotizen / Präferenzen */}
          <div className="col-span-2 lg:col-span-4 card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <Apple size={16} className="text-brand" /> Ernährungsnotizen & Präferenzen
              </h3>
              <span className="text-xs text-text-muted">Wird im Haushalt & KI-Planer verwendet</span>
            </div>
            <textarea
              className="input resize-none text-sm w-full"
              rows={3}
              placeholder="z.B. Magenprobleme → viel Kiwi, leicht verdaulich. Kein Gluten. Isst gerne deftig und viel Protein..."
              value={notizen}
              onChange={e => setNotizen(e.target.value)}
            />
            <button
              onClick={async () => {
                if (!clientId) return
                setNotizenSaving(true)
                await supabase.from('client_settings')
                  .update({ ernaehrungs_notizen: notizen || null })
                  .eq('user_id', clientId)
                setNotizenSaving(false)
              }}
              disabled={notizenSaving}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              {notizenSaving ? <Spinner size={14} /> : <CheckCircle size={14} />}
              Speichern
            </button>
          </div>
        </div>
      )}

      {tab === 'anamnese' && (() => {
        let anamnese: Record<string, unknown> = {}
        try { anamnese = settings?.ernaehrungs_notizen ? JSON.parse(settings.ernaehrungs_notizen) : {} } catch {}
        const hasData = anamnese.anamnese_done && !anamnese.skipped
        if (!hasData) return (
          <div className="card text-center py-12 text-text-muted text-sm">
            Klient hat die Anamnese noch nicht ausgefüllt.
          </div>
        )
        const row = (label: string, value: unknown) => value ? (
          <div className="grid grid-cols-[160px_1fr] gap-2 py-2 border-b border-border last:border-0">
            <span className="text-xs text-text-muted font-medium">{label}</span>
            <span className="text-sm text-text-primary">{Array.isArray(value) ? (value as string[]).join(', ') : String(value)}</span>
          </div>
        ) : null
        return (
          <div className="space-y-4">
            <div className="card space-y-1">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Körperdaten</div>
              {row('Alter', anamnese.alter && `${anamnese.alter} Jahre`)}
              {row('Geschlecht', anamnese.geschlecht)}
              {row('Beruf', anamnese.beruf)}
              {row('Körpergröße', anamnese.koerpergroesse && `${anamnese.koerpergroesse} cm`)}
              {row('Aktuelles Gewicht', anamnese.koerpergewicht && `${anamnese.koerpergewicht} kg`)}
              {row('Zielgewicht', anamnese.zielgewicht && `${anamnese.zielgewicht} kg`)}
              {row('Gewichtsverlauf', anamnese.gewichtsverlauf)}
            </div>
            <div className="card space-y-1">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Ziele & Gesundheit</div>
              {row('Hauptziele', anamnese.ziele)}
              {row('Zeitraum', anamnese.zeitraum)}
              {row('Erkrankungen', anamnese.erkrankungen)}
              {row('Allergien', anamnese.allergien)}
              {row('Supplements', anamnese.supplements)}
            </div>
            <div className="card space-y-1">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Ernährungsgewohnheiten</div>
              {row('Aktivitätsniveau', anamnese.aktivitaet)}
              {row('Frühstück', anamnese.fruehstueck)}
              {row('Mittagessen', anamnese.mittagessen)}
              {row('Abendessen', anamnese.abendessen)}
              {row('Snacks', anamnese.snacks)}
              {row('Alkohol', anamnese.alkohol)}
              {row('Heißhunger', anamnese.heisshunger)}
            </div>
            <div className="card space-y-1">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Mahlzeiten & Timing</div>
              {row('Mahlzeiten bevorzugt', anamnese.mahlzeiten_typ)}
              {row('Meal Prep', anamnese.meal_prep)}
              {row('Intervallfasten', anamnese.intervallfasten)}
              {row('Proteinquellen', anamnese.proteinquellen)}
              {row('Smartwatch / Tracker', anamnese.smartwatch)}
            </div>
          </div>
        )
      })()}

      {tab === 'weight' && (
        <div className="space-y-4">
          <KoerperFotos userId={clientId!} readOnly consent={!!settings?.coach_foto_freigabe} />
          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-text-primary mb-4">Gewichtsverlauf ({weights.length} Einträge)</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-text-muted font-medium">Datum</th>
                <th className="text-right py-2 px-3 text-text-muted font-medium">Gewicht</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Notizen</th>
                {settings?.coach_foto_freigabe && <th className="text-center py-2 px-3 text-text-muted font-medium">Foto</th>}
              </tr></thead>
              <tbody>
                {[...weights].reverse().map(w => (
                  <tr key={w.id} className="border-b border-border/50">
                    <td className="py-2.5 px-3 text-text-secondary">{formatDate(w.datum)}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-text-primary">{w.gewicht} kg</td>
                    <td className="py-2.5 px-3 text-text-muted">{w.notizen ?? '--'}</td>
                    {settings?.coach_foto_freigabe && (
                      <td className="py-2.5 px-3 text-center">
                        {(w as any).foto_url ? (
                          <a href={(w as any).foto_url} target="_blank" rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg overflow-hidden border border-border hover:border-brand transition-colors inline-block">
                            <img src={(w as any).foto_url} alt="" className="w-full h-full object-cover" />
                          </a>
                        ) : <span className="text-text-muted text-xs">–</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'training' && (() => {
        const filtered = trainings.filter(t =>
          !trainingFilter ||
          (t.trainingstyp ?? '').toLowerCase().includes(trainingFilter.toLowerCase()) ||
          (t.datum ?? '').includes(trainingFilter)
        )
        // Build exercise progression map: uebungsname → [{datum, maxKg, sets}]
        const progression: Record<string, { datum: string; maxKg: number | null; totalSaetze: number }[]> = {}
        for (const t of trainings) {
          for (const u of (uebungenMap[t.id] ?? [])) {
            if (!progression[u.uebungsname]) progression[u.uebungsname] = []
            const maxKg = u.saetze_log?.length
              ? Math.max(...u.saetze_log.map(s => s.kg ?? 0))
              : u.gewicht_kg ?? null
            progression[u.uebungsname].push({ datum: t.datum, maxKg, totalSaetze: u.saetze ?? 1 })
          }
        }
        const selectedT = selectedTrainingId ? trainings.find(t => t.id === selectedTrainingId) : null
        return (
          <div className="space-y-3">
            {/* Filter */}
            <div className="card">
              <input
                className="input text-sm w-full"
                placeholder="Nach Typ oder Datum filtern…"
                value={trainingFilter}
                onChange={e => setTrainingFilter(e.target.value)}
              />
            </div>

            {/* Detail modal */}
            {selectedT && (
              <div className="card border border-brand/30 bg-brand/5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-bold text-text-primary">{selectedT.trainingstyp ?? 'Training'} — {formatDate(selectedT.datum)}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {selectedT.dauer_min ? `${selectedT.dauer_min} min` : ''}{selectedT.kalorien_verbrannt ? ` · ${selectedT.kalorien_verbrannt} kcal` : ''}
                    </div>
                  </div>
                  <button onClick={() => setSelectedTrainingId(null)} className="p-1.5 text-text-muted hover:text-text-primary"><X size={16} /></button>
                </div>
                {(uebungenMap[selectedT.id] ?? []).length === 0 ? (
                  <p className="text-sm text-text-muted">Keine Übungen erfasst.</p>
                ) : (
                  <div className="space-y-3">
                    {(uebungenMap[selectedT.id] ?? []).map(u => {
                      const hist = (progression[u.uebungsname] ?? []).sort((a, b) => a.datum.localeCompare(b.datum))
                      const idx = hist.findIndex(h => h.datum === selectedT.datum)
                      const prev = idx > 0 ? hist[idx - 1] : null
                      const currKg = u.saetze_log?.length ? Math.max(...u.saetze_log.map(s => s.kg ?? 0)) : u.gewicht_kg ?? null
                      const delta = currKg && prev?.maxKg ? currKg - prev.maxKg : null
                      return (
                        <div key={u.id} className="p-3 rounded-xl bg-bg-elevated">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-text-primary text-sm">{u.uebungsname}</span>
                            {delta !== null && delta !== 0 && (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${delta > 0 ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                                {delta > 0 ? '+' : ''}{delta}kg
                              </span>
                            )}
                          </div>
                          {u.saetze_log && u.saetze_log.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {u.saetze_log.map((s, i) => (
                                <span key={i} className="text-xs bg-bg px-2 py-1 rounded text-text-secondary">
                                  S{i + 1}: {s.wdh ?? '?'} Wdh × {s.kg ?? '?'} kg
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-text-muted mt-1">{u.saetze ?? '?'} Sätze × {u.wdh ?? '?'} Wdh{u.gewicht_kg ? ` @ ${u.gewicht_kg} kg` : ''}</div>
                          )}
                          {u.notizen && (
                            <p className="mt-2 text-xs text-text-secondary border-l-2 border-brand/50 pl-2">
                              <span className="font-semibold text-text-primary">Notiz:</span> {u.notizen}
                            </p>
                          )}
                          {prev && (
                            <div className="text-[11px] text-text-muted mt-1.5">
                              Vorher ({formatDate(prev.datum)}): {prev.maxKg ?? '?'} kg max
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* List */}
            <div className="card overflow-x-auto">
              <h3 className="font-semibold text-text-primary mb-3">Trainingseinheiten ({filtered.length})</h3>
              <div className="space-y-2">
                {filtered.map(t => {
                  const exList = uebungenMap[t.id] ?? []
                  const isSelected = t.id === selectedTrainingId
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTrainingId(isSelected ? null : t.id)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors border ${isSelected ? 'border-brand/40 bg-brand/5' : 'border-transparent hover:bg-bg-elevated'}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary text-sm">{t.trainingstyp ?? 'Training'}</span>
                          {exList.length > 0 && <span className="text-[11px] text-text-muted">{exList.length} Übungen</span>}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5">{formatDate(t.datum)}{t.dauer_min ? ` · ${t.dauer_min} min` : ''}{t.kalorien_verbrannt ? ` · ${t.kalorien_verbrannt} kcal` : ''}</div>
                      </div>
                      <ChevronDown size={14} className={`text-text-muted transition-transform ${isSelected ? 'rotate-180' : ''}`} />
                    </div>
                  )
                })}
                {filtered.length === 0 && <p className="text-sm text-text-muted py-4 text-center">Keine Einträge gefunden.</p>}
              </div>
            </div>
          </div>
        )
      })()}

      {tab === 'sleep' && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold text-text-primary mb-4">Schlaflog ({schlaf.length} Einträge)</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><th className="text-left py-2 px-3 text-text-muted font-medium">Datum</th><th className="text-left py-2 px-3 text-text-muted font-medium">Einschlaf</th><th className="text-left py-2 px-3 text-text-muted font-medium">Aufwach</th><th className="text-right py-2 px-3 text-text-muted font-medium">Dauer</th><th className="text-right py-2 px-3 text-text-muted font-medium">Qualität</th></tr></thead>
            <tbody>
              {[...schlaf].reverse().map(s => {
                const h = s.einschlafzeit && s.aufwachzeit ? calcSleepHours(s.einschlafzeit, s.aufwachzeit) : null
                return (
                  <tr key={s.id} className="border-b border-border/50">
                    <td className="py-2.5 px-3 text-text-secondary">{formatDate(s.datum)}</td>
                    <td className="py-2.5 px-3 text-text-primary">{s.einschlafzeit ?? '--'}</td>
                    <td className="py-2.5 px-3 text-text-primary">{s.aufwachzeit ?? '--'}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-text-primary">{h ? `${h}h` : '--'}</td>
                    <td className="py-2.5 px-3 text-right text-text-secondary">{s.schlafqualitaet ? `${s.schlafqualitaet}/10` : '--'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'nutrition' && (() => {
        const filteredItems = nutritionFilter
          ? foodLog.filter(e => e.name.toLowerCase().includes(nutritionFilter.toLowerCase()) || e.datum.includes(nutritionFilter))
          : foodLog
        const byDate = filteredItems.reduce<Record<string, { kcal: number; p: number; k: number; f: number; entries: typeof foodLog }>>((acc, e) => {
          if (!acc[e.datum]) acc[e.datum] = { kcal: 0, p: 0, k: 0, f: 0, entries: [] }
          acc[e.datum].kcal += e.kalorien ?? 0
          acc[e.datum].p += e.protein_g ?? 0
          acc[e.datum].k += e.kohlenhydrate_g ?? 0
          acc[e.datum].f += e.fett_g ?? 0
          acc[e.datum].entries.push(e)
          return acc
        }, {})
        const days = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]))
        return (
          <div className="space-y-3">
            <div className="card">
              <input
                className="input text-sm w-full"
                placeholder="Nach Mahlzeit oder Datum filtern…"
                value={nutritionFilter}
                onChange={e => setNutritionFilter(e.target.value)}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold text-text-primary mb-3">Ernährungslog ({days.length} Tage)</h3>
              {days.length === 0 ? (
                <p className="text-text-muted text-sm">Noch keine Einträge.</p>
              ) : (
                <div className="space-y-2">
                  {days.map(([datum, d]) => {
                    const isOpen = expandedNutritionDay === datum
                    return (
                      <div key={datum} className="border border-border rounded-xl overflow-hidden">
                        <div
                          onClick={() => setExpandedNutritionDay(isOpen ? null : datum)}
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-bg-elevated transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-text-secondary w-24 shrink-0">{formatDate(datum)}</span>
                            <span className="font-semibold text-text-primary text-sm">{Math.round(d.kcal)} kcal</span>
                            <span className="text-xs text-text-muted hidden sm:block">{Math.round(d.p)}g P · {Math.round(d.k)}g K · {Math.round(d.f)}g F</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted">{d.entries.length} Einträge</span>
                            <ChevronDown size={14} className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                        {isOpen && (
                          <div className="border-t border-border px-3 py-2 bg-bg-elevated space-y-1">
                            {d.entries.map(e => (
                              <div key={e.id} className="flex items-center justify-between py-1.5 text-sm border-b border-border/40 last:border-0">
                                <span className="text-text-primary">{e.name}</span>
                                <div className="flex items-center gap-3 text-xs text-text-muted">
                                  <span className="font-medium text-text-secondary">{e.kalorien ?? 0} kcal</span>
                                  <span>{e.protein_g ?? 0}g P</span>
                                  <span>{e.kohlenhydrate_g ?? 0}g K</span>
                                  <span>{e.fett_g ?? 0}g F</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {tab === 'masterplan' && clientId && (
        <MasterplanTab clientId={clientId} settings={settings} onApplied={reloadSettings} />
      )}

      {tab === 'haushalt' && clientId && (
        <HaushaltTab clientId={clientId} clientName={client?.name ?? 'Klient'} />
      )}

      {tab === 'figur' && clientId && (
        <GameTab clientId={clientId} clientName={client?.name?.split(' ')[0] ?? 'Klient'} game={game} />
      )}
    </div>
  )
}
