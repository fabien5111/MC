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

// Les 7 blocs ci-dessous sont aussi affichés sur /relecture (relecture d'un
// import), au même endroit du parcours (RelectureEditor réutilise ces mêmes
// clés plutôt que d'en déclarer de nouvelles) : un seul contenu à saisir ici
// pour les deux écrans, et un masquage par le membre vaut pour les deux.
export const HELP_BLOCKS: HelpBlockDef[] = [
  {
    key: 'creer.intro',
    page: 'creer',
    adminLabel: "En haut du formulaire, juste avant le titre (aussi affiché en tête de la relecture d'un import)",
  },
  {
    key: 'creer.taille',
    page: 'creer',
    adminLabel: "Avant la section « Taille / Nombre de portions » (aussi affiché en relecture)",
  },
  {
    key: 'creer.ajustement_etape',
    page: 'creer',
    adminLabel:
      "Dans la 1ʳᵉ étape, avant « Ajustement des quantités de cette étape » (aussi affiché en relecture)",
  },
  {
    key: 'creer.description_etape',
    page: 'creer',
    adminLabel:
      "Dans la 1ʳᵉ étape, avant le champ « Description » (aussi affiché en relecture, avant les sous-étapes)",
  },
  {
    key: 'creer.verification',
    page: 'creer',
    adminLabel: "« Vérification de la recette » — avant la section « Planning de préparation » (aussi affiché en relecture)",
  },
  {
    key: 'creer.ingredients_recap',
    page: 'creer',
    adminLabel:
      "« Liste complète des ingrédients » — avant la section « Récapitulatif des ingrédients » (aussi affiché en relecture)",
  },
  {
    key: 'creer.ustensiles',
    page: 'creer',
    adminLabel: "Avant la section « Ustensiles nécessaires » (aussi affiché en relecture)",
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
