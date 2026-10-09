import { useEffect, useMemo, useState } from 'react'
import { Search, X, Dumbbell } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Spinner } from '../ui/Spinner'
import { cn } from '../../lib/utils'
import { GROUPS, imgUrl, loadExercises, norm, searchKey, type GroupKey, type PoolExercise } from '../../lib/exercises'
import type { Role } from '../../lib/splits'

const EQUIPMENT_FILTERS = ['Alle', 'Langhantel', 'Kurzhantel', 'Kabel', 'Maschine', 'Körpergewicht']
const PAGE = 60

function Thumb({ ex }: { ex: PoolExercise }) {
  const [err, setErr] = useState(false)
  return (
    <div className="w-12 h-12 rounded-xl bg-bg-elevated overflow-hidden shrink-0 flex items-center justify-center">
      {err ? <Dumbbell size={20} className="text-text-muted" /> : (
        <img src={imgUrl(ex)} alt="" loading="lazy" className="w-full h-full object-cover" onError={() => setErr(true)} />
      )}
    </div>
  )
}

export function ExercisePicker({ open, onClose, group, role, onPick }: {
  open: boolean
  onClose: () => void
  group: GroupKey
  role: Role
  onPick: (ex: PoolExercise) => void
}) {
  const [pool, setPool] = useState<PoolExercise[] | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [grp, setGrp] = useState<GroupKey | 'alle'>(group)
  const [equip, setEquip] = useState('Alle')
  const [hideStretch, setHideStretch] = useState(true)
  const [shown, setShown] = useState(PAGE)

  useEffect(() => { if (open) { setGrp(group); setQuery(''); setEquip('Alle'); setShown(PAGE) } }, [open, group])
  useEffect(() => {
    if (!open || pool) return
    loadExercises().then(setPool).catch(() => setError(true))
  }, [open, pool])
  useEffect(() => { setShown(PAGE) }, [query, grp, equip, hideStretch])

  const keys = useMemo(() => (pool ? new Map(pool.map(e => [e.id, searchKey(e)])) : new Map<string, string>()), [pool])

  const list = useMemo(() => {
    if (!pool) return []
    const q = norm(query)
    const words = q ? q.split(' ') : []
    return pool
      .filter(e => {
        if (grp !== 'alle' && e.group !== grp) return false
        if (hideStretch && e.stretch) return false
        if (equip !== 'Alle' && e.equipment_group !== equip) return false
        if (words.length) { const k = keys.get(e.id) ?? ''; return words.every(w => k.includes(w)) }
        return true
      })
      .sort((a, b) => {
        const wantCompound = role === 'grund' ? 1 : 0
        const ca = a.compound === wantCompound ? 0 : 1
        const cb = b.compound === wantCompound ? 0 : 1
        return ca - cb || a.name.localeCompare(b.name, 'de')
      })
  }, [pool, keys, query, grp, equip, hideStretch, role])

  return (
    <Sheet open={open} onClose={onClose} title="Übung wählen" tall>
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="search" className="input pl-9 pr-9" placeholder="Übung suchen, z. B. Bankdrücken" value={query}
            onChange={e => setQuery(e.target.value)} aria-label="Übung suchen"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary" aria-label="Suche leeren">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-none">
          {[{ key: 'alle', label: 'Alle' }, ...GROUPS.filter(g => g.key !== 'sonstige')].map(g => (
            <button
              key={g.key} onClick={() => setGrp(g.key as GroupKey | 'alle')}
              className={cn('px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border shrink-0 transition-all active:scale-95',
                grp === g.key ? 'bg-primary border-brand text-white' : 'border-border text-text-secondary hover:border-brand/40')}
            >{g.label}</button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-none">
          {EQUIPMENT_FILTERS.map(eq => (
            <button
              key={eq} onClick={() => setEquip(eq)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border shrink-0 transition-all active:scale-95',
                equip === eq ? 'bg-brand/15 border-brand/50 text-brand' : 'border-border text-text-muted hover:border-brand/40')}
            >{eq}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
          <input type="checkbox" checked={hideStretch} onChange={e => setHideStretch(e.target.checked)} />
          Dehnübungen und Mobilisation ausblenden
        </label>

        {error ? (
          <div className="card text-sm text-text-secondary">Der Übungspool konnte nicht geladen werden.</div>
        ) : !pool ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : list.length === 0 ? (
          <div className="card text-sm text-text-secondary text-center">Keine passende Übung gefunden. Lockere die Filter.</div>
        ) : (
          <ul className="space-y-0.5 pb-4">
            {list.slice(0, shown).map(ex => (
              <li key={ex.id}>
                <button
                  onClick={() => onPick(ex)}
                  className="flex items-center gap-3 w-full py-2 px-2 rounded-2xl hover:bg-bg-elevated active:scale-[0.985] transition-all text-left"
                >
                  <Thumb ex={ex} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-text-primary truncate">{ex.name}</span>
                    <span className="block text-xs text-text-muted truncate">{ex.equipment_de} · {ex.target_de}</span>
                  </span>
                  {ex.compound === 1 && <span className="badge bg-brand/10 text-brand shrink-0">Grundübung</span>}
                </button>
              </li>
            ))}
            {list.length > shown && (
              <li>
                <button onClick={() => setShown(s => s + PAGE)} className="btn-secondary w-full mt-2 text-sm">
                  Mehr anzeigen ({list.length - shown} weitere)
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
