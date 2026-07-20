-- Champs « source » et conseils de dégustation/conservation d'une recette.
--
--  source          : origine de la recette (ex. « Cyril Lignac »)
--  source_url      : lien vers la recette d'origine
--  video_url       : lien vers une vidéo de la recette (optionnel)
--  serving_advice  : conseils de dégustation et de conservation (fin de recette)
--
-- Colonnes additives, rétro-compatibles. À exécuter dans l'éditeur SQL de
-- Supabase (projet mc-snowy) AVANT le déploiement du code qui les utilise,
-- puis régénérer les types : `npm run gen:types`.

alter table public.recipes
  add column if not exists source text,
  add column if not exists source_url text,
  add column if not exists video_url text,
  add column if not exists serving_advice text;
