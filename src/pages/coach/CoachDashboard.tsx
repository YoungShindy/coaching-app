import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Clock, Scale, Dumbbell, Moon, TrendingUp, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { formatDate, todayISO } from '../../lib/utils'
import { Spinner } from '../../components/ui/Spinner'
import { Avatar } from '../../components/character/Avatar'
import { DEFAULT_AVATAR, type AvatarConfig } from '../../components/character/avatarConfig'
import { levelInfo, type Equipped } from '../../lib/game'
import type { Profile } from '../../types/database'

interface ClientWithStats extends Profile {
  lastWeight?: number | null
  totalTrainings?: number
  lastTrainingDate?: string | null
  figur?: { config: AvatarConfig; equipped: Equipped; level: number; name: string } | null
}

export function CoachDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientWithStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      const { data: clientProfiles } = await supabase
        .from('profiles')
        .select('*')
        .eq('coach_id', user!.id)
        .eq('role', 'client')
        .order('last_active', { ascending: false, nullsFirst: false })

      if (!clientProfiles?.length) {
        setLoading(false)
        return
      }

      const clientIds = clientProfiles.map(c => c.id)

      const [weightsRes, trainingsRes, figurRes, statsRes] = await Promise.all([
        supabase.from('gewicht').select('user_id, gewicht, datum').in('user_id', clientIds).order('datum', { ascending: false }),
        supabase.from('training').select('user_id, datum').in('user_id', clientIds).order('datum', { ascending: false }),
        supabase.from('characters').select('user_id, name, config, equipped').in('user_id', clientIds),
        supabase.from('character_stats').select('user_id, xp').in('user_id', clientIds),
      ])
      // Fehlt das Spiel (noch) in der Datenbank, bleibt es beim Buchstaben
      const figuren = new Map(((figurRes.error ? [] : figurRes.data ?? []) as unknown as { user_id: string; name: string; config: Partial<AvatarConfig>; equipped: Equipped }[]).map(f => [f.user_id, f]))
      const xpOf = new Map(((statsRes.error ? [] : statsRes.data ?? []) as unknown as { user_id: string; xp: number }[]).map(s => [s.user_id, s.xp]))

      const weights = weightsRes.data ?? []
      const trainings = trainingsRes.data ?? []

      const enriched: ClientWithStats[] = clientProfiles.map(c => {
        const clientWeights = weights.filter(w => w.user_id === c.id)
        const clientTrainings = trainings.filter(t => t.user_id === c.id)
        return {
          ...c,
          lastWeight: clientWeights[0]?.gewicht ?? null,
          totalTrainings: clientTrainings.length,
          lastTrainingDate: clientTrainings[0]?.datum ?? null,
          figur: figuren.has(c.id)
            ? { config: { ...DEFAULT_AVATAR, ...figuren.get(c.id)!.config }, equipped: figuren.get(c.id)!.equipped ?? {}, level: levelInfo(xpOf.get(c.id) ?? 0).level, name: figuren.get(c.id)!.name }
            : null,
        }
      })

      setClients(enriched)
      setLoading(false)
    }
    load()
  }, [user])

  function timeSinceTraining(dateStr: string | null) {
    if (!dateStr) return 'Nie trainiert'
    const diff = Date.now() - new Date(dateStr).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Heute trainiert'
    if (days === 1) return 'Gestern trainiert'
    return `Vor ${days} Tagen trainiert`
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="section-title text-2xl">Meine Klienten</h1>
        <p className="text-text-secondary text-sm mt-0.5">{clients.length} aktive Klienten</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">{clients.length}</div>
          <div className="text-xs text-text-muted mt-1">Klienten gesamt</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">
            {clients.filter(c => c.lastTrainingDate && (Date.now() - new Date(c.lastTrainingDate + 'T12:00:00').getTime()) < 86400000 * 7).length}
          </div>
          <div className="text-xs text-text-muted mt-1">Diese Woche aktiv</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">
            {clients.reduce((a, c) => a + (c.totalTrainings ?? 0), 0)}
          </div>
          <div className="text-xs text-text-muted mt-1">Trainingseinheiten</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-success">
            {(() => { const today = todayISO(); return clients.filter(c => c.lastTrainingDate === today).length })()}
          </div>
          <div className="text-xs text-text-muted mt-1">Heute aktiv</div>
        </div>
      </div>

      {/* Client List */}
      <div className="card">
        <h2 className="section-title mb-4">Klienten-Übersicht</h2>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : clients.length === 0 ? (
          <div className="py-12 text-center">
            <div className="p-4 rounded-2xl bg-bg-elevated border border-border inline-block mb-4">
              <Users size={32} className="text-text-muted" />
            </div>
            <h3 className="font-semibold text-text-primary mb-1">Noch keine Klienten</h3>
            <p className="text-sm text-text-secondary">Erstelle Einladungscodes in den Einstellungen und teile sie mit deinen Klienten.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clients.map(client => {
              const isActive = client.lastTrainingDate && (Date.now() - new Date(client.lastTrainingDate).getTime()) < 86400000 * 7
              return (
                <div
                  key={client.id}
                  onClick={() => navigate(`/coach/client/${client.id}`)}
                  className="flex items-center gap-4 p-4 rounded-xl hover:bg-bg-elevated border border-transparent hover:border-border cursor-pointer transition-all group"
                >
                  {/* Avatar */}
                  {client.figur ? (
                    <div className="relative shrink-0" role="img" aria-label={`${client.figur.name}, Level ${client.figur.level}`}>
                      <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/30 overflow-hidden">
                        <Avatar view="head" config={client.figur.config} equipped={client.figur.equipped} size={48} label="" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center text-brand font-bold text-lg shrink-0">
                      {client.name?.charAt(0)?.toUpperCase() ?? '?'}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary">{client.name ?? 'Unbekannt'}</span>
                      <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-success' : 'bg-border'}`} />
                      {client.figur && <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[11px] font-bold tabular-nums">Level {client.figur.level}</span>}
                    </div>
                    <div className="text-xs text-text-muted truncate">{client.email}</div>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-sm font-semibold text-text-primary">{client.lastWeight ? `${client.lastWeight} kg` : '--'}</div>
                      <div className="text-xs text-text-muted">Letztes Gewicht</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-semibold text-text-primary">{client.totalTrainings}</div>
                      <div className="text-xs text-text-muted">Trainings</div>
                    </div>
                    <div className="text-center min-w-[100px]">
                      <div className="flex items-center gap-1 text-xs text-text-secondary">
                        <Clock size={11} />
                        {timeSinceTraining(client.lastTrainingDate ?? null)}
                      </div>
                    </div>
                  </div>

                  <ChevronRight size={18} className="text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
