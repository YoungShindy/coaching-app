-- Paket 2: Push auf mehreren Geräten (auch Apple), Zeitzone, Nachrichtenarten, Erinnerung und Vorlage pro Termin

-- 1) Push-Abos: mehrere Geräte pro Nutzer (iPhone, iPad, Mac, Android ...)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Users manage own subscription" on public.push_subscriptions;
create policy "Users manage own subscription" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.push_subscriptions drop constraint if exists push_subscriptions_user_id_key;
alter table public.push_subscriptions
  add column if not exists user_agent text,
  add column if not exists device_label text,
  add column if not exists last_seen_at timestamptz default now();
create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- 2) Einstellungen: Zeitzone und Nachrichtenarten
alter table public.client_settings
  add column if not exists notif_daily_reminder boolean default true,
  add column if not exists notif_reminder_time text default '20:00',
  add column if not exists notif_appointments boolean default true,
  add column if not exists notif_appointment_minutes integer default 60,
  add column if not exists timezone text default 'Europe/Berlin',
  add column if not exists notif_praise boolean default true,
  add column if not exists notif_streak boolean default true,
  add column if not exists notif_water boolean default true,
  add column if not exists notif_max_per_day integer default 3;

alter table public.client_settings drop constraint if exists client_settings_notif_max_per_day_check;
alter table public.client_settings
  add constraint client_settings_notif_max_per_day_check check (notif_max_per_day is null or notif_max_per_day between 1 and 3);

-- 3) Protokoll verschickter Nachrichten (verhindert Doppelte, zählt das Tageslimit).
--    Ohne Policy: Nutzer haben keinen Zugriff, nur der Service-Key der Edge Function.
create table if not exists public.push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  ref text not null,
  local_date date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
alter table public.push_log enable row level security;
create index if not exists push_log_user_date_idx on public.push_log (user_id, local_date);

-- 4) Kalender: Vorlage aus dem Trainingsbereich und Erinnerung pro Termin
alter table public.kalender_events
  add column if not exists vorlage_id uuid references public.training_vorlagen(id) on delete set null,
  add column if not exists erinnerung_min integer,   -- null = Standard aus den Einstellungen, 0 = keine Erinnerung
  add column if not exists created_by uuid default auth.uid();

-- Athleten dürfen eigene Termine (z. B. Training mit Vorlage) anlegen, ändern und löschen.
-- Vom Coach angelegte Termine bleiben für Athleten schreibgeschützt (created_by ist der Coach).
drop policy if exists "Clients manage own created events" on public.kalender_events;
create policy "Clients manage own created events" on public.kalender_events
  for all
  using (client_id = auth.uid() and created_by = auth.uid())
  with check (
    client_id = auth.uid() and created_by = auth.uid()
    and (coach_id = auth.uid() or coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid()))
  );

create index if not exists kalender_events_vorlage_idx on public.kalender_events (vorlage_id);
