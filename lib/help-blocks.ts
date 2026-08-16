// Blocs d'aide contextuelle — déclaration PURE (aucun accès Supabase).
//
// Les blocs eux-mêmes (clé, page, emplacement) sont fixés dans le code : la
// section admin « Blocs d'aide » n'en édite que le contenu (texte + lien
// vidéo, table `help_blocks`), sans écran d'ajout/suppression. Un nouveau
// bloc s'ajoute donc ici, un par un, au fil des besoins.
export type HelpPageSlug = 'creer' | 'planification';

export const HELP_PAGES: { slug: HelpPageSlug; label: string }[] = [
  { slug: 'creer', label: 'Création / modification recette' },
  { slug: 'planification', label: 'Planification' },
];

export type HelpBlockDef = {
  key: string;
  page: HelpPageSlug;
  // Repère l'emplacement du bloc dans l'écran admin — jamais montré aux membres.
  adminLabel: string;
};

export const HELP_BLOCKS: HelpBlockDef[] = [
  { key: 'creer.intro', page: 'creer', adminLabel: "En haut du formulaire, juste avant le titre" },
  { key: 'creer.taille', page: 'creer', adminLabel: "Avant la section « Taille / Nombre de portions »" },
  {
    key: 'creer.ajustement_etape',
    page: 'creer',
    adminLabel: "Dans la 1ʳᵉ étape, avant « Ajustement des quantités de cette étape »",
  },
  {
    key: 'creer.description_etape',
    page: 'creer',
    adminLabel: "Dans la 1ʳᵉ étape, avant le champ « Description »",
  },
  {
    key: 'creer.verification',
    page: 'creer',
    adminLabel: "« Vérification de la recette » — avant la section « Planning de préparation »",
  },
  {
    key: 'creer.ingredients_recap',
    page: 'creer',
    adminLabel: "« Liste complète des ingrédients » — avant la section « Récapitulatif des ingrédients »",
  },
  {
    key: 'creer.ustensiles',
    page: 'creer',
    adminLabel: "Avant la section « Ustensiles nécessaires »",
  },
];

export function helpBlocksForPage(page: HelpPageSlug): HelpBlockDef[] {
  return HELP_BLOCKS.filter((b) => b.page === page);
}

export function helpPageLabel(page: string): string {
  return HELP_PAGES.find((p) => p.slug === page)?.label ?? page;
}

export function isHelpPageSlug(page: string): page is HelpPageSlug {
  return HELP_PAGES.some((p) => p.slug === page);
}
