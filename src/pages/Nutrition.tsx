import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Plus, Trash2, Camera, Sparkles, X, Search,
  ChevronLeft, ChevronRight, Droplets, Check, FileText, BookOpen, ScanLine,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { todayISO, toLocalISO, tokenColor } from '../lib/utils'
import { Spinner } from '../components/ui/Spinner'
import { WaterCard } from '../components/water/WaterCard'
import { useGame } from '../hooks/useGame'
import type { FoodLogItem, WasserLogEntry, Rezept } from '../types/database'

// ─── Local types ──────────────────────────────────────────────────────────────

interface OFFNutriments {
  'energy-kcal_100g'?: number
  proteins_100g?: number
  carbohydrates_100g?: number
  fat_100g?: number
}

interface OFFProduct {
  product_name?: string
  product_name_de?: string
  brands?: string
  nutriments?: OFFNutriments
  serving_quantity?: number
}

interface NutritionGoals {
  kalorie_tagesziel: number
  protein_ziel: number
  karbs_ziel: number
  fett_ziel: number
}

interface FoodItemInput {
  name: string
  menge_g: number | null
  kalorien: number
  protein_g: number
  kohlenhydrate_g: number
  fett_g: number
  barcode?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MEALS = [
  { id: 'Frühstück', icon: '🌅', color: 'warning' },
  { id: 'Mittagessen', icon: '☀️', color: 'info' },
  { id: 'Abendessen', icon: '🌙', color: 'accent' },
  { id: 'Snack', icon: '🍎', color: 'success' },
] as const

const DEFAULT_WATER_GOAL_ML = 2000
const BOTTLE_KEY = 'hlx-bottle-ml'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toLocalISO(d)
}

function formatDateLabel(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Heute'
  if (iso === shiftDate(today, -1)) return 'Gestern'
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  })
}

// ─── CalorieRing ──────────────────────────────────────────────────────────────

function CalorieRing({ eaten, goal }: { eaten: number; goal: number }) {
  const { colors } = useTheme()
  const r = 48
  const circ = 2 * Math.PI * r
  const pct = goal > 0 ? Math.min(eaten / goal, 1) : 0
  const over = eaten > goal

  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      <svg width="136" height="136" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke={colors.track} strokeWidth="9" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke={over ? colors.danger : colors.brand} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x="60" y="53" textAnchor="middle" fill={colors.text} fontSize="20" fontWeight="700">{eaten}</text>
        <text x="60" y="67" textAnchor="middle" fill={colors.tick} fontSize="8">kcal gegessen</text>
        <text x="60" y="81" textAnchor="middle" fill={over ? colors.danger : colors.success} fontSize="8" fontWeight="600">
          {over ? `+${eaten - goal} über Ziel` : `${goal - eaten} übrig`}
        </text>
      </svg>
      <div className="text-[11px] text-text-muted">Ziel: {goal} kcal</div>
    </div>
  )
}

// ─── CalorieBilanzRing ────────────────────────────────────────────────────────

function CalorieBilanzRing({ consumed, burned, goal }: { consumed: number; burned: number; goal: number }) {
  const { colors } = useTheme()
  const R_OUT = 50, R_IN = 36, cx = 60, cy = 60
  const circOut = 2 * Math.PI * R_OUT
  const circIn  = 2 * Math.PI * R_IN
  const net = Math.max(0, consumed - burned)
  const consumedPct = goal > 0 ? Math.min(consumed / goal, 1) : 0
  const burnedPct   = goal > 0 ? Math.min(burned  / goal, 1) : 0
  const netRatio    = goal > 0 ? net / goal : 0
  const atGoal  = Math.abs(netRatio - 1) < 0.1
  const overGoal = net > goal * 1.1
  const statusColor = atGoal ? colors.success : colors.warning

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <svg width="144" height="144" viewBox="0 0 120 120">
        {/* Outer bg */}
        <circle cx={cx} cy={cy} r={R_OUT} fill="none" stroke={colors.track} strokeWidth="10" />
        {/* Outer blue: consumed */}
        <circle cx={cx} cy={cy} r={R_OUT} fill="none" stroke={colors.info} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circOut} strokeDashoffset={circOut * (1 - consumedPct)}
          transform={`rotate(-90,${cx},${cy})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {/* Inner bg */}
        <circle cx={cx} cy={cy} r={R_IN} fill="none" stroke={colors.track} strokeWidth="8" />
        {/* Inner red: burned */}
        {burned > 0 && (
          <circle cx={cx} cy={cy} r={R_IN} fill="none" stroke={colors.danger} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circIn} strokeDashoffset={circIn * (1 - burnedPct)}
            transform={`rotate(-90,${cx},${cy})`}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        )}
        {/* Center */}
        <text x={cx} y={cy - 9} textAnchor="middle" fill={colors.text} fontSize="19" fontWeight="700">{net}</text>
        <text x={cx} y={cy + 4}  textAnchor="middle" fill={colors.tick} fontSize="8">kcal netto</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill={statusColor} fontSize="7.5" fontWeight="600">
          {atGoal ? '✓ Ziel erreicht' : overGoal ? `+${net - goal} über Ziel` : `${goal - net} bis Ziel`}
        </text>
      </svg>
      <div className="flex gap-5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-info shrink-0" />
          <span className="text-text-secondary">{consumed} kcal gegessen</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-danger shrink-0" />
          <span className="text-text-secondary">{burned} kcal verbrannt</span>
        </span>
      </div>
    </div>
  )
}

// ─── MacroBar ─────────────────────────────────────────────────────────────────

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0
  const over = value > goal
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className={over ? 'text-danger font-medium' : 'text-text-primary'}>
          {value}g <span className="text-text-muted">/ {goal}g</span>
        </span>
      </div>
      <div className="h-1.5 bg-bg rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: over ? tokenColor('danger') : tokenColor(color) }} />
      </div>
    </div>
  )
}

// ─── FoodSearch (Open Food Facts) ────────────────────────────────────────────

function FoodSearch({ onSelect }: { onSelect: (p: OFFProduct) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<OFFProduct[]>([])
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const doSearch = useCallback(async (term: string) => {
    if (term.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&json=1&page_size=20&fields=product_name,product_name_de,brands,nutriments,serving_quantity&lc=de&cc=de`
      )
      const data = await res.json()
      const products = ((data.products ?? []) as OFFProduct[]).filter(p =>
        (p.product_name || p.product_name_de) && (p.nutriments?.['energy-kcal_100g'] ?? 0) > 0
      )
      setResults(products.slice(0, 15))
    } catch {
      setResults([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => doSearch(q), 500)
    return () => clearTimeout(timer.current)
  }, [q, doSearch])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          type="search" className="input pl-9"
          placeholder="Lebensmittel suchen..."
          value={q} onChange={e => setQ(e.target.value)}
          autoFocus
        />
      </div>
      {loading && <div className="flex justify-center py-4"><Spinner /></div>}
      {results.length > 0 && (
        <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 260 }}>
          {results.map((p, i) => {
            const n = p.nutriments ?? {}
            const name = p.product_name_de || p.product_name || ''
            return (
              <button key={i} onClick={() => onSelect(p)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-bg-elevated hover:bg-brand/10 text-left transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{name}</div>
                  {p.brands && <div className="text-xs text-text-muted truncate">{p.brands}</div>}
                </div>
                <div className="text-right text-xs ml-3 shrink-0">
                  <div className="font-semibold text-text-primary">
                    {Math.round(n['energy-kcal_100g'] ?? 0)} kcal
                  </div>
                  <div className="text-text-secondary">
                    P:{Math.round((n.proteins_100g ?? 0) * 10) / 10}
                    {' '}K:{Math.round((n.carbohydrates_100g ?? 0) * 10) / 10}
                    {' '}F:{Math.round((n.fat_100g ?? 0) * 10) / 10}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {q.length >= 2 && !loading && results.length === 0 && (
        <p className="text-center py-6 text-sm text-text-muted">Keine Ergebnisse gefunden</p>
      )}
    </div>
  )
}

// ─── LiveBarcodeScanner ───────────────────────────────────────────────────────

function LiveBarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(true)
  const [camError, setCamError] = useState('')
  const [hint, setHint] = useState('Barcode in den Rahmen halten…')
  const hasDetector = 'BarcodeDetector' in window

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      })
      .catch(() => setCamError('Kamera-Zugriff verweigert. Bitte Berechtigung in den Browser-Einstellungen erlauben.'))
    return () => { scanningRef.current = false; streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  useEffect(() => {
    if (!hasDetector || !videoRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] })
    let animId: number
    async function tick() {
      if (!scanningRef.current || !videoRef.current || videoRef.current.readyState < 2) {
        if (scanningRef.current) animId = requestAnimationFrame(tick)
        return
      }
      try {
        const codes = await detector.detect(videoRef.current)
        if (codes.length > 0) { scanningRef.current = false; onDetected(codes[0].rawValue); return }
      } catch { /* continue */ }
      if (scanningRef.current) animId = setTimeout(() => { animId = requestAnimationFrame(tick) }, 250) as unknown as number
    }
    animId = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(animId); clearTimeout(animId) }
  }, [hasDetector, onDetected])

  useEffect(() => {
    if (!hasDetector) setHint('Live-Scan nicht unterstützt — Nummer manuell eingeben.')
  }, [hasDetector])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3">
        <span className="text-white font-semibold text-sm">Barcode scannen</span>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white"><X size={18} /></button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
        {/* Scan frame overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-72 h-44">
            <div className="absolute inset-0 border-2 border-white/20 rounded-xl" />
            {/* Corner markers */}
            {[['top-0 left-0','border-t-2 border-l-2 rounded-tl-xl'],
              ['top-0 right-0','border-t-2 border-r-2 rounded-tr-xl'],
              ['bottom-0 left-0','border-b-2 border-l-2 rounded-bl-xl'],
              ['bottom-0 right-0','border-b-2 border-r-2 rounded-br-xl'],
            ].map(([pos, cls]) => (
              <div key={pos} className={`absolute w-8 h-8 border-brand ${pos} ${cls}`} />
            ))}
            {/* Scan line animation */}
            <div className="absolute left-2 right-2 h-0.5 bg-brand/80 animate-scanline" />
          </div>
        </div>
        {camError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center">
            <p className="text-white text-sm">{camError}</p>
          </div>
        )}
      </div>

      <div className="px-4 py-4 bg-black/80 text-center">
        <div className="flex items-center justify-center gap-2 text-white/70 text-sm mb-1">
          <ScanLine size={14} /> {hint}
        </div>
        {!hasDetector && (
          <p className="text-xs text-white/50 mt-1">Tipp: Chrome/Edge auf Android unterstützt Live-Scan.</p>
        )}
      </div>
    </div>
  )
}

// ─── PortionSelector ─────────────────────────────────────────────────────────

function PortionSelector({ product, barcode, onConfirm, onBack }: {
  product: OFFProduct
  barcode?: string
  onConfirm: (item: FoodItemInput) => void
  onBack: () => void
}) {
  const [menge, setMenge] = useState(String(product.serving_quantity ?? 100))
  const n = product.nutriments ?? {}
  const g = parseFloat(menge) || 0
  const f = g / 100
  const name = product.product_name_de || product.product_name || 'Unbekannt'

  const macros = {
    kalorien: Math.round((n['energy-kcal_100g'] ?? 0) * f),
    protein_g: Math.round((n.proteins_100g ?? 0) * f * 10) / 10,
    kohlenhydrate_g: Math.round((n.carbohydrates_100g ?? 0) * f * 10) / 10,
    fett_g: Math.round((n.fat_100g ?? 0) * f * 10) / 10,
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="font-semibold text-text-primary text-sm">{name}</div>
        {product.brands && <div className="text-xs text-text-muted">{product.brands}</div>}
        <div className="text-[11px] text-text-muted mt-0.5">
          pro 100g: {Math.round(n['energy-kcal_100g'] ?? 0)} kcal ·
          {' '}P:{Math.round((n.proteins_100g ?? 0) * 10) / 10}g ·
          {' '}K:{Math.round((n.carbohydrates_100g ?? 0) * 10) / 10}g ·
          {' '}F:{Math.round((n.fat_100g ?? 0) * 10) / 10}g
        </div>
      </div>
      <div>
        <label className="label">Menge (g)</label>
        <input type="number" className="input" value={menge}
          onChange={e => setMenge(e.target.value)} min="1" max="5000" autoFocus />
      </div>
      {g > 0 && (
        <div className="grid grid-cols-4 gap-2 p-3 bg-bg-elevated rounded-xl">
          {([
            { l: 'Kalorien', v: macros.kalorien, u: 'kcal' },
            { l: 'Protein', v: macros.protein_g, u: 'g' },
            { l: 'Karbs', v: macros.kohlenhydrate_g, u: 'g' },
            { l: 'Fett', v: macros.fett_g, u: 'g' },
          ] as const).map(m => (
            <div key={m.l} className="text-center">
              <div className="text-sm font-bold text-text-primary">{m.v}</div>
              <div className="text-[10px] text-text-muted">{m.u}</div>
              <div className="text-[10px] text-text-muted">{m.l}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary flex-1">Zurück</button>
        <button
          onClick={() => onConfirm({ name, menge_g: g, ...macros, barcode })}
          disabled={g <= 0}
          className="btn-primary flex-1"
        >
          Hinzufügen
        </button>
      </div>
    </div>
  )
}

// ─── AddFoodModal ─────────────────────────────────────────────────────────────

type AddTab = 'search' | 'barcode' | 'photo' | 'text' | 'rezepte' | 'manual'

function AddFoodModal({ meal, onClose, onAdd }: {
  meal: string
  onClose: () => void
  onAdd: (item: FoodItemInput) => Promise<void>
}) {
  const { user } = useAuth()
  const [tab, setTab] = useState<AddTab>('search')
  const [selectedProduct, setSelectedProduct] = useState<OFFProduct | null>(null)
  const [selectedBarcode, setSelectedBarcode] = useState<string | undefined>()
  const [barcodeInput, setBarcodeInput] = useState('')
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [barcodeError, setBarcodeError] = useState('')
  const [showLiveScanner, setShowLiveScanner] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState<FoodItemInput | null>(null)
  const [aiCorrection, setAiCorrection] = useState('')
  const photoRef = useRef<HTMLInputElement>(null)
  const photoFileRef = useRef<File | null>(null)
  const [manual, setManual] = useState({
    name: '', kalorien: '', protein_g: '', kohlenhydrate_g: '', fett_g: '', menge_g: '',
  })

  // Text-Analyse state
  const [textInput, setTextInput] = useState('')
  const [textResult, setTextResult] = useState<FoodItemInput | null>(null)
  const [textAnalyzing, setTextAnalyzing] = useState(false)
  const [textError, setTextError] = useState('')
  const [textSavedAsRezept, setTextSavedAsRezept] = useState(false)

  // Rezepte state
  const [rezepte, setRezepte] = useState<Rezept[]>([])
  const [rezepteLoading, setRezepteLoading] = useState(false)
  const [selectedRezept, setSelectedRezept] = useState<Rezept | null>(null)
  const [rezeptPortion, setRezeptPortion] = useState('1')
  const [showNewRezept, setShowNewRezept] = useState(false)
  const [newRezept, setNewRezept] = useState({ name: '', kalorien: '', protein_g: '', kohlenhydrate_g: '', fett_g: '' })
  const [savingRezept, setSavingRezept] = useState(false)

  async function lookupBarcode(code: string) {
    setBarcodeLoading(true)
    setBarcodeError('')
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
      const data = await res.json()
      const p = data.product as OFFProduct | undefined
      if (data.status === 1 && p?.nutriments?.['energy-kcal_100g']) {
        setSelectedProduct(p)
        setSelectedBarcode(code)
      } else {
        setBarcodeError('Produkt nicht gefunden. Bitte Nummer prüfen oder manuell eingeben.')
      }
    } catch {
      setBarcodeError('Netzwerkfehler. Bitte erneut versuchen.')
    }
    setBarcodeLoading(false)
  }

  function handleCameraCapture(file: File) {
    if (!('BarcodeDetector' in window)) {
      setBarcodeError('Barcode-Scanner nicht verfügbar. Bitte Nummer unten eingeben.')
      return
    }
    createImageBitmap(file)
      .then(img => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
        })
        return detector.detect(img) as Promise<Array<{ rawValue: string }>>
      })
      .then(codes => {
        if (codes.length > 0) {
          lookupBarcode(codes[0].rawValue)
        } else {
          setBarcodeError('Kein Barcode erkannt. Bitte manuell eingeben.')
        }
      })
      .catch(() => setBarcodeError('Scan fehlgeschlagen. Bitte manuell eingeben.'))
  }

  async function analyzePhoto(file: File, hint?: string) {
    photoFileRef.current = file
    setAnalyzing(true)
    setAiResult(null)
    setAiCorrection('')
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      if (!hint) setPhotoPreview(reader.result as string)
      try {
        const body: Record<string, unknown> = { imageBase64: base64, mimeType: file.type, context: 'nutrition' }
        if (hint) body.hint = hint
        const { data } = await supabase.functions.invoke('analyze-screenshot', { body })
        if (data?.result) {
          const r = data.result
          setAiResult({
            name: r.notizen || r.name || 'KI-Analyse',
            kalorien: Math.round(r.kalorien ?? 0),
            protein_g: Math.round((r.protein_g ?? 0) * 10) / 10,
            kohlenhydrate_g: Math.round((r.kohlenhydrate_g ?? 0) * 10) / 10,
            fett_g: Math.round((r.fett_g ?? 0) * 10) / 10,
            menge_g: null,
          })
        } else {
          setBarcodeError('KI konnte die Mahlzeit nicht erkennen.')
        }
      } catch {
        setBarcodeError('KI-Analyse fehlgeschlagen.')
      }
      setAnalyzing(false)
    }
    reader.readAsDataURL(file)
  }

  function correctAnalysis() {
    if (photoFileRef.current && aiCorrection.trim()) {
      analyzePhoto(photoFileRef.current, aiCorrection.trim())
    }
  }

  async function analyzeText() {
    if (!textInput.trim()) return
    setTextAnalyzing(true)
    setTextError('')
    setTextResult(null)
    setTextSavedAsRezept(false)
    try {
      const { data } = await supabase.functions.invoke('analyze-screenshot', {
        body: { recipeText: textInput.trim(), context: 'recipe_text' },
      })
      if (data?.result) {
        const r = data.result
        setTextResult({
          name: r.name || 'KI-Analyse',
          kalorien: Math.round(r.kalorien ?? 0),
          protein_g: Math.round((r.protein_g ?? 0) * 10) / 10,
          kohlenhydrate_g: Math.round((r.kohlenhydrate_g ?? 0) * 10) / 10,
          fett_g: Math.round((r.fett_g ?? 0) * 10) / 10,
          menge_g: null,
        })
      } else {
        setTextError('Analyse fehlgeschlagen. Bitte erneut versuchen.')
      }
    } catch {
      setTextError('Fehler bei der Analyse.')
    }
    setTextAnalyzing(false)
  }

  async function saveAsRezept(item: FoodItemInput) {
    if (!user) return
    await supabase.from('rezepte').insert({
      user_id: user.id,
      name: item.name,
      zutaten_text: textInput || null,
      portionen: 1,
      kalorien: item.kalorien,
      protein_g: item.protein_g,
      kohlenhydrate_g: item.kohlenhydrate_g,
      fett_g: item.fett_g,
    })
    setTextSavedAsRezept(true)
  }

  async function loadRezepte() {
    if (!user) return
    setRezepteLoading(true)
    const { data } = await supabase
      .from('rezepte')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setRezepte((data ?? []) as Rezept[])
    setRezepteLoading(false)
  }

  async function createRezept() {
    if (!user || !newRezept.name || !newRezept.kalorien) return
    setSavingRezept(true)
    const { data } = await supabase.from('rezepte').insert({
      user_id: user.id,
      name: newRezept.name,
      portionen: 1,
      kalorien: parseInt(newRezept.kalorien),
      protein_g: parseFloat(newRezept.protein_g) || null,
      kohlenhydrate_g: parseFloat(newRezept.kohlenhydrate_g) || null,
      fett_g: parseFloat(newRezept.fett_g) || null,
    }).select().single()
    if (data) setRezepte(prev => [data as Rezept, ...prev])
    setNewRezept({ name: '', kalorien: '', protein_g: '', kohlenhydrate_g: '', fett_g: '' })
    setShowNewRezept(false)
    setSavingRezept(false)
  }

  async function handleAdd(item: FoodItemInput) {
    setSaving(true)
    await onAdd(item)
    setSaving(false)
  }

  function switchTab(t: AddTab) {
    setTab(t)
    setSelectedProduct(null)
    setSelectedBarcode(undefined)
    setBarcodeError('')
    setTextResult(null)
    setTextError('')
    setSelectedRezept(null)
    setRezeptPortion('1')
    setShowNewRezept(false)
    if (t === 'rezepte' && rezepte.length === 0) loadRezepte()
  }

  const TABS: { id: AddTab; emoji: string; label: string }[] = [
    { id: 'search', emoji: '🔍', label: 'Suchen' },
    { id: 'barcode', emoji: '📷', label: 'Barcode' },
    { id: 'photo', emoji: '✨', label: 'KI-Foto' },
    { id: 'text', emoji: '📝', label: 'KI-Text' },
    { id: 'rezepte', emoji: '📖', label: 'Rezepte' },
    { id: 'manual', emoji: '✏️', label: 'Manuell' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full rounded-t-4xl overflow-y-auto bg-bg-card"
        style={{ maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-4 pt-3 pb-3 border-b border-border bg-bg-card">
          <div className="w-10 h-1 bg-border-light rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-primary text-sm">Hinzufügen — {meal}</h3>
            <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary rounded-lg">
              <X size={16} />
            </button>
          </div>
          <div className="flex gap-0.5 bg-bg rounded-xl p-0.5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-all ${
                  tab === t.id ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span className="text-sm">{t.emoji}</span>
                <span className="text-[11px] font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          {selectedProduct && (tab === 'search' || tab === 'barcode') ? (
            <PortionSelector
              product={selectedProduct}
              barcode={selectedBarcode}
              onConfirm={item => handleAdd(item)}
              onBack={() => { setSelectedProduct(null); setSelectedBarcode(undefined) }}
            />
          ) : (
            <>
              {tab === 'search' && (
                <FoodSearch onSelect={p => { setSelectedProduct(p); setSelectedBarcode(undefined) }} />
              )}

              {tab === 'barcode' && (
                <div className="space-y-4">
                  {showLiveScanner && (
                    <LiveBarcodeScanner
                      onDetected={code => { setShowLiveScanner(false); lookupBarcode(code) }}
                      onClose={() => setShowLiveScanner(false)}
                    />
                  )}
                  {barcodeLoading ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <Spinner />
                      <p className="text-sm text-text-secondary">Produkt wird geladen...</p>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowLiveScanner(true)}
                        className="w-full flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-border hover:border-brand/50 hover:bg-brand/5 transition-colors"
                      >
                        <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center">
                          <ScanLine size={26} className="text-brand" />
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-text-primary text-sm">Live-Kamera starten</div>
                          <div className="text-xs text-text-muted mt-0.5">Barcode in Echtzeit scannen</div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-text-muted whitespace-nowrap">oder Nummer eingeben</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text" inputMode="numeric" className="input flex-1"
                          placeholder="Barcode-Nummer (z.B. 4008400401836)"
                          value={barcodeInput}
                          onChange={e => setBarcodeInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && barcodeInput) lookupBarcode(barcodeInput) }}
                        />
                        <button
                          onClick={() => lookupBarcode(barcodeInput)}
                          disabled={!barcodeInput}
                          className="btn-primary shrink-0 px-4 text-sm"
                        >
                          Suchen
                        </button>
                      </div>
                      {barcodeError && <p className="text-sm text-danger text-center">{barcodeError}</p>}
                    </>
                  )}
                </div>
              )}

              {tab === 'photo' && (
                <div className="space-y-4">
                  <input
                    ref={photoRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) analyzePhoto(f) }}
                  />
                  {!photoPreview ? (
                    <button
                      onClick={() => photoRef.current?.click()}
                      className="w-full flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-border hover:border-brand/50 transition-colors"
                    >
                      <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center">
                        <Camera size={24} className="text-brand" />
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-text-primary flex items-center gap-1.5 justify-center">
                          <Sparkles size={13} className="text-warning" /> KI-Foto-Analyse
                        </div>
                        <div className="text-xs text-text-muted mt-1">
                          Foto der Mahlzeit, Verpackung oder Rezept
                        </div>
                      </div>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative">
                        <img src={photoPreview} alt="Mahlzeit" className="w-full h-44 object-cover rounded-xl" />
                        <button
                          onClick={() => { setPhotoPreview(null); setAiResult(null) }}
                          className="absolute top-2 right-2 p-1 rounded-full text-white"
                          style={{ background: 'rgba(0,0,0,0.55)' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {analyzing ? (
                        <div className="flex items-center gap-3 p-3 bg-bg-elevated rounded-xl">
                          <Spinner size={18} />
                          <span className="text-sm text-text-secondary">KI analysiert Mahlzeit...</span>
                        </div>
                      ) : aiResult ? (
                        <div className="space-y-3">
                          {/* Macro result card */}
                          <div className="p-3 bg-bg-elevated rounded-xl space-y-3">
                            <div className="text-xs text-text-muted flex items-center gap-1">
                              <Sparkles size={11} className="text-warning" />
                              KI hat erkannt:
                            </div>
                            <div className="text-sm font-semibold text-text-primary">{aiResult.name}</div>
                            <div className="grid grid-cols-2 gap-2">
                              {([
                                { l: 'Kalorien', v: aiResult.kalorien, u: 'kcal', color: 'text-brand' },
                                { l: 'Protein', v: aiResult.protein_g, u: 'g', color: 'text-info' },
                                { l: 'Kohlenhydrate', v: aiResult.kohlenhydrate_g, u: 'g', color: 'text-warning' },
                                { l: 'Fett', v: aiResult.fett_g, u: 'g', color: 'text-success' },
                              ] as const).map(m => (
                                <div key={m.l} className="flex items-center justify-between bg-bg-card rounded-lg px-3 py-2">
                                  <span className="text-xs text-text-muted">{m.l}</span>
                                  <span className={`text-sm font-bold ${m.color}`}>{m.v} {m.u}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Correction text box */}
                          <div className="space-y-2">
                            <div className="text-xs text-text-muted">Falsch erkannt? Korrigieren:</div>
                            <div className="flex gap-2">
                              <input
                                className="input flex-1 text-sm"
                                placeholder='z.B. "Lachs mit Reis"'
                                value={aiCorrection}
                                onChange={e => setAiCorrection(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && correctAnalysis()}
                              />
                              <button
                                onClick={correctAnalysis}
                                disabled={!aiCorrection.trim() || analyzing}
                                className="btn-secondary px-3 text-sm flex items-center gap-1.5 shrink-0"
                              >
                                <Sparkles size={13} className="text-warning" />
                                Neu
                              </button>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => { setPhotoPreview(null); setAiResult(null); setAiCorrection(''); photoFileRef.current = null }}
                              className="btn-secondary flex-1 text-sm"
                            >
                              Verwerfen
                            </button>
                            <button
                              onClick={() => handleAdd(aiResult)}
                              disabled={saving}
                              className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm"
                            >
                              {saving ? <Spinner size={14} /> : <Check size={14} />}
                              Hinzufügen
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {tab === 'text' && (
                <div className="space-y-4">
                  {!textResult ? (
                    <>
                      <div>
                        <label className="label flex items-center gap-1.5">
                          <FileText size={13} className="text-brand" />
                          Rezept oder Zutaten einfügen
                        </label>
                        <textarea
                          className="input resize-none"
                          rows={7}
                          placeholder={"z.B.:\n200g Hähnchenbrust\n100g Basmati-Reis\n50g Brokkoli\n1 EL Olivenöl\n\noder ganzes Rezept einfügen..."}
                          value={textInput}
                          onChange={e => setTextInput(e.target.value)}
                          autoFocus
                        />
                        <div className="text-right text-[11px] text-text-muted mt-1">
                          {textInput.length} / 10.000
                        </div>
                      </div>
                      {textError && <p className="text-sm text-danger text-center">{textError}</p>}
                      <button
                        onClick={analyzeText}
                        disabled={!textInput.trim() || textAnalyzing}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                      >
                        {textAnalyzing ? (
                          <><Spinner size={14} /> KI analysiert...</>
                        ) : (
                          <><Sparkles size={14} className="text-warning" /> Analysieren</>
                        )}
                      </button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-bg-elevated rounded-xl">
                        <div className="text-sm font-medium text-text-primary mb-2">{textResult.name}</div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          {([
                            { l: 'Kalorien', v: textResult.kalorien, u: 'kcal' },
                            { l: 'Protein', v: textResult.protein_g, u: 'g' },
                            { l: 'Karbs', v: textResult.kohlenhydrate_g, u: 'g' },
                            { l: 'Fett', v: textResult.fett_g, u: 'g' },
                          ] as const).map(m => (
                            <div key={m.l}>
                              <div className="text-sm font-bold text-text-primary">{m.v}</div>
                              <div className="text-[10px] text-text-muted">{m.u}</div>
                              <div className="text-[10px] text-text-muted">{m.l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setTextResult(null); setTextSavedAsRezept(false) }}
                          className="btn-secondary flex-1 text-sm"
                        >
                          Neu
                        </button>
                        <button
                          onClick={() => handleAdd(textResult)}
                          disabled={saving}
                          className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm"
                        >
                          {saving ? <Spinner size={14} /> : <Check size={14} />}
                          Hinzufügen
                        </button>
                      </div>
                      <button
                        onClick={() => saveAsRezept(textResult)}
                        disabled={textSavedAsRezept}
                        className="w-full text-xs text-center py-2 rounded-xl border border-border hover:border-brand/50 text-text-secondary hover:text-brand transition-colors disabled:opacity-50"
                      >
                        {textSavedAsRezept ? '✓ Als Rezept gespeichert' : '+ Als Rezept speichern'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === 'rezepte' && (
                <div className="space-y-3">
                  {selectedRezept ? (
                    <div className="space-y-4">
                      <div className="p-3 bg-bg-elevated rounded-xl">
                        <div className="text-sm font-medium text-text-primary mb-1">{selectedRezept.name}</div>
                        <div className="text-[11px] text-text-muted mb-3">
                          pro Portion: {selectedRezept.kalorien} kcal ·
                          P:{selectedRezept.protein_g ?? 0}g ·
                          K:{selectedRezept.kohlenhydrate_g ?? 0}g ·
                          F:{selectedRezept.fett_g ?? 0}g
                        </div>
                        <label className="label">Portionen</label>
                        <input
                          type="number" className="input" min="0.25" step="0.25"
                          value={rezeptPortion}
                          onChange={e => setRezeptPortion(e.target.value)}
                          autoFocus
                        />
                        {parseFloat(rezeptPortion) > 0 && (
                          <div className="grid grid-cols-4 gap-2 text-center mt-3 p-2 bg-bg rounded-xl">
                            {([
                              { l: 'Kalorien', v: Math.round(selectedRezept.kalorien * parseFloat(rezeptPortion)), u: 'kcal' },
                              { l: 'Protein', v: Math.round((selectedRezept.protein_g ?? 0) * parseFloat(rezeptPortion) * 10) / 10, u: 'g' },
                              { l: 'Karbs', v: Math.round((selectedRezept.kohlenhydrate_g ?? 0) * parseFloat(rezeptPortion) * 10) / 10, u: 'g' },
                              { l: 'Fett', v: Math.round((selectedRezept.fett_g ?? 0) * parseFloat(rezeptPortion) * 10) / 10, u: 'g' },
                            ] as const).map(m => (
                              <div key={m.l}>
                                <div className="text-sm font-bold text-text-primary">{m.v}</div>
                                <div className="text-[10px] text-text-muted">{m.u}</div>
                                <div className="text-[10px] text-text-muted">{m.l}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setSelectedRezept(null)} className="btn-secondary flex-1 text-sm">
                          Zurück
                        </button>
                        <button
                          onClick={() => {
                            const p = parseFloat(rezeptPortion) || 1
                            handleAdd({
                              name: selectedRezept.name,
                              kalorien: Math.round(selectedRezept.kalorien * p),
                              protein_g: Math.round((selectedRezept.protein_g ?? 0) * p * 10) / 10,
                              kohlenhydrate_g: Math.round((selectedRezept.kohlenhydrate_g ?? 0) * p * 10) / 10,
                              fett_g: Math.round((selectedRezept.fett_g ?? 0) * p * 10) / 10,
                              menge_g: null,
                            })
                          }}
                          disabled={!rezeptPortion || saving}
                          className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm"
                        >
                          {saving ? <Spinner size={14} /> : <Check size={14} />}
                          Hinzufügen
                        </button>
                      </div>
                    </div>
                  ) : rezepteLoading ? (
                    <div className="flex justify-center py-10"><Spinner size={28} /></div>
                  ) : (
                    <>
                      {rezepte.length === 0 && !showNewRezept && (
                        <div className="flex flex-col items-center gap-3 py-8 text-center">
                          <BookOpen size={32} className="text-text-muted opacity-40" />
                          <div className="text-sm text-text-muted">Noch keine Rezepte gespeichert</div>
                          <div className="text-xs text-text-muted">
                            Analyse im KI-Text Tab oder erstelle manuell.
                          </div>
                        </div>
                      )}
                      {rezepte.length > 0 && !showNewRezept && (
                        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 260 }}>
                          {rezepte.map(r => (
                            <button
                              key={r.id}
                              onClick={() => { setSelectedRezept(r); setRezeptPortion('1') }}
                              className="w-full flex items-center justify-between p-3 rounded-xl bg-bg-elevated hover:bg-brand/10 text-left transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-text-primary truncate">{r.name}</div>
                                <div className="text-xs text-text-muted">pro Portion</div>
                              </div>
                              <div className="text-right text-xs ml-3 shrink-0">
                                <div className="font-semibold text-text-primary">{r.kalorien} kcal</div>
                                <div className="text-text-secondary">
                                  P:{r.protein_g ?? 0} K:{r.kohlenhydrate_g ?? 0} F:{r.fett_g ?? 0}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {showNewRezept ? (
                        <div className="space-y-3 border border-border rounded-xl p-3">
                          <div className="text-sm font-medium text-text-primary">Neues Rezept</div>
                          <div>
                            <label className="label">Name *</label>
                            <input type="text" className="input" placeholder="z.B. Hähnchen-Reis-Bowl"
                              value={newRezept.name} onChange={e => setNewRezept(r => ({ ...r, name: e.target.value }))} autoFocus />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="label">Kalorien (kcal) *</label>
                              <input type="number" className="input" placeholder="500"
                                value={newRezept.kalorien} onChange={e => setNewRezept(r => ({ ...r, kalorien: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">Protein (g)</label>
                              <input type="number" step="0.1" className="input" placeholder="40"
                                value={newRezept.protein_g} onChange={e => setNewRezept(r => ({ ...r, protein_g: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">Kohlenhydrate (g)</label>
                              <input type="number" step="0.1" className="input" placeholder="50"
                                value={newRezept.kohlenhydrate_g} onChange={e => setNewRezept(r => ({ ...r, kohlenhydrate_g: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">Fett (g)</label>
                              <input type="number" step="0.1" className="input" placeholder="12"
                                value={newRezept.fett_g} onChange={e => setNewRezept(r => ({ ...r, fett_g: e.target.value }))} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setShowNewRezept(false)} className="btn-secondary flex-1 text-sm">Abbrechen</button>
                            <button
                              onClick={createRezept}
                              disabled={!newRezept.name || !newRezept.kalorien || savingRezept}
                              className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm"
                            >
                              {savingRezept ? <Spinner size={14} /> : <Check size={14} />}
                              Speichern
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowNewRezept(true)}
                          className="w-full py-2.5 text-xs text-text-muted border border-dashed border-border/50 rounded-xl hover:border-brand/30 hover:text-brand transition-colors"
                        >
                          + Neues Rezept erstellen
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {tab === 'manual' && (
                <div className="space-y-4">
                  <div>
                    <label className="label">Name *</label>
                    <input
                      type="text" className="input" placeholder="z.B. Haferflocken"
                      value={manual.name}
                      onChange={e => setManual(m => ({ ...m, name: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Menge (g)</label>
                      <input type="number" className="input" placeholder="100"
                        value={manual.menge_g}
                        onChange={e => setManual(m => ({ ...m, menge_g: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Kalorien (kcal) *</label>
                      <input type="number" className="input" placeholder="350"
                        value={manual.kalorien}
                        onChange={e => setManual(m => ({ ...m, kalorien: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Protein (g)</label>
                      <input type="number" step="0.1" className="input" placeholder="12"
                        value={manual.protein_g}
                        onChange={e => setManual(m => ({ ...m, protein_g: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Kohlenhydrate (g)</label>
                      <input type="number" step="0.1" className="input" placeholder="50"
                        value={manual.kohlenhydrate_g}
                        onChange={e => setManual(m => ({ ...m, kohlenhydrate_g: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Fett (g)</label>
                      <input type="number" step="0.1" className="input" placeholder="8"
                        value={manual.fett_g}
                        onChange={e => setManual(m => ({ ...m, fett_g: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={onClose} className="btn-secondary flex-1 text-sm">Abbrechen</button>
                    <button
                      onClick={() => handleAdd({
                        name: manual.name,
                        kalorien: parseInt(manual.kalorien) || 0,
                        protein_g: parseFloat(manual.protein_g) || 0,
                        kohlenhydrate_g: parseFloat(manual.kohlenhydrate_g) || 0,
                        fett_g: parseFloat(manual.fett_g) || 0,
                        menge_g: manual.menge_g ? parseFloat(manual.menge_g) : null,
                      })}
                      disabled={!manual.name || !manual.kalorien || saving}
                      className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm"
                    >
                      {saving && <Spinner size={14} />}
                      Hinzufügen
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MealSection ─────────────────────────────────────────────────────────────

function MealSection({ meal, items, onAdd, onDelete }: {
  meal: typeof MEALS[number]
  items: FoodLogItem[]
  onAdd: () => void
  onDelete: (id: string) => void
}) {
  const kcal = Math.round(items.reduce((a, i) => a + (i.kalorien ?? 0), 0))
  const prot = Math.round(items.reduce((a, i) => a + (i.protein_g ?? 0), 0) * 10) / 10

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{meal.icon}</span>
          <div>
            <div className="font-semibold text-text-primary text-sm">{meal.id}</div>
            {kcal > 0 && (
              <div className="text-xs text-text-secondary">{kcal} kcal · {prot}g Protein</div>
            )}
          </div>
        </div>
        <button
          onClick={onAdd}
          aria-label={`${meal.id}: Eintrag hinzufügen`}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-brand/10 text-brand hover:bg-brand/20 transition-colors shrink-0"
        >
          <Plus size={14} />
        </button>
      </div>

      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2.5 py-2 px-2.5 rounded-xl bg-bg">
              <div className="w-1.5 h-7 rounded-full shrink-0" style={{ backgroundColor: tokenColor(meal.color) }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary truncate">{item.name}</div>
                <div className="text-xs text-text-secondary">
                  {item.kalorien} kcal
                  {item.menge_g ? ` · ${item.menge_g}g` : ''}
                  {item.protein_g ? ` · P: ${item.protein_g}g` : ''}
                </div>
              </div>
              <button
                onClick={() => onDelete(item.id)}
                aria-label={`${item.name} löschen`}
                className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <button
          onClick={onAdd}
          className="w-full py-2.5 text-xs text-text-muted border border-dashed border-border/50 rounded-xl hover:border-brand/30 hover:text-text-secondary transition-colors"
        >
          + Lebensmittel hinzufügen
        </button>
      )}
    </div>
  )
}

// ─── Nutrition Page ───────────────────────────────────────────────────────────

export function Nutrition() {
  const { user } = useAuth()
  const { character } = useGame()
  const [date, setDate] = useState(todayISO())
  const [tab, setTab] = useState<'ernaehrung' | 'bilanz'>('ernaehrung')
  const [items, setItems] = useState<FoodLogItem[]>([])
  const [water, setWater] = useState<WasserLogEntry[]>([])
  const [waterGoal, setWaterGoal] = useState(DEFAULT_WATER_GOAL_ML)
  const [bottleMl, setBottleMl] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem(BOTTLE_KEY) ?? ''); return v >= 100 && v <= 2000 ? v : 500 } catch { return 500 }
  })
  const [burnedKcal, setBurnedKcal] = useState(0)
  const [goals, setGoals] = useState<NutritionGoals>({
    kalorie_tagesziel: 2000,
    protein_ziel: 150,
    karbs_ziel: 250,
    fett_ziel: 70,
  })
  const [loading, setLoading] = useState(true)
  const [addingToMeal, setAddingToMeal] = useState<string | null>(null)

  const today = todayISO()

  async function load() {
    if (!user) return
    const [foodRes, waterRes, goalsRes, trainingRes] = await Promise.all([
      supabase.from('food_log').select('*').eq('user_id', user.id).eq('datum', date).order('created_at'),
      supabase.from('wasser_log').select('*').eq('user_id', user.id).eq('datum', date).order('created_at'),
      supabase.from('client_settings')
        .select('kalorie_tagesziel,protein_ziel,karbs_ziel,fett_ziel,wasser_ziel_ml')
        .eq('user_id', user.id).single(),
      supabase.from('training').select('kalorien_verbrannt').eq('user_id', user.id).eq('datum', date),
    ])
    setItems((foodRes.data ?? []) as FoodLogItem[])
    setWater((waterRes.data ?? []) as WasserLogEntry[])
    const burned = ((trainingRes.data ?? []) as { kalorien_verbrannt: number | null }[])
      .reduce((sum, r) => sum + (r.kalorien_verbrannt ?? 0), 0)
    setBurnedKcal(burned)
    if (goalsRes.data) {
      const d = goalsRes.data as Partial<NutritionGoals> & { wasser_ziel_ml?: number | null }
      if (d.wasser_ziel_ml) setWaterGoal(d.wasser_ziel_ml)
      setGoals(g => ({
        kalorie_tagesziel: d.kalorie_tagesziel ?? g.kalorie_tagesziel,
        protein_ziel: d.protein_ziel ?? g.protein_ziel,
        karbs_ziel: d.karbs_ziel ?? g.karbs_ziel,
        fett_ziel: d.fett_ziel ?? g.fett_ziel,
      }))
    }
    setLoading(false)
  }

  useEffect(() => { setLoading(true); load() }, [user, date])

  // Flaschengröße: gespeicherter Wert aus den Einstellungen (Spalte kommt per Migration, deshalb getrennt und ohne Fehlerfolgen)
  useEffect(() => {
    if (!user) return
    supabase.from('client_settings').select('wasser_flasche_ml').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      const v = (data as { wasser_flasche_ml?: number | null } | null)?.wasser_flasche_ml
      if (v && v >= 100 && v <= 2000) setBottleMl(v)
    })
  }, [user])

  function handleBottleChange(ml: number) {
    setBottleMl(ml)
    try { localStorage.setItem(BOTTLE_KEY, String(ml)) } catch { /* privater Modus */ }
    if (user) void supabase.from('client_settings').update({ wasser_flasche_ml: ml } as never).eq('user_id', user.id)
  }

  const totals = {
    kalorien: Math.round(items.reduce((a, i) => a + (i.kalorien ?? 0), 0)),
    protein_g: Math.round(items.reduce((a, i) => a + (i.protein_g ?? 0), 0) * 10) / 10,
    kohlenhydrate_g: Math.round(items.reduce((a, i) => a + (i.kohlenhydrate_g ?? 0), 0) * 10) / 10,
    fett_g: Math.round(items.reduce((a, i) => a + (i.fett_g ?? 0), 0) * 10) / 10,
  }

  async function handleAdd(meal: string, item: FoodItemInput) {
    if (!user) return
    const { data } = await supabase.from('food_log').insert({
      user_id: user.id,
      datum: date,
      mahlzeit: meal,
      name: item.name,
      menge_g: item.menge_g,
      kalorien: item.kalorien,
      protein_g: item.protein_g,
      kohlenhydrate_g: item.kohlenhydrate_g,
      fett_g: item.fett_g,
      barcode: item.barcode ?? null,
    }).select().single()
    if (data) setItems(prev => [...prev, data as FoodLogItem])
    setAddingToMeal(null)
  }

  async function handleDelete(id: string) {
    await supabase.from('food_log').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function handleAddWater(ml: number) {
    if (!user) return
    // Sofort anzeigen, dann speichern: so reagiert der Tank ohne Wartezeit
    const temp: WasserLogEntry = { id: `tmp-${Date.now()}`, user_id: user.id, datum: date, menge_ml: ml, created_at: new Date().toISOString() }
    setWater(prev => [...prev, temp])
    const { data } = await supabase.from('wasser_log').insert({ user_id: user.id, datum: date, menge_ml: ml }).select().single()
    setWater(prev => prev.map(w => (w.id === temp.id ? ((data as WasserLogEntry | null) ?? w) : w)))
  }

  async function handleRemoveLastWater() {
    const last = water[water.length - 1]
    if (!last) return
    setWater(prev => prev.slice(0, -1))
    if (!last.id.startsWith('tmp-')) await supabase.from('wasser_log').delete().eq('id', last.id)
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setDate(shiftDate(date, -1))}
          aria-label="Vorheriger Tag"
          className="p-2 rounded-xl hover:bg-bg-elevated transition-colors text-text-secondary"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <div className="font-semibold text-text-primary">{formatDateLabel(date)}</div>
          <div className="text-xs text-text-muted">
            {new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
              day: '2-digit', month: 'long', year: 'numeric',
            })}
          </div>
        </div>
        <button
          onClick={() => { if (date < today) setDate(shiftDate(date, 1)) }}
          disabled={date >= today}
          aria-label="Nächster Tag"
          className={`p-2 rounded-xl transition-colors ${
            date >= today ? 'text-text-muted opacity-40 cursor-not-allowed' : 'hover:bg-bg-elevated text-text-secondary'
          }`}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-bg-elevated rounded-xl">
        {(['ernaehrung', 'bilanz'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {t === 'ernaehrung' ? 'Ernährung' : 'Bilanz'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={36} /></div>
      ) : tab === 'ernaehrung' ? (
        <>
          {/* Calorie ring + macros */}
          <div className="card">
            <div className="flex items-center gap-4">
              <CalorieRing eaten={totals.kalorien} goal={goals.kalorie_tagesziel} />
              <div className="flex-1 space-y-3">
                <MacroBar label="Protein" value={totals.protein_g} goal={goals.protein_ziel} color="info" />
                <MacroBar label="Kohlenhydrate" value={totals.kohlenhydrate_g} goal={goals.karbs_ziel} color="warning" />
                <MacroBar label="Fett" value={totals.fett_g} goal={goals.fett_ziel} color="success" />
              </div>
            </div>
          </div>

          {/* Meal sections */}
          {MEALS.map(meal => (
            <MealSection
              key={meal.id}
              meal={meal}
              items={items.filter(i => i.mahlzeit === meal.id)}
              onAdd={() => setAddingToMeal(meal.id)}
              onDelete={handleDelete}
            />
          ))}

          {/* Water */}
          <WaterCard
            totalMl={water.reduce((a, w) => a + w.menge_ml, 0)}
            goalMl={waterGoal}
            entries={water.length}
            bottleMl={bottleMl}
            onBottleChange={handleBottleChange}
            onAdd={handleAddWater}
            onRemoveLast={handleRemoveLastWater}
            avatar={character?.config}
            equipped={character?.equipped}
          />
        </>
      ) : (
        /* ── Bilanz Tab ── */
        <div className="space-y-4">
          <div className="card flex flex-col items-center py-6 gap-4">
            <h3 className="text-sm font-semibold text-text-primary self-start">Kalorien-Bilanz</h3>
            <CalorieBilanzRing
              consumed={totals.kalorien}
              burned={burnedKcal}
              goal={goals.kalorie_tagesziel}
            />
            <div className="w-full border-t border-border pt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-base font-bold text-text-primary">{totals.kalorien}</div>
                <div className="text-text-muted">gegessen</div>
              </div>
              <div>
                <div className="text-base font-bold text-danger">{burnedKcal}</div>
                <div className="text-text-muted">verbrannt</div>
              </div>
              <div>
                <div className="text-base font-bold text-text-primary">{goals.kalorie_tagesziel}</div>
                <div className="text-text-muted">Ziel</div>
              </div>
            </div>
          </div>

          {burnedKcal === 0 && (
            <div className="card text-center py-5 text-sm text-text-muted">
              Noch kein Training für diesen Tag eingetragen.
              <br />
              <span className="text-xs">Trage Training mit Kalorien-Angabe ein — es erscheint hier automatisch.</span>
            </div>
          )}
        </div>
      )}

      {addingToMeal && (
        <AddFoodModal
          meal={addingToMeal}
          onClose={() => setAddingToMeal(null)}
          onAdd={item => handleAdd(addingToMeal, item)}
        />
      )}
    </div>
  )
}
