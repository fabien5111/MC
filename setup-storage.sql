-- ============================================================
-- SETUP STORAGE — Bucket avatars + colonne banner_url
-- Exécuter dans : Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Colonne bannière dans profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banner_url text;

-- 2. Bucket de stockage public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- 3. Politiques RLS sur le bucket

-- Lecture publique (tout le monde peut voir les photos)
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Upload dans son propre dossier (userId/fichier)
CREATE POLICY "Users upload own photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Mise à jour de ses propres fichiers
CREATE POLICY "Users update own photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Suppression de ses propres fichiers
CREATE POLICY "Users delete own photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
