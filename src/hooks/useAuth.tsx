import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { todayISO } from '../lib/utils'
import type { Profile } from '../types/database'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, name: string, inviteCode: string, consentAi?: boolean) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    import('./usePushNotifications').then(m => m.refreshPushSubscription(userId))
  }

  function updateLastActive(userId: string) {
    supabase.from('profiles').update({ last_active: new Date().toISOString() }).eq('id', userId).then(() => {})
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false))
        updateLastActive(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        updateLastActive(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Update last_active when user returns to the tab and every 5 minutes while active
  useEffect(() => {
    if (!user) return

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') updateLastActive(user.id)
    }
    document.addEventListener('visibilitychange', handleVisibility)

    const interval = setInterval(() => updateLastActive(user.id), 5 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(interval)
    }
  }, [user])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email: string, password: string, name: string, inviteCode: string, consentAi = false) {
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`,
      },
    })
    if (signUpError || !authData.user) return { error: signUpError }

    const userId = authData.user.id

    // Validate invite code + set coach_id via secure server-side function
    // (prevents direct invite_codes table exposure, handles race conditions)
    const { data: codeResult, error: codeError } = await supabase
      .rpc('validate_and_use_invite_code', { p_code: inviteCode, p_user_id: userId })

    if (codeError || codeResult?.error) {
      // Clean up: delete the auth user we just created
      // (best effort — Supabase will garbage-collect unconfirmed accounts)
      return { error: new Error(codeResult?.error ?? 'Ungültiger oder bereits verwendeter Einladungscode.') }
    }

    // Update profile name (trigger already created profile with email/role)
    await supabase.from('profiles').update({ name }).eq('id', userId)

    // Create client settings with consent records (DSGVO Art. 7 Nachweis)
    const consentNow = new Date().toISOString()
    await supabase.from('client_settings').upsert({
      user_id: userId,
      kalorie_tagesziel: 2000,
      trainings_pro_woche: 4,
      schlaf_ziel: 8,
      startdatum: todayISO(),
      consent_dsgvo: true,
      consent_ai: consentAi,
      consent_given_at: consentNow,
    }, { onConflict: 'user_id' })

    return { error: null }
  }

  async function signOut() {
    // Dieses Gerät soll nach dem Abmelden keine Nachrichten für das Konto mehr bekommen
    if (user) await import('./usePushNotifications').then(m => m.forgetThisDevice(user.id)).catch(() => {})
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
