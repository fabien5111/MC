-- Contrainte `imports_source_type_check` : valeurs autorisées de `source_type`.
--
-- L'import ne gérait au départ que les URL (`source_type = 'url'`) et la
-- contrainte n'autorisait que cette valeur. L'import par texte collé insère
-- `source_type = 'texte'` (voir app/api/import-url/route.ts), ce qui violait
-- la contrainte :
--   new row for relation "imports" violates check constraint
--   "imports_source_type_check"
--
-- On redéfinit la contrainte pour autoriser les sources réellement produites
-- par le code (`url`, `texte`) ainsi que `pdf` (import de fichier à venir).
--
-- À exécuter dans l'éditeur SQL de Supabase (projet mc-snowy), puis
-- régénérer les types : `npm run gen:types`.

alter table public.imports
  drop constraint if exists imports_source_type_check;

alter table public.imports
  add constraint imports_source_type_check
  check (source_type in ('url', 'texte', 'pdf'));
