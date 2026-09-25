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
import { planComponentCopy, type ComponentSourceKind, type ComponentStepDraft, type CopyableRecipe } from '@/lib/projects';
import { writeComponentContent, resequenceProjectSteps } from '@/lib/projects-write';
import type { ProjectComponent } from '@/lib/projects-data';
import { resolveIngredientRefId, type IngredientRefOption } from '@/lib/ingredient-conversions';

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

// Portées de recherche, dans l'ordre d'affichage voulu par la spec. La
// dernière valeur est le `source_kind` enregistré sur le composant : c'est
// lui qui portera le crédit (§9).
const PORTEES: { scope: string; label: string; kind: ComponentSourceKind }[] = [
  { scope: 'mine', label: 'Mon carnet', kind: 'own' },
  { scope: 'fav', label: 'Mes favoris', kind: 'favorite' },
  { scope: 'followed', label: 'Pâtissiers suivis', kind: 'followed' },
];

type Trouvee = { id: string; title: string; author: string | null; kind: ComponentSourceKind; label: string };

// Lecture d'une recette source, réduite à ce que la copie exige : ni photos
// (data-URL, inutiles ici) ni ustensiles. Volontairement plus étroit que le
// `FULL_SELECT` de lib/recipes.ts, comme `RECIPE_SOURCE_SELECT` l'est pour la
// fournée.
const COPY_SELECT = `
  id, title, author_id,
  profiles!recipes_author_id_fkey(full_name),
  ingredient_groups(order_index, scaling_mode, ingredients(name, quantity, unit, comment, allergen, ref_id, order_index)),
  recipe_steps(title, description, sous_etapes, prep_time, cook_time, wait_time, cook_temp, tips, day_offset, order_index)
`;

const btnPrimary =
  'rounded-pill bg-primary px-5 py-2.5 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-40';
const btnGhost =
  'rounded-pill border border-outline-variant px-4 py-2 font-label-md text-[12.5px] font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-40';

const champ =
  'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-[14px] outline-none focus:border-primary';

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
  peutGenererIA = true,
  quotaProjetIA = null,
  initialMode,
  initialDraft,
  initialDraftKind,
  onClose,
  onDone,
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
  initialMode?: 'sources' | 'edit';
  initialDraft?: ComponentStepDraft[];
  initialDraftKind?: ComponentSourceKind;
  onClose: () => void;
  onDone: () => void;
}) {
  const dialog = useDialog();
  const { mutate, busy } = useMutation();

  const [mode, setMode] = useState<'sources' | 'edit'>(initialMode ?? 'sources');
  const [terme, setTerme] = useState(component.name);
  const [resultats, setResultats] = useState<Trouvee[]>([]);
  const [chargement, setChargement] = useState(false);
  const [recherche, setRecherche] = useState(false);
  const datalistId = `dl-ingredients-composant-${component.id}`;
  // Consignes pour une nouvelle proposition de l'IA (JEP-254, point 8).
  const [consignes, setConsignes] = useState('');

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
      const reponses = await Promise.all(
        PORTEES.map((p) =>
          fetch(`/api/recipes/picker?scopes=${p.scope}&q=${q}&limit=10`)
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
        const p = PORTEES[i];
        for (const it of (rep?.items ?? []) as { id: string; title: string; profiles?: { full_name: string | null } | null }[]) {
          if (vues.has(it.id)) continue;
          vues.add(it.id);
          out.push({ id: it.id, title: it.title, author: it.profiles?.full_name ?? null, kind: p.kind, label: p.label });
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
    // Ouverture directe en édition (« Consulter ») : la recherche ne sert à
    // rien tant qu'on n'est pas revenu à l'onglet des recettes.
    if (mode === 'edit') return;
    const t = setTimeout(() => void chercher(terme), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `chercher` est recréée à chaque rendu mais ne lit que des refs et des
    // setters stables : seul le terme doit relancer la recherche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terme]);

  // Écriture commune aux trois chemins de résolution.
  async function enregistrer(
    steps: ComponentStepDraft[],
    kind: ComponentSourceKind,
    source: { recipeId: string | null; authorId: string | null; title: string | null; authorName: string | null },
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
      scaling_mode: component.scalingMode ?? st.scaling_mode,
      ingredients: st.ingredients.map((it) => ({
        ...it,
        ref_id: it.ref_id ?? (ingredientRefs.length ? resolveIngredientRefId(it.name, ingredientRefs) : null),
      })),
    }));
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        try {
          await writeComponentContent(supabase, projectId, component.id, componentIndex, prets);
          await resequenceProjectSteps(supabase, projectId, componentIds);
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

  async function attacher(item: Trouvee) {
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
      await enregistrer(steps, item.kind, {
        recipeId: item.id,
        authorId: (data as unknown as { author_id: string }).author_id ?? null,
        title: item.title,
        authorName: item.author,
      });
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
          ...(revision ? { consignes: consignes.trim(), precedente: draft } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        dialog.alert(data?.erreur || 'La proposition a échoué.');
        return;
      }
      setDraft((data.steps ?? []) as ComponentStepDraft[]);
      setDraftKind('ai_generated');
      setConsignes('');
      setMode('edit');
    } catch {
      dialog.alert('La proposition a échoué.');
    } finally {
      setChargement(false);
    }
  }

  function saisirAMain() {
    setDraft([
      {
        title: component.name,
        description: '',
        scaling_mode: null,
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
        className="my-8 w-full max-w-[720px] rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-xl"
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

            {resultats.length === 0 ? (
              <p className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm italic text-on-surface-variant">
                Aucune recette trouvée dans votre carnet, vos favoris ni chez les pâtissiers que vous suivez.
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
                    {/* Consulter la recette avant de la choisir, sans quitter
                        le parcours (JEP-254, point 14). */}
                    <a
                      href={`/recette/${it.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ouvrir la recette dans un nouvel onglet"
                      className="shrink-0 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                    >
                      <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                    </a>
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
                    onClick={() => void demanderIA()}
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
        ) : (
          <>
            <p className="mb-4 text-[12.5px] text-on-surface-variant">
              {draftKind === 'ai_generated'
                ? 'Proposition de l’IA — un point de départ, à relire et corriger avant d’enregistrer.'
                : 'Saisissez les étapes de cette préparation.'}
            </p>

            <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
              {draft.map((st, i) => (
                <div key={i} className="rounded-xl border border-outline-variant p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      value={st.title ?? ''}
                      onChange={(e) => majEtape(i, { title: e.target.value })}
                      placeholder={`Étape ${i + 1}`}
                      className={champ}
                    />
                    <button
                      type="button"
                      title="Retirer l’étape"
                      onClick={() => setDraft((prev) => prev.filter((_, k) => k !== i))}
                      className="p-1"
                    >
                      <span className="material-symbols-outlined text-[20px] text-error">delete</span>
                    </button>
                  </div>
                  <textarea
                    ref={autoGrow}
                    value={st.description ?? ''}
                    onChange={(e) => {
                      majEtape(i, { description: e.target.value });
                      autoGrow(e.target);
                    }}
                    rows={2}
                    placeholder="Le geste, en une ou deux phrases"
                    className={`${champ} mb-3 resize-none overflow-hidden`}
                  />
                  <ul className="space-y-2">
                    {st.ingredients.map((it, j) => (
                      <li key={j} className="flex flex-wrap items-center gap-2">
                        <input
                          value={it.name}
                          // Nom saisi ≠ ingrédient rattaché : le rattachement
                          // est refait à l'enregistrement.
                          onChange={(e) => majIngredient(i, j, { name: e.target.value, ref_id: null })}
                          list={ingredientRefs.length ? datalistId : undefined}
                          autoComplete="off"
                          placeholder="Ingrédient"
                          className={`${champ} flex-1 min-w-[8rem]`}
                        />
                        <input
                          value={it.quantity ?? ''}
                          onChange={(e) => majIngredient(i, j, { quantity: e.target.value })}
                          placeholder="Qté"
                          inputMode="decimal"
                          className={`${champ} w-20`}
                        />
                        <select
                          value={it.unit ?? ''}
                          onChange={(e) => majIngredient(i, j, { unit: e.target.value || null })}
                          className={`${champ} w-28`}
                        >
                          <option value="">—</option>
                          {units.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                          {it.unit && !units.includes(it.unit) && <option value={it.unit}>{it.unit}</option>}
                        </select>
                        <button
                          type="button"
                          title="Retirer l’ingrédient"
                          onClick={() =>
                            setDraft((prev) =>
                              prev.map((s, k) => (k === i ? { ...s, ingredients: s.ingredients.filter((_, m) => m !== j) } : s)),
                            )
                          }
                          className="p-1"
                        >
                          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">close</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() =>
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
                    className="mt-2 text-[12.5px] font-semibold text-primary"
                  >
                    + Ingrédient
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setDraft((prev) => [
                  ...prev,
                  {
                    title: '',
                    description: '',
                    scaling_mode: null,
                    sous_etapes: null,
                    prep_time: null,
                    cook_time: null,
                    wait_time: null,
                    cook_temp: null,
                    tips: null,
                    day_offset: null,
                    ingredients: [{ name: '', quantity: '', unit: units[0] ?? null, comment: null, allergen: null, ref_id: null }],
                  },
                ])
              }
              className="mt-3 text-[12.5px] font-semibold text-primary"
            >
              + Étape
            </button>

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
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void enregistrer(
                    draft.filter((s) => (s.title || '').trim() || (s.description || '').trim()),
                    draftKind,
                    { recipeId: null, authorId: null, title: null, authorName: null },
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
