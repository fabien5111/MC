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
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { planComponentCopy, type ComponentSourceKind, type ComponentStepDraft, type CopyableRecipe } from '@/lib/projects';
import { writeComponentContent, resequenceProjectSteps } from '@/lib/projects-write';
import type { ProjectComponent } from '@/lib/projects-data';

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
  component,
  componentIndex,
  componentIds,
  units,
  onClose,
  onDone,
}: {
  projectId: string;
  projectTitle: string;
  servings: number | null;
  component: ProjectComponent;
  componentIndex: number;
  componentIds: number[];
  units: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const dialog = useDialog();
  const { mutate, busy } = useMutation();

  const [mode, setMode] = useState<'sources' | 'edit'>('sources');
  const [terme, setTerme] = useState(component.name);
  const [resultats, setResultats] = useState<Trouvee[]>([]);
  const [chargement, setChargement] = useState(false);

  // Brouillon de contenu, alimenté soit par une proposition de l'IA, soit
  // par la saisie à la main. Les deux passent par le même éditeur, et le
  // même écrivain : une proposition d'IA n'est qu'un point de départ qu'on
  // relit avant d'enregistrer.
  const [draft, setDraft] = useState<ComponentStepDraft[]>([]);
  const [draftKind, setDraftKind] = useState<ComponentSourceKind>('manual');

  const chercher = useCallback(async () => {
    setChargement(true);
    try {
      const q = encodeURIComponent(terme.trim());
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
      setChargement(false);
    }
  }, [terme, dialog]);

  // Première ouverture : la recherche part du nom du composant. C'est la
  // façon la plus directe de tenir l'exigence de pertinence de la spec (§5)
  // avec le sélecteur existant — une « pâte sucrée » y trouve les pâtes
  // sucrées, pas les génoises.
  useEffect(() => {
    void chercher();
    // Volontairement à l'ouverture seulement : les recherches suivantes sont
    // déclenchées par l'utilisateur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        try {
          await writeComponentContent(supabase, projectId, component.id, componentIndex, steps);
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

  async function demanderIA() {
    setChargement(true);
    try {
      const r = await fetch('/api/projet/composant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: component.name, role: component.role, projectTitle, servings }),
      });
      const data = await r.json();
      if (!r.ok) {
        dialog.alert(data?.erreur || 'La proposition a échoué.');
        return;
      }
      setDraft((data.steps ?? []) as ComponentStepDraft[]);
      setDraftKind('ai_generated');
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
            <div className="mb-4 flex gap-2">
              <input
                value={terme}
                onChange={(e) => setTerme(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void chercher();
                }}
                placeholder="Rechercher une recette…"
                className={champ}
              />
              <button type="button" onClick={() => void chercher()} className={btnGhost}>
                Chercher
              </button>
            </div>

            {resultats.length === 0 ? (
              <p className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm italic text-on-surface-variant">
                Aucune recette trouvée dans votre carnet, vos favoris ni chez les pâtissiers que vous suivez.
              </p>
            ) : (
              <ul className="max-h-[45vh] space-y-2 overflow-y-auto">
                {resultats.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => void attacher(it)}
                      className="flex w-full items-center gap-3 rounded-xl border border-outline-variant px-4 py-3 text-left transition-colors hover:border-primary"
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
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap gap-3 border-t border-outline-variant pt-5">
              <button type="button" onClick={() => void demanderIA()} className={btnGhost}>
                Demander une proposition à l’IA
              </button>
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
                    value={st.description ?? ''}
                    onChange={(e) => majEtape(i, { description: e.target.value })}
                    rows={2}
                    placeholder="Le geste, en une ou deux phrases"
                    className={`${champ} mb-3`}
                  />
                  <ul className="space-y-2">
                    {st.ingredients.map((it, j) => (
                      <li key={j} className="flex flex-wrap items-center gap-2">
                        <input
                          value={it.name}
                          onChange={(e) => majIngredient(i, j, { name: e.target.value })}
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
