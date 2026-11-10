// Recalcul des quantités d'une sous-recette quand une étape devient (ou cesse
// d'être) « déjà réalisée avant la fournée » (`batch_steps.fait_en_amont`).
//
// Un ingrédient remplacé par une recette (« je fais moi-même mon praliné »)
// est fabriqué en UNE fois pour toutes ses occurrences : les ingrédients des
// étapes insérées valent `base × coefficient`, le coefficient venant de la
// somme des quantités des occurrences. Si l'une de ces occurrences se trouve
// dans une étape déjà faite avant la fournée, on n'a plus à fabriquer sa part :
// on réduit les ingrédients des étapes insérées dans le même rapport — et
// inversement quand on décoche.
//
// Logique pure (aucun accès base) : `planifierRecalculAmont` rend ce qu'il y
// aurait à écrire, l'appelant confirme puis écrit.
//
// Pas de colonne pour mémoriser le coefficient d'origine : on part des
// quantités ACTUELLES des lignes insérées (qui gardent donc un coefficient
// retouché à la main, proportionnellement) et on les multiplie par
// « besoin après / besoin avant ». Conséquence assumée : un arrondi d'unité
// (cf. `units.round_from`) peut décaler d'un gramme après plusieurs coches et
// décoches.
import { arrondirQuantite, type SeuilsArrondi } from '@/lib/arrondi-unite';
import { expandedGroup, fmtNum, type BatchFull, type BatchIngredientRow } from '@/lib/recipe-plan';

export type LigneARecalculer = { id: number; nom: string; unite: string | null; avant: number; apres: number };

export type RecalculExpansion = {
  nom: string;
  unite: string | null;
  // Quantité à fabriquer avant / après (somme des occurrences non « en amont »).
  besoinAvant: number;
  besoinApres: number;
  // `recalcule` : les lignes insérées sont à réécrire ; `plus-rien` : toutes les
  // occurrences sont en amont, rien n'est écrit (le coefficient d'origine ne se
  // retrouverait plus) ; `sans-reference` : il n'y avait plus de besoin avant,
  // le rapport est indéfini, rien n'est écrit.
  statut: 'recalcule' | 'plus-rien' | 'sans-reference';
  lignes: LigneARecalculer[];
};

export type PlanRecalculAmont = {
  expansions: RecalculExpansion[];
  // Écritures à faire : { id de la ligne `batch_ingredients`, nouvelle quantité }.
  ecritures: { id: number; quantity: number }[];
  // Texte de confirmation, `null` quand rien ne change (aucun remplacement concerné).
  confirmation: string | null;
};

function enAmontApres(batch: BatchFull, stepId: number, suivant: boolean): Set<number> {
  const set = new Set<number>();
  for (const s of batch.batch_steps ?? []) {
    const on = s.id === stepId ? suivant : !!s.fait_en_amont;
    if (on) set.add(s.id);
  }
  return set;
}

// Quantité encore à fabriquer : occurrences chiffrées qui ne sont pas portées
// par une étape « en amont » (sauf ligne décochée pour être gardée).
function besoin(group: BatchIngredientRow[], enAmont: Set<number>): number {
  return group.reduce((sum, it) => {
    if (it.quantity == null) return sum;
    const sorti = it.batch_step_id != null && enAmont.has(it.batch_step_id) && it.excluded_when_done;
    return sorti ? sum : sum + it.quantity;
  }, 0);
}

export function planifierRecalculAmont(batch: BatchFull, stepId: number, suivant: boolean, seuils?: SeuilsArrondi | null): PlanRecalculAmont {
  const avantSet = enAmontApres(batch, stepId, !suivant); // état courant
  const apresSet = enAmontApres(batch, stepId, suivant);
  const vus = new Set<number>();
  const expansions: RecalculExpansion[] = [];
  const ecritures: { id: number; quantity: number }[] = [];

  for (const it of batch.batch_ingredients) {
    if (it.expanded_into_recipe_id == null || it.removed || vus.has(it.id)) continue;
    const group = expandedGroup(batch, it).filter((g) => !g.removed);
    group.forEach((g) => vus.add(g.id));
    // Seuls comptent les remplacements dont une occurrence est dans l'étape touchée.
    if (!group.some((g) => g.batch_step_id === stepId && g.excluded_when_done)) continue;

    const besoinAvant = besoin(group, avantSet);
    const besoinApres = besoin(group, apresSet);
    if (besoinAvant === besoinApres) continue;

    const groupIds = group.map((g) => g.id);
    const stepIds = new Set(batch.batch_steps.filter((s) => s.source_ingredient_id != null && groupIds.includes(s.source_ingredient_id)).map((s) => s.id));
    const exp: RecalculExpansion = { nom: it.name, unite: it.unit, besoinAvant, besoinApres, statut: 'recalcule', lignes: [] };

    if (besoinApres <= 0) exp.statut = 'plus-rien';
    else if (besoinAvant <= 0) exp.statut = 'sans-reference';
    else {
      const rapport = besoinApres / besoinAvant;
      for (const l of batch.batch_ingredients) {
        if (l.batch_step_id == null || !stepIds.has(l.batch_step_id) || l.quantity == null) continue;
        const apres = arrondirQuantite(l.quantity * rapport, l.unit, seuils);
        if (apres === l.quantity) continue;
        exp.lignes.push({ id: l.id, nom: l.name, unite: l.unit, avant: l.quantity, apres });
        ecritures.push({ id: l.id, quantity: apres });
      }
    }
    expansions.push(exp);
  }

  if (expansions.length === 0) return { expansions, ecritures, confirmation: null };

  const q = (n: number, u: string | null) => `${fmtNum(n)}${u ? ' ' + u : ''}`;
  const intro = suivant ? 'Vous voulez indiquer que cette étape a déjà été réalisée avant la fournée.' : 'Vous voulez indiquer que cette étape doit être réalisée dans cette fournée.';
  const geste = suivant ? 'En cochant la case' : 'En décochant la case';
  const detail = (e: RecalculExpansion) => {
    if (e.statut === 'plus-rien') {
      return `il n'y aura plus rien à fabriquer pour le « ${e.nom} » (toutes ses utilisations sont déjà réalisées). Les quantités des étapes ajoutées restent inchangées : annulez le remplacement si vous n'en avez plus besoin.`;
    }
    if (e.statut === 'sans-reference') {
      return `les quantités des étapes ajoutées pour fabriquer le « ${e.nom} » ne peuvent pas être recalculées automatiquement. Vérifiez-les.`;
    }
    return `il y aura un impact sur le « ${e.nom} » à fabriquer : ${q(e.besoinAvant, e.unite)} ⇒ ${q(e.besoinApres, e.unite)}.`;
  };
  let confirmation: string;
  if (expansions.length === 1) {
    confirmation = `${intro} ${geste}, ${detail(expansions[0])}`;
  } else {
    const puces = expansions.map((e) => {
      if (e.statut === 'recalcule') return `• « ${e.nom} » : ${q(e.besoinAvant, e.unite)} ⇒ ${q(e.besoinApres, e.unite)}`;
      const d = detail(e);
      return `• ${d.charAt(0).toUpperCase()}${d.slice(1)}`;
    });
    confirmation = `${intro} ${geste}, il y aura un impact sur plusieurs ingrédients à fabriquer :\n${puces.join('\n')}`;
  }
  return { expansions, ecritures, confirmation };
}
