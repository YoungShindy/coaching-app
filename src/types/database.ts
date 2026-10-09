export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          name: string | null
          role: 'coach' | 'client'
          coach_id: string | null
          created_at: string
          last_active: string | null
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      invite_codes: {
        Row: {
          id: string
          code: string
          coach_id: string
          used_by: string | null
          created_at: string
          expires_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['invite_codes']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['invite_codes']['Insert']>
      }
      client_settings: {
        Row: {
          id: string
          user_id: string
          kalorie_tagesziel: number | null
          protein_ziel: number | null
          karbs_ziel: number | null
          fett_ziel: number | null
          wasser_ziel_ml: number | null
          trainings_pro_woche: number | null
          startdatum: string | null
          startgewicht: number | null
          zielgewicht: number | null
          schlaf_ziel: number | null
          koerpergroesse: number | null
          alter_jahre: number | null
          updated_at: string
          notif_daily_reminder: boolean | null
          notif_reminder_time: string | null
          notif_appointments: boolean | null
          notif_appointment_minutes: number | null
          timezone?: string | null
          notif_praise?: boolean | null
          notif_streak?: boolean | null
          notif_water?: boolean | null
          notif_max_per_day?: number | null
          ernaehrungs_notizen: string | null
          coach_foto_freigabe: boolean | null
          consent_dsgvo: boolean | null
          consent_ai: boolean | null
          consent_given_at: string | null
          aktivitaetsniveau: string | null
          sport_ziel: string | null
          ernaehrungs_typ: string | null
          intervall_fasten: string | null
        }
        Insert: Omit<Database['public']['Tables']['client_settings']['Row'], 'id' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['client_settings']['Insert']>
      }
      gewicht: {
        Row: {
          id: string
          user_id: string
          datum: string
          gewicht: number
          notizen: string | null
          foto_url: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['gewicht']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['gewicht']['Insert']>
      }
      training: {
        Row: {
          id: string
          user_id: string
          datum: string
          trainingstyp: string | null
          dauer_min: number | null
          avg_puls: number | null
          kalorien_verbrannt: number | null
          notizen: string | null
          einheit_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['training']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['training']['Insert']>
      }
      uebungen: {
        Row: {
          id: string
          user_id: string
          training_id: string
          uebungsname: string
          saetze: number | null
          wdh: number | null
          gewicht_kg: number | null
          notizen: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['uebungen']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['uebungen']['Insert']>
      }
      schlaf: {
        Row: {
          id: string
          user_id: string
          datum: string
          einschlafzeit: string | null
          aufwachzeit: string | null
          schlafqualitaet: number | null
          notizen: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['schlaf']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['schlaf']['Insert']>
      }
      ernaehrung: {
        Row: {
          id: string
          user_id: string
          datum: string
          mahlzeit: string | null
          kalorien: number | null
          protein_g: number | null
          kohlenhydrate_g: number | null
          fett_g: number | null
          wasser_ml: number | null
          notizen: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ernaehrung']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['ernaehrung']['Insert']>
      }
      supplements: {
        Row: {
          id: string
          user_id: string
          name: string
          beschreibung: string | null
          dosierung: string | null
          zeitpunkt: string | null
          aktiv: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['supplements']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['supplements']['Insert']>
      }
      supplement_log: {
        Row: {
          id: string
          user_id: string
          supplement_id: string
          datum: string
          eingenommen: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['supplement_log']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['supplement_log']['Insert']>
      }
      kalender_events: {
        Row: {
          id: string
          coach_id: string
          client_id: string | null
          titel: string
          datum: string
          uhrzeit: string | null
          dauer_min: number | null
          typ: 'coaching' | 'training' | 'sonstiges'
          notizen: string | null
          vorlage_id?: string | null
          erinnerung_min?: number | null
          created_by?: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['kalender_events']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['kalender_events']['Insert']>
      }
      food_log: {
        Row: {
          id: string
          user_id: string
          datum: string
          mahlzeit: string
          name: string
          menge_g: number | null
          kalorien: number | null
          protein_g: number | null
          kohlenhydrate_g: number | null
          fett_g: number | null
          barcode: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['food_log']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['food_log']['Insert']>
      }
      wasser_log: {
        Row: {
          id: string
          user_id: string
          datum: string
          menge_ml: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['wasser_log']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['wasser_log']['Insert']>
      }
      coach_plans: {
        Row: {
          id: string
          client_id: string
          coach_id: string
          pdf_storage_path: string | null
          pdf_name: string | null
          angewendet_am: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['coach_plans']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['coach_plans']['Insert']>
      }
      rezepte: {
        Row: {
          id: string
          user_id: string
          name: string
          zutaten_text: string | null
          kochanleitung: string | null
          bild_url: string | null
          portionen: number
          kalorien: number
          protein_g: number | null
          kohlenhydrate_g: number | null
          fett_g: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['rezepte']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['rezepte']['Insert']>
      }
      haushalte: {
        Row: {
          id: string
          coach_id: string
          name: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['haushalte']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['haushalte']['Insert']>
      }
      haushalt_mitglieder: {
        Row: {
          id: string
          haushalt_id: string
          user_id: string
          anzeige_name: string
          kalorien_ziel: number | null
          praeferenzen: string | null
        }
        Insert: Omit<Database['public']['Tables']['haushalt_mitglieder']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['haushalt_mitglieder']['Insert']>
      }
      meal_plans: {
        Row: {
          id: string
          user_id: string
          datum: string
          mahlzeit: string
          rezept_id: string | null
          rezept_name: string
          portionen: number
          kalorien: number | null
          protein_g: number | null
          kohlenhydrate_g: number | null
          fett_g: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['meal_plans']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['meal_plans']['Insert']>
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type InviteCode = Database['public']['Tables']['invite_codes']['Row']
export type ClientSettings = Database['public']['Tables']['client_settings']['Row']
export type GewichtEntry = Database['public']['Tables']['gewicht']['Row']
export type TrainingEntry = Database['public']['Tables']['training']['Row']
export type UebungEntry = Database['public']['Tables']['uebungen']['Row']
export type SchlafEntry = Database['public']['Tables']['schlaf']['Row']
export type ErnaehrungEntry = Database['public']['Tables']['ernaehrung']['Row']
export type Supplement = Database['public']['Tables']['supplements']['Row']
export type SupplementLog = Database['public']['Tables']['supplement_log']['Row']
export type KalenderEvent = Database['public']['Tables']['kalender_events']['Row']
export type FoodLogItem = Database['public']['Tables']['food_log']['Row']
export type WasserLogEntry = Database['public']['Tables']['wasser_log']['Row']
export type CoachPlan = Database['public']['Tables']['coach_plans']['Row']
export type Rezept = Database['public']['Tables']['rezepte']['Row']
export type MealPlanEntry = Database['public']['Tables']['meal_plans']['Row']
export type Haushalt = Database['public']['Tables']['haushalte']['Row']
export type HaushaltMitglied = Database['public']['Tables']['haushalt_mitglieder']['Row']
