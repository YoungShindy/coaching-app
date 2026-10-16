import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Globe, Minus, Package, Plus, Search, Sparkles } from 'lucide-react'
import { Spinner } from '../ui/Spinner'
import { cn } from '../../lib/utils'
import {
  POPULAR_SEARCHES,
  fetchWebUnits,
  formatAmount,
  isPackUnit,
  loadCustomUnits,
  macrosFor,
  normalize,
  resolveEntry,
  saveCustomUnit,
  searchLocalFoods,
  searchOpenFoodFacts,
  searchWebFoods,
  type FoodEntry,
  type FoodUnit,
} from '../../lib/foodDb'

export interface FoodItemInput {
  name: string
  menge_g: number | null
  kalorien: number
  protein_g: number
  kohlenhydrate_g: number
  fett_g: number
  barcode?: string
}

// ─── Suche ────────────────────────────────────────────────────────────────────────────────────────

function MacroPills({ entry }: { entry: FoodEntry }) {
  const { protein, carbs, fat } = entry.per100
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 text-[11px] font-medium">
      <span className="px-2 py-0.5 rounded-full bg-info/10 text-info">P {formatAmount(protein)} g</span>
      <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning">K {formatAmount(carbs)} g</span>
      <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent">F {formatAmount(fat)} g</span>
    </div>
  )
}

function FoodCard({ entry, onSelect }: { entry: FoodEntry; onSelect: (entry: FoodEntry) => void }) {
  const hasVariants = !!entry.groups?.length
  const pieceUnit = entry.units[0]
  return (
    <button
      onClick={() => onSelect(entry)}
      className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl bg-bg-elevated hover:bg-brand/10 active:scale-[0.99] text-left transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="text-base sm:text-lg font-semibold text-text-primary leading-snug">{entry.name}</div>
        {entry.brand && <div className="text-sm text-text-muted truncate">{entry.brand}</div>}
        <MacroPills entry={entry} />
        {(hasVariants || pieceUnit) && (
          <div className="text-xs text-text-muted mt-2">
            {hasVariants && entry.groups!.map(group => group.name).join(' & ')}
            {hasVariants && pieceUnit && ' · '}
            {pieceUnit && `${pieceUnit.label} ca. ${formatAmount(pieceUnit.grams)} g`}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="text-xl font-bold text-text-primary leading-none">{Math.round(entry.per100.kcal)}</div>
        <div className="text-[11px] text-text-muted mt-1">kcal / 100 g</div>
      </div>
    </button>
  )
}

function SectionTitle({ icon, children, busy }: { icon: React.ReactNode; children: React.ReactNode; busy?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
      {icon}
      <span>{children}</span>
      {busy && <Spinner size={12} />}
    </div>
  )
}

export function FoodSearchPanel({ onSelect }: { onSelect: (entry: FoodEntry) => void }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [webFoods, setWebFoods] = useState<FoodEntry[]>([])
  const [products, setProducts] = useState<FoodEntry[]>([])
  const [webBusy, setWebBusy] = useState(false)
  const [productsBusy, setProductsBusy] = useState(false)
  const [productsFailed, setProductsFailed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 450)
    return () => window.clearTimeout(timer)
  }, [query])

  const localFoods = useMemo(() => searchLocalFoods(query), [query])

  useEffect(() => {
    setWebFoods([])
    setProducts([])
    setProductsFailed(false)
    if (debounced.length < 2) { setWebBusy(false); setProductsBusy(false); return }
    const controller = new AbortController()
    let stale = false

    setProductsBusy(true)
    searchOpenFoodFacts(debounced, controller.signal)
      .then(found => { if (!stale) setProducts(found) })
      .catch(() => { if (!stale && !controller.signal.aborted) setProductsFailed(true) })
      .finally(() => { if (!stale) setProductsBusy(false) })

    // Das Internet nur fragen, wenn die eingebaute Liste nicht schon genug liefert
    if (debounced.length >= 3 && searchLocalFoods(debounced).length < 3) {
      setWebBusy(true)
      searchWebFoods(debounced)
        .then(found => { if (!stale) setWebFoods(found) })
        .catch(() => { /* Internet-Suche ist optional */ })
        .finally(() => { if (!stale) setWebBusy(false) })
    } else {
      setWebBusy(false)
    }
    return () => { stale = true; controller.abort() }
  }, [debounced])

  const localNames = new Set(localFoods.map(food => normalize(food.name)))
  const webList = webFoods.filter(food => !localNames.has(normalize(food.name)))
  const webNames = new Set(webList.map(food => normalize(`${food.name} ${food.brand ?? ''}`)))
  const productList = products.filter(product => !webNames.has(normalize(`${product.name} ${product.brand ?? ''}`)))
  const common = [...localFoods, ...webList.filter(food => !food.brand)]
  const brands = [...webList.filter(food => !!food.brand), ...productList]

  const searching = debounced !== query.trim() || webBusy || productsBusy
  const nothing = debounced.length >= 2 && !searching && common.length === 0 && brands.length === 0

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          type="search"
          enterKeyHint="search"
          className="input !pl-12 !py-4 !text-lg !rounded-2xl"
          placeholder="Lebensmittel suchen, z. B. Banane, Hanuta …"
          value={query}
          onChange={event => setQuery(event.target.value)}
          autoFocus
        />
      </div>

      {query.trim().length < 2 && (
        <div className="space-y-3 pt-2">
          <div className="text-sm text-text-secondary">Beliebt</div>
          <div className="flex flex-wrap gap-2">
            {POPULAR_SEARCHES.map(term => (
              <button
                key={term}
                onClick={() => setQuery(term)}
                className="px-4 py-2.5 rounded-full bg-bg-elevated text-sm font-medium text-text-primary hover:bg-brand/10 active:scale-95 transition-all"
              >
                {term}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted leading-relaxed pt-2">
            Du findest allgemeine Lebensmittel mit Größen und Reifegraden (z. B. Banane klein bis groß, grün bis sehr reif)
            sowie Markenprodukte wie Hanuta oder Prinzenrolle. Die Menge gibst du in Gramm oder pro Stück an.
          </p>
        </div>
      )}

      {common.length > 0 && (
        <div className="space-y-2.5">
          <SectionTitle icon={<Sparkles size={13} />}>Lebensmittel</SectionTitle>
          {common.map(entry => <FoodCard key={entry.id} entry={entry} onSelect={onSelect} />)}
        </div>
      )}

      {(brands.length > 0 || (webBusy && common.length === 0)) && (
        <div className="space-y-2.5">
          <SectionTitle icon={<Globe size={13} />} busy={webBusy || productsBusy}>Produkte &amp; Marken</SectionTitle>
          {brands.map(entry => <FoodCard key={entry.id} entry={entry} onSelect={onSelect} />)}
        </div>
      )}

      {searching && query.trim().length >= 2 && common.length === 0 && brands.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-text-secondary">
          <Spinner />
          Suche im Internet …
        </div>
      )}

      {nothing && (
        <div className="text-center py-12 text-text-muted">
          <p className="text-base">Nichts gefunden.</p>
          <p className="text-sm mt-1">
            {productsFailed
              ? 'Die Produkt-Datenbank ist gerade nicht erreichbar. Prüfe deine Verbindung oder nutze „Manuell“.'
              : 'Versuche einen anderen Begriff, den Barcode oder „Manuell“.'}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Menge wählen (Gramm oder Einheiten) ──────────────────────────────────────────────────────────

const GRAM = 'g'

function Chip({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'px-4 py-2.5 rounded-full text-sm font-semibold border transition-all active:scale-95 disabled:opacity-50',
        active ? 'bg-primary border-brand text-white' : 'bg-bg-elevated border-border text-text-secondary hover:border-brand/40',
      )}
    >
      {children}
    </button>
  )
}

export function PortionPicker({ entry, onConfirm, onBack, busy }: {
  entry: FoodEntry
  onConfirm: (item: FoodItemInput) => void
  onBack: () => void
  busy?: boolean
}) {
  const [choice, setChoice] = useState<number[]>(() => (entry.groups ?? []).map(group => group.defaultIndex ?? 0))
  const [webUnits, setWebUnits] = useState<FoodUnit[]>([])
  const [customUnits, setCustomUnits] = useState<FoodUnit[]>(() => loadCustomUnits(entry))
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [unit, setUnit] = useState<string>(() => [...entry.units, ...loadCustomUnits(entry)].find(u => !isPackUnit(u.label))?.label ?? GRAM)
  const [amount, setAmount] = useState(() => ([...entry.units, ...loadCustomUnits(entry)].some(u => !isPackUnit(u.label)) ? '1' : '100'))
  const [showCustom, setShowCustom] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [customGrams, setCustomGrams] = useState('')
  const pickedByUser = useRef(false)

  // Fehlt zu einem Produkt die Stückgröße (z. B. 1 Keks), im Internet nachschlagen
  useEffect(() => {
    if (!entry.needsUnits) return
    let stale = false
    setLoadingUnits(true)
    fetchWebUnits(entry)
      .then(units => { if (!stale) setWebUnits(units) })
      .catch(() => { /* optional */ })
      .finally(() => { if (!stale) setLoadingUnits(false) })
    return () => { stale = true }
  }, [entry])

  const resolved = useMemo(() => resolveEntry(entry, choice, [...customUnits, ...webUnits]), [entry, choice, customUnits, webUnits])
  const selectedUnit = unit === GRAM ? null : resolved.units.find(u => u.label === unit) ?? null

  // Kamen Einheiten erst nachträglich dazu, und der Nutzer hat noch nichts gewählt: Stück vorwählen (nie die Packung)
  useEffect(() => {
    if (pickedByUser.current || unit !== GRAM) return
    const piece = resolved.units.find(u => !isPackUnit(u.label))
    if (!piece) return
    setUnit(piece.label)
    setAmount('1')
  }, [resolved.units, unit])

  const amountNumber = parseFloat(amount.replace(',', '.')) || 0
  const grams = selectedUnit ? amountNumber * selectedUnit.grams : amountNumber
  const macros = macrosFor(resolved.per100, grams)
  const step = selectedUnit ? 1 : 10

  function chooseUnit(next: string) {
    pickedByUser.current = true
    setUnit(next)
    setAmount(next === GRAM ? '100' : '1')
  }

  function nudge(direction: 1 | -1) {
    const next = Math.max(0, Math.round((amountNumber + direction * step) * 10) / 10)
    setAmount(String(next))
  }

  function addCustomUnit() {
    const label = customLabel.trim().slice(0, 24)
    const unitGrams = parseFloat(customGrams.replace(',', '.'))
    if (!label || !(unitGrams > 0) || unitGrams > 5000) return
    const created = { label: label.charAt(0).toUpperCase() + label.slice(1), grams: Math.round(unitGrams * 10) / 10 }
    saveCustomUnit(entry, created)
    setCustomUnits(prev => [...prev.filter(u => u.label.toLowerCase() !== created.label.toLowerCase()), created])
    pickedByUser.current = true
    setUnit(created.label)
    setAmount('1')
    setCustomLabel('')
    setCustomGrams('')
    setShowCustom(false)
  }

  function confirm() {
    if (grams <= 0) return
    const variants = resolved.variantLabels.length ? ` (${resolved.variantLabels.join(', ')})` : ''
    const portion = selectedUnit ? ` · ${formatAmount(amountNumber)} ${selectedUnit.label}` : ''
    onConfirm({
      name: `${entry.name}${variants}${portion}`.slice(0, 120),
      menge_g: Math.round(grams * 10) / 10,
      ...macros,
      barcode: entry.barcode,
    })
  }

  const quick = selectedUnit ? [0.5, 1, 2, 3, 4] : [25, 50, 100, 150, 200, 250]

  return (
    <div className="space-y-6 pb-4">
      <button onClick={onBack} className="flex items-center gap-1 -ml-1 text-sm font-medium text-text-secondary hover:text-text-primary">
        <ChevronLeft size={18} /> Zurück zur Suche
      </button>

      <div>
        <h3 className="text-2xl font-bold text-text-primary leading-tight">{entry.name}</h3>
        {entry.brand && <div className="text-sm text-text-muted mt-0.5">{entry.brand}</div>}
        <div className="text-xs text-text-muted mt-1.5">
          pro 100 g: {Math.round(resolved.per100.kcal)} kcal · P {formatAmount(resolved.per100.protein)} g · K {formatAmount(resolved.per100.carbs)} g · F {formatAmount(resolved.per100.fat)} g
        </div>
      </div>

      {entry.groups?.map((group, groupIndex) => (
        <div key={group.name}>
          <div className="label">{group.name}</div>
          <div className="flex flex-wrap gap-2">
            {group.choices.map((option, optionIndex) => (
              <Chip
                key={option.label}
                active={(choice[groupIndex] ?? 0) === optionIndex}
                onClick={() => setChoice(prev => prev.map((value, index) => (index === groupIndex ? optionIndex : value)))}
              >
                {option.label}
                {option.grams ? <span className="font-normal opacity-70"> · {formatAmount(option.grams)} g</span> : null}
              </Chip>
            ))}
          </div>
        </div>
      ))}

      <div>
        <div className="label flex items-center gap-2">
          Menge in
          {loadingUnits && <span className="flex items-center gap-1.5 text-xs font-normal text-text-muted"><Spinner size={12} /> Stückgrößen werden gesucht …</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={unit === GRAM} onClick={() => chooseUnit(GRAM)}>Gramm</Chip>
          {resolved.units.map(option => (
            <Chip key={option.label} active={unit === option.label} onClick={() => chooseUnit(option.label)}>
              {option.label}
              <span className="font-normal opacity-70"> · {formatAmount(option.grams)} g</span>
            </Chip>
          ))}
          <button
            type="button"
            onClick={() => setShowCustom(open => !open)}
            className="px-4 py-2.5 rounded-full text-sm font-semibold border border-dashed border-border text-text-muted hover:text-text-primary hover:border-brand/40 flex items-center gap-1.5"
          >
            <Plus size={14} /> Eigene Einheit
          </button>
        </div>
        {showCustom && (
          <div className="mt-3 p-4 rounded-2xl bg-bg-elevated space-y-3">
            <p className="text-xs text-text-muted">Zum Beispiel „1 Keks = 8 g“ oder „1 Riegel = 25 g“. Die Einheit wird für dieses Lebensmittel gemerkt.</p>
            <div className="grid grid-cols-[1fr_7rem_auto] gap-2 items-center">
              <input className="input" placeholder="Name, z. B. Keks" value={customLabel} maxLength={24} onChange={event => setCustomLabel(event.target.value)} />
              <input className="input" inputMode="decimal" placeholder="Gramm" value={customGrams} onChange={event => setCustomGrams(event.target.value)} />
              <button
                onClick={addCustomUnit}
                disabled={!customLabel.trim() || !(parseFloat(customGrams.replace(',', '.')) > 0)}
                className="btn-primary px-4"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Weniger"
            className="w-14 h-14 rounded-full bg-bg-elevated text-text-primary flex items-center justify-center active:scale-90 transition-transform"
          >
            <Minus size={22} />
          </button>
          <div className="relative w-40">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Menge"
              className="input !text-center !text-3xl !font-bold !py-3 !pr-0"
              value={amount}
              onChange={event => setAmount(event.target.value.replace(/[^\d.,]/g, ''))}
            />
          </div>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Mehr"
            className="w-14 h-14 rounded-full bg-bg-elevated text-text-primary flex items-center justify-center active:scale-90 transition-transform"
          >
            <Plus size={22} />
          </button>
        </div>
        <div className="text-center text-sm text-text-muted mt-2">
          {selectedUnit ? `${selectedUnit.label}${grams > 0 ? ` · = ${formatAmount(grams)} g` : ''}` : 'Gramm'}
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-3">
          {quick.map(value => (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(String(value))}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-sm border transition-colors',
                amountNumber === value ? 'border-brand text-brand font-semibold' : 'border-border text-text-secondary hover:border-brand/40',
              )}
            >
              {formatAmount(value)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-bg-elevated p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-4xl font-bold text-text-primary leading-none">{macros.kalorien}</div>
            <div className="text-xs text-text-muted mt-1.5">kcal</div>
          </div>
          <div className="grid grid-cols-3 gap-5 text-center">
            {([
              { label: 'Protein', value: macros.protein_g },
              { label: 'Kohlenhydrate', value: macros.kohlenhydrate_g },
              { label: 'Fett', value: macros.fett_g },
            ]).map(item => (
              <div key={item.label}>
                <div className="text-lg font-bold text-text-primary leading-none">{formatAmount(item.value)} g</div>
                <div className="text-[11px] text-text-muted mt-1.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-bg-card/95 backdrop-blur">
        <button
          onClick={confirm}
          disabled={grams <= 0 || busy}
          className="btn-primary w-full !py-4 text-base flex items-center justify-center gap-2"
        >
          {busy ? <Spinner size={18} /> : <Package size={18} />} Hinzufügen
        </button>
      </div>
    </div>
  )
}
