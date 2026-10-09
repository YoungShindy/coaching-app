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

-- Erfolge werden gegen die echten Daten geprüft: Punkte und XP gibt es nur für das, was wirklich eingetragen wurde,
-- in der Höhe, die die App vorsieht. Ausgaben nur über Shop und Belohnungen. Gleiche Werte wie in src/lib/game.ts.
create or replace function public.xp_ref_date(p text) returns date
language plpgsql stable as $$
declare
  d date;
begin
  d := p::date;
  -- Spielraum für Zeitzonen: die App rechnet mit dem Datum des Geräts, der Server mit UTC
  if d < current_date - 2 or d > current_date + 1 then
    raise exception 'Datum nicht zulässig' using errcode = 'P0001';
  end if;
  return d;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  raise exception 'Ungültiges Datum' using errcode = 'P0001';
end;
$$;

create or replace function public.xp_supplements_done(uid uuid, d date) returns boolean
language sql stable as $$
  select
    (select count(*) from public.supplements s where s.user_id = uid and s.aktiv) > 0
    and (select count(distinct l.supplement_id) from public.supplement_log l
         join public.supplements s on s.id = l.supplement_id and s.aktiv
         where l.user_id = uid and l.datum = d and l.eingenommen)
        >= (select count(*) from public.supplements s where s.user_id = uid and s.aktiv)
$$;

create or replace function public.xp_meals(uid uuid, d date) returns integer
language sql stable as $$
  select count(distinct f.mahlzeit)::integer from public.food_log f
  where f.user_id = uid and f.datum = d and f.mahlzeit in ('Frühstück', 'Mittagessen', 'Abendessen')
$$;

create or replace function public.validate_xp_event() returns trigger
language plpgsql as $$
declare
  d date; n integer; meal text; cnt integer; goal integer; sd date; ed date;
  rx integer; rp integer; supp_total integer;
begin
  if new.xp < 0 then
    raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
  end if;

  -- Ausgeben: nur Shop und Belohnungen, ohne XP
  if new.punkte < 0 then
    if new.xp <> 0 or new.quelle not in ('shop', 'belohnung') then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.quelle = 'start' then
    if new.ref <> 'willkommen' or new.xp <> 0 or new.punkte <> 50
       or not exists (select 1 from public.characters c where c.user_id = new.user_id) then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;

  elsif new.quelle = 'mahlzeit' then
    d := public.xp_ref_date(split_part(new.ref, ':', 1));
    meal := split_part(new.ref, ':', 2);
    if new.xp <> 6 or new.punkte <> 0 or meal not in ('Frühstück', 'Mittagessen', 'Abendessen')
       or not exists (select 1 from public.food_log f where f.user_id = new.user_id and f.datum = d and f.mahlzeit = meal) then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;

  elsif new.quelle = 'schlaf' then
    d := public.xp_ref_date(new.ref);
    if new.xp <> 8 or new.punkte <> 0 or not exists (select 1 from public.schlaf x where x.user_id = new.user_id and x.datum = d) then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;

  elsif new.quelle = 'gewicht' then
    d := public.xp_ref_date(new.ref);
    if new.xp <> 5 or new.punkte <> 0 or not exists (select 1 from public.gewicht x where x.user_id = new.user_id and x.datum = d) then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;

  elsif new.quelle = 'training' then
    d := public.xp_ref_date(split_part(new.ref, ':', 1));
    n := split_part(new.ref, ':', 2)::integer;
    select count(*) into cnt from public.training t where t.user_id = new.user_id and t.datum = d;
    if new.xp <> 30 or new.punkte <> 10 or n not in (1, 2) or cnt < n then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;

  elsif new.quelle = 'supplements' then
    d := public.xp_ref_date(new.ref);
    if new.xp <> 8 or new.punkte <> 0 or not public.xp_supplements_done(new.user_id, d) then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;

  elsif new.quelle = 'wasser' then
    d := public.xp_ref_date(new.ref);
    select coalesce(c.wasser_ziel_ml, 0) into goal from public.client_settings c where c.user_id = new.user_id;
    select coalesce(sum(w.menge_ml), 0) into cnt from public.wasser_log w where w.user_id = new.user_id and w.datum = d;
    if new.xp <> 20 or new.punkte <> 10 or coalesce(goal, 0) <= 0 or cnt < goal then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;

  elsif new.quelle = 'gruener-tag' then
    d := public.xp_ref_date(new.ref);
    select count(*) into supp_total from public.supplements s where s.user_id = new.user_id and s.aktiv;
    if new.xp <> 30 or new.punkte <> 20
       or public.xp_meals(new.user_id, d) < 3
       or not exists (select 1 from public.schlaf x where x.user_id = new.user_id and x.datum = d)
       or (supp_total > 0 and not public.xp_supplements_done(new.user_id, d)) then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;

  elsif new.quelle = 'streak' then
    -- Referenz "Tage@Starttag": alle Tage von Starttag bis heute (oder gestern) haben mindestens einen Eintrag
    n := split_part(new.ref, '@', 1)::integer;
    sd := split_part(new.ref, '@', 2)::date;   -- der Starttag liegt Tage zurück, geprüft wird der letzte Tag der Serie
    select v.xp, v.punkte into rx, rp from (values
      (3, 15, 10), (7, 40, 25), (14, 80, 40), (21, 100, 50), (30, 150, 75), (50, 200, 100),
      (75, 250, 125), (100, 300, 200), (150, 350, 250), (200, 400, 300), (365, 500, 500)
    ) as v(days, xp, punkte) where v.days = n;
    if rx is null or new.xp <> rx or new.punkte <> rp then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;
    ed := sd + (n - 1);
    if ed < current_date - 2 or ed > current_date + 1 then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;
    select count(*) into cnt from (
      select datum from public.gewicht where user_id = new.user_id and datum between sd and ed
      union select datum from public.schlaf where user_id = new.user_id and datum between sd and ed
      union select datum from public.training where user_id = new.user_id and datum between sd and ed
      union select datum from public.food_log where user_id = new.user_id and datum between sd and ed
    ) days;
    if cnt < n then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;

  elsif new.quelle = 'challenge' then
    -- Punkte wie bei der Challenge hinterlegt, XP 1,5-fach (höchstens 500); höchstens 6 pro 24 Stunden
    select c.punkte into cnt from public.challenges c
      where c.id::text = new.ref and c.user_id = new.user_id and c.status in ('aktiv', 'erledigt');
    if cnt is null or new.punkte <> cnt or new.xp <> least(500, round(cnt * 1.5))::integer
       or (select count(*) from public.xp_events e where e.user_id = new.user_id and e.quelle = 'challenge'
           and e.created_at > now() - interval '24 hours') >= 6 then
      raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
    end if;

  else
    raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
  end if;

  return new;
exception when invalid_text_representation then
  raise exception 'Ungültiger Eintrag' using errcode = 'P0001';
end;
$$;
drop trigger if exists xp_events_validate on public.xp_events;
create trigger xp_events_validate before insert on public.xp_events
  for each row execute function public.validate_xp_event();

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
  with check (auth.uid() = user_id and coach_id is null and punkte between 5 and 30);
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
