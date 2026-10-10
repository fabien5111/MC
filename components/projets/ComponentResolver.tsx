'use client';

// Résolution d'un composant (spec §4 étape 4, §5) — quatre sources plus la
// saisie à la main, dans une seule fenêtre.
//
// Ordre imposé par la spec : carnet → favoris → pâtissiers suivis →
// génération IA. « Une recette du carnet de l'utilisateur qui correspond au
// composant doit toujours être proposée avant une génération. » Les trois
// portées sont donc interrogées séparément et concaténées dans cet ordre —
// pas fusionnées en une requête : c'est la portée qui a répondu qui décide du
// crédit d'auteur enregistré sur le composant.
//
// Rattacher une recette la COPIE (spec §3.2) : le projet ne bouge plus si la
// source évolue ensuite, et il reste complet si elle disparaît. La copie va
// dans les `recipe_steps` / `ingredient_groups` / `ingredients` du projet —
// pas dans un instantané JSON, que le moteur de fournée ne saurait pas lire
// (cf. lib/projects-write.ts).
//
// Cette fenêtre ne porte JAMAIS sa propre resynchronisation : elle écrit avec
// `refresh: false` puis rend la main au parent, qui reste monté. Une
// transition déclarée ici mourrait avec la modale, le spinner s'éteindrait
// avant le retour du rendu serveur (cf. CLAUDE.md).
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LockedAction, LockedHint } from '@/components/LockedAction';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import {
  COMPONENT_SOURCE_LABELS,
  PICKER_SCOPES,
  PICKER_SCOPE_KIND,
  PICKER_SCOPE_LABELS,
  type PickerScope,
  planComponentCopy,
  type ComponentSourceKind, type ComponentStepDraft, type ComponentUtensil, type CopyableRecipe } from '@/lib/projects';
import { attachComponentUtensils, resetComponent, writeComponentContent, resequenceProjectSteps } from '@/lib/projects-write';
import type { ProjectComponent } from '@/lib/projects-data';
import { resolveIngredientRefId, type IngredientRefOption } from '@/lib/ingredient-conversions';
import { RecipeStep } from '@/components/recipe/RecipeStep';
import type { IngredientView, RecipeStepView } from '@/lib/recipes';
import { StepEditorCard } from '@/components/projets/StepEditorCard';
import { televerserImage } from '@/lib/storage-client';

// Hauteur d'une zone de texte calée sur son contenu (JEP-254, point 7) : une
// proposition de l'IA arrive avec des descriptions de plusieurs lignes, qu'un
// champ de deux lignes tronquait. Même geste que `autoGrow` de CreerForm —
// appelé depuis une ref, légal dans un `.map()`, là où un hook ne l'est pas.
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

// Délai avant de lancer la recherche pendant la frappe (JEP-254, point 11) —
// même valeur que la recherche avancée.
const DEBOUNCE_MS = 300;

// Portées de recherche : les mêmes cases que « Remplacer un ingrédient par
// une recette » (PICKER_SCOPES). Interrogées UNE À UNE, dans l'ordre imposé par
// la spec (carnet → brouillons → favoris → abonnements → toutes) : c'est la
// portée qui a répondu qui décide du `source_kind` enregistré, donc du crédit
// d'auteur (§9). « Toutes les recettes » n'est pas cochée par défaut.
const PORTEES_PAR_DEFAUT: PickerScope[] = ['mine', 'draft', 'fav', 'followed'];

type Trouvee = { id: string; title: string; author: string | null; kind: ComponentSourceKind; label: string };

// Lecture d'une recette source, réduite à ce que la copie exige : ni photos
// (data-URL, inutiles ici) ni ustensiles. Volontairement plus étroit que le
// `FULL_SELECT` de lib/recipes.ts, comme `RECIPE_SOURCE_SELECT` l'est pour la
// fournée.
const COPY_SELECT = `
  id, title, author_id,
  profiles!recipes_author_id_fkey(full_name),
  ingredient_groups(order_index, scaling_mode, ingredients(name, quantity, unit, comment, allergen, ref_id, order_index)),
  recipe_steps(title, description, sous_etapes, prep_time, cook_time, wait_time, cook_temp, tips, day_offset, order_index),
  recipe_utensils(name, ref_id, comment, order_index)
`;

const btnPrimary =
  'rounded-pill bg-primary px-5 py-2.5 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-40';
const btnGhost =
  'rounded-pill border border-outline-variant px-4 py-2 font-label-md text-[12.5px] font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-40';

// Sans largeur : `w-full` est généré APRÈS `w-14`/`w-16` par Tailwind et
// l'emporterait sur toute largeur fixe posée à côté.
const champBase =
  'rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-[14px] outline-none focus:border-primary';
const champ = `w-full ${champBase}`;

export function ComponentResolver({
  projectId,
  projectTitle,
  servings,
  formatLabel = null,
  component,
  componentIndex,
  componentIds,
  units,
  ingredientRefs = [],
  referenceAllergenes,
  peutGenererIA = true,
  quotaProjetIA = null,
  initialMode,
  initialDraft,
  initialDraftKind,
  initialSource,
  onClose,
  onDone,
  onReset,
}: {
  projectId: string;
  projectTitle: string;
  servings: number | null;
  // Format visé en clair, transmis à l'IA avec le nom du dessert.
  formatLabel?: string | null;
  component: ProjectComponent;
  componentIndex: number;
  componentIds: number[];
  units: string[];
  // Référentiel des ingrédients : aide à la saisie (datalist) et
  // rattachement au référentiel à l'enregistrement, comme dans l'éditeur de
  // recette (JEP-254, point 9).
  ingredientRefs?: IngredientRefOption[];
  // Allergènes du référentiel (menu + pastilles) et allergènes par ingrédient
  // du référentiel (pré-remplissage) — comme l'éditeur de recette. Absent :
  // champ texte libre.
  referenceAllergenes?: { names: string[]; byIngredient: Record<string, string> };
  // Droit `mode_projet_ia_mensuel` (défaut `true` : le parent l'a déjà
  // vérifié avant de monter cette fenêtre).
  peutGenererIA?: boolean;
  // État du quota (`mc_check_quota`, affichage seulement) : grise « Demander
  // une proposition à l'IA » une fois épuisé, plutôt que de laisser
  // découvrir le refus après un clic (JEP-77, même motif que BatchWidget).
  quotaProjetIA?: { allowed: boolean; limit?: number; usage?: number } | null;
  // « Consulter » (JEP-254) : pour une source « Proposée par l'IA » ou
  // « Saisie à la main », il n'y a pas de recette séparée à ouvrir — la
  // fenêtre s'ouvre directement sur le contenu déjà enregistré plutôt que
  // sur la recherche, qui le ferait perdre de vue à chaque réouverture.
  initialMode?: 'sources' | 'edit' | 'contexte-ia';
  initialDraft?: ComponentStepDraft[];
  initialDraftKind?: ComponentSourceKind;
  // Crédit à conserver quand on MODIFIE un composant déjà copié d'une
  // recette (mode projet v2, « Modifier cette préparation ») : sans lui,
  // l'enregistrement en édition effacerait la source — et avec elle le
  // crédit d'auteur, que §9 interdit de perdre en retouchant une copie.
  initialSource?: { recipeId: string | null; authorId: string | null; title: string | null; authorName: string | null };
  onClose: () => void;
  onDone: () => void;
  // « Réinitialiser » (JEP-254) : le contenu déjà enregistré est effacé et le
  // composant repasse « À résoudre », mais la fenêtre reste ouverte — la
  // resynchronisation du parent ne doit donc pas la fermer, contrairement à
  // `onDone`. Optionnel avec un repli sur `onDone` : au pire on referme,
  // jamais d'écriture non resynchronisée côté serveur.
  onReset?: () => void;
}) {
  const dialog = useDialog();
  const { mutate, busy } = useMutation();

  const [mode, setMode] = useState<'sources' | 'edit' | 'contexte-ia' | 'apercu'>(initialMode ?? 'sources');
  const [terme, setTerme] = useState(component.name);
  const [portees, setPortees] = useState<Set<PickerScope>>(new Set(PORTEES_PAR_DEFAUT));
  const [resultats, setResultats] = useState<Trouvee[]>([]);
  const [chargement, setChargement] = useState(false);
  const [recherche, setRecherche] = useState(false);
  // Étapes repliées dans l'éditeur (par rang) — remis à zéro dès qu'une étape
  // est insérée, supprimée ou déplacée, les rangs changeant.
  const [repliees, setRepliees] = useState<Set<number>>(new Set());
  // Aperçu d'une recette trouvée, dans la fenêtre (œil) : ce qui serait copié.
  const [apercu, setApercu] = useState<{ item: Trouvee; steps: ComponentStepDraft[] } | null>(null);
  const datalistId = `dl-ingredients-composant-${component.id}`;
  // Consignes pour une nouvelle proposition de l'IA (JEP-254, point 8).
  const [consignes, setConsignes] = useState('');
  // Précision libre saisie avant la PREMIÈRE proposition (JEP-254) — distincte
  // de `consignes` ci-dessus, qui corrige une proposition déjà vue.
  const [contexteIA, setContexteIA] = useState('');

  const iaEpuise = peutGenererIA && quotaProjetIA != null && !quotaProjetIA.allowed;
  // JEP-130 : même repère et même bulle que partout ailleurs, à la place du
  // `title` natif. Le motif décide de l'issue : sans le droit, /plans ;
  // crédit épuisé, aucun lien (il se renouvelle tout seul).
  const iaMessage = peutGenererIA
    ? `Quota de générations par IA atteint ce mois-ci (${quotaProjetIA?.usage ?? quotaProjetIA?.limit}/${quotaProjetIA?.limit}). Le crédit se renouvelle à la prochaine période.`
    : "La proposition d'une recette de base par IA n'est pas incluse dans votre formule.";

  // Brouillon de contenu, alimenté soit par une proposition de l'IA, soit
  // par la saisie à la main. Les deux passent par le même éditeur, et le
  // même écrivain : une proposition d'IA n'est qu'un point de départ qu'on
  // relit avant d'enregistrer.
  const [draft, setDraft] = useState<ComponentStepDraft[]>(initialDraft ?? []);
  const [draftKind, setDraftKind] = useState<ComponentSourceKind>(initialDraftKind ?? 'manual');

  // Numéro de la dernière recherche lancée : une réponse plus ancienne,
  // arrivée après une plus récente, est ignorée — sans quoi une frappe
  // rapide pourrait afficher les résultats d'un terme déjà dépassé.
  const derniere = useRef(0);

  async function chercher(texte: string) {
    const numero = ++derniere.current;
    setRecherche(true);
    try {
      const q = encodeURIComponent(texte.trim());
      // Portées cochées, dans l'ordre de PICKER_SCOPES (pas celui des clics).
      const actives = PICKER_SCOPES.filter((s) => portees.has(s));
      const reponses = await Promise.all(
        actives.map((scope) =>
          fetch(`/api/recipes/picker?scopes=${scope}&q=${q}&limit=10`)
            // Une erreur reste visible (message d'alerte) plutôt que
            // silencieusement transformée en « aucun résultat » — sans quoi
            // une vraie panne de la recherche se lit exactement comme une
            // recherche sans correspondance, impossible à distinguer.
            .then(async (r) => (r.ok ? r.json() : Promise.reject(await r.json().catch(() => ({})))))
            .catch((e) => ({ erreur: e?.erreur, items: [] })),
        ),
      );
      if (numero !== derniere.current) return;
      const erreur = reponses.find((rep) => rep?.erreur)?.erreur;
      if (erreur) dialog.alert(`La recherche a échoué : ${erreur}`);
      // Concaténation dans l'ordre des portées, dédoublonnée : une recette de
      // mon carnet que j'ai aussi mise en favori reste créditée « Mon
      // carnet », la portée la plus proche de moi.
      const vues = new Set<string>();
      const out: Trouvee[] = [];
      reponses.forEach((rep, i) => {
        const scope = actives[i];
        const kind = PICKER_SCOPE_KIND[scope];
        for (const it of (rep?.items ?? []) as { id: string; title: string; profiles?: { full_name: string | null } | null }[]) {
          if (vues.has(it.id)) continue;
          vues.add(it.id);
          out.push({ id: it.id, title: it.title, author: it.profiles?.full_name ?? null, kind, label: COMPONENT_SOURCE_LABELS[kind] });
        }
      });
      setResultats(out);
    } finally {
      if (numero === derniere.current) setRecherche(false);
    }
  }

  // Résultats au fil de la saisie (JEP-254, point 11), la première recherche
  // partant du nom du composant — la façon la plus directe de tenir
  // l'exigence de pertinence de la spec (§5) : une « pâte sucrée » y trouve
  // les pâtes sucrées, pas les génoises. Pas de voile plein écran ici : il
  // masquerait le champ qu'on est en train de remplir (même doctrine que la
  // recherche avancée) ; un indicateur discret suffit.
  useEffect(() => {
    // Ouverture directe en édition (« Consulter ») ou en saisie de contexte
    // pour l'IA : la recherche ne sert à rien tant qu'on n'est pas revenu à
    // l'onglet des recettes.
    if (mode !== 'sources') return;
    const t = setTimeout(() => void chercher(terme), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `chercher` est recréée à chaque rendu mais ne lit que des refs et des
    // setters stables : seul le terme doit relancer la recherche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terme, portees]);

  // Écriture commune aux trois chemins de résolution.
  async function enregistrer(
    steps: ComponentStepDraft[],
    kind: ComponentSourceKind,
    source: { recipeId: string | null; authorId: string | null; title: string | null; authorName: string | null },
    // Copie d'une recette existante seulement : ses ustensiles, mémorisés sur
    // la préparation et ajoutés à la liste globale (sans doublon). Absent pour
    // une proposition de l'IA, une saisie ou une modification : on n'y touche pas.
    utensils?: ComponentUtensil[],
  ) {
    if (!steps.length) {
      dialog.alert('Ce composant n’a aucune étape : il resterait vide dans la recette.');
      return;
    }
    // Mode d'ajustement choisi à l'étape 3 (JEP-254, point 4) : il prime sur
    // celui de la recette copiée. Sans choix, celui de la source est gardé.
    // Rattachement des ingrédients au référentiel, comme dans l'éditeur.
    const prets = steps.map((st) => ({
      ...st,
      scaling_mode: st.scaling_mode ?? component.scalingMode,
      ingredients: st.ingredients.map((it) => ({
        ...it,
        ref_id: it.ref_id ?? (ingredientRefs.length ? resolveIngredientRefId(it.name, ingredientRefs) : null),
      })),
    }));
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        try {
          // Photos d'étape : une data-URL fraîche est déposée sur le stockage
          // ici, côté navigateur ; une URL déjà déposée revient telle quelle.
          const avecPhotos = await Promise.all(
            prets.map(async (st) =>
              st.photos?.length
                ? {
                    ...st,
                    photos: await Promise.all(
                      st.photos.map(async (ph) => ({
                        ...ph,
                        url: await televerserImage('recette', ph.url),
                        original_url: await televerserImage('recette', ph.original_url),
                      })),
                    ),
                  }
                : st,
            ),
          );
          await writeComponentContent(supabase, projectId, component.id, componentIndex, avecPhotos);
          await resequenceProjectSteps(supabase, projectId, componentIds);
          if (utensils) await attachComponentUtensils(supabase, projectId, component.id, utensils);
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        return supabase
          .from('recipe_project_components')
          .update({
            source_kind: kind,
            source_recipe_id: source.recipeId,
            source_author_id: source.authorId,
            // Crédit dénormalisé : si la recette source est supprimée ou
            // dépubliée, le lien devient inactif mais le nom de l'auteur
            // reste affiché (spec §9).
            source_title: source.title,
            source_author_name: source.authorName,
            resolved: true,
          } as never)
          .eq('id', component.id);
      },
      { errorLabel: 'Rattachement du composant', refresh: false },
    );
    if (ok) onDone();
  }

  // Efface le contenu déjà enregistré (étapes + ingrédients) et repasse le
  // composant « À résoudre » (JEP-254) — le seul moyen de repartir de zéro :
  // `enregistrer` refuse d'écrire un composant sans étape, donc vider le
  // brouillon puis « Enregistrer » ne menait nulle part. Reste dans la
  // fenêtre, sur l'onglet des recettes, pour relancer aussitôt une recherche,
  // une proposition de l'IA ou une saisie à la main.
  async function reinitialiser() {
    const ok = await dialog.confirm(
      `Effacer le contenu de « ${component.name} » ? Il faudra choisir une nouvelle recette, demander une nouvelle proposition ou ressaisir les étapes.`,
    );
    if (!ok) return;
    setChargement(true);
    try {
      const supabase = createClient();
      await resetComponent(supabase, projectId, component.id);
    } catch (e) {
      dialog.alert(`L’effacement a échoué : ${(e as Error).message}`);
      return;
    } finally {
      setChargement(false);
    }
    setDraft([]);
    setTerme(component.name);
    setMode('sources');
    (onReset ?? onDone)();
  }

  // Lecture seule : les étapes telles qu'`attacher` les copierait (sans
  // photos, que la copie ne lit pas non plus).
  async function voirApercu(item: Trouvee) {
    setChargement(true);
    try {
      const { data, error } = await createClient().from('recipes').select(COPY_SELECT).eq('id', item.id).maybeSingle();
      if (error || !data) {
        dialog.alert("Cette recette n'a pas pu être lue.");
        return;
      }
      const steps = planComponentCopy(data as unknown as CopyableRecipe);
      if (!steps.length) {
        dialog.alert("Cette recette n'a aucune étape à copier.");
        return;
      }
      setApercu({ item, steps });
      setMode('apercu');
    } finally {
      setChargement(false);
    }
  }

  async function attacher(item: Trouvee) {
    setChargement(true);
    try {
      const { data, error } = await createClient().from('recipes').select(COPY_SELECT).eq('id', item.id).maybeSingle();
      if (error || !data) {
        dialog.alert("Cette recette n'a pas pu être lue.");
        return;
      }
      // Le mode choisi pour la préparation (étape 3) prime sur celui de la
      // source ; l'éditeur d'étape le montre ensuite tel quel.
      const steps = planComponentCopy(data as unknown as CopyableRecipe).map((st) => ({
        ...st,
        scaling_mode: component.scalingMode ?? st.scaling_mode,
      }));
      if (!steps.length) {
        dialog.alert("Cette recette n'a aucune étape à copier.");
        return;
      }
      const ustensiles = [
        ...((data as unknown as { recipe_utensils?: (ComponentUtensil & { order_index: number | null })[] })
          .recipe_utensils ?? []),
      ]
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((u) => ({ name: u.name, ref_id: u.ref_id ?? null, comment: u.comment ?? null }));
      await enregistrer(
        steps,
        item.kind,
        {
          recipeId: item.id,
          authorId: (data as unknown as { author_id: string }).author_id ?? null,
          title: item.title,
          authorName: item.author,
        },
        ustensiles,
      );
    } finally {
      setChargement(false);
    }
  }

  // `revision` : nouvelle proposition, à partir du brouillon affiché et des
  // consignes de correction (JEP-254, point 8).
  async function demanderIA(revision = false) {
    if (revision && !consignes.trim()) {
      dialog.alert('Indiquez ce qu’il faut corriger dans la proposition.');
      return;
    }
    setChargement(true);
    try {
      const r = await fetch('/api/projet/composant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: component.name,
          role: component.role,
          projectTitle,
          servings,
          format: formatLabel,
          ...(revision
            ? { consignes: consignes.trim(), precedente: draft }
            : { contexteLibre: contexteIA.trim() || undefined }),
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        dialog.alert(data?.erreur || 'La proposition a échoué.');
        return;
      }
      setDraft(((data.steps ?? []) as ComponentStepDraft[]).map((st) => ({ ...st, scaling_mode: component.scalingMode ?? st.scaling_mode })));
      setDraftKind('ai_generated');
      setConsignes('');
      setContexteIA('');
      setMode('edit');
    } catch {
      dialog.alert('La proposition a échoué.');
    } finally {
      setChargement(false);
    }
  }

  // Étape vide, avec le mode d'ajustement de la préparation.
  const vierge = (): ComponentStepDraft => ({
    title: '',
    description: '',
    scaling_mode: component.scalingMode ?? null,
    sous_etapes: null,
    prep_time: null,
    cook_time: null,
    wait_time: null,
    cook_temp: null,
    tips: null,
    day_offset: null,
    ingredients: [{ name: '', quantity: '', unit: units[0] ?? null, comment: null, allergen: null, ref_id: null }],
  });

  function saisirAMain() {
    setDraft([
      {
        title: component.name,
        description: '',
        scaling_mode: component.scalingMode ?? null,
        sous_etapes: null,
        prep_time: null,
        cook_time: null,
        wait_time: null,
        cook_temp: null,
        tips: null,
        day_offset: null,
        ingredients: [{ name: '', quantity: '', unit: units[0] ?? null, comment: null, allergen: null, ref_id: null }],
      },
    ]);
    setDraftKind('manual');
    setMode('edit');
  }

  // ── Édition du brouillon ────────────────────────────────────────────────
  function majEtape(i: number, patch: Partial<ComponentStepDraft>) {
    setDraft((prev) => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  }
  function majIngredient(i: number, j: number, patch: Partial<ComponentStepDraft['ingredients'][number]>) {
    setDraft((prev) =>
      prev.map((s, k) =>
        k === i ? { ...s, ingredients: s.ingredients.map((it, m) => (m === j ? { ...it, ...patch } : it)) } : s,
      ),
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Choisir une recette pour ${component.name}`}
      className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-background/60 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <LoadingOverlay visible={busy || chargement} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-[960px] rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-headline-md text-xl text-primary">{component.name}</h3>
            {component.role && <p className="text-[12.5px] text-on-surface-variant">{component.role}</p>}
          </div>
          <button type="button" onClick={onClose} title="Fermer" className="p-1">
            <span className="material-symbols-outlined text-[22px] text-on-surface-variant">close</span>
          </button>
        </div>

        {mode === 'sources' ? (
          <>
            <div className="relative mb-4">
              <input
                value={terme}
                onChange={(e) => setTerme(e.target.value)}
                placeholder="Rechercher une recette…"
                aria-label="Rechercher une recette"
                className={`${champ} pr-10`}
              />
              <span
                className={`material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[20px] text-outline ${
                  recherche ? 'animate-pulse' : ''
                }`}
                aria-hidden
              >
                search
              </span>
            </div>

            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
              {PICKER_SCOPES.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 font-body-md text-sm">
                  <input
                    type="checkbox"
                    checked={portees.has(s)}
                    onChange={() =>
                      setPortees((prev) => {
                        const n = new Set(prev);
                        if (n.has(s)) n.delete(s);
                        else n.add(s);
                        return n;
                      })
                    }
                    className="h-5 w-5 cursor-pointer rounded border-outline accent-primary"
                  />
                  {PICKER_SCOPE_LABELS[s]}
                </label>
              ))}
            </div>

            {portees.size === 0 ? (
              <p className="text-sm italic text-on-surface-variant">Cochez au moins une portée de recherche.</p>
            ) : resultats.length === 0 ? (
              <p className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm italic text-on-surface-variant">
                Aucune recette ne correspond dans les portées cochées.
              </p>
            ) : (
              <ul className="max-h-[45vh] space-y-2 overflow-y-auto">
                {resultats.map((it) => (
                  <li key={it.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void attacher(it)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-outline-variant px-4 py-3 text-left transition-colors hover:border-primary"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-body-md text-[15px] text-on-surface">{it.title}</span>
                        <span className="block text-[12px] text-on-surface-variant">
                          {it.label}
                          {it.author ? ` · ${it.author}` : ''}
                        </span>
                      </span>
                      <span className="material-symbols-outlined text-[20px] text-primary">add</span>
                    </button>
                    {/* Consulter la recette avant de la choisir, dans la
                        fenêtre (JEP-254, point 14). */}
                    <button
                      type="button"
                      onClick={() => void voirApercu(it)}
                      title="Voir la recette"
                      aria-label={`Voir la recette ${it.title}`}
                      className="shrink-0 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                    >
                      <span className="material-symbols-outlined text-[20px]">visibility</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap gap-3 border-t border-outline-variant pt-5">
              {!peutGenererIA ? (
                // Sans le droit, le bouton désactivé n'offrait aucune issue :
                // le repère le remplace et mène aux formules.
                <LockedAction
                  label="Demander une proposition à l’IA"
                  message={iaMessage}
                  className="rounded-pill border border-outline-variant px-4 py-2 font-label-md text-[12.5px] font-semibold"
                >
                  Demander une proposition à l’IA
                </LockedAction>
              ) : (
                <LockedHint message={iaMessage} active={iaEpuise}>
                  <button
                    type="button"
                    onClick={() => setMode('contexte-ia')}
                    disabled={iaEpuise}
                    className={`${btnGhost} flex items-center gap-1.5 disabled:cursor-not-allowed`}
                  >
                    {iaEpuise && (
                      <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
                        block
                      </span>
                    )}
                    Demander une proposition à l’IA
                  </button>
                </LockedHint>
              )}
              <button type="button" onClick={saisirAMain} className={btnGhost}>
                Saisir à la main
              </button>
            </div>
            <p className="mt-2 text-[12px] text-on-surface-variant">
              La recette choisie est copiée dans le projet : la modifier ensuite chez son auteur ne changera rien ici.
            </p>
          </>
        ) : mode === 'apercu' && apercu ? (
          <>
            <p className="mb-1 font-label-md text-[12.5px] text-on-surface-variant">
              {apercu.item.label}
              {apercu.item.author ? ` · ${apercu.item.author}` : ''}
            </p>
            <h4 className="mb-6 font-headline-md text-headline-md text-primary">{apercu.item.title}</h4>
            <div className="flex flex-col gap-10 pb-8">
              {apercu.steps.map((st, i) => {
                const vue: RecipeStepView = {
                  id: i,
                  title: st.title,
                  description: st.description,
                  day_offset: st.day_offset,
                  prep_time: st.prep_time,
                  cook_time: st.cook_time,
                  wait_time: st.wait_time,
                  cook_temp: st.cook_temp,
                  tips: st.tips,
                  video_url: null,
                  sous_etapes: st.sous_etapes,
                  order_index: i,
                };
                const ings = st.ingredients.map(
                  (g, k): IngredientView => ({
                    id: k,
                    name: g.name,
                    quantity: g.quantity || null,
                    unit: g.unit,
                    comment: g.comment,
                    url: null,
                    allergen: g.allergen,
                    order_index: k,
                    ref_id: null,
                    ingredient_refs: null,
                  }),
                );
                return (
                  <RecipeStep
                    key={i}
                    step={vue}
                    index={i}
                    anchorId={`apercu-etape-${i}`}
                    ingredients={ings}
                    qty={(it) => [it.quantity, it.unit].filter(Boolean).join(' ')}
                    last={i === apercu.steps.length - 1}
                  />
                );
              })}
            </div>
            {/* Bandeau collé en bas de la zone qui défile : un `fixed` ici suivrait la
                fenêtre (backdrop-blur du conteneur = nouveau repère) et partirait
                avec le contenu. */}
            <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex justify-end gap-3 rounded-b-2xl border-t border-outline-variant bg-surface-container-lowest px-6 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
              <div className="flex w-full justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setApercu(null);
                    setMode('sources');
                  }}
                  className={btnGhost}
                >
                  Annuler
                </button>
                <button type="button" onClick={() => void attacher(apercu.item)} className={btnPrimary}>
                  Sélectionner
                </button>
              </div>
            </div>
          </>
        ) : mode === 'contexte-ia' ? (
          <>
            <p className="mb-3 text-[12.5px] text-on-surface-variant">
              Une précision à donner à l’IA avant sa proposition pour « {component.name} » ? Sans gélatine, au chocolat
              noir plutôt qu’au lait, version allégée en sucre… Facultatif.
            </p>
            <textarea
              ref={autoGrow}
              value={contexteIA}
              onChange={(e) => {
                setContexteIA(e.target.value);
                autoGrow(e.target);
              }}
              rows={3}
              placeholder="Précisions pour l’IA (optionnel)"
              className={`${champ} resize-none overflow-hidden`}
            />
            <div className="mt-5 flex flex-wrap gap-3 border-t border-outline-variant pt-5">
              <button type="button" onClick={() => setMode('sources')} className={btnGhost}>
                Retour aux recettes
              </button>
              <button type="button" onClick={() => void demanderIA()} className={btnPrimary}>
                Générer
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 text-[12.5px] text-on-surface-variant">
              {draftKind === 'ai_generated'
                ? 'Proposition de l’IA — un point de départ, à relire et corriger avant d’enregistrer.'
                : 'Saisissez les étapes de cette préparation.'}
            </p>

            <div className="mb-6 flex flex-wrap items-center justify-end gap-6">
              <button
                type="button"
                onClick={() => setRepliees(new Set(draft.map((_, k) => k)))}
                className="flex items-center gap-1 text-[13px] font-semibold text-on-surface-variant hover:text-primary"
              >
                <span className="material-symbols-outlined">unfold_less</span> Tout replier
              </button>
              <button
                type="button"
                onClick={() => setRepliees(new Set())}
                className="flex items-center gap-1 text-[13px] font-semibold text-on-surface-variant hover:text-primary"
              >
                <span className="material-symbols-outlined">unfold_more</span> Tout déplier
              </button>
            </div>

            <div className="space-y-12">
              {draft.map((st, i) => (
                <StepEditorCard
                  key={i}
                  step={st}
                  index={i}
                  count={draft.length}
                  allergenNames={referenceAllergenes?.names}
                  refAllergens={referenceAllergenes?.byIngredient}
                  collapsed={repliees.has(i)}
                  onToggleCollapse={() =>
                    setRepliees((prev) => {
                      const n = new Set(prev);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                  onInsertBefore={() => {
                    setRepliees(new Set());
                    setDraft((prev) => [...prev.slice(0, i), vierge(), ...prev.slice(i)]);
                  }}
                  onReorder={(from, to) => {
                    if (from === to || isNaN(from)) return;
                    setRepliees(new Set());
                    setDraft((prev) => {
                      const l = [...prev];
                      const [deplace] = l.splice(from, 1);
                      l.splice(to, 0, deplace);
                      return l;
                    });
                  }}
                  units={units}
                  datalistId={ingredientRefs.length ? datalistId : undefined}
                  onChange={(patch) => majEtape(i, patch)}
                  onIngredientChange={(j, patch) => majIngredient(i, j, patch)}
                  onIngredientAdd={() =>
                    setDraft((prev) =>
                      prev.map((s, k) =>
                        k === i
                          ? {
                              ...s,
                              ingredients: [
                                ...s.ingredients,
                                { name: '', quantity: '', unit: units[0] ?? null, comment: null, allergen: null, ref_id: null },
                              ],
                            }
                          : s,
                      ),
                    )
                  }
                  onIngredientDelete={(j) =>
                    setDraft((prev) =>
                      prev.map((s, k) => (k === i ? { ...s, ingredients: s.ingredients.filter((_, m) => m !== j) } : s)),
                    )
                  }
                  onDelete={() => {
                    setRepliees(new Set());
                    setDraft((prev) => prev.filter((_, k) => k !== i));
                  }}
                />
              ))}
            </div>

            <div className="flex justify-center py-8">
              <button
                type="button"
                onClick={() => setDraft((prev) => [...prev, vierge()])}
                className="flex items-center gap-3 px-8 py-3 border border-primary text-primary hover:bg-primary-container hover:text-white transition-all font-label-md text-label-md uppercase tracking-widest"
              >
                <span className="material-symbols-outlined">add_circle</span> Ajouter une étape
              </button>
            </div>

            {ingredientRefs.length > 0 && (
              <datalist id={datalistId}>
                {ingredientRefs.map((r) => (
                  <option key={r.id} value={r.name} />
                ))}
              </datalist>
            )}

            {/* Nouvelle proposition de l'IA, corrigée (JEP-254, point 8) : on
                dit ce qui ne va pas plutôt que de tout reprendre à la main. La
                base soumise est le brouillon tel qu'affiché, retouches
                comprises. */}
            {draftKind === 'ai_generated' && peutGenererIA && (
              <div className="mt-5 rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <label className="mb-2 block font-label-md text-[12px] text-outline">
                  CE QU’IL FAUT CORRIGER DANS LA PROPOSITION
                </label>
                <textarea
                  ref={autoGrow}
                  value={consignes}
                  onChange={(e) => {
                    setConsignes(e.target.value.slice(0, 1000));
                    autoGrow(e.target);
                  }}
                  rows={2}
                  placeholder="Moins sucré, sans gélatine, une version au beurre noisette…"
                  className={`${champ} resize-none overflow-hidden`}
                />
                <LockedHint message={iaMessage} active={iaEpuise}>
                  <button
                    type="button"
                    onClick={() => void demanderIA(true)}
                    disabled={iaEpuise || !consignes.trim()}
                    className={`${btnGhost} mt-3 disabled:cursor-not-allowed`}
                  >
                    Demander une nouvelle proposition
                  </button>
                </LockedHint>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3 border-t border-outline-variant pt-5">
              <button type="button" onClick={() => setMode('sources')} className={btnGhost}>
                Retour aux recettes
              </button>
              {/* Effacer ce qui est déjà enregistré — seul moyen de repartir
                  de zéro, `enregistrer` refusant un composant sans étape. */}
              <button
                type="button"
                onClick={() => void reinitialiser()}
                className={`${btnGhost} text-error hover:bg-error/10`}
              >
                Réinitialiser
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void enregistrer(
                    draft
                      .filter((s) => (s.title || '').trim() || (s.description || '').trim() || (s.sous_etapes || []).some((t) => t.trim()))
                      .map((s) => {
                        const sous = (s.sous_etapes || []).map((t) => t.trim()).filter(Boolean);
                        return { ...s, sous_etapes: sous.length ? sous : null };
                      }),
                    draftKind,
                    initialSource ?? { recipeId: null, authorId: null, title: null, authorName: null },
                  )
                }
                className={btnPrimary}
              >
                Enregistrer ce composant
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
