-- Catégories d'accueil portées par le référentiel des tags.
--
-- Une seule colonne `category_icon` suffit à « gérer les catégories » :
--   • NULL           → tag ordinaire (filtrage des recettes uniquement) ;
--   • valeur non NULL → le tag est mis en avant comme CATÉGORIE sur la page
--     d'accueil (section « Explorer par Catégorie »), la valeur étant le nom
--     de l'icône Material Symbols affichée (ex. « cake », « icecream »).
--
-- Les tags restent écrits par les administrateurs (policy admin déjà en place
-- sur la table). À exécuter dans l'éditeur SQL de Supabase (projet mc-snowy),
-- puis régénérer les types : `npm run gen:types`.

alter table public.tags
  add column if not exists category_icon text;

comment on column public.tags.category_icon is
  'Icône Material Symbols si le tag est une catégorie d''accueil ; NULL sinon.';
