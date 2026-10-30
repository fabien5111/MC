// Clé de comparaison d'un nom d'ingrédient (JEP-249) — fonction pure.
//
// Un même ingrédient s'écrit de plusieurs façons selon l'auteur, l'import ou
// le clavier : « Jaune d'œuf », « jaunes d'oeufs », « Jaunes d’œufs ». Le
// texte saisi reste affiché tel quel ; c'est la COMPARAISON qui doit les
// confondre — rattachement au référentiel (`resolveIngredientRefId`), fusion
// de la liste totale, des courses, des fournées. Sans clé commune, chacun de
// ces endroits comparait `toLowerCase()` à sa façon, et deux lignes du même
// ingrédient restaient séparées (et, côté référentiel, sans `ref_id` : ni
// conversion, ni masse volumique — demain, ni coût ni stock).
//
// Règle, appliquée mot par mot :
//   - casse, accents, ligatures (œ → oe, æ → ae), apostrophes et ponctuation ;
//   - mots vides retirés (« de », « d' », « du », « des », « la »…) ;
//   - pluriel régulier ramené au singulier : « s » final, et « x » final
//     après un « u » (gâteaux, choux, noyaux, cheveux).
// Les deux côtés passant par la même fonction, un mot invariable (« noix »,
// « pois », « jus ») ou mal singularisé (« cassis » → « cassi ») se compare
// toujours à lui-même : l'approximation ne coûte rien tant qu'elle est
// symétrique. Seuls les mots de plus de 3 lettres perdent leur marque de
// pluriel, pour épargner « jus », « gras », « riz »…
//
// Jamais une clé stockée ni affichée : elle peut changer (règle affinée) sans
// migration. Son équivalent SQL (`public.mc_ingredient_key`) sert au
// rattrapage des `ref_id` et à la détection des doublons du référentiel —
// les deux doivent rester alignés.

const STOPWORDS = new Set(['a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'l', 'la', 'le', 'les', 'un', 'une']);

function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ux')) return w.slice(0, -1);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

// Mots significatifs d'un nom, normalisés mais PAS encore ramenés au singulier.
function ingredientKeyMots(name: string | null | undefined): string[] {
  return (name ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w));
}

export function ingredientKey(name: string | null | undefined): string {
  return ingredientKeyMots(name).map(singular).join(' ');
}

// Vrai si deux noms désignent le même ingrédient au sens de `ingredientKey`.
export function sameIngredient(a: string | null | undefined, b: string | null | undefined): boolean {
  return ingredientKey(a) === ingredientKey(b);
}

// Entrées du référentiel qui partagent la même clé (« Jaune d'œuf » /
// « Jaunes d'oeufs ») — un ingrédient ne doit y figurer qu'une fois, sans
// quoi coûts, stocks, conversions et masse volumique se répartiraient entre
// deux fiches. Groupes de 2 entrées ou plus, triés par libellé.
export function ingredientRefDuplicates<T extends { id: number; name: string }>(refs: T[]): T[][] {
  const byKey = new Map<string, T[]>();
  for (const r of refs) {
    const k = ingredientKey(r.name);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  return [...byKey.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
    .sort((a, b) => a[0].name.localeCompare(b[0].name, 'fr'));
}

// Entrée à garder de préférence dans un groupe de doublons (JEP-383) : celle
// dont le libellé est au PLURIEL (« Poudre de pistaches », « Jaunes d'œufs »),
// parce qu'un ingrédient du référentiel se lit comme ce qu'on achète ou pèse.
// Le pluriel se reconnaît à ses mots : on compte ceux que `singular` raccourcit
// (« pistaches » oui, « noix » ou « jus » non, ils sont invariables). Égalité
// (« Fève de tonka » / « Fève tonka », rien à départager) : la première du
// groupe, qui est déjà triée par libellé. Une suggestion, jamais un choix
// imposé : l'admin tranche.
function motsAuPluriel(name: string): number {
  return ingredientKeyMots(name).filter((w) => singular(w) !== w).length;
}

export function entreePlurielPreferee<T extends { name: string }>(group: T[]): T | null {
  let meilleure: T | null = null;
  let max = 0;
  for (const r of group) {
    const n = motsAuPluriel(r.name);
    if (n > max) {
      max = n;
      meilleure = r;
    }
  }
  return meilleure;
}

// ---------------------------------------------------------------------------
// Accord du nom à l'affichage (JEP-282) — fonction pure.
//
// Le texte saisi par l'auteur reste en base tel quel ; seul l'AFFICHAGE
// s'accorde, quand la quantité change sans que le nom suive (« 1 jaune
// d'œuf » ajusté ×3, « 2 jaunes d'œufs » divisé par deux). Le pluriel d'un
// nom composé n'étant pas mécanique (« jaunes d'œufs », « gousses de
// vanille », « noix de coco »), il vient d'un libellé saisi au référentiel
// (`ingredient_refs.name_plural`), jamais d'une heuristique.
//
// N'agit que si : la ligne est rattachée au référentiel, l'unité est une unité
// de comptage (« unité(s) » ou aucune — jamais « 40 g de jaunes d'œufs »), la
// quantité est un nombre, la référence porte un pluriel, et le nom de
// l'auteur désigne bien cette référence (même `ingredientKey`) — un libellé
// enrichi (« Jaunes d'œufs frais ») reste intact. Sinon, texte de l'auteur.

export type NomsReference = { singulier: string; pluriel: string | null };

// Noms accordables du référentiel, par identifiant ET par `ingredientKey`. La
// clé sert de repli quand la ligne pointe vers un DOUBLON de la référence qui
// porte le pluriel (« Œufs » à côté de « Œuf ») : le référentiel en contient
// tant qu'Admin → Éléments inconnus ne les a pas fusionnés, et l'accord ne doit
// pas dépendre de la copie que la ligne a rattachée.
export type NomsAccordables = { parId: Record<number, NomsReference>; parCle: Record<string, NomsReference> };

export const AUCUN_NOM_ACCORDABLE: NomsAccordables = { parId: {}, parCle: {} };

// Références de la ligne : la sienne si elle porte un pluriel, sinon une autre
// référence du même ingrédient. Ligne non rattachée (`refId` vide) : aucune.
export function nomsDeLigne(
  noms: NomsAccordables,
  nom: string,
  refId: number | null | undefined,
): NomsReference | null {
  if (refId == null) return null;
  return noms.parId[refId] ?? noms.parCle[ingredientKey(nom)] ?? null;
}

const UNITES_COMPTAGE = new Set(['', 'unité(s)', 'unité', 'unités', 'unite(s)']);

// Quantité affichée → nombre, ou null si elle n'est pas lisible
// (« 1/2 » et « 1,5 » acceptés ; « quelques », « 2-3 » écartés).
export function quantiteNumerique(q: string | number | null | undefined): number | null {
  if (q == null) return null;
  const s = String(q).trim().replace(',', '.');
  if (!s) return null;
  const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function libelleIngredient(
  nom: string,
  quantite: string | number | null | undefined,
  unite: string | null | undefined,
  ref: NomsReference | null | undefined,
): string {
  if (!ref || !ref.pluriel || !ref.singulier) return nom;
  if (!UNITES_COMPTAGE.has((unite ?? '').trim().toLowerCase())) return nom;
  const n = quantiteNumerique(quantite);
  if (n == null) return nom;
  const cle = ingredientKey(nom);
  if (!cle || (cle !== ingredientKey(ref.singulier) && cle !== ingredientKey(ref.pluriel))) return nom;
  const voulu = n >= 2 ? ref.pluriel : ref.singulier;
  // Majuscule initiale : celle de l'auteur, pas celle du référentiel.
  const premier = nom.charAt(0);
  const maj = premier !== premier.toLowerCase();
  const tete = voulu.charAt(0);
  return (maj ? tete.toUpperCase() : tete.toLowerCase()) + voulu.slice(1);
}
