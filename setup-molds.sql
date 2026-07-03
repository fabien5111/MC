-- ============================================================
-- TABLE MOLDS — Moules spécifiques avec type
-- Exécuter dans : Supabase > SQL Editor > New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.molds (
  id         bigint generated always as identity primary key,
  name       text    not null,
  type_id    bigint  references public.mold_types(id) on delete set null,
  status     text    not null default 'published',
  created_at timestamptz not null default now()
);

ALTER TABLE public.molds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read molds"
  ON public.molds FOR SELECT
  USING (status = 'published');

CREATE POLICY "Authenticated manage molds"
  ON public.molds FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
