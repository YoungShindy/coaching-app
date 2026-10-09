import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Coins, HelpCircle, Pencil, Star } from 'lucide-react'
import { Avatar } from '../components/character/Avatar'
import { AvatarEditor } from '../components/character/AvatarEditor'
import { ChallengesTab } from '../components/character/ChallengesTab'
import { RewardsTab } from '../components/character/RewardsTab'
import { ShopTab } from '../components/character/ShopTab'
import { Onboarding } from '../components/character/Onboarding'
import type { AvatarConfig } from '../components/character/avatarConfig'
import { SegmentTabs } from '../components/ui/SegmentTabs'
import { Sheet } from '../components/ui/Sheet'
import { PageLoader } from '../components/ui/Spinner'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import { supabase } from '../lib/supabase'
import { cleanName, levelTitle, STREAK_REWARDS } from '../lib/game'
import { cn } from '../lib/utils'

type Tab = 'challenges' | 'shop' | 'belohnungen'
const TABS: { key: Tab; label: string }[] = [
  { key: 'challenges', label: 'Challenges' }, { key: 'shop', label: 'Shop' }, { key: 'belohnungen', label: 'Belohnungen' },
]

interface Earned { id: string; titel: string | null; xp: number; punkte: number }

export function Character() {
  const { user } = useAuth()
  const { available, loaded, character, level, stats, updateCharacter } = useGame()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find(t => t.key === params.get('tab'))?.key ?? 'challenges') as Tab
  const [editing, setEditing] = useState(false)
  const [help, setHelp] = useState(false)
  const [draftCfg, setDraftCfg] = useState<AvatarConfig | null>(null)
  const [draftName, setDraftName] = useState('')
  const [saving, setSaving] = useState(false)
  const [earned, setEarned] = useState<Earned[]>([])
  // Wer ohne Figur hier ankommt, bleibt im Onboarding, auch wenn die Figur zwischendurch angelegt wird (Abschlussseite)
  const onboarding = useRef(false)
  const [onboardingDone, setOnboardingDone] = useState(false)
  if (loaded && available && !character) onboarding.current = true

  // Heute verdient: aktualisiert sich, sobald sich XP oder Punkte ändern
  useEffect(() => {
    if (!user || !character) return
    const start = new Date(); start.setHours(0, 0, 0, 0)
    let off = false
    void supabase.from('xp_events').select('id,titel,xp,punkte').eq('user_id', user.id).gte('created_at', start.toISOString()).order('created_at', { ascending: false })
      .then(({ data }) => {
        if (off) return
        setEarned(((data ?? []) as unknown as Earned[]).filter(e => e.xp > 0 || e.punkte > 0))
      })
    return () => { off = true }
  }, [user, character, stats.xp, stats.punkte])

  if (!loaded) return <PageLoader />
  if (!available) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="section-title text-2xl">Deine Figur</h1>
        <p className="card text-sm text-text-secondary">Die Figur ist noch nicht freigeschaltet. Das Update wird gerade eingespielt, bitte später noch einmal schauen.</p>
      </div>
    )
  }
  if (onboarding.current && !onboardingDone) {
    return <Onboarding withAnamnese={false} onDone={() => setOnboardingDone(true)} onSkip={() => navigate('/more')} />
  }
  if (!character) return <PageLoader />

  function openEditor() {
    setDraftCfg(character!.config); setDraftName(character!.name); setEditing(true)
  }
  async function saveEditor() {
    const n = cleanName(draftName)
    if (!n || !draftCfg) return
    setSaving(true)
    await updateCharacter({ name: n, config: draftCfg })
    setSaving(false); setEditing(false)
  }

  const gainedXp = earned.reduce((a, e) => a + e.xp, 0)
  const gainedPts = earned.reduce((a, e) => a + e.punkte, 0)

  return (
    <div className="max-w-2xl space-y-5">
      {/* Figur, Level und Punkte */}
      <div className="card relative overflow-hidden !p-5">
        <button onClick={() => setHelp(true)} className="absolute right-3 top-3 z-10 w-10 h-10 rounded-full bg-bg-elevated/80 border border-border-input text-text-secondary hover:text-brand flex items-center justify-center transition-colors" aria-label="So sammelst du XP und Punkte"><HelpCircle size={18} aria-hidden="true" /></button>
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-brand/10 to-transparent pointer-events-none" aria-hidden="true" />
        <div className="relative flex flex-col items-center text-center">
          <div className="enter relative" style={{ '--d': 0 } as React.CSSProperties}>
            <Avatar config={character.config} equipped={character.equipped} size={200} idle label={`${character.name}, Level ${level.level}`} />
            <span className="pop-in absolute -bottom-1 left-1/2 -translate-x-1/2 min-w-[72px] px-3.5 py-1 rounded-full bg-primary text-white text-lg font-extrabold tabular-nums ring-4 ring-bg-card border border-brand/50 shadow-glow-sm" style={{ animationDelay: '0.3s' }}>
              Level {level.level}
            </span>
          </div>
          <h1 className="enter section-title text-2xl mt-6" style={{ '--d': 100 } as React.CSSProperties}>{character.name}</h1>
          <p className="enter text-sm font-semibold text-brand" style={{ '--d': 150 } as React.CSSProperties}>{levelTitle(level.level)}</p>

          <div className="enter w-full max-w-sm mt-4" style={{ '--d': 220 } as React.CSSProperties}>
            <div className="flex items-baseline justify-between text-xs text-text-secondary tabular-nums mb-1.5">
              <span className="inline-flex items-center gap-1 font-semibold"><Star size={12} className="text-warning" aria-hidden="true" /> {stats.xp} XP</span>
              <span>noch {level.xpNeed - level.xpInto} bis Level {level.next}</span>
            </div>
            <div
              className="h-3 rounded-full bg-bg-elevated overflow-hidden" role="progressbar"
              aria-valuemin={0} aria-valuemax={level.xpNeed} aria-valuenow={level.xpInto} aria-label={`Fortschritt zu Level ${level.next}`}
            >
              <div className="bar-grow h-full rounded-full bg-gradient-to-r from-primary to-brand" style={{ width: `${Math.max(4, level.pct)}%`, '--d': 380 } as React.CSSProperties} />
            </div>
          </div>

          <div className="enter mt-4 flex flex-wrap items-center justify-center gap-2" style={{ '--d': 300 } as React.CSSProperties}>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-warning/15 text-warning font-extrabold tabular-nums"><Coins size={16} aria-hidden="true" /> {stats.punkte} Punkte</span>
            <button onClick={openEditor} className="btn-secondary !px-4 !py-2 text-sm flex items-center gap-2"><Pencil size={14} aria-hidden="true" /> Figur ändern</button>
          </div>
        </div>
      </div>

      {/* Heute verdient */}
      <div className="enter card !p-4" style={{ '--d': 120 } as React.CSSProperties}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-2">
          <h2 className="text-sm font-bold text-text-primary">Heute verdient</h2>
          {earned.length > 0 && <span className="text-xs font-semibold tabular-nums text-text-secondary">+{gainedXp} XP · +{gainedPts} Punkte</span>}
        </div>
        {earned.length === 0 ? (
          <p className="text-sm text-text-secondary">Noch nichts. Trag eine Mahlzeit ein, trink Wasser oder starte eine Challenge.</p>
        ) : (
          <ul className="space-y-1.5">
            {earned.slice(0, 8).map(e => (
              <li key={e.id} className="flex items-center gap-2.5 text-sm">
                <span className="w-5 h-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0"><Check size={12} strokeWidth={3.5} aria-hidden="true" /></span>
                <span className="flex-1 min-w-0 text-text-primary break-words">{e.titel ?? 'Erfolg'}</span>
                <span className="text-xs font-semibold tabular-nums text-text-secondary">{e.xp > 0 && `+${e.xp} XP`}{e.punkte > 0 && <span className="text-warning"> +{e.punkte}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SegmentTabs tabs={TABS} value={tab} onChange={k => setParams(k === 'challenges' ? {} : { tab: k }, { replace: true })} label="Bereich" />
      <div key={tab} className={cn('enter')} style={{ '--d': 0 } as React.CSSProperties}>
        {tab === 'challenges' && <ChallengesTab />}
        {tab === 'shop' && <ShopTab />}
        {tab === 'belohnungen' && <RewardsTab />}
      </div>

      {/* Figur ändern */}
      <Sheet open={editing} onClose={() => setEditing(false)} title="Figur ändern" tall>
        {draftCfg && (
          <div className="pb-3">
            <AvatarEditor config={draftCfg} name={draftName} equipped={character.equipped} onConfig={setDraftCfg} onName={setDraftName} />
            <button onClick={saveEditor} disabled={!cleanName(draftName) || saving} className="btn-primary w-full mt-5 disabled:opacity-50">{saving ? 'Wird gespeichert …' : 'Speichern'}</button>
          </div>
        )}
      </Sheet>

      {/* Erklärung */}
      <Sheet open={help} onClose={() => setHelp(false)} title="So funktioniert’s">
        <div className="space-y-4 pb-3 text-sm text-text-secondary leading-relaxed">
          <p><strong className="text-text-primary">XP</strong> bringen dich ins nächste Level. Neue Level schalten Dinge im Shop frei. <strong className="text-text-primary">Punkte</strong> sind dein Geld: Damit bezahlst du Dinge im Shop und Belohnungen.</p>
          <table className="w-full text-left">
            <caption className="sr-only">Was bringt wie viel</caption>
            <thead><tr className="text-xs uppercase tracking-wider text-text-muted"><th className="py-1 font-semibold">Aktion</th><th className="py-1 font-semibold text-right">XP</th><th className="py-1 font-semibold text-right">Punkte</th></tr></thead>
            <tbody className="divide-y divide-border">
              {[
                ['Hauptmahlzeit eintragen', 6, 0], ['Schlaf eintragen', 8, 0], ['Gewicht eintragen', 5, 0], ['Supplements komplett', 8, 0],
                ['Training geschafft', 30, 10], ['Wasserziel erreicht', 20, 10], ['Grüner Tag', 30, 20],
              ].map(([t, xp, p]) => (
                <tr key={t as string}><td className="py-1.5 text-text-primary">{t}</td><td className="py-1.5 text-right tabular-nums">+{xp}</td><td className="py-1.5 text-right tabular-nums">{p ? `+${p}` : '–'}</td></tr>
              ))}
            </tbody>
          </table>
          <p><strong className="text-text-primary">Grüner Tag:</strong> alle drei Hauptmahlzeiten, Schlaf und alle Supplements sind eingetragen.</p>
          <p><strong className="text-text-primary">Serien:</strong> Wer {Object.keys(STREAK_REWARDS).slice(0, 4).join(', ')} … Tage am Stück etwas einträgt, bekommt einen Bonus.</p>
          <p><strong className="text-text-primary">Challenges:</strong> Bis zu drei pro Tag. Mit Foto oder kurzer Notiz bekommst du Punkte und 1,5-fach XP.</p>
          <p><strong className="text-text-primary">Belohnungen:</strong> Du bestimmst selbst, was du dir gönnst und was es kostet. Eingelöst wird per Gutschein.</p>
        </div>
      </Sheet>
    </div>
  )
}
