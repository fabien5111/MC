// Mode projet — constantes et prédicats purs.
//
// `lib/projects.ts` (pur) / `lib/projects-data.ts` (accès base, server-only,
// à venir avec le parcours guidé) : même séparation que `ideas.ts` /
// `ideas-data.ts`, sans quoi le formulaire client tirerait `next/headers` et
// casserait le build.
//
// Une recette porte désormais DEUX axes indépendants, à ne jamais confondre :
//
//   `status`                  — modération : draft → pending → published / rejected
//   `kind` + `project_stage`  — mode projet
//
// Ils ne se recouvrent pas : une recette peut être un projet finalisé et non
// publié. En particulier, `status = 'draft'` (brouillon de modération, qui
// existe depuis toujours et s'affiche dans le carnet sous « Brouillons ») n'a
// rien à voir avec `project_stage = 'wizard'`.

export type RecipeKind = 'simple' | 'project';
export type ProjectStage = 'wizard' | 'ready' | 'dissolved';

// Marques portées par la ligne `recipes`. Volontairement souple (`string`
// plutôt que les unions ci-dessus) : c'est ce que rend la base, et un
// `project_stage` inconnu doit se comporter comme une recette ordinaire
// plutôt que faire échouer un rendu.
export type ProjectMarks = { kind?: string | null; project_stage?: string | null };

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  wizard: 'Projet en cours',
  ready: 'Projet',
  dissolved: 'Projet',
};

// Recette issue du mode projet, quel que soit son avancement. Porte la vue
// par composants et les crédits d'auteur (spec §8.4, §9).
export function isProjectRecipe(r: ProjectMarks | null | undefined): boolean {
  return r?.kind === 'project';
}

// **Le seul prédicat d'étanchéité.** Un projet en cours d'élaboration ne doit
// apparaître nulle part où l'on liste des recettes, hors de l'espace
// « Projets » du carnet (spec §10) : ni recherche, ni flux public, ni
// favoris, ni partage, ni sélecteur de sous-recette.
//
// Un projet `ready` ou `dissolved`, lui, est une recette ordinaire : carnet,
// recherche, partage, publication — il se comporte exactement comme les
// autres, et aucun filtre ne doit le distinguer. C'est ce qui réduit la
// surface du §10 à une poignée de points, et ce qui rend la validation d'un
// projet aussi simple qu'un changement d'état.
export function isProjectDraft(r: ProjectMarks | null | undefined): boolean {
  return r?.kind === 'project' && r?.project_stage === 'wizard';
}

// Projet dont les étapes ont été ré-enregistrées par l'éditeur classique.
// `CreerForm` fait un `delete` + `insert` complet à chaque sauvegarde : tous
// les `recipe_steps.component_id` disparaissent, et avec eux la vue par
// composants. Les composants eux-mêmes — donc les crédits d'auteur — sont
// conservés : §9 est un engagement vis-à-vis d'auteurs tiers, pas un confort
// d'affichage, et il ne doit pas suffire d'ouvrir puis d'enregistrer une
// recette pour la blanchir de ses emprunts.
export function isProjectDissolved(r: ProjectMarks | null | undefined): boolean {
  return r?.kind === 'project' && r?.project_stage === 'dissolved';
}
