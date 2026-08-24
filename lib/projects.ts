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

// ── Parcours guidé ────────────────────────────────────────────────────────
//
// Quatre étapes (spec §4), séquentielles mais librement réversibles. L'étape
// courante est mémorisée en base (`recipe_projects.wizard_step`) et non dans
// l'URL : quitter l'application au milieu du dialogue et y revenir doit
// restituer le brouillon là où il a été laissé, y compris depuis un autre
// appareil — ce qu'un état d'URL ne garantit pas.

export const WIZARD_STEPS = [1, 2, 3, 4, 5, 6] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_LABELS: Record<WizardStep, string> = {
  1: 'Intention',
  2: 'Format',
  3: 'Structure',
  4: 'Recettes',
  5: 'Quantités',
  6: 'Récapitulatif',
};

export function parseWizardStep(v: unknown): WizardStep {
  const n = Number(v);
  return (WIZARD_STEPS as readonly number[]).includes(n) ? (n as WizardStep) : 1;
}

// ── Format visé (étape 2) ─────────────────────────────────────────────────
//
// Les quatre formats de la spec, exprimés dans le modèle DÉJÀ en place plutôt
// que dans un vocabulaire parallèle : `recipes.measure_type` +
// `mold_type_id` + `mold_dims`, exactement ce que `BatchWidget` lit pour
// calculer les coefficients surface/volume d'un ajustement. Un format rangé
// ailleurs couperait le mode projet de toute la machinerie de mise à
// l'échelle (cf. CLAUDE.md « Mode projet »).
//
// `forme` renvoie aux formes du référentiel `mold_types` (colonne `forme`),
// ce qui permet de proposer les moules pertinents et rien d'autre.
export type ProjectFormat = 'round' | 'rectangular' | 'individual' | 'free';

export const PROJECT_FORMATS: Record<
  ProjectFormat,
  { label: string; hint: string; forme: string | null; dims: { key: string; label: string }[] }
> = {
  round: {
    label: 'Cercle ou moule rond',
    hint: 'Entremets, tarte, gâteau rond',
    forme: 'cylindre',
    dims: [
      { key: 'diametre', label: 'Diamètre' },
      { key: 'hauteur', label: 'Hauteur' },
    ],
  },
  rectangular: {
    label: 'Cadre ou moule rectangulaire',
    hint: 'Entremets à trancher, tarte rectangulaire',
    forme: 'rectangulaire',
    dims: [
      { key: 'longueur', label: 'Longueur' },
      { key: 'largeur', label: 'Largeur' },
      { key: 'hauteur', label: 'Hauteur' },
    ],
  },
  individual: {
    label: 'Empreintes individuelles',
    hint: 'Petits gâteaux, dômes, tartelettes',
    forme: null,
    dims: [
      { key: 'diametre', label: 'Diamètre unitaire' },
      { key: 'hauteur', label: 'Hauteur' },
    ],
  },
  free: {
    label: 'Format libre',
    hint: 'Nombre de parts seulement',
    forme: null,
    dims: [],
  },
};

export const PROJECT_FORMAT_KEYS = Object.keys(PROJECT_FORMATS) as ProjectFormat[];

export function isProjectFormat(v: unknown): v is ProjectFormat {
  return typeof v === 'string' && v in PROJECT_FORMATS;
}

// Description lisible du format, écrite dans `recipes.yield_desc` — la même
// que celle composée par l'éditeur classique (`composeMoldDesc`), pour qu'une
// recette de projet et une recette saisie à la main affichent leur rendement
// de la même façon.
export function formatYieldDesc(
  format: ProjectFormat,
  dims: Record<string, number>,
  count: number | null,
): string | null {
  const keys = PROJECT_FORMATS[format].dims.map((d) => d.key);
  const parts = keys.filter((k) => dims[k] != null).map((k) => (k === 'diametre' ? 'Ø ' : '') + dims[k]);
  const txt = parts.length ? `${parts.join(' × ')} cm` : null;
  if (!txt) return null;
  return count && count > 1 ? `${count} × ${txt}` : txt;
}

// ── Composants (étapes 3 et 4) ────────────────────────────────────────────

// Rôles proposés à la saisie et attendus de l'IA. Liste courte et ordonnée du
// bas vers le haut d'un assemblage : elle sert autant à guider la proposition
// qu'à filtrer les recettes suggérées pour un composant (spec §5,
// « Pertinence »). Le champ reste du texte libre en base — un rôle inattendu
// s'affiche tel quel plutôt que d'être perdu.
export const COMPONENT_ROLES = [
  'Fond',
  'Biscuit',
  'Crème',
  'Insert',
  'Mousse',
  'Glaçage',
  'Garniture',
  'Décor',
] as const;

// Plafond du nombre de composants. Ce n'est pas un arbitrage produit (la
// spec laisse la question ouverte) mais un garde-fou : il borne ce qu'une
// réponse d'IA peut produire et ce qu'une boucle d'ajout peut écrire. Douze
// préparations dépassent déjà largement l'entremets le plus construit.
export const MAX_COMPONENTS = 12;

export const COMPONENT_SOURCE_KINDS = ['own', 'favorite', 'followed', 'ai_generated', 'manual'] as const;
export type ComponentSourceKind = (typeof COMPONENT_SOURCE_KINDS)[number];

export const COMPONENT_SOURCE_LABELS: Record<ComponentSourceKind, string> = {
  own: 'Mon carnet',
  favorite: 'Mes favoris',
  followed: 'Pâtissiers suivis',
  ai_generated: 'Proposée par l’IA',
  manual: 'Saisie à la main',
};

// Position d'un composant : `numeric` en base, pour intercaler sans
// renuméroter (même raison que `batch_steps.order_index`). L'ajout se fait
// donc toujours après le dernier, sans toucher aux autres.
export function nextComponentPosition(positions: number[]): number {
  return positions.length ? Math.max(...positions) + 1 : 1;
}

// ── Contenu d'un composant ────────────────────────────────────────────────
//
// Forme intermédiaire, produite par les TROIS chemins de résolution d'un
// composant — copie d'une recette existante, génération IA, saisie à la
// main — et consommée par un seul écrivain (`lib/projects-write.ts`). Sans
// ce pivot, chaque source réinventerait son insertion dans `recipe_steps` /
// `ingredient_groups` / `ingredients`, avec trois occasions de désynchroniser
// l'appariement étape ↔ groupe.
export type ComponentIngredientDraft = {
  name: string;
  quantity: string | null;
  unit: string | null;
  comment: string | null;
  allergen: string | null;
  ref_id: number | null;
};

export type ComponentStepDraft = {
  title: string | null;
  // Mode d'échelle du groupe d'ingrédients de l'étape (`aucun`, `foncage`…).
  // Repris de la recette source et jamais deviné : c'est lui qui décide
  // qu'une pâte à foncer suive la surface et un appareil le volume
  // (`scalingCoef`). Le perdre à la copie ferait recalculer de travers tout
  // ce qui n'est pas proportionnel au volume.
  scaling_mode: string | null;
  description: string | null;
  sous_etapes: string[] | null;
  prep_time: number | null;
  cook_time: number | null;
  wait_time: number | null;
  cook_temp: number | null;
  tips: string | null;
  day_offset: number | null;
  ingredients: ComponentIngredientDraft[];
};

// Recette source telle que la lit le sélecteur, réduite à ce que la copie
// exige. Volontairement structurellement compatible avec `RecipeSource`
// (lib/recipe-plan.ts) : c'est la même lecture, pour une écriture différente.
export type CopyableRecipe = {
  ingredient_groups: {
    order_index: number | null;
    scaling_mode?: string | null;
    ingredients: (ComponentIngredientDraft & { order_index?: number | null })[];
  }[];
  recipe_steps: {
    title: string | null;
    description: string | null;
    sous_etapes: unknown;
    prep_time: number | null;
    cook_time: number | null;
    wait_time: number | null;
    cook_temp: number | null;
    tips: string | null;
    day_offset: number | null;
    order_index: number | null;
  }[];
};

// Copie figée d'une recette dans un composant (spec §3.2). Reproduit
// l'appariement étape ↔ groupe d'ingrédients du modèle (par `order_index`,
// cf. `materializeBatch`) : sans ça, les ingrédients d'une étape se
// retrouveraient rattachés à une autre.
//
// Aucun coefficient n'est appliqué ici : les quantités sont reprises telles
// quelles, la mise à l'échelle est l'objet d'un lot séparé.
export function planComponentCopy(recipe: CopyableRecipe): ComponentStepDraft[] {
  const groupsByOrder = new Map<number, { scaling_mode?: string | null; ingredients: ComponentIngredientDraft[] }>();
  (recipe.ingredient_groups || []).forEach((g) =>
    groupsByOrder.set(g.order_index ?? 0, g as { scaling_mode?: string | null; ingredients: ComponentIngredientDraft[] }),
  );

  return [...(recipe.recipe_steps || [])]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((s, i) => {
      const group = groupsByOrder.get(s.order_index ?? i);
      const sous = Array.isArray(s.sous_etapes) ? (s.sous_etapes as unknown[]).map((x) => String(x)).filter(Boolean) : null;
      return {
        title: s.title,
        scaling_mode: group?.scaling_mode ?? null,
        description: s.description,
        sous_etapes: sous && sous.length ? sous : null,
        prep_time: s.prep_time,
        cook_time: s.cook_time,
        wait_time: s.wait_time,
        cook_temp: s.cook_temp,
        tips: s.tips,
        day_offset: s.day_offset,
        ingredients: [...(group?.ingredients || [])].map((it) => ({
          name: it.name,
          quantity: it.quantity ?? null,
          unit: it.unit ?? null,
          comment: it.comment ?? null,
          allergen: it.allergen ?? null,
          ref_id: it.ref_id ?? null,
        })),
      };
    });
}

// ── Quantités (étape 5) ───────────────────────────────────────────────────
//
// La mise à l'échelle n'est PAS redéveloppée ici (spec §6.1) : le calcul est
// exactement celui d'une fournée — rapport des volumes ou des surfaces entre
// le moule de la recette source et le format visé (`moldMetrics`), puis
// application par groupe d'ingrédients selon son `scaling_mode`
// (`scalingCoef`). Une pâte à foncer suit la surface, un appareil suit le
// volume ; c'est déjà vrai pour toute fournée, ça doit l'être ici.

// Format d'une recette, réduit à ce dont le calcul a besoin. Vaut pour la
// source (la recette copiée) comme pour la cible (le projet).
export type ScalableFormat = {
  measure_type: string | null;
  forme: string | null;
  dims: Record<string, number>;
  // Nombre de moules ou d'empreintes (`recipes.yield_qty` en mode moule).
  count: number;
  yieldQty: number | null;
  yieldUnit: string | null;
};

export type ScaleProposal = {
  factor: number;
  moldCoefs: { surface: number; volume: number } | null;
  // Justification en une phrase (spec §6.4). Une proposition qu'on ne peut
  // pas expliquer n'est pas corrigeable intelligemment.
  reason: string;
};

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const fr1 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

function dimsTexte(forme: string | null, dims: Record<string, number>): string {
  const keys = forme === 'cylindre' ? ['diametre', 'hauteur'] : ['longueur', 'largeur', 'hauteur'];
  const parts = keys.filter((k) => dims[k] != null).map((k) => (k === 'diametre' ? 'Ø ' : '') + dims[k]);
  return parts.length ? `${parts.join(' × ')} cm` : '';
}

// Coefficient proposé pour un composant, ou `null` quand la géométrie ne
// permet pas de trancher (recette source sans moule renseigné, composant
// proposé par l'IA ou saisi à la main). Dans ce cas l'écran bascule sur
// l'ajustement par IA en texte libre — /api/scale-recipe, déjà en place — ou
// sur la saisie directe du coefficient.
//
// `metrics` est injecté (et non importé) pour garder ce module pur et sans
// dépendance vers lib/recipe-view : l'appelant passe `moldMetrics`.
export function componentScaleProposal(
  source: ScalableFormat,
  target: ScalableFormat,
  metrics: (forme: string | null, dims: Record<string, number>) => { volume: number | null; surface: number | null },
): ScaleProposal | null {
  // Deux recettes exprimées en moule : rapport des volumes et des surfaces,
  // multiplié par le rapport des nombres de pièces. C'est le calcul de
  // `BatchWidget`, à l'identique.
  if (source.measure_type === 'mold' && target.measure_type === 'mold') {
    const src = metrics(source.forme, source.dims);
    const tgt = metrics(target.forme, target.dims);
    const nRatio = (target.count || 1) / (source.count || 1);
    const coefVol = src.volume && tgt.volume ? (nRatio * tgt.volume) / src.volume : null;
    const coefSurf = src.surface && tgt.surface ? (nRatio * tgt.surface) / src.surface : null;
    if (!coefVol && !coefSurf && nRatio === 1) return null;
    const moldCoefs = {
      surface: round3(coefSurf ?? nRatio),
      volume: round3(coefVol ?? nRatio),
    };
    const srcTxt = dimsTexte(source.forme, source.dims) || 'moule d’origine';
    const tgtTxt = dimsTexte(target.forme, target.dims) || 'format visé';
    const nTxt = nRatio !== 1 ? `, ${fr1(target.count || 1)} pièce(s) contre ${fr1(source.count || 1)}` : '';
    return {
      factor: moldCoefs.volume,
      moldCoefs,
      reason: `${srcTxt} → ${tgtTxt}${nTxt} : volume ×${fr1(moldCoefs.volume)}, surface ×${fr1(moldCoefs.surface)}.`,
    };
  }

  // Recette source exprimée en nombre de pièces ou de personnes, projet dont
  // on connaît le nombre de parts : rapport direct.
  if (source.measure_type === 'units' && source.yieldQty && source.yieldQty > 0 && target.yieldQty && target.yieldQty > 0) {
    const factor = round3(target.yieldQty / source.yieldQty);
    if (!factor || !isFinite(factor)) return null;
    const u = source.yieldUnit || '';
    return {
      factor,
      moldCoefs: null,
      reason: `Recette pour ${fr1(source.yieldQty)} ${u}, projet pour ${fr1(target.yieldQty)} : ×${fr1(factor)}.`.replace('  ', ' '),
    };
  }

  return null;
}

// Quantité mise à l'échelle d'une ligne, à partir de sa valeur de base. Rendue
// en texte (la colonne `ingredients.quantity` est du texte, comme partout
// ailleurs dans l'application), virgule décimale française.
//
// `base` à `null` = ligne non recalculable : quantité non chiffrée
// (« 1 pincée »), ou ligne modifiée à la main — qu'un changement de
// coefficient ne doit plus jamais toucher (même doctrine que les lignes
// `added` d'une fournée, que `rescaleBatchIngredients` laisse intactes).
export function scaledQuantityText(base: number | null, coef: number): string | null {
  if (base == null) return null;
  return String(Math.round(base * coef * 100) / 100).replace('.', ',');
}
