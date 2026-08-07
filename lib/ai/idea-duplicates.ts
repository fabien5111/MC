// Détection de doublons par IA (boîte à idées) — fonctions pures.
//
// Complète la prévention lexicale déjà en place (`suggest_similar_ideas`,
// trigramme + plein texte) : deux idées peuvent décrire le même besoin sans
// partager le moindre mot (« minuteur qui se lance tout seul » ↔
// « chronomètre automatique »), ce qu'aucune recherche lexicale ne peut
// repérer. Deux usages :
//  - à la création, une idée à la fois contre le fonds existant
//    (`buildCheckContenu` / `normaliseCheckResultat`) ;
//  - côté admin, un balayage de l'ensemble des idées ouvertes, deux par deux
//    (`buildScanContenu` / `normaliseScanResultat`).

export type IdeaCandidate = { id: string; title: string; description?: string | null };

const MAX_TITLE_LEN = 200;
const MAX_DESC_LEN = 300;

function clip(s: string | null | undefined, max: number): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// ── Vérification à la création (une idée contre le fonds existant) ────────

export function buildCheckContenu(
  title: string,
  description: string | null,
  candidates: IdeaCandidate[],
): string {
  const liste = candidates
    .map((c) => `${c.id}: ${clip(c.title, MAX_TITLE_LEN)}`)
    .join('\n');
  return `Tu compares une idée proposée par un membre à la liste des idées déjà
existantes sur un site communautaire de recettes de pâtisserie, pour repérer un
doublon même si les mots utilisés diffèrent complètement (ex. « minuteur qui se
lance tout seul » et « chronomètre automatique » désignent la même idée).

Idée proposée :
Titre : "${clip(title, MAX_TITLE_LEN)}"
Description : "${clip(description, MAX_DESC_LEN) || '(aucune)'}"

Idées déjà existantes (id: titre) :
${liste || '(aucune)'}

Réponds UNIQUEMENT par un objet JSON valide, sans texte ni balises autour :
{"doublons": [{"id": "<id d'une idée existante qui a EXACTEMENT le même sens>", "raison": "<une phrase brève expliquant le rapprochement, en français>"}]}
Ne renvoie que des correspondances sérieuses (même besoin final), pas de simples
thèmes voisins. Renvoie un tableau vide si aucune ne correspond vraiment.`;
}

export type DuplicateMatch = { id: string; raison: string };

export function normaliseCheckResultat(obj: unknown, validIds: Set<string>): DuplicateMatch[] {
  const raw = (obj as { doublons?: unknown[] })?.doublons;
  if (!Array.isArray(raw)) return [];
  const out: DuplicateMatch[] = [];
  for (const item of raw) {
    const id = (item as { id?: unknown })?.id;
    const raison = (item as { raison?: unknown })?.raison;
    if (typeof id === 'string' && validIds.has(id)) {
      out.push({ id, raison: typeof raison === 'string' ? raison.slice(0, 200) : '' });
    }
    if (out.length >= 5) break;
  }
  return out;
}

// ── Balayage admin (paires de doublons parmi les idées ouvertes) ──────────

export function buildScanContenu(candidates: IdeaCandidate[]): string {
  const liste = candidates
    .map((c) => `${c.id}: ${clip(c.title, MAX_TITLE_LEN)} — ${clip(c.description, MAX_DESC_LEN) || '(pas de description)'}`)
    .join('\n');
  return `Tu analyses une liste d'idées de fonctionnalités proposées par les membres
d'un site communautaire de recettes de pâtisserie, pour repérer les paires qui
décrivent en réalité LE MÊME besoin, même si les mots diffèrent — en vue d'une
fusion (les votes des deux idées seront regroupés).

Idées (id: titre — description) :
${liste || '(aucune)'}

Réponds UNIQUEMENT par un objet JSON valide, sans texte ni balises autour :
{"paires": [{"a": "<id>", "b": "<id>", "raison": "<une phrase brève, en français>"}]}
Une seule paire par doublon repéré (pas de groupes de 3 idées ou plus : choisis
la paire la plus évidente si plusieurs idées se recoupent). Ne renvoie que des
correspondances sérieuses. Tableau vide si aucun doublon net.`;
}

export type DuplicatePair = { a: string; b: string; raison: string };

export function normaliseScanResultat(obj: unknown, validIds: Set<string>): DuplicatePair[] {
  const raw = (obj as { paires?: unknown[] })?.paires;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DuplicatePair[] = [];
  for (const item of raw) {
    const a = (item as { a?: unknown })?.a;
    const b = (item as { b?: unknown })?.b;
    const raison = (item as { raison?: unknown })?.raison;
    if (typeof a !== 'string' || typeof b !== 'string') continue;
    if (a === b || !validIds.has(a) || !validIds.has(b)) continue;
    // Une paire (a,b) et (b,a) sont la même correspondance.
    const key = [a, b].sort().join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ a, b, raison: typeof raison === 'string' ? raison.slice(0, 200) : '' });
    if (out.length >= 20) break;
  }
  return out;
}
