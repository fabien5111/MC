// Logique pure du contenu d'article — aucun accès base, aucun rendu.
//
// Le contenu d'un article est un document ProseMirror (l'arbre produit par
// TipTap), stocké en `jsonb`. Tout ce qui s'en déduit — sommaire, nombre de
// mots, temps de lecture — se calcule ici, en parcourant l'arbre. Rien de tout
// cela n'est stocké en base : une valeur dénormalisée dériverait dès la
// première réédition faite ailleurs que par l'éditeur.
//
// Utilisable côté serveur comme côté client (module sans effet de bord).

export type ProseMark = { type: string; attrs?: Record<string, unknown> | null };

export type ProseNode = {
  type: string;
  attrs?: Record<string, unknown> | null;
  content?: ProseNode[];
  marks?: ProseMark[] | null;
  text?: string;
};

export type ProseDoc = { type: string; content?: ProseNode[] };

export const EMPTY_DOC: ProseDoc = { type: 'doc', content: [] };

// Vitesse de lecture retenue pour le temps affiché. 200 mots/minute est la
// fourchette basse des mesures usuelles (200–250) : mieux vaut annoncer un peu
// large que promettre 4 minutes pour une lecture qui en prend 7.
const WORDS_PER_MINUTE = 200;

// `content` vient d'une colonne `jsonb` : on ne peut pas présumer de sa forme.
// Toute valeur inattendue est ramenée à un document vide plutôt que de faire
// tomber le rendu d'une page publique.
export function asDoc(value: unknown): ProseDoc {
  if (!value || typeof value !== 'object') return EMPTY_DOC;
  const doc = value as ProseDoc;
  if (doc.type !== 'doc' || !Array.isArray(doc.content)) return EMPTY_DOC;
  return doc;
}

// Parcours en profondeur, dans l'ordre du document.
function walk(node: ProseNode, visit: (n: ProseNode) => void): void {
  visit(node);
  for (const child of node.content ?? []) walk(child, visit);
}

function eachNode(doc: ProseDoc, visit: (n: ProseNode) => void): void {
  for (const child of doc.content ?? []) walk(child, visit);
}

// Texte brut d'un nœud (concaténation de ses feuilles `text`).
export function nodeText(node: ProseNode): string {
  let out = '';
  walk(node, (n) => {
    if (typeof n.text === 'string') out += n.text;
  });
  return out;
}

export function docText(doc: ProseDoc): string {
  return (doc.content ?? []).map(nodeText).join(' ');
}

export function wordCount(doc: ProseDoc): number {
  const words = docText(doc).trim().split(/\s+/).filter(Boolean);
  return words.length;
}

// Temps de lecture en minutes, arrondi au supérieur. Jamais 0 : un article
// d'une phrase annonce « 1 min ».
export function readingMinutes(doc: ProseDoc): number {
  return Math.max(1, Math.ceil(wordCount(doc) / WORDS_PER_MINUTE));
}

// Slugification d'un intitulé de titre pour en faire une ancre.
export function slugifyHeading(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section'
  );
}

export type Heading = { id: string; level: number; text: string };

// Ancres des titres, calculées **en une passe** sur le document et indexées par
// identité de nœud.
//
// Deux exigences se croisent ici :
//
//  - **Stabilité entre deux rendus.** Les ancres d'un article peuvent être
//    partagées : elles ne doivent pas se déplacer d'une génération à l'autre.
//    Elles ne dépendent donc que du texte des titres et de leur ordre dans le
//    document — jamais d'un identifiant de nœud, qui change à chaque
//    réenregistrement de l'éditeur.
//
//  - **Indépendance à l'ordre de rendu.** Le sommaire et le corps ont besoin
//    des mêmes ancres. Les recalculer chacun de son côté avec un compteur
//    supposerait que React évalue les composants dans l'ordre du document, ce
//    qui n'est garanti nulle part. On indexe donc par référence de nœud : le
//    corps lit l'ancre de son titre, quel que soit le moment où il la lit.
export function buildHeadingIds(doc: ProseDoc): Map<ProseNode, string> {
  const used = new Map<string, number>();
  const ids = new Map<ProseNode, string>();

  eachNode(doc, (n) => {
    if (n.type !== 'heading') return;
    const level = Number(n.attrs?.level ?? 0);
    if (level !== 2 && level !== 3) return;
    const text = nodeText(n).trim();
    if (!text) return;

    const base = slugifyHeading(text);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    ids.set(n, seen === 0 ? base : `${base}-${seen + 1}`);
  });

  return ids;
}

// Sommaire : les H2 et H3 du corps, dans l'ordre. Rien à saisir dans le
// back-office — le sommaire est une lecture du contenu, pas un champ.
export function extractHeadings(doc: ProseDoc): Heading[] {
  const ids = buildHeadingIds(doc);
  const out: Heading[] = [];
  eachNode(doc, (n) => {
    const id = ids.get(n);
    if (!id) return;
    out.push({ id, level: Number(n.attrs?.level ?? 2), text: nodeText(n).trim() });
  });
  return out;
}

// Vrai si le document contient au moins un bloc porteur de contenu. Sert au
// contrôle bloquant à la publication (lot suivant) : un document TipTap vide
// n'est pas `content: []` mais un paragraphe vide.
export function hasContent(doc: ProseDoc): boolean {
  return (doc.content ?? []).some((n) => nodeText(n).trim().length > 0 || n.type === 'image');
}
