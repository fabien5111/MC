'use client';

// Mode projet v2 — la page verticale (admins seulement, à côté du parcours
// actuel pour comparer). Le projet s'y lit comme la recette qu'il deviendra :
// les blocs de la recette dans l'ordre de l'éditeur, entre lesquels
// s'intercalent les blocs « Atelier projet » (fond plus clair). Les blocs pas
// encore atteints restent visibles, grisés (`projectV2BlockStates`).
//
// Même doctrine que la v1 : chaque geste écrit en base puis resynchronise
// (`useMutation`), aucun miroir local de la liste des composants. Deux écarts
// voulus :
// - la v2 n'écrit JAMAIS `recipe_projects.wizard_step` — l'étape du parcours
//   actuel lui appartient, ouvrir un projet ici ne doit pas l'y déplacer ;
// - la description du dessert se saisit pour tous les formats (la v1 ne la
//   demande qu'en format libre, et ne l'efface plus ailleurs).
//
// Premier lot : l'intention, le dessert (titre + description) et le format
// sont modifiables ; le reste affiche ce que porte déjà la base, avec un
// renvoi vers le parcours actuel pour agir.
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { IngredientTotalList } from '@/components/IngredientTotalList';
import { ProjectFormatFields, type MoldTypeOption } from '@/components/projets/ProjectFormatFields';
import { ProjectV2Block } from '@/components/projets/v2/ProjectV2Block';
import {
  COMPONENT_SCALING_MODES,
  COMPONENT_SOURCE_LABELS,
  PROJECT_V2_ATELIER,
  buildProjectFormatUpdate,
  deduceProjectFormat,
  projectV2BlockStates,
  projectValidationBlockers,
  type ComponentSourceKind,
  type ProjectFormat,
  type ProjectV2Block as BlockKey,
} from '@/lib/projects';
import { INTENT_MAX } from '@/lib/ai/project-structure';
import { dayLabel, effectiveTimes, mergeIngredientLines, planningDays } from '@/lib/recipe-view';
import { groupWithTotal } from '@/lib/ingredients-recap';
import { ingredientKey } from '@/lib/ingredient-name';
import type { ProjectFull } from '@/lib/projects-data';
import type { ConversionRef, UnitRef } from '@/lib/ingredient-conversions';
import type { RecipeFull, RecipeStepView } from '@/lib/recipes';

const btnPrimary =
  'rounded-pill bg-primary px-6 py-3 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-40';
const lienV1 = 'text-sm text-secondary underline underline-offset-2 hover:text-primary';
const champ =
  'w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-body-md text-[15px] outline-none focus:border-primary';
const etiquette = 'mb-1 block font-label-md text-label-md text-outline';

// Ordre et libellés des blocs. `apercu` est ce que l'on voit d'un bloc encore
// verrouillé : la recette à venir se lit dès l'ouverture du projet.
const BLOCS: Record<BlockKey, { titre: string; apercu: string }> = {
  intention: { titre: 'Votre intention', apercu: 'Ce que vous voulez réaliser, en quelques phrases.' },
  identite: { titre: 'Le dessert', apercu: 'Nom, photo, description, type et catégories.' },
  format: { titre: 'Format et rendement', apercu: 'Moule, dimensions, nombre de parts.' },
  structure: { titre: 'Structure', apercu: 'Les préparations qui composent le dessert, du bas vers le haut.' },
  etapes: { titre: 'Étapes', apercu: 'Le déroulé de chaque préparation, avec ses ingrédients.' },
  quantites: { titre: 'Ajustement des quantités', apercu: 'Les quantités ramenées au format visé.' },
  ingredients: { titre: 'Liste complète des ingrédients', apercu: 'Tous les ingrédients du dessert, totalisés.' },
  organisation: { titre: 'Ustensiles, difficulté et temps', apercu: 'Le matériel, le niveau et le planning.' },
  conseils: { titre: 'Conseils et source', apercu: 'Astuces, conseils de service, provenance.' },
  validation: { titre: 'Essais et validation', apercu: 'Les fournées d’essai, puis le passage en recette.' },
};

function fmtMin(n: number | null): string | null {
  if (!n) return null;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
}

function fmtFacteur(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

export function ProjectV2({
  project,
  recipe,
  moldTypes,
  conversions,
  unitRefs,
  trialCount,
}: {
  project: ProjectFull;
  // `null` si la recette du projet n'a pas pu être lue : les blocs de recette
  // affichent alors un message plutôt que de planter la page.
  recipe: RecipeFull | null;
  moldTypes: MoldTypeOption[];
  conversions: ConversionRef[];
  unitRefs: UnitRef[];
  trialCount: number;
}) {
  const dialog = useDialog();
  const { mutate, busy } = useMutation();
  const states = projectV2BlockStates(project);
  const v1 = `/projets/${project.id}`;

  // ── Intention ─────────────────────────────────────────────────────────
  const [intent, setIntent] = useState(project.intent ?? '');
  async function saveIntent() {
    await mutate(
      () =>
        createClient()
          .from('recipe_projects')
          .update({ intent: intent.trim().slice(0, INTENT_MAX) || null } as never)
          .eq('recipe_id', project.id),
      { errorLabel: "Enregistrement de l'intention" },
    );
  }

  // ── Le dessert : titre + description ──────────────────────────────────
  const [title, setTitle] = useState(project.title === 'Nouveau projet' ? '' : project.title);
  const [description, setDescription] = useState(project.description ?? '');
  async function saveIdentite() {
    await mutate(
      () =>
        createClient()
          .from('recipes')
          .update({ title: title.trim().slice(0, 120) || 'Nouveau projet', description: description.trim() || null } as never)
          .eq('id', project.id),
      { errorLabel: 'Enregistrement du dessert' },
    );
  }

  // ── Format ────────────────────────────────────────────────────────────
  // Relu depuis la recette, exactement comme l'étape 2 du parcours actuel.
  const dimsBase = (
    project.mold_dims && typeof project.mold_dims === 'object' && !Array.isArray(project.mold_dims)
      ? (project.mold_dims as Record<string, number>)
      : {}
  ) as Record<string, number>;
  const formeBase = moldTypes.find((m) => m.id === project.mold_type_id)?.forme ?? null;
  const nbBase = parseInt(project.yield_qty || '1', 10) > 0 ? parseInt(project.yield_qty || '1', 10) : 1;
  const [format, setFormat] = useState<ProjectFormat>(
    deduceProjectFormat({ measure_type: project.measure_type, forme: formeBase, dims: dimsBase, count: nbBase }),
  );
  const [dims, setDims] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(dimsBase).map(([k, v]) => [k, String(v)])),
  );
  const [moldTypeId, setMoldTypeId] = useState(project.mold_type_id ? String(project.mold_type_id) : '');
  const [servings, setServings] = useState(project.servings ? String(project.servings) : '');
  const [count, setCount] = useState(project.measure_type === 'mold' ? String(nbBase) : '1');

  async function saveFormat() {
    // Le titre passé est celui DÉJÀ enregistré : il se modifie dans le bloc
    // « Le dessert », le format ne doit pas l'écraser avec une saisie en cours.
    const built = buildProjectFormatUpdate({ format, title: project.title, servings, count, dims, moldTypeId });
    if ('error' in built) {
      dialog.alert(built.error);
      return;
    }
    await mutate(() => createClient().from('recipes').update(built.payload as never).eq('id', project.id), {
      errorLabel: 'Enregistrement du format',
    });
  }

  // ── Lectures pour les blocs de recette ────────────────────────────────
  const ordered = [...project.components].sort((a, b) => a.position - b.position);
  const steps = [...(recipe?.recipe_steps ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  // Appariement étape ↔ groupe d'ingrédients par `order_index`, comme partout
  // ailleurs dans le mode projet (cf. lib/projects-write.ts).
  const groupByOrder = new Map((recipe?.ingredient_groups ?? []).map((g) => [g.order_index ?? -1, g]));
  // `component_id` est lu par `recipe_steps(*)` mais absent de `RecipeStepView`.
  const componentOf = (s: RecipeStepView) => (s as RecipeStepView & { component_id?: number | null }).component_id ?? null;
  const assemblage = steps.filter((s) => componentOf(s) == null);

  const ingredientGroups = recipe
    ? groupWithTotal(
        mergeIngredientLines(recipe, conversions, unitRefs),
        (m) => ({ name: m.name, qty: m.qty, unit: m.unit, refId: m.ref_id }),
        conversions,
        unitRefs,
      )
    : [];
  const times = recipe ? effectiveTimes(recipe) : null;
  const days = planningDays(steps);
  const blockers = projectValidationBlockers({ measure_type: project.measure_type, components: project.components });

  function etape(s: RecipeStepView, i: number) {
    const groupe = groupByOrder.get(s.order_index ?? -1);
    const ingredients = groupe?.ingredients ?? [];
    return (
      <li key={s.id} className="border-t border-outline-variant/40 pt-4 first:border-t-0 first:pt-0">
        <p className="font-label-md text-[11px] uppercase tracking-widest text-outline">
          {dayLabel(s.day_offset)} · Étape {i + 1}
        </p>
        <h4 className="font-body-md text-[16px] font-semibold text-on-surface">{s.title || 'Sans titre'}</h4>
        {s.description && <p className="mt-1 whitespace-pre-line text-[14px] text-on-surface-variant">{s.description}</p>}
        {!!s.sous_etapes?.length && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[14px] text-on-surface-variant">
            {s.sous_etapes.map((se, k) => (
              <li key={k}>{se}</li>
            ))}
          </ul>
        )}
        {ingredients.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-[14px]">
            {ingredients.map((it) => {
              const allergene = it.ingredient_refs?.allergens?.name || it.allergen;
              return (
                <li key={it.id}>
                  <span className="font-label-md text-primary">{[it.quantity, it.unit].filter(Boolean).join(' ')}</span>{' '}
                  {it.name}
                  {allergene && <span className="italic text-on-surface-variant"> (Allergènes : {allergene})</span>}
                  {it.comment && <span className="italic text-on-surface-variant"> — {it.comment}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {!!s.step_photos?.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {s.step_photos.map((p, k) => (
              // eslint-disable-next-line @next/next/no-img-element -- stockage Swift, cross-origin
              <img key={k} src={p.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
            ))}
          </div>
        )}
      </li>
    );
  }

  const bloc = (key: BlockKey, children: React.ReactNode) => (
    <ProjectV2Block
      key={key}
      id={`bloc-${key}`}
      atelier={PROJECT_V2_ATELIER.has(key)}
      titre={BLOCS[key].titre}
      apercu={BLOCS[key].apercu}
      state={states[key]}
    >
      {children}
    </ProjectV2Block>
  );

  const sansRecette = <p className="text-sm text-on-surface-variant">La recette du projet n’a pas pu être lue.</p>;

  return (
    <>
      <LoadingOverlay visible={busy} />

      <header className="mb-8">
        <p className="font-label-md text-label-md uppercase tracking-widest text-secondary">
          Mode projet · nouvelle version (essai)
        </p>
        <h1 className="mb-3 font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[34px]">
          {project.title === 'Nouveau projet' ? 'Nouveau projet' : project.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href={v1} className={lienV1}>
            Revenir à la version actuelle
          </Link>
          <span className="flex items-center gap-2 text-[12px] text-on-surface-variant">
            <span className="inline-block h-3 w-3 rounded border border-outline-variant bg-surface-container-low" />
            Recette
            <span className="ml-3 inline-block h-3 w-3 rounded border border-dashed border-secondary/40 bg-surface-container-lowest" />
            Atelier projet
          </span>
        </div>
      </header>

      <div className="space-y-6">
        {bloc(
          'intention',
          <div className="space-y-3">
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value.slice(0, INTENT_MAX))}
              rows={4}
              placeholder="Une tarte au praliné pour huit, avec un croustillant et une crème légère…"
              className={champ}
            />
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={saveIntent}
                disabled={busy || intent.trim() === (project.intent ?? '').trim()}
                className={btnPrimary}
              >
                Enregistrer
              </button>
              <Link href={v1} className={lienV1}>
                Demander une proposition à l’IA (version actuelle)
              </Link>
            </div>
          </div>,
        )}

        {bloc(
          'identite',
          <div className="space-y-5">
            {recipe?.hero_image_url && (
              // eslint-disable-next-line @next/next/no-img-element -- stockage Swift, cross-origin
              <img src={recipe.hero_image_url} alt="" className="max-h-72 w-full rounded-xl object-cover" />
            )}
            <div>
              <label className={etiquette}>NOM DU DESSERT</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                placeholder="Tarte aux fruits rouges"
                className={champ}
              />
            </div>
            <div>
              <label className={etiquette}>DESCRIPTION</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                rows={3}
                placeholder="Ce qui rend ce dessert unique, l’occasion, le goût recherché…"
                className={champ}
              />
            </div>
            <button
              type="button"
              onClick={saveIdentite}
              disabled={
                busy ||
                ((title.trim() || 'Nouveau projet') === project.title &&
                  description.trim() === (project.description ?? '').trim())
              }
              className={btnPrimary}
            >
              Enregistrer
            </button>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 border-t border-outline-variant/40 pt-4 text-sm">
              <dt className="text-outline">Type</dt>
              <dd>{recipe?.recipe_types?.name ?? '—'}</dd>
              <dt className="text-outline">Catégories</dt>
              <dd>
                {recipe?.recipe_tags
                  .map((t) => t.tags?.name)
                  .filter(Boolean)
                  .join(', ') || '—'}
              </dd>
              <dt className="text-outline">Photo</dt>
              <dd>{recipe?.hero_image_url ? 'Oui' : '—'}</dd>
            </dl>
            <p className="text-[12px] italic text-on-surface-variant">
              Photo, type et catégories : bientôt modifiables ici.
            </p>
          </div>,
        )}

        {bloc(
          'format',
          <div className="space-y-6">
            <ProjectFormatFields
              moldTypes={moldTypes}
              format={format}
              setFormat={setFormat}
              dims={dims}
              setDims={setDims}
              count={count}
              setCount={setCount}
              moldTypeId={moldTypeId}
              setMoldTypeId={setMoldTypeId}
              servings={servings}
              setServings={setServings}
              disabled={busy}
            />
            <button type="button" onClick={saveFormat} disabled={busy} className={btnPrimary}>
              Enregistrer le format
            </button>
          </div>,
        )}

        {bloc(
          'structure',
          <div className="space-y-3">
            {ordered.length ? (
              <ol className="space-y-2">
                {ordered.map((c, i) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 rounded-lg bg-surface px-4 py-2.5">
                    <span className="font-label-md text-outline">{i + 1}.</span>
                    <span className="font-semibold text-on-surface">{c.name}</span>
                    {c.role && <span className="text-[13px] text-on-surface-variant">{c.role}</span>}
                    <span className={`ml-auto text-[12px] ${c.resolved ? 'text-green-700' : 'text-secondary'}`}>
                      {c.resolved
                        ? (COMPONENT_SOURCE_LABELS[c.source_kind as ComponentSourceKind] ?? 'Résolu') +
                          (c.source_title ? ` · ${c.source_title}` : '')
                        : 'À résoudre'}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-on-surface-variant">Aucune préparation pour l’instant.</p>
            )}
            <Link href={v1} className={lienV1}>
              Modifier la structure et résoudre les préparations (version actuelle)
            </Link>
          </div>,
        )}

        {bloc(
          'etapes',
          recipe ? (
            <div className="space-y-8">
              {ordered.map((c) => {
                const own = steps.filter((s) => componentOf(s) === c.id);
                return (
                  <div key={c.id}>
                    <h3 className="mb-3 font-label-md text-[13px] uppercase tracking-widest text-secondary">{c.name}</h3>
                    {own.length ? (
                      <ol className="space-y-4">{own.map((s) => etape(s, steps.indexOf(s)))}</ol>
                    ) : (
                      <p className="text-sm italic text-on-surface-variant">Pas encore de recette pour cette préparation.</p>
                    )}
                  </div>
                );
              })}
              {assemblage.length > 0 && (
                <div>
                  <h3 className="mb-3 font-label-md text-[13px] uppercase tracking-widest text-secondary">Assemblage</h3>
                  <ol className="space-y-4">{assemblage.map((s) => etape(s, steps.indexOf(s)))}</ol>
                </div>
              )}
            </div>
          ) : (
            sansRecette
          ),
        )}

        {bloc(
          'quantites',
          <div className="space-y-3">
            <ul className="space-y-2">
              {ordered
                .filter((c) => c.resolved)
                .map((c) => (
                  <li key={c.id} className="rounded-lg bg-surface px-4 py-2.5 text-sm">
                    <span className="font-semibold text-on-surface">{c.name}</span>{' '}
                    <span className="text-on-surface-variant">
                      — {COMPONENT_SCALING_MODES.find((m) => m.value === (c.scalingMode ?? ''))?.label ?? 'Selon la recette'}
                    </span>
                    <span className="block text-on-surface-variant">
                      {c.scaleFactor != null && c.scaleFactor !== 1
                        ? `Coefficient ×${fmtFacteur(c.scaleFactor)}${c.manuallyAdjusted ? ' (saisi à la main)' : ''}`
                        : 'Quantités d’origine, pas encore ajustées'}
                      {c.scaleReason && <span className="italic"> — {c.scaleReason}</span>}
                    </span>
                  </li>
                ))}
            </ul>
            <Link href={v1} className={lienV1}>
              Ajuster les quantités (version actuelle)
            </Link>
          </div>,
        )}

        {bloc(
          'ingredients',
          recipe ? (
            ingredientGroups.length ? (
              <IngredientTotalList
                groups={ingredientGroups.map((g) => ({
                  key: ingredientKey(g.name),
                  name: g.name,
                  allergen:
                    Array.from(new Set(g.lines.flatMap((m) => (m.allergen ? m.allergen.split(',').map((a) => a.trim()) : []))))
                      .filter(Boolean)
                      .join(', ') || null,
                  total: g.subtotal ? [g.subtotal.qty, g.subtotal.unit].filter(Boolean).join(' ') : null,
                  lines: g.lines.map((m, k) => ({
                    key: `${k}-${m.comment || ''}`,
                    qty: [m.qty, m.unit].filter(Boolean).join(' '),
                    comment: m.comment,
                  })),
                }))}
              />
            ) : (
              <p className="text-sm text-on-surface-variant">Aucun ingrédient pour l’instant.</p>
            )
          ) : (
            sansRecette
          ),
        )}

        {bloc(
          'organisation',
          recipe ? (
            <div className="space-y-5 text-sm">
              <div>
                <h3 className="mb-1 font-label-md text-[12px] uppercase tracking-widest text-outline">Ustensiles</h3>
                <p>{recipe.recipe_utensils.map((u) => u.name).join(', ') || '—'}</p>
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <p>
                  <span className="text-outline">Difficulté : </span>
                  {recipe.difficulties?.name ?? '—'}
                </p>
                {times && (
                  <>
                    <p>
                      <span className="text-outline">Préparation : </span>
                      {fmtMin(times.prep) ?? '—'}
                    </p>
                    <p>
                      <span className="text-outline">Cuisson : </span>
                      {fmtMin(times.cook) ?? '—'}
                    </p>
                    <p>
                      <span className="text-outline">Repos : </span>
                      {fmtMin(times.wait) ?? '—'}
                    </p>
                    <p>
                      <span className="text-outline">Total : </span>
                      {fmtMin(times.total) ?? '—'}
                    </p>
                  </>
                )}
              </div>
              {days.length > 1 && (
                <div>
                  <h3 className="mb-1 font-label-md text-[12px] uppercase tracking-widest text-outline">Planning</h3>
                  <ul className="space-y-1">
                    {days.map((d) => (
                      <li key={d.offset}>
                        <span className="font-label-md text-primary">{dayLabel(d.offset)}</span> —{' '}
                        {d.items.map((it) => it.title || 'Sans titre').join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[12px] italic text-on-surface-variant">Bientôt modifiables ici.</p>
            </div>
          ) : (
            sansRecette
          ),
        )}

        {bloc(
          'conseils',
          recipe ? (
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="mb-1 font-label-md text-[12px] uppercase tracking-widest text-outline">Conseils</h3>
                <p className="whitespace-pre-line">{recipe.tips || '—'}</p>
              </div>
              <div>
                <h3 className="mb-1 font-label-md text-[12px] uppercase tracking-widest text-outline">
                  Conseils de service
                </h3>
                <p className="whitespace-pre-line">{recipe.serving_advice || '—'}</p>
              </div>
              <div>
                <h3 className="mb-1 font-label-md text-[12px] uppercase tracking-widest text-outline">Source</h3>
                <p>{[recipe.source, recipe.source_url, recipe.video_url].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <p className="text-[12px] italic text-on-surface-variant">Bientôt modifiables ici.</p>
            </div>
          ) : (
            sansRecette
          ),
        )}

        {bloc(
          'validation',
          <div className="space-y-3 text-sm">
            {blockers.length ? (
              <ul className="list-disc space-y-1 pl-5 text-secondary">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="text-green-700">Le projet peut être validé.</p>
            )}
            <p className="text-on-surface-variant">
              {trialCount
                ? `${trialCount} fournée${trialCount > 1 ? 's' : ''} d’essai.`
                : 'Aucune fournée d’essai pour l’instant (facultatif).'}
            </p>
            <Link href={v1} className={lienV1}>
              Lancer un essai ou valider le projet (version actuelle)
            </Link>
          </div>,
        )}
      </div>
    </>
  );
}
