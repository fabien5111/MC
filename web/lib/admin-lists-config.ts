// Config des sections de « Gestion des listes » — partagée entre la page
// serveur (app/admin/listes) et le gestionnaire client (ListsManager).
//
// IMPORTANT : ce module ne doit PAS avoir 'use client'. Un Server Component ne
// peut pas lire une valeur non-composant (ex. un tableau) exportée depuis un
// module 'use client' — Next.js la remplace par une référence opaque côté
// serveur, et .map()/.forEach() dessus lève une exception serveur silencieuse
// (« Application error: a server-side exception has occurred »).
export type Field = { key: string; label: string; type?: 'text' | 'number' | 'select'; options?: string[]; required?: boolean };
export type Section = { table: string; label: string; fields: Field[] };

const TOOLTIP: Field = { key: 'tooltip', label: 'Infobulle' };

export const SECTIONS: Section[] = [
  { table: 'recipe_types', label: 'Types de recettes', fields: [{ key: 'name', label: 'Nom', required: true }, TOOLTIP] },
  { table: 'tags', label: 'Tags', fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'slug', label: 'Slug' }, TOOLTIP] },
  {
    table: 'mold_types',
    label: 'Types de moules',
    fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'forme', label: 'Forme', type: 'select', options: ['cylindre', 'rectangulaire', 'demi-cylindre', 'oblong'] }, TOOLTIP],
  },
  { table: 'difficulties', label: 'Difficultés', fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'level', label: 'Niveau (1–5)', type: 'number', required: true }, TOOLTIP] },
  { table: 'units', label: 'Unités', fields: [{ key: 'name', label: 'Nom', required: true }, TOOLTIP] },
  { table: 'ingredient_refs', label: 'Ingrédients', fields: [{ key: 'name', label: 'Libellé', required: true }, { key: 'url', label: 'URL' }, TOOLTIP] },
  { table: 'utensils', label: 'Ustensiles', fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'comment', label: 'Commentaire' }, { key: 'url', label: 'URL' }, TOOLTIP] },
];
