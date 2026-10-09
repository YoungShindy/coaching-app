-- Paket 4: Charakter, Level, Punkte, Shop, Challenges und Belohnungen

-- 1) Charakter: Aussehen, Name, getragene Dinge und die Antworten aus dem Kennenlernen
create table if not exists public.characters (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 16),
  config jsonb not null default '{}'::jsonb,
  equipped jsonb not null default '{}'::jsonb,   -- z. B. {"kopf":"cap","brille":"sunglasses","tier":"dog"}
  kennenlernen jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.characters enable row level security;
drop policy if exists "Users manage own character" on public.characters;
create policy "Users manage own character" on public.characters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Coach reads client character" on public.characters;
create policy "Coach reads client character" on public.characters
  for select using (exists (select 1 from public.profiles p where p.id = characters.user_id and p.coach_id = auth.uid()));

-- 2) Protokoll aller Erfolge (XP für das Level, Punkte zum Ausgeben). Käufe und Einlösungen stehen mit negativen Punkten drin.
--    Jede Kombination aus Nutzer, Quelle und Referenz gibt es nur einmal: so zählt „Grüner Tag 12.10.“ nie doppelt.
create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quelle text not null,
  ref text not null,
  xp integer not null default 0 check (xp between 0 and 500),
  punkte integer not null default 0 check (punkte between -5000 and 500),
  titel text,
  created_at timestamptz not null default now(),
  unique (user_id, quelle, ref)
);
create index if not exists xp_events_user_created_idx on public.xp_events (user_id, created_at desc);
alter table public.xp_events enable row level security;
drop policy if exists "Users read own xp events" on public.xp_events;
create policy "Users read own xp events" on public.xp_events for select using (auth.uid() = user_id);
drop policy if exists "Users add own xp events" on public.xp_events;
create policy "Users add own xp events" on public.xp_events for insert with check (auth.uid() = user_id);

-- Ausgeben geht nur mit genug Punkten
create or replace function public.check_points_balance() returns trigger
language plpgsql as $$
declare
  balance integer;
begin
  if new.punkte < 0 then
    -- Zwei Geräte gleichzeitig: hintereinander prüfen, sonst könnte das Guthaben unter null fallen
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    select coalesce(sum(punkte), 0) into balance from public.xp_events where user_id = new.user_id;
    if balance + new.punkte < 0 then
      raise exception 'Nicht genug Punkte' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists xp_events_check_balance on public.xp_events;
create trigger xp_events_check_balance before insert on public.xp_events
  for each row execute function public.check_points_balance();

-- Summen für Level und Punkte. Bewusst ohne security_invoker: Nutzer sehen ihre eigenen Summen,
-- der Coach die seiner Klienten. Einzelne Protokollzeilen bleiben privat.
create or replace view public.character_stats as
  select x.user_id, coalesce(sum(x.xp), 0)::integer as xp, coalesce(sum(x.punkte), 0)::integer as punkte
  from public.xp_events x
  where x.user_id = auth.uid()
     or exists (select 1 from public.profiles p where p.id = x.user_id and p.coach_id = auth.uid())
  group by x.user_id;
grant select on public.character_stats to authenticated;

-- 3) Challenges: feste Liste aus der App (vorlage_id) oder vom Coach gesetzt (coach_id)
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  vorlage_id text,
  titel text not null check (char_length(titel) between 1 and 120),
  beschreibung text,
  kategorie text,
  punkte integer not null default 20 check (punkte between 5 and 100),
  status text not null default 'aktiv' check (status in ('aktiv', 'erledigt', 'abgebrochen')),
  frist date,
  nachweis_text text,
  nachweis_pfad text,                       -- Foto im Bucket challenge-proofs
  erledigt_am timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists challenges_user_idx on public.challenges (user_id, status);
create index if not exists challenges_coach_idx on public.challenges (coach_id, user_id);
alter table public.challenges enable row level security;

drop policy if exists "Users read own challenges" on public.challenges;
create policy "Users read own challenges" on public.challenges for select using (auth.uid() = user_id);
drop policy if exists "Users start own challenges" on public.challenges;
create policy "Users start own challenges" on public.challenges for insert
  with check (auth.uid() = user_id and coach_id is null);
drop policy if exists "Users finish own challenges" on public.challenges;
create policy "Users finish own challenges" on public.challenges for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users drop own challenges" on public.challenges;
create policy "Users drop own challenges" on public.challenges for delete using (auth.uid() = user_id and coach_id is null);

drop policy if exists "Coach manages assigned challenges" on public.challenges;
create policy "Coach manages assigned challenges" on public.challenges for all
  using (auth.uid() = coach_id)
  with check (
    auth.uid() = coach_id
    and exists (select 1 from public.profiles p where p.id = challenges.user_id and p.coach_id = auth.uid())
  );

-- Nutzer dürfen bei Coach-Challenges nur Status und Nachweis ändern, nicht Punkte oder Titel
create or replace function public.challenges_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() = old.user_id and old.coach_id is distinct from auth.uid() then
    new.user_id := old.user_id; new.coach_id := old.coach_id; new.vorlage_id := old.vorlage_id;
    new.titel := old.titel; new.beschreibung := old.beschreibung; new.kategorie := old.kategorie;
    new.punkte := old.punkte; new.frist := old.frist; new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists challenges_guard_trg on public.challenges;
create trigger challenges_guard_trg before update on public.challenges
  for each row execute function public.challenges_guard();

-- 4) Eigene Belohnungen mit Preis und eingelöste Gutscheine (privat, nur für den Nutzer)
create table if not exists public.belohnungen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  titel text not null check (char_length(titel) between 1 and 60),
  preis integer not null check (preis between 10 and 5000),
  emoji text,
  created_at timestamptz not null default now()
);
create table if not exists public.einloesungen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  titel text not null,
  preis integer not null,
  emoji text,
  eingeloest_am timestamptz not null default now(),
  genutzt boolean not null default false
);
alter table public.belohnungen enable row level security;
alter table public.einloesungen enable row level security;
drop policy if exists "Users manage own rewards" on public.belohnungen;
create policy "Users manage own rewards" on public.belohnungen for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own vouchers" on public.einloesungen;
create policy "Users manage own vouchers" on public.einloesungen for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5) Nachweisfotos der Challenges (privat). Der Coach sieht sie nur bei Challenges, die er selbst gesetzt hat.
insert into storage.buckets (id, name, public) values ('challenge-proofs', 'challenge-proofs', false) on conflict (id) do nothing;
drop policy if exists "Users manage own challenge proofs" on storage.objects;
create policy "Users manage own challenge proofs" on storage.objects for all to authenticated
  using (bucket_id = 'challenge-proofs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'challenge-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Coach reads proofs of own challenges" on storage.objects;
create policy "Coach reads proofs of own challenges" on storage.objects for select to authenticated
  using (
    bucket_id = 'challenge-proofs'
    and exists (select 1 from public.challenges c where c.nachweis_pfad = storage.objects.name and c.coach_id = auth.uid())
  );
