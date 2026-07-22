// Config des sections de « Gestion des listes » — partagée entre la page
// serveur (app/admin/listes) et le gestionnaire client (ListsManager).
//
// IMPORTANT : ce module ne doit PAS avoir 'use client'. Un Server Component ne
// peut pas lire une valeur non-composant (ex. un tableau) exportée depuis un
// module 'use client' — Next.js la remplace par une référence opaque côté
// serveur, et .map()/.forEach() dessus lève une exception serveur silencieuse
// (« Application error: a server-side exception has occurred »).
// `refTable` : select dynamique dont les options proviennent d'une autre liste
// déjà chargée (id + name), ex. l'allergène d'un ingrédient. La valeur stockée
// est l'id numérique de l'entrée liée (ou null).
// `image` : dépôt d'un visuel (ex. picto d'allergène) compressé en data-URL
// côté client (comme avatar_url / hero_image_url), stocké tel quel en base.
export type Field = { key: string; label: string; type?: 'text' | 'number' | 'select' | 'image'; options?: string[]; refTable?: string; required?: boolean };
export type Section = { table: string; label: string; type: string; badge: string; desc: string; fields: Field[] };

const TOOLTIP: Field = { key: 'tooltip', label: 'Infobulle' };

// Tables dont la colonne `slug` (NOT NULL en base) n'est pas exposée dans le
// formulaire — générée automatiquement depuis le nom à l'enregistrement,
// comme dans admin-listes.html (saveFormPanel).
export const SLUG_TABLES = ['recipe_types', 'tags', 'mold_types'];

export const SECTIONS: Section[] = [
  {
    table: 'recipe_types',
    label: 'Types de recettes',
    type: 'Taxonomie',
    badge: 'bg-secondary-container text-on-secondary-container',
    desc: 'Classification principale des recettes',
    fields: [{ key: 'name', label: 'Nom', required: true }, TOOLTIP],
  },
  {
    table: 'tags',
    label: 'Tags',
    type: 'Étiquettes',
    badge: 'bg-tertiary-fixed text-on-tertiary-fixed',
    desc: 'Mots-clés pour le filtrage des recettes',
    fields: [
      { key: 'name', label: 'Nom', required: true },
      { key: 'slug', label: 'Slug' },
      // Renseigner une icône Material Symbols (ex. « cake ») promeut le tag en
      // catégorie affichée sur l'accueil ; laisser vide pour un tag ordinaire.
      { key: 'category_icon', label: 'Icône catégorie (accueil)' },
      TOOLTIP,
    ],
  },
  {
    table: 'mold_types',
    label: 'Types de moules',
    type: 'Matériel',
    badge: 'bg-primary-fixed text-on-primary-fixed',
    desc: 'Catégories de moules utilisées dans les recettes',
    fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'forme', label: 'Forme', type: 'select', options: ['cylindre', 'rectangulaire', 'demi-cylindre', 'oblong'] }, TOOLTIP],
  },
  {
    table: 'molds',
    label: 'Moules',
    type: 'Matériel',
    badge: 'bg-primary-fixed text-on-primary-fixed',
    desc: 'Moules référencés dans les recettes',
    fields: [], // géré spécifiquement (name + type_id select + infobulle), comme en vanilla
  },
  {
    table: 'difficulties',
    label: 'Difficultés',
    type: 'Notation',
    badge: 'bg-secondary-container text-on-secondary-container',
    desc: 'Niveaux de complexité des recettes',
    fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'level', label: 'Niveau (1–5)', type: 'number', required: true }, TOOLTIP],
  },
  {
    table: 'units',
    label: 'Unités de mesure',
    type: 'Global',
    badge: 'bg-outline-variant text-on-surface-variant',
    desc: 'Unités disponibles dans les recettes',
    fields: [{ key: 'name', label: 'Nom', required: true }, TOOLTIP],
  },
  {
    table: 'ingredient_refs',
    label: 'Ingrédients',
    type: 'Garde-manger',
    badge: 'bg-tertiary-fixed text-on-tertiary-fixed',
    desc: 'Ingrédients de référence pour les recettes',
    fields: [
      { key: 'name', label: 'Libellé', required: true },
      { key: 'allergen_id', label: 'Allergène', type: 'select', refTable: 'allergens' },
      { key: 'url', label: 'URL' },
      TOOLTIP,
    ],
  },
  {
    table: 'allergens',
    label: 'Allergènes',
    type: 'Nutrition',
    badge: 'bg-secondary-container text-on-secondary-container',
    desc: 'Allergènes de référence pour les recettes',
    fields: [{ key: 'name', label: 'Libellé', required: true }, { key: 'picto', label: 'Picto', type: 'image' }, { key: 'url', label: 'URL' }, TOOLTIP],
  },
  {
    table: 'utensils',
    label: 'Ustensiles',
    type: 'Matériel',
    badge: 'bg-primary-fixed text-on-primary-fixed',
    desc: 'Ustensiles de référence pour les recettes',
    fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'comment', label: 'Commentaire' }, { key: 'url', label: 'URL' }, TOOLTIP],
  },
];
