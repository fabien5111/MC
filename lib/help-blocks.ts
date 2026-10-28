// Blocs d'aide contextuelle — déclaration PURE (aucun accès Supabase).
//
// Les blocs eux-mêmes (clé, page, emplacement) sont fixés dans le code : la
// section admin « Blocs d'aide » n'en édite que le contenu (texte + lien
// vidéo, table `help_blocks`), sans écran d'ajout/suppression. Un nouveau
// bloc s'ajoute donc ici, un par un, au fil des besoins.
export type HelpPageSlug =
  | 'creer'
  | 'fournee'
  | 'projet'
  | 'relecture'
  | 'importer'
  | 'courses'
  | 'carnet'
  | 'recette'
  | 'recherche'
  | 'reglages'
  | 'idees';

export const HELP_PAGES: { slug: HelpPageSlug; label: string }[] = [
  { slug: 'creer', label: 'Création / modification recette' },
  { slug: 'fournee', label: 'Fournée' },
  { slug: 'projet', label: 'Mode projet' },
  { slug: 'relecture', label: "Relecture d'un import" },
  { slug: 'importer', label: 'Import de recette' },
  { slug: 'courses', label: 'Liste de courses' },
  { slug: 'carnet', label: 'Carnet' },
  { slug: 'recette', label: 'Fiche recette' },
  { slug: 'recherche', label: 'Recherche avancée' },
  { slug: 'reglages', label: 'Réglages' },
  { slug: 'idees', label: 'Boîte à idées' },
];

export type HelpBlockDef = {
  key: string;
  // Titre montré aux membres (page Aide) : il dit ce que le bloc explique.
  title: string;
  page: HelpPageSlug;
  // Repère l'emplacement du bloc dans l'écran admin — jamais montré aux membres.
  adminLabel: string;
};

export const HELP_BLOCKS: HelpBlockDef[] = [
  { key: 'creer.intro', title: 'Bien saisir sa recette', page: 'creer', adminLabel: "En haut du formulaire, juste avant le titre" },
  { key: 'creer.taille', title: 'Indiquer la taille de la recette', page: 'creer', adminLabel: "Avant la section « Taille / Nombre de portions »" },
  {
    key: 'creer.ustensiles',
    title: 'Lister les ustensiles',
    page: 'creer',
    adminLabel: "Avant la section « Ustensiles nécessaires »",
  },
  {
    key: 'creer.ajustement_etape',
    title: "Ajuster les quantités d'une étape",
    page: 'creer',
    adminLabel: "Dans la 1ʳᵉ étape, avant « Ajustement des quantités de cette étape »",
  },
  {
    key: 'creer.description_etape',
    title: "Rédiger la description d'une étape",
    page: 'creer',
    adminLabel: "Dans la 1ʳᵉ étape, avant le champ « Description »",
  },
  {
    key: 'creer.jour_et_avance',
    title: "Jour de préparation et préparation à l'avance",
    page: 'creer',
    adminLabel: "Dans la 1ʳᵉ étape, avant « À préparer le jour J − » (jour prévu et préparation à l'avance)",
  },
  {
    key: 'creer.verification',
    title: "Vérifier la recette avant de l'enregistrer",
    page: 'creer',
    adminLabel: "« Vérification de la recette » — avant la section « Planning de préparation »",
  },
  {
    key: 'creer.ingredients_recap',
    title: 'Comprendre la liste des ingrédients',
    page: 'creer',
    adminLabel: "« Liste complète des ingrédients » — avant la section « Récapitulatif des ingrédients »",
  },
  { key: 'relecture.intro', title: 'Relire une recette importée', page: 'relecture', adminLabel: "En haut de « Informations générales », avant le titre" },
  { key: 'relecture.taille', title: 'Vérifier la taille de la recette', page: 'relecture', adminLabel: "Avant le champ « Taille / Nombre de portions »" },
  { key: 'relecture.ustensiles', title: 'Vérifier les ustensiles', page: 'relecture', adminLabel: "Avant la section « Ustensiles »" },
  {
    key: 'relecture.ajustement_etape',
    title: "Ajuster les quantités d'une étape",
    page: 'relecture',
    adminLabel: "Dans la 1ʳᵉ étape, avant « Ajustement des quantités de cette étape »",
  },
  {
    key: 'relecture.description_etape',
    title: 'Relire les étapes importées',
    page: 'relecture',
    adminLabel: "Dans la 1ʳᵉ étape, avant « Sous-étapes importées »",
  },
  {
    key: 'relecture.jour_et_avance',
    title: "Jour de préparation et préparation à l'avance",
    page: 'relecture',
    adminLabel: "Dans la 1ʳᵉ étape, avant les temps (réalisation, attente, cuisson, jour prévu, à l'avance)",
  },
  {
    key: 'relecture.verification',
    title: "Vérifier la recette avant de l'enregistrer",
    page: 'relecture',
    adminLabel: "Avant la section « Planning de préparation »",
  },
  {
    key: 'relecture.ingredients_recap',
    title: 'Comprendre la liste des ingrédients',
    page: 'relecture',
    adminLabel: "Avant la section « Récapitulatif des ingrédients »",
  },
  // Fournée (JEP-373, lot 1) — page `fournee`, chargée par /recette/[id]
  // (panneau de lancement) et /fournee/[id] (deux modes).
  { key: 'fournee.lancer', title: 'Lancer une fournée', page: 'fournee', adminLabel: "Panneau « Lancer une fournée », en tête (fiche recette)" },
  { key: 'fournee.preparer_intro', title: 'Préparer sa fournée', page: 'fournee', adminLabel: "Mode Préparer, en tête de l'écran" },
  {
    key: 'fournee.deja_realise',
    title: 'Marquer une étape comme déjà réalisée',
    page: 'fournee',
    adminLabel: "Mode Préparer, 1ʳᵉ étape, avant la case « Réalisée partiellement ou complètement »",
  },
  {
    key: 'fournee.remplacement',
    title: 'Fabriquer soi-même un ingrédient',
    page: 'fournee',
    adminLabel: "Mode Préparer, 1ʳᵉ étape, dans le bloc « Ingrédients de l'étape »",
  },
  { key: 'fournee.notes', title: 'Ma note et le commentaire du jour J', page: 'fournee', adminLabel: "Mode Préparer, 1ʳᵉ étape, avant « Ma note »" },
  { key: 'fournee.patisser_intro', title: 'Cuisiner pas à pas', page: 'fournee', adminLabel: "Mode Pâtisser, en tête de l'écran" },
  // Mode projet (JEP-373, lot 1) — page `projet`, /projets/[id].
  { key: 'projet.intention', title: 'Décrire son projet de dessert', page: 'projet', adminLabel: "Bloc « Votre intention », avant le champ" },
  { key: 'projet.structure', title: 'Composer ses préparations', page: 'projet', adminLabel: "Bloc « Structure », avant la liste des préparations" },
  { key: 'projet.ajustement', title: "Ajuster les quantités d'une préparation", page: 'projet', adminLabel: "1ᵉʳ volet « Ajustement des quantités »" },
  { key: 'projet.reste_a_faire', title: "Suivre ce qu'il reste à faire", page: 'projet', adminLabel: "Panneau « Reste à faire » (exemplaire du haut)" },
  { key: 'projet.essais_validation', title: 'Essayer puis valider le projet', page: 'projet', adminLabel: "Bloc « Essais et validation »" },
  // Lot 2 (JEP-373) : import, courses, carnet, fiche recette, recherche, réglages, idées.
  { key: 'importer.intro', title: 'Importer une recette', page: 'importer', adminLabel: "/importer, avant le choix texte collé / PDF / photos" },
  { key: 'importer.photos', title: 'Importer depuis des photos', page: 'importer', adminLabel: "Onglet « Photos », avant la zone de dépôt" },
  { key: 'courses.fusion', title: 'Comment les articles se regroupent', page: 'courses', adminLabel: "/courses/[id], en tête de la liste" },
  { key: 'courses.ajout', title: 'Ajouter un article à la main', page: 'courses', adminLabel: "Avant le formulaire d'ajout à la main" },
  { key: 'carnet.portees', title: "S'y retrouver dans son carnet", page: 'carnet', adminLabel: "/carnet, sous la ligne des portées" },
  { key: 'carnet.cap', title: 'Préparer son carnet CAP', page: 'carnet', adminLabel: "Portée « Carnet CAP », avant le bandeau d'information" },
  { key: 'carnet.cap_apercu', title: 'Imprimer le carnet CAP', page: 'carnet', adminLabel: "/carnet/cap, en tête de l'aperçu" },
  { key: 'recette.extraire', title: 'Extraire des étapes en recette', page: 'recette', adminLabel: "Fenêtre « Extraire des étapes en recette », en tête" },
  { key: 'recherche.facettes', title: 'Affiner sa recherche', page: 'recherche', adminLabel: "/recherche, au-dessus de la liste des résultats" },
  { key: 'reglages.notifications', title: 'Régler ses notifications', page: 'reglages', adminLabel: "Bloc « Notifications », avant la grille" },
  { key: 'idees.nouvelle', title: 'Proposer une idée', page: 'idees', adminLabel: "/idees/nouvelle, avant le formulaire" },
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
