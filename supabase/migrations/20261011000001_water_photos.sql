-- Paket 3: Flaschengröße fürs Wasser und frei beschriftete Körperfotos mit Vergleich

-- 1) Flaschengröße des Nutzers (Standard 500 ml)
alter table public.client_settings add column if not exists wasser_flasche_ml integer default 500;
alter table public.client_settings drop constraint if exists client_settings_wasser_flasche_ml_check;
alter table public.client_settings
  add constraint client_settings_wasser_flasche_ml_check check (wasser_flasche_ml is null or wasser_flasche_ml between 100 and 2000);

-- 2) Speicher für Körperfotos (privat). Die Zugriffsregeln für storage.objects stehen schon in
--    20260729000003_security_hardening.sql: Nutzer ihren eigenen Ordner, Coach nur mit Freigabe.
insert into storage.buckets (id, name, public) values ('body-photos', 'body-photos', false) on conflict (id) do nothing;

-- 3) Körperfotos: mehrere pro Tag, frei beschriftet (z. B. „Vorne“, „Seite“, „Rücken“, „Pose Bizeps“)
create table if not exists public.koerperfotos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  datum date not null,
  pfad text not null,                      -- Pfad im Bucket body-photos: <user_id>/<datei>
  label text not null default 'Foto',
  created_at timestamptz not null default now()
);
create index if not exists koerperfotos_user_datum_idx on public.koerperfotos (user_id, datum desc);

alter table public.koerperfotos enable row level security;

drop policy if exists "Users manage own body photo rows" on public.koerperfotos;
create policy "Users manage own body photo rows" on public.koerperfotos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Coach sieht die Fotos seiner Klienten nur mit Freigabe des Klienten
drop policy if exists "Coach reads client body photo rows" on public.koerperfotos;
create policy "Coach reads client body photo rows" on public.koerperfotos
  for select using (
    exists (
      select 1 from public.profiles p
      join public.client_settings cs on cs.user_id = p.id
      where p.id = koerperfotos.user_id and p.coach_id = auth.uid() and cs.coach_foto_freigabe = true
    )
  );
