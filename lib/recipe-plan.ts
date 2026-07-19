// Logique du « mode planifié » d'une recette (porté de recette.html) : coefficient
// de mise à l'échelle par ligne d'ingrédient (barré / modifié / ajouté / déjà en
// possession), fusion effective pour la liste de courses et la mise en place, et
// construction du instantané (« snapshot ») figé au démarrage d'une exécution.
// Fonctions pures — aucun accès réseau ici.
import type { RecipeFull } from '@/lib/recipes';
import type { PlanningEntry } from '@/lib/profile';
import type { Json } from '@/lib/database.types';

export type IngMod = { qty?: number; coef?: number; removed?: boolean };
export type AddedIng = { group: string; name: string; qty: string; unit: string };
export type MoldCoefs = { surface: number; volume: number };
export type PlanOverrides = {
  mods: Record<string, IngMod>;
  added: AddedIng[];
  etapes_faites: string[];
  mold_coefs: MoldCoefs | null;
  mold_target: Record<string, unknown> | null;
};

const numify = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const round2 = (n: number): number => +n.toFixed(2);
export const fmtNum = (n: number): string => String(round2(n)).replace('.', ',');

export function normalizeOverrides(raw: Json | null | undefined): PlanOverrides {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    mods: (o.mods as Record<string, IngMod>) || {},
    added: (o.added as AddedIng[]) || [],
    etapes_faites: (o.etapes_faites as string[]) || [],
    mold_coefs: (o.mold_coefs as MoldCoefs) || null,
    mold_target: (o.mold_target as Record<string, unknown>) || null,
  };
}

export function planFactor(plan: Pick<PlanningEntry, 'factor'> | null): number {
  return plan && plan.factor && plan.factor > 0 ? plan.factor : 1;
}

export function isStepDone(overrides: PlanOverrides, stepId: number): boolean {
  return overrides.etapes_faites.map(String).includes(String(stepId));
}

// Groupes d'ingrédients « déjà en ma possession » (ceux des étapes réalisées à la planification).
export function ownedGroupOrders(overrides: PlanOverrides, steps: RecipeFull['recipe_steps']): Set<number> {
  const owned = new Set<number>();
  steps.forEach((s) => {
    if (isStepDone(overrides, s.id)) owned.add(s.order_index || 0);
  });
  return owned;
}

function ingMod(overrides: PlanOverrides, id: number | string): IngMod {
  return overrides.mods[String(id)] || {};
}
export function isRemovedIng(overrides: PlanOverrides, id: number | string): boolean {
  return !!ingMod(overrides, id).removed;
}
export function isModifiedIng(overrides: PlanOverrides, id: number | string): boolean {
  const m = ingMod(overrides, id);
  return m.qty != null || m.coef != null;
}

export function scalingModeMap(recipe: RecipeFull): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  (recipe.ingredient_groups || []).forEach((g) => (g.ingredients || []).forEach((it) => (map[String(it.id)] = g.scaling_mode)));
  return map;
}

// Coefficient d'adaptation d'une ligne AVANT toute modification manuelle : « aucun »
// fige la quantité (×1) ; pour une recette moule, « fonçage » suit la surface, sinon
// le volume (mold_coefs) ; sinon l'ajustement global de la planification.
function baseScalingCoef(plan: PlanningEntry, overrides: PlanOverrides, mode: string | null | undefined): number {
  if (mode === 'aucun') return 1;
  const mc = overrides.mold_coefs;
  if (mc) {
    const c = mode === 'foncage' ? (mc.surface ?? mc.volume) : (mc.volume ?? mc.surface);
    if (c != null && c > 0) return c;
  }
  return planFactor(plan);
}

export function effAdjustedQty(
  plan: PlanningEntry,
  overrides: PlanOverrides,
  mode: string | null | undefined,
  it: { id: number; quantity: string | null },
): number | null {
  const m = ingMod(overrides, it.id);
  if (m.qty != null) return m.qty;
  const base = numify(it.quantity);
  if (base == null) return null;
  const coef = m.coef != null ? m.coef : baseScalingCoef(plan, overrides, mode);
  return round2(base * coef);
}

export function effCoef(
  plan: PlanningEntry,
  overrides: PlanOverrides,
  mode: string | null | undefined,
  it: { id: number; quantity: string | null },
): number | null {
  const m = ingMod(overrides, it.id);
  if (m.coef != null) return m.coef;
  const base = numify(it.quantity);
  if (m.qty != null) return base ? round2(m.qty / base) : null;
  return baseScalingCoef(plan, overrides, mode);
}

// ── Lignes d'un groupe (mode planifié), lignes de la recette + lignes ajoutées ──
export type PlanRow = {
  id: string; // id réel (string) ou « added-N »
  name: string;
  comment: string | null;
  url: string | null;
  quantity: string | null;
  unit: string | null;
  addedIdx: number | null;
  owned: boolean;
  removed: boolean;
  modified: boolean;
  coef: number | null;
  adjQty: number | null;
};

export function buildGroupRows(group: RecipeFull['ingredient_groups'][number], plan: PlanningEntry, overrides: PlanOverrides, owned: boolean): PlanRow[] {
  const base: PlanRow[] = [...(group.ingredients || [])]
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    .map((it) => ({
      id: String(it.id),
      name: it.name,
      comment: it.comment,
      url: it.ingredient_refs?.url || it.url,
      quantity: it.quantity,
      unit: it.unit,
      addedIdx: null,
      owned,
      removed: isRemovedIng(overrides, it.id),
      modified: isModifiedIng(overrides, it.id),
      coef: effCoef(plan, overrides, group.scaling_mode, it),
      adjQty: effAdjustedQty(plan, overrides, group.scaling_mode, it),
    }));
  const added: PlanRow[] = overrides.added
    .map((a, idx) => ({ a, idx }))
    .filter(({ a }) => String(a.group) === String(group.id))
    .map(({ a, idx }) => ({
      id: `added-${idx}`,
      name: a.name,
      comment: null,
      url: null,
      quantity: a.qty,
      unit: a.unit,
      addedIdx: idx,
      owned,
      removed: false,
      modified: false,
      coef: null,
      adjQty: numify(a.qty),
    }));
  return [...base, ...added];
}

// ── Fusion effective (mode planifié) : groupes « possédés » exclus, lignes barrées
// exclues, ajustements appliqués, ajouts inclus. Sert à la liste de courses et à
// la mise en place de l'exécution.
export type MergedPlanRow = { name: string; unit: string; adj: number | null; orig: number | null; origTxt: string[]; added: boolean; modified: boolean };

export function effectiveMergedRows(recipe: RecipeFull, plan: PlanningEntry, overrides: PlanOverrides): MergedPlanRow[] {
  const rows: (MergedPlanRow & { key: string })[] = [];
  const push = (name: string, unit: string, adjN: number | null, origN: number | null, origRaw: string, added: boolean, modFlag: boolean) => {
    const key = name.toLowerCase() + '|' + unit.toLowerCase();
    let r = rows.find((x) => x.key === key);
    if (!r) {
      r = { key, name, unit, adj: null, orig: null, origTxt: [], added: false, modified: false };
      rows.push(r);
    }
    if (adjN != null) r.adj = round2((r.adj || 0) + adjN);
    if (origN != null) r.orig = round2((r.orig || 0) + origN);
    else if (origRaw) r.origTxt.push(origRaw);
    if (added) r.added = true;
    if (modFlag) r.modified = true;
  };
  const owned = ownedGroupOrders(overrides, recipe.recipe_steps);
  const modeMap = scalingModeMap(recipe);
  (recipe.ingredient_groups || []).forEach((g) => {
    if (owned.has(g.order_index || 0)) return;
    (g.ingredients || []).forEach((it) => {
      if (!it.name || isRemovedIng(overrides, it.id)) return;
      push(it.name, it.unit || '', effAdjustedQty(plan, overrides, modeMap[String(it.id)], it), numify(it.quantity), it.quantity || '', false, isModifiedIng(overrides, it.id));
    });
  });
  overrides.added.forEach((a) => {
    if (a.name) push(a.name, a.unit || '', numify(a.qty), null, '', true, false);
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return rows.map(({ key: _key, ...r }) => r);
}

export function mergedRowQtyText(r: MergedPlanRow): string {
  return r.adj != null ? fmtNum(r.adj) : r.origTxt.join(' + ') || '';
}

// Étape « Jour J − n » → date réelle (jour de dégustation − offset), en mode planifié.
export function planDayLabel(offset: number | null | undefined, plannedDate: string): string {
  const d = new Date(plannedDate + 'T00:00:00');
  d.setDate(d.getDate() - Math.max(0, offset || 0));
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}

// ── Snapshot d'exécution : copie figée jalons > étapes > ingrédients (quantités
// ajustées du planning), autonome une fois créé — les modifications ultérieures de
// la recette ou du planning ne l'affectent plus.
export type ExecStepIngredient = { nom: string; unite: string; quantite_prevue: number | string; quantite_reelle: number | null; fait: boolean };
export type ExecSousEtape = { texte: string; fait: boolean };
export type ExecStep = {
  id: number;
  titre: string;
  description: string;
  sous_etapes?: ExecSousEtape[];
  tips: string;
  prep: number;
  attente: number;
  cuisson: number;
  temperature: number | null;
  video: string | null;
  faite: boolean;
  date_faite: string | null;
  commentaire: string;
  ingredients: ExecStepIngredient[];
};
export type ExecJalon = { offset: number; etapes: ExecStep[] };
export type ExecMepItem = { nom: string; unite?: string; quantite?: number | string; fait: boolean };
export type ExecutionSnapshot = {
  titre: string;
  jalons: ExecJalon[];
  mise_en_place: { ustensiles: ExecMepItem[]; ingredients: ExecMepItem[]; passee?: boolean };
};

export function buildExecutionSnapshot(recipe: RecipeFull, plan: PlanningEntry, overrides: PlanOverrides): ExecutionSnapshot {
  const steps = [...(recipe.recipe_steps || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const groupsByOrder: Record<number, RecipeFull['ingredient_groups'][number]> = {};
  (recipe.ingredient_groups || []).forEach((g) => (groupsByOrder[g.order_index || 0] = g));
  const modeMap = scalingModeMap(recipe);

  const stepIngredients = (grp: RecipeFull['ingredient_groups'][number] | undefined, done: boolean): ExecStepIngredient[] => {
    if (!grp) return [];
    const rows: ExecStepIngredient[] = [...(grp.ingredients || [])]
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .filter((it) => it.name && !isRemovedIng(overrides, it.id))
      .map((it) => ({
        nom: it.name,
        unite: it.unit || '',
        quantite_prevue: effAdjustedQty(plan, overrides, modeMap[String(it.id)], it) ?? (it.quantity || ''),
        quantite_reelle: null,
        fait: done,
      }));
    overrides.added.forEach((a) => {
      if (String(a.group) === String(grp.id) && a.name) {
        rows.push({ nom: a.name, unite: a.unit || '', quantite_prevue: numify(a.qty) ?? (a.qty || ''), quantite_reelle: null, fait: done });
      }
    });
    return rows;
  };

  const jalons: ExecJalon[] = [];
  steps.forEach((s) => {
    const offset = Math.max(0, s.day_offset || 0);
    let j = jalons.find((x) => x.offset === offset);
    if (!j) {
      j = { offset, etapes: [] };
      jalons.push(j);
    }
    const done = isStepDone(overrides, s.id);
    j.etapes.push({
      id: s.id,
      titre: s.title || '',
      description: s.description || '',
      ...(Array.isArray(s.sous_etapes) && s.sous_etapes.length ? { sous_etapes: s.sous_etapes.map((t) => ({ texte: t, fait: done })) } : {}),
      tips: s.tips || '',
      prep: s.prep_time || 0,
      attente: s.wait_time || 0,
      cuisson: s.cook_time || 0,
      temperature: s.cook_temp || null,
      video: null, // recipe_steps.video_url absent de la base live (maquette vanilla uniquement)
      faite: done,
      date_faite: null,
      commentaire: '',
      ingredients: stepIngredients(groupsByOrder[s.order_index || 0], done),
    });
  });
  jalons.sort((a, b) => b.offset - a.offset); // du plus lointain au jour J

  return {
    titre: recipe.title,
    jalons,
    mise_en_place: {
      ustensiles: [...(recipe.recipe_utensils || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map((u) => ({ nom: u.name, fait: false })),
      ingredients: effectiveMergedRows(recipe, plan, overrides).map((r) => ({
        nom: r.name,
        unite: r.unit || '',
        quantite: r.adj != null ? r.adj : r.orig != null ? r.orig : r.origTxt.join(' + '),
        fait: false,
      })),
    },
  };
}
