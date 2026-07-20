-- Lien allergène ↔ ingrédient de référence.
--
-- Un ingrédient porte au plus UN allergène (relation simple, pas de table de
-- liaison). L'info d'allergène des recettes est déduite de leurs ingrédients.
--
-- Prérequis : la table `allergens` doit exister (voir db/allergens.sql).
-- À exécuter dans l'éditeur SQL de Supabase (projet mc-snowy), puis
-- régénérer les types : `npm run gen:types`.

alter table public.ingredient_refs
  add column if not exists allergen_id bigint
    references public.allergens(id) on delete set null;
