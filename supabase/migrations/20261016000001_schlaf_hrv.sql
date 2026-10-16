-- HRV (Herzratenvariabilität, in Millisekunden) zum Schlafeintrag.
-- Die Datei darf mehrfach laufen.
ALTER TABLE public.schlaf ADD COLUMN IF NOT EXISTS hrv_ms numeric(5,1);
ALTER TABLE public.schlaf DROP CONSTRAINT IF EXISTS schlaf_hrv_ms_bereich;
ALTER TABLE public.schlaf ADD CONSTRAINT schlaf_hrv_ms_bereich CHECK (hrv_ms IS NULL OR (hrv_ms > 0 AND hrv_ms <= 500));
