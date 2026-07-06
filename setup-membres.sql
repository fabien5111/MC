-- ============================================================
-- MEMBRES — Allowlist + extension profiles
-- Exécuter dans : Supabase > SQL Editor > New Query
-- ============================================================

-- Étendre la table profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email     text,
  ADD COLUMN IF NOT EXISTS status    text NOT NULL DEFAULT 'active',  -- active | disabled
  ADD COLUMN IF NOT EXISTS role      text NOT NULL DEFAULT 'member',  -- member | admin
  ADD COLUMN IF NOT EXISTS plan      text NOT NULL DEFAULT 'free',    -- free | paid
  ADD COLUMN IF NOT EXISTS is_demo   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes     text,
  ADD COLUMN IF NOT EXISTS provider  text;  -- 'google' | 'email'

-- Table allowlist (emails autorisés à s'inscrire)
CREATE TABLE IF NOT EXISTS public.allowlist (
  id          bigint generated always as identity primary key,
  email       text        NOT NULL UNIQUE,
  status      text        NOT NULL DEFAULT 'pending',  -- pending | active | disabled
  role        text        NOT NULL DEFAULT 'member',   -- member | admin
  plan        text        NOT NULL DEFAULT 'free',     -- free | paid
  is_demo     boolean     NOT NULL DEFAULT false,
  notes       text,
  invited_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read allowlist"
  ON public.allowlist FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated manage allowlist"
  ON public.allowlist FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
