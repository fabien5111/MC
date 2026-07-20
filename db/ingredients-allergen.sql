-- Allergène porté par un ingrédient de recette.
--
-- Texte dénormalisé (comme `name`) : renseigné soit depuis le référentiel
-- quand l'ingrédient est choisi dans la liste, soit à la main pour un
-- ingrédient saisi librement. Pas de clé étrangère : l'info doit survivre à
-- une modification du référentiel et rester éditable en saisie libre.
--
-- À exécuter dans l'éditeur SQL de Supabase (projet mc-snowy), puis
-- régénérer les types : `npm run gen:types`.

alter table public.ingredients
  add column if not exists allergen text;
