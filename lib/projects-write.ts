// Mode projet — écriture du contenu d'un composant dans la recette du projet.
//
// Pourquoi ces étapes vivent dans `recipe_steps` / `ingredient_groups` /
// `ingredients` et non dans un instantané JSON : le moteur de fournée
// (`materializeBatch`) lit les tables relationnelles. Une copie rangée
// ailleurs lui serait invisible, et lancer une fournée d'essai sur un projet
// — tout l'intérêt du modèle — exigerait un second moteur (cf. CLAUDE.md
// « Mode projet »).
//
// Deux invariants du modèle sont tenus ici, et nulle part ailleurs :
//
//  1. **Une étape ↔ un groupe d'ingrédients**, appariés par `order_index`,
//     le groupe portant le titre de l'étape. C'est ainsi que l'éditeur écrit
//     une recette (`CreerForm`) et que la fournée la relit ; s'en écarter
//     rattacherait les ingrédients d'une étape à une autre.
//  2. **Un composant occupe un bloc contigu d'`order_index`**, de
//     `k × BLOCK` à `k × BLOCK + n`, où `k` est le rang du composant. Un
//     bloc par composant évite de renuméroter tout le projet à chaque
//     rattachement : seul un déplacement ou une suppression de composant
//     redistribue les blocs (`resequenceProjectSteps`).
import type { createClient } from '@/lib/supabase/client';
import type { ComponentStepDraft } from '@/lib/projects';

type Supabase = ReturnType<typeof createClient>;

// Taille d'un bloc d'étapes par composant. Cent étapes pour une seule
// préparation n'existe pas en pâtisserie ; le cap est là pour que le calcul
// d'index ne puisse pas déborder sur le bloc suivant.
const BLOCK = 100;
export const MAX_STEPS_PER_COMPONENT = BLOCK;

type StepRow = { id: number; order_index: number | null; component_id: number | null };
type GroupRow = { id: number; order_index: number | null };

// Étapes du projet et groupes d'ingrédients, appariés par `order_index`.
async function readLayout(supabase: Supabase, recipeId: string) {
  const [stepsRes, groupsRes] = await Promise.all([
    supabase.from('recipe_steps').select('id, order_index, component_id').eq('recipe_id', recipeId),
    supabase.from('ingredient_groups').select('id, order_index').eq('recipe_id', recipeId),
  ]);
  if (stepsRes.error) throw stepsRes.error;
  if (groupsRes.error) throw groupsRes.error;
  return {
    steps: (stepsRes.data ?? []) as StepRow[],
    groups: (groupsRes.data ?? []) as GroupRow[],
  };
}

// Supprime tout le contenu d'un composant : ses étapes, et les groupes
// d'ingrédients qui leur font face (les ingrédients partent en cascade avec
// leur groupe). Sert au remplacement d'une source comme à l'annulation.
export async function clearComponentContent(supabase: Supabase, recipeId: string, componentId: number) {
  const { steps, groups } = await readLayout(supabase, recipeId);
  const mine = steps.filter((s) => s.component_id === componentId);
  if (!mine.length) return;

  const indexes = new Set(mine.map((s) => s.order_index ?? -1));
  const groupIds = groups.filter((g) => indexes.has(g.order_index ?? -1)).map((g) => g.id);

  const { error: stepErr } = await supabase
    .from('recipe_steps')
    .delete()
    .in('id', mine.map((s) => s.id));
  if (stepErr) throw stepErr;

  if (groupIds.length) {
    const { error: groupErr } = await supabase.from('ingredient_groups').delete().in('id', groupIds);
    if (groupErr) throw groupErr;
  }
}

// Écrit le contenu d'un composant — quelle que soit sa provenance : copie
// d'une recette existante, proposition de l'IA ou saisie à la main. Un seul
// écrivain pour les trois sources, sinon chacune aurait sa façon d'apparier
// étapes et groupes, avec autant d'occasions de la rompre.
//
// Le contenu précédent du composant est remplacé, jamais complété : changer
// la recette source d'un composant, c'est le refaire.
export async function writeComponentContent(
  supabase: Supabase,
  recipeId: string,
  componentId: number,
  componentIndex: number,
  steps: ComponentStepDraft[],
) {
  await clearComponentContent(supabase, recipeId, componentId);

  const base = componentIndex * BLOCK;
  const retenues = steps.slice(0, MAX_STEPS_PER_COMPONENT);

  for (let i = 0; i < retenues.length; i++) {
    const st = retenues[i];
    const order = base + i;
    const titre = (st.title || '').trim() || null;

    const { data: stepRow, error: stepErr } = await supabase
      .from('recipe_steps')
      .insert({
        recipe_id: recipeId,
        component_id: componentId,
        step_number: order + 1,
        order_index: order,
        title: titre,
        description: st.description,
        sous_etapes: st.sous_etapes,
        prep_time: st.prep_time,
        cook_time: st.cook_time,
        wait_time: st.wait_time,
        cook_temp: st.cook_temp,
        tips: st.tips,
        day_offset: st.day_offset,
      } as never)
      .select('id')
      .single();
    if (stepErr || !stepRow) throw stepErr ?? new Error('Étape refusée');

    const lignes = st.ingredients.filter((it) => (it.name || '').trim());
    if (!lignes.length) continue;

    // Groupe d'ingrédients face à l'étape : même `order_index`, même titre —
    // l'appariement du modèle (cf. en-tête).
    const { data: groupRow, error: groupErr } = await supabase
      .from('ingredient_groups')
      .insert({ recipe_id: recipeId, name: titre || `Étape ${i + 1}`, order_index: order } as never)
      .select('id')
      .single();
    if (groupErr || !groupRow) throw groupErr ?? new Error('Groupe refusé');

    const { error: ingErr } = await supabase.from('ingredients').insert(
      lignes.map((it, ii) => ({
        group_id: groupRow.id,
        name: it.name.trim(),
        quantity: it.quantity,
        unit: it.unit,
        comment: it.comment,
        allergen: it.allergen,
        ref_id: it.ref_id,
        order_index: ii,
      })) as never,
    );
    if (ingErr) throw ingErr;
  }
}

// Redistribue les blocs d'`order_index` après un déplacement ou une
// suppression de composant : les étapes d'un projet doivent se lire dans
// l'ordre d'assemblage, du bas vers le haut. Les groupes suivent leurs
// étapes, sans quoi l'appariement se romprait au premier réordonnancement.
//
// Aucune contrainte d'unicité sur `order_index` : les mises à jour peuvent
// donc se faire ligne à ligne, sans passe intermédiaire pour éviter les
// collisions.
export async function resequenceProjectSteps(supabase: Supabase, recipeId: string, componentIds: number[]) {
  const { steps, groups } = await readLayout(supabase, recipeId);
  if (!steps.length) return;

  const groupByIndex = new Map<number, GroupRow>();
  groups.forEach((g) => groupByIndex.set(g.order_index ?? -1, g));

  const rang = new Map<number, number>();
  componentIds.forEach((id, i) => rang.set(id, i));

  // Les étapes sans composant (il n'y en a pas encore, mais l'assemblage
  // final en produira) sont rejetées à la fin, dans leur ordre courant.
  const ordonnees = [...steps].sort((a, b) => {
    const ra = a.component_id != null ? (rang.get(a.component_id) ?? componentIds.length) : componentIds.length;
    const rb = b.component_id != null ? (rang.get(b.component_id) ?? componentIds.length) : componentIds.length;
    if (ra !== rb) return ra - rb;
    return (a.order_index ?? 0) - (b.order_index ?? 0);
  });

  let courant = -1;
  let dansLeBloc = 0;
  for (const s of ordonnees) {
    const r = s.component_id != null ? (rang.get(s.component_id) ?? componentIds.length) : componentIds.length;
    if (r !== courant) {
      courant = r;
      dansLeBloc = 0;
    }
    const cible = r * BLOCK + dansLeBloc;
    dansLeBloc++;
    if (cible === s.order_index) continue;

    const groupe = groupByIndex.get(s.order_index ?? -1);
    const { error } = await supabase
      .from('recipe_steps')
      .update({ order_index: cible, step_number: cible + 1 } as never)
      .eq('id', s.id);
    if (error) throw error;
    if (groupe) {
      const { error: gErr } = await supabase.from('ingredient_groups').update({ order_index: cible } as never).eq('id', groupe.id);
      if (gErr) throw gErr;
    }
  }
}
