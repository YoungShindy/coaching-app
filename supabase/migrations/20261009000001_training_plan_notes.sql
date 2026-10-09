-- Plan-Baukasten (Vorlagen gehören zu einem Plan) und Wiederholungsbereiche
alter table public.training_vorlagen add column if not exists plan_name text;
alter table public.training_vorlagen add column if not exists plan_split text;
alter table public.training_vorlagen add column if not exists plan_reihenfolge integer;

alter table public.vorlagen_uebungen add column if not exists wdh_text text;   -- z. B. "6-8"
alter table public.vorlagen_uebungen add column if not exists gruppe text;     -- Muskelgruppe der Vorlage
alter table public.vorlagen_uebungen add column if not exists rolle text;      -- grund | iso

-- Notiz je Übung im Training (Coach liest über die bestehende Policy mit)
alter table public.uebungen add column if not exists notizen text;
alter table public.uebungen add column if not exists saetze_log jsonb;
