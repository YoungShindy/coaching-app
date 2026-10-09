import { useSearchParams } from 'react-router-dom'
import { SegmentTabs } from '../components/ui/SegmentTabs'
import { TrainingLog } from './Training'
import { TrainingVorlagen } from './TrainingVorlagen'
import { Uebungspool } from './Uebungspool'
import { PlanBuilder } from '../components/training/PlanBuilder'
import { Fortschritt } from '../components/training/Fortschritt'

type Tab = 'einheiten' | 'vorlagen' | 'uebungen' | 'fortschritt'
type Mode = 'pool' | 'plan'

const TABS: { key: Tab; label: string }[] = [
  { key: 'einheiten', label: 'Einheiten' },
  { key: 'vorlagen', label: 'Vorlagen' },
  { key: 'uebungen', label: 'Übungen' },
  { key: 'fortschritt', label: 'Fortschritt' },
]

/** Training mit Reitern: Einheiten, Vorlagen, Übungspool samt Plan-Baukasten und Kraft-Fortschritt. */
export function Training() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.some(t => t.key === raw) ? (raw as Tab) : 'einheiten'
  const mode: Mode = params.get('mode') === 'plan' ? 'plan' : 'pool'

  const go = (next: Tab, nextMode?: Mode) => {
    const p = new URLSearchParams()
    if (next !== 'einheiten') p.set('tab', next)
    if (next === 'uebungen' && nextMode === 'plan') p.set('mode', 'plan')
    setParams(p, { replace: true })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="section-title text-2xl">Training</h1>
        <p className="text-text-secondary text-sm mt-0.5">Einheiten, Vorlagen, Übungen und dein Fortschritt</p>
      </div>

      <SegmentTabs tabs={TABS} value={tab} onChange={k => go(k)} label="Trainingsbereich" />

      <div key={tab} className="enter" style={{ '--d': 0 } as React.CSSProperties}>
        {tab === 'einheiten' && <TrainingLog embedded onOpenVorlagen={() => go('vorlagen')} />}
        {tab === 'vorlagen' && <TrainingVorlagen embedded onBuildPlan={() => go('uebungen', 'plan')} />}
        {tab === 'uebungen' && (
          <div className="space-y-4">
            <SegmentTabs
              tabs={[{ key: 'pool', label: 'Übungspool' }, { key: 'plan', label: 'Plan bauen' }]}
              value={mode} onChange={m => go('uebungen', m)} label="Übungen oder Plan" className="max-w-sm"
            />
            {mode === 'pool' ? <Uebungspool embedded /> : <PlanBuilder onSaved={() => go('vorlagen')} />}
          </div>
        )}
        {tab === 'fortschritt' && <Fortschritt />}
      </div>
    </div>
  )
}
