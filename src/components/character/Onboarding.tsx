import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Coins, Sparkles } from 'lucide-react'
import { Avatar, type AvatarHandle } from './Avatar'
import { AvatarEditor } from './AvatarEditor'
import { randomConfig, type AvatarConfig } from './avatarConfig'
import { Anamnese } from '../../pages/Anamnese'
import { useAuth } from '../../hooks/useAuth'
import { useGame, type Kennenlernen } from '../../hooks/useGame'
import { cn } from '../../lib/utils'
import { WELCOME_AWARD, cleanName } from '../../lib/game'

// Erster Start: Begrüßung und vier Fragen zum Kennenlernen, danach die Anamnese und zuletzt die eigene Figur mit Namen.

const GOALS = ['Abnehmen', 'Muskeln aufbauen', 'Fitter werden', 'Gesünder essen', 'Besser schlafen', 'Stress abbauen', 'Sportlich besser werden']
const EXPERIENCE = ['Ich fange gerade erst an', 'Ich trainiere ab und zu', 'Ich trainiere regelmäßig', 'Ich bin schon lange dabei']
const TIME = ['Bis 2 Stunden pro Woche', '2 bis 4 Stunden pro Woche', '4 bis 6 Stunden pro Woche', 'Mehr als 6 Stunden pro Woche']
const HARD = ['Dranbleiben', 'Zeit finden', 'Gesund essen', 'Heißhunger', 'Genug schlafen', 'Wissen, was ich tun soll', 'Schmerzen oder Verletzungen', 'Stress']

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      className={cn('px-3.5 py-2 rounded-2xl border text-sm font-semibold transition-all active:scale-95',
        on ? 'bg-primary text-white border-brand' : 'bg-bg-elevated border-border text-text-secondary hover:border-brand/50 hover:text-text-primary')}
    >{label}</button>
  )
}

function Option({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} role="radio" aria-checked={on}
      className={cn('w-full text-left px-4 py-3 rounded-2xl border text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-between gap-3',
        on ? 'bg-brand/10 border-brand text-text-primary' : 'bg-bg-elevated border-border text-text-secondary hover:border-brand/50')}
    >
      {label}
      <span className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0', on ? 'border-brand bg-primary text-white' : 'border-border-light')}>
        {on && <Check size={12} strokeWidth={3.5} aria-hidden="true" />}
      </span>
    </button>
  )
}

function toggle(list: string[], v: string) { return list.includes(v) ? list.filter(x => x !== v) : [...list, v] }

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={`Schritt ${step} von ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-500', i < step ? 'bg-primary' : 'bg-bg-elevated')} />
      ))}
    </div>
  )
}

type Phase = 'hallo' | 'kennenlernen' | 'anamnese' | 'figur' | 'fertig'

export function Onboarding({ withAnamnese, onDone, onSkip }: {
  /** Neue Konten füllen nach dem Kennenlernen die Anamnese aus; bestehende Konten haben sie schon. */
  withAnamnese: boolean
  onDone: () => void
  /** Bestehende Konten dürfen das Angebot auch wieder verlassen */
  onSkip?: () => void
}) {
  const { user, profile } = useAuth()
  const { createCharacter } = useGame()
  const [phase, setPhase] = useState<Phase>('hallo')
  const [step, setStep] = useState(0)
  const first = profile?.name?.split(' ')[0] ?? ''
  const [k, setK] = useState<Kennenlernen>({ anrede: first, ziele: [], warum: '', erfahrung: '', zeit: '', schwierigkeiten: [] })
  const [config, setConfig] = useState<AvatarConfig>(() => randomConfig())
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const helloRef = useRef<AvatarHandle>(null)
  const doneRef = useRef<AvatarHandle>(null)
  const helloConfig = useMemo(() => randomConfig(), [])

  const total = 4
  const canNext = step === 0 ? k.anrede.trim().length > 0 : step === 1 ? k.ziele.length > 0 : step === 2 ? !!k.erfahrung && !!k.zeit : k.schwierigkeiten.length > 0

  async function finish() {
    const n = cleanName(name)
    if (!n || saving) return
    setSaving(true); setError(null)
    const ok = await createCharacter({ name: n, config, equipped: {}, kennenlernen: { ...k, anrede: k.anrede.trim(), warum: k.warum.trim() } })
    setSaving(false)
    if (!ok) { setError('Das hat nicht geklappt. Prüfe deine Verbindung und versuche es noch einmal.'); return }
    setPhase('fertig')
    window.setTimeout(() => { void doneRef.current?.cheer() }, 500)
  }

  if (phase === 'anamnese' && user) {
    return <Anamnese userId={user.id} onDone={() => setPhase('figur')} />
  }

  return (
    <div className="max-w-lg mx-auto space-y-6" data-enter="manual">
      {phase === 'hallo' && (
        <div className="text-center space-y-5 pt-2">
          <div className="enter mx-auto w-fit rounded-4xl bg-gradient-to-b from-brand/10 to-transparent px-8 pt-4" style={{ '--d': 0 } as React.CSSProperties}>
            <Avatar ref={helloRef} config={helloConfig} size={200} idle label="Eine freundliche Figur winkt dir zu" />
          </div>
          <div className="enter space-y-2" style={{ '--d': 160 } as React.CSSProperties}>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Willkommen{first ? `, ${first}` : ''}!</h1>
            <p className="text-text-secondary leading-relaxed">
              Schön, dass du bei HLX Together dabei bist. Ich stelle dir kurz vier Fragen, damit dein Coach dich besser kennenlernt.
              Danach gestaltest du deine eigene Figur, die mit dir wächst.
            </p>
          </div>
          <div className="enter space-y-2" style={{ '--d': 300 } as React.CSSProperties}>
            <button onClick={() => { setPhase('kennenlernen'); setStep(0) }} className="btn-primary w-full flex items-center justify-center gap-2">
              Los geht’s <ArrowRight size={18} aria-hidden="true" />
            </button>
            {onSkip && <button onClick={onSkip} className="w-full py-2.5 text-sm font-semibold text-text-secondary hover:text-text-primary">Später</button>}
          </div>
        </div>
      )}

      {phase === 'kennenlernen' && (
        <div className="space-y-6">
          <Progress step={step + 1} total={total} />
          <div key={step} className="enter space-y-5" style={{ '--d': 0 } as React.CSSProperties}>
            {step === 0 && (
              <>
                <div>
                  <h2 className="text-2xl font-extrabold text-text-primary">Wie sollen wir dich nennen?</h2>
                  <p className="text-sm text-text-secondary mt-1">Dein Vorname oder ein Spitzname, so sprechen wir dich an.</p>
                </div>
                <div>
                  <label htmlFor="k-anrede" className="label">Name</label>
                  <input id="k-anrede" className="input" maxLength={30} value={k.anrede} autoFocus autoComplete="given-name" onChange={e => setK({ ...k, anrede: e.target.value })} placeholder="z. B. Lena" />
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <div>
                  <h2 className="text-2xl font-extrabold text-text-primary">Was möchtest du erreichen?</h2>
                  <p className="text-sm text-text-secondary mt-1">Du kannst mehrere wählen.</p>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Ziele">
                  {GOALS.map(g => <Chip key={g} label={g} on={k.ziele.includes(g)} onClick={() => setK({ ...k, ziele: toggle(k.ziele, g) })} />)}
                </div>
                <div>
                  <label htmlFor="k-warum" className="label">Warum ist dir das wichtig? (freiwillig)</label>
                  <textarea id="k-warum" className="input min-h-[88px]" maxLength={240} value={k.warum} onChange={e => setK({ ...k, warum: e.target.value })} placeholder="Zum Beispiel: Ich will mich wieder wohler fühlen." />
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h2 className="text-2xl font-extrabold text-text-primary">Wie sieht es mit Training aus?</h2>
                <div className="space-y-2" role="radiogroup" aria-label="Erfahrung">
                  {EXPERIENCE.map(o => <Option key={o} label={o} on={k.erfahrung === o} onClick={() => setK({ ...k, erfahrung: o })} />)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-text-secondary mb-2">Wie viel Zeit hast du pro Woche?</div>
                  <div className="space-y-2" role="radiogroup" aria-label="Zeit pro Woche">
                    {TIME.map(o => <Option key={o} label={o} on={k.zeit === o} onClick={() => setK({ ...k, zeit: o })} />)}
                  </div>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div>
                  <h2 className="text-2xl font-extrabold text-text-primary">Was fällt dir schwer?</h2>
                  <p className="text-sm text-text-secondary mt-1">Dann kann dein Coach genau da helfen. Mehrere sind erlaubt.</p>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Was fällt schwer">
                  {HARD.map(g => <Chip key={g} label={g} on={k.schwierigkeiten.includes(g)} onClick={() => setK({ ...k, schwierigkeiten: toggle(k.schwierigkeiten, g) })} />)}
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => (step === 0 ? setPhase('hallo') : setStep(step - 1))} aria-label="Zurück"
              className="w-12 rounded-2xl bg-bg-elevated border border-border-input text-text-secondary hover:text-text-primary flex items-center justify-center transition-colors"
            ><ArrowLeft size={18} aria-hidden="true" /></button>
            <button
              disabled={!canNext}
              onClick={() => {
                if (step < total - 1) { setStep(step + 1); return }
                setPhase(withAnamnese ? 'anamnese' : 'figur')
              }}
              className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
            >{step < total - 1 ? 'Weiter' : withAnamnese ? 'Weiter zur Anamnese' : 'Weiter zur Figur'} <ArrowRight size={18} aria-hidden="true" /></button>
          </div>
        </div>
      )}

      {phase === 'figur' && (
        <div className="space-y-5">
          <div>
            <h2 className="enter text-2xl font-extrabold text-text-primary" style={{ '--d': 0 } as React.CSSProperties}>Gestalte deine Figur</h2>
            <p className="enter text-sm text-text-secondary mt-1" style={{ '--d': 80 } as React.CSSProperties}>Sie begleitet dich, sammelt mit dir XP und steigt im Level auf. Gib ihr einen Namen.</p>
          </div>
          <AvatarEditor config={config} name={name} onConfig={setConfig} onName={setName} />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button onClick={finish} disabled={!cleanName(name) || saving} className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2">
            <Sparkles size={18} aria-hidden="true" /> {saving ? 'Wird gespeichert …' : 'Figur fertig'}
          </button>
        </div>
      )}

      {phase === 'fertig' && (
        <div className="text-center space-y-5 pt-2">
          <div className="pop-in mx-auto w-fit rounded-4xl bg-gradient-to-b from-brand/10 to-transparent px-8 pt-4">
            <Avatar ref={doneRef} config={config} size={210} idle label={`${cleanName(name)} freut sich`} />
          </div>
          <div className="enter space-y-2" style={{ '--d': 200 } as React.CSSProperties}>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Das ist {cleanName(name)}!</h1>
            <p className="text-text-secondary">Zum Start schenken wir euch ein paar Punkte für den Shop.</p>
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-warning/15 text-warning font-extrabold tabular-nums"><Coins size={18} aria-hidden="true" /> +{WELCOME_AWARD.punkte} Punkte</div>
          </div>
          <button onClick={onDone} className="enter btn-primary w-full" style={{ '--d': 420 } as React.CSSProperties}>Auf geht’s</button>
        </div>
      )}
    </div>
  )
}
