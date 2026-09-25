// Mode projet — proposition IA d'un plan de montage (JEP-254) : la quantité
// visée pour CHAQUE composant selon son rôle dans l'assemblage, quand
// personne ne peut la connaître à l'avance (« combien de crémeux pour un
// insert de tarte ? »). Fonctions pures, même doctrine que
// project-structure.ts / project-component.ts.
//
// L'IA ne calcule PAS de coefficient : elle propose une quantité en grammes
// par estimation de métier (épaisseur d'une couche, taille d'un insert selon
// le format du dessert). Le coefficient (visée ÷ poids pesé de la recette
// choisie) est calculé côté client, exactement comme pour une proposition
// individuelle (cf. ProjectQuantities `proposer` / `proposerIA`).
export type AssemblyComponentInput = { id: number; name: string; role: string | null };
export type AssemblyProposal = { id: number; targetGrams: number | null; dims: string | null; explication: string };

export function buildAssemblyContenu(
  dessert: { title: string; formatLabel: string; servings: number | null },
  composants: AssemblyComponentInput[],
  // Description libre du montage voulu (JEP-254) : « un fond en pâte sucrée
  // de 28 cm, une crème d'amande sur 8 mm… ». Quand elle est donnée, elle
  // prime sur l'estimation générique par rôle — c'est la description la plus
  // fiable de ce que le pâtissier a en tête.
  descriptionMontage: string | null = null,
): string {
  const liste = composants
    .map((c, i) => `${i + 1}. id=${c.id} — "${c.name}"${c.role ? ` (rôle : ${c.role})` : ''}`)
    .join('\n');

  const blocDescription = descriptionMontage
    ? `

Le pâtissier décrit précisément le montage voulu — base-toi PRIORITAIREMENT
sur cette description (dimensions, épaisseurs, techniques citées) pour
chaque composant qu'elle mentionne ; ne retombe sur une estimation générique
par rôle que pour ce qu'elle ne précise pas :
"""
${descriptionMontage}
"""

Une dimension peut être DÉDUITE de cette description sans être chiffrée —
cette déduction prime alors sur toute règle générique ci-dessous (retrait
d'un insert, une pièce par part…) :
- une couche décrite comme coulée/étalée « dans le fond », « sur » ou « dans »
  une autre couche du dessert (pas comme un insert à part) épouse le diamètre
  DU DESSERT, pas un diamètre réduit ;
- « sur tout le dessus », « recouvrant l'ensemble », « toute la surface »
  signifie une couverture COMPLÈTE de cette surface : calcule le poids à
  partir de la surface totale à couvrir (et de l'épaisseur ou du volume d'une
  pièce du motif décrit), jamais un compte de pièces arbitraire du type « une
  par part » sauf si le pâtissier le demande explicitement.`
    : '';

  return `Tu es pâtissier professionnel. On te donne un dessert et la liste de
ses préparations (composants), du bas vers le haut de l'assemblage. Pour
CHAQUE composant, propose la quantité de préparation qu'il faut RÉELLEMENT
pour CE dessert précis — une estimation de métier (épaisseur d'une couche,
taille d'un insert, quantité de glaçage…), pas un calcul géométrique exact.

Dessert : "${dessert.title || 'Sans titre'}"
Format : ${dessert.formatLabel}${dessert.servings ? `, ${dessert.servings} parts` : ''}

Composants, du bas vers le haut :
${liste}${blocDescription}

Réponds UNIQUEMENT par un objet JSON valide, sans texte ni balises autour :
{
  "composants": [
    {"id": <id>, "dimensions": "<dimensions retenues, ex. Ø19 cm x 1 cm>", "poids_g": <nombre entier>, "explication": "<une phrase en français, mentionnant les dimensions et pourquoi>"}
  ]
}

Règles :
- Une entrée par composant reçu, dans le même ordre, avec le même "id" (nombre,
  pas une chaîne).
- "poids_g" : un nombre réaliste en grammes, jamais 0 ni négatif. Si le rôle ne
  permet vraiment aucune estimation (ex. décor sans quantité pertinente), mets
  poids_g à null et explique pourquoi dans "explication".
- Base-toi sur le format du dessert (diamètre, hauteur, nombre de parts) pour
  dimensionner chaque couche : un fond ou un biscuit couvre tout le diamètre du
  dessert, un insert est plus petit (retrait de 2 à 4 cm de diamètre), un
  glaçage est une fine couche de quelques millimètres.
- Aucun texte, aucun commentaire hors du JSON.`;
}

function nombrePositif(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function texte(v: unknown, max: number): string | null {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return t ? t.slice(0, max) : null;
}

// Défensive comme les autres normalisations de ce module : la réponse d'un
// modèle est une donnée, pas une promesse. `knownIds` filtre tout ce qui ne
// correspond à aucun composant réellement envoyé — un id halluciné serait
// sinon silencieusement ignoré côté appelant, mais autant ne jamais le
// renvoyer.
export function normaliseAssembly(obj: unknown, knownIds: number[]): AssemblyProposal[] {
  const o = (obj ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(o.composants) ? o.composants : [];
  const ids = new Set(knownIds);
  const vus = new Set<number>();
  const out: AssemblyProposal[] = [];
  for (const item of raw) {
    const c = (item ?? {}) as Record<string, unknown>;
    const id = Number(c.id);
    if (!Number.isFinite(id) || !ids.has(id) || vus.has(id)) continue;
    vus.add(id);
    out.push({
      id,
      targetGrams: nombrePositif(c.poids_g),
      dims: texte(c.dimensions, 60),
      explication: texte(c.explication, 300) ?? '',
    });
  }
  return out;
}
