// Logique d'ajustement d'une recette par IA (coefficient multiplicateur).
// Porté depuis api/scale-recipe.js — fonctions pures.

export const PROMPT = `Tu es un assistant de pâtisserie expert en calcul de quantités. On te donne le
rendement actuel d'une recette, ses ingrédients, et la demande d'adaptation d'un
utilisateur. Déduis le COEFFICIENT MULTIPLICATEUR unique à appliquer à TOUTES les
quantités pour satisfaire la demande.

Règles :
- Changement de nombre de portions/pièces : coefficient = cible / actuel.

- Changement de moule ou de dimensions : DISTINGUE d'abord la nature de la préparation.
  • CAS A — préparation qui REMPLIT le moule en volume (appareil, crème, mousse,
    ganache, entremets, cake, flan, gâteau…) : coefficient = rapport des VOLUMES.
    Rond/cylindre : π·(diamètre/2)²·hauteur. Carré/rectangle/cadre : L·l·h.
  • CAS B — pâte abaissée en COUCHE d'épaisseur ~constante qui FONCE/TAPISSE le
    moule (fond de tarte, pâte à foncer, pâte brisée/sablée/sucrée abaissée,
    biscuit à chemiser) : l'épaisseur est fixe, donc la quantité est proportionnelle
    à la SURFACE de pâte abaissée, MARGE DE FONÇAGE INCLUSE. Pour foncer un moule on
    abaisse une pièce plus grande que le moule : on AJOUTE 2×hauteur à chaque
    dimension au sol (le disque de pâte a un diamètre = diamètre du moule + 2×hauteur).
    Rond : surface = π·((diamètre + 2·hauteur)/2)². Rectangle : (L+2h)·(l+2h).
    Multiplie par le nombre de pièces de chaque configuration, puis
    coefficient = surface totale cible / surface totale de départ.
  Choisis A ou B d'après le TITRE et les INGRÉDIENTS : une pâte à tarte / à foncer
  relève de B ; un appareil qui remplit le moule relève de A. En cas de doute pour
  une pâte de fonçage, prends B.
  Ce choix, ET la formule appliquée une fois qu'il est fait, ne dépendent JAMAIS
  du vocabulaire du rendement ou du complément d'informations (ex. « pour un fond
  de tarte de 26 cm », « pour 6 tartelettes ») : ce texte décrit un CONTENANT ou un
  USAGE, pas la nature de la préparation. Une crème ou un appareil dont le
  rendement est exprimé avec ce vocabulaire reste un CAS A — rapport des VOLUMES,
  SANS marge de fonçage — même si les mots « fond de tarte » ou « tartelette »
  y apparaissent. La marge de fonçage (+2×hauteur) est réservée à une préparation
  qui est elle-même une pâte abaissée (cas B).
  Si une hauteur manque, suppose la même qu'à l'origine.
  MAIS si une table « Moules de référence » est fournie et que le moule de départ
  ET le moule cible y figurent (ou correspondent clairement), utilise plutôt le
  rapport des NOMBRES DE PERSONNES : cible / départ.

- « J'ai seulement X d'un ingrédient » : coefficient = X / quantité actuelle de cet ingrédient.
- Complément d'informations sur les quantités (ex. moule rempli aux 3/4, marge de
  fonçage particulière, quantité pour 6 à 8 personnes...). Les ajustements de
  recette via l'IA prendront en compte ces éléments.
- Le coefficient doit être strictement positif ; arrondis-le à 2 décimales.
- Si la demande est ambiguë, impossible ou sans rapport avec un redimensionnement,
  renvoie coefficient null et explique brièvement pourquoi.

Rendement ajusté — une fois le coefficient trouvé, réécris le « Rendement actuel » et
le « Complément d'informations sur les quantités » tels qu'ils seraient pour la
recette multipliée par ce coefficient, afin que l'utilisateur sache ce qu'il va
produire (taille du moule à prévoir, nombre de pièces, de personnes, poids…) :
- Garde la MÊME formulation que l'original ; ne change que les éléments chiffrés.
- Nombre de pièces, de personnes, de parts, poids, volume : multiplie par le
  coefficient (arrondis à une valeur parlante, ex. « environ 12 personnes »).
- Dimension d'un moule ou d'un cadre REMPLI (cas A) dont la hauteur ne change pas :
  la surface au sol suit le coefficient, donc chaque dimension linéaire (diamètre,
  côté) est multipliée par √coefficient — JAMAIS par le coefficient lui-même. Arrondis
  à la taille du commerce la plus proche (cercles et moules ronds : de 2 en 2 cm),
  et donne la valeur calculée entre parenthèses (ex. « 22 à 24 cm de diamètre
  (≈ 22,6 cm) »). Si la demande impose elle-même un moule ou un nombre de moules,
  reprends-le tel quel.
- Pâte abaissée (cas B) : la dimension du moule cible est celle de la demande ; à
  défaut, applique la même règle de √coefficient sur le moule.
- Si l'arrondi à une taille du commerce change sensiblement l'épaisseur obtenue,
  ajoute-le en quelques mots (ex. « un peu plus épais en 22 cm »).
- PLUSIEURS PROPOSITIONS quand le rendement associe un nombre de pièces ET une
  dimension de moule (ex. « 1 brownie de 16 cm de diamètre ») : il y a alors
  plusieurs façons d'atteindre la quantité, donne-les dans "propositions", de la
  plus naturelle à la moins naturelle :
  1. même nombre de pièces, moule agrandi (règle √coefficient ci-dessus) —
     ex. « 1 brownie de 22 à 24 cm de diamètre (≈ 22,6 cm) » ;
  2. même moule, nombre de pièces × coefficient — SEULEMENT si le résultat est un
     entier ou très proche (ex. « 2 brownies de 16 cm de diamètre ») ;
  3. facultatif, une autre combinaison réaliste (ex. un cadre carré équivalent,
     ou 2 moules plus petits), seulement si elle apporte vraiment quelque chose.
  Si la demande impose un moule ou un nombre de moules, UNE seule proposition qui
  le reprend. Sans dimension de moule dans le rendement, UNE seule proposition.
  Au plus 3 propositions ; le complément est commun à toutes.
- N'invente RIEN : une partie absente de l'original, ou qui ne contient aucun
  élément chiffré à adapter, vaut null (propositions : liste vide). Si le
  coefficient est null, tout vaut null.

Calcule d'abord, dans le champ "calcul", les surfaces ou volumes chiffrés de départ
et cible ET leur rapport ; déduis-en SEULEMENT ENSUITE le coefficient.
Réponds UNIQUEMENT par un objet JSON valide, sans texte ni balises autour :
{"calcul": "<surfaces/volumes chiffrés de départ et cible + le rapport, en une ligne>", "coefficient": <nombre ou null>, "explication": "<une phrase claire en français pour l'utilisateur, mentionnant la méthode employée>", "rendement_ajuste": {"propositions": ["<rendement actuel réécrit, une entrée par proposition>"], "complement": "<complément d'informations réécrit, ou null>"}}`;

type Ingredient = { nom?: string; name?: string; quantite?: unknown; quantity?: unknown; unite?: string; unit?: string };
type Recette = { titre?: string; title?: string; rendement?: unknown; yield_notes?: string | null; ingredients?: Ingredient[] };
type MouleRef = { nom?: string; personnes?: number | null };

export function buildContenu(
  recette: Recette | undefined,
  prompt: string,
  moulesReference: MouleRef[] | undefined,
): string {
  const r = recette || {};
  const ings = Array.isArray(r.ingredients) ? r.ingredients : [];
  const liste = ings
    .slice(0, 60)
    .map((i) => `- ${i.nom || i.name}: ${i.quantite ?? i.quantity ?? ''} ${i.unite || i.unit || ''}`.trim())
    .join('\n');
  const moules = Array.isArray(moulesReference) ? moulesReference.filter((m) => m && m.personnes != null) : [];
  const moulesTxt = moules.length
    ? `\nMoules de référence (nom → personnes) :\n${moules.slice(0, 60).map((m) => `- ${m.nom} : ${m.personnes} personnes`).join('\n')}\n`
    : '';
  return `${PROMPT}

Recette : ${r.titre || r.title || 'Sans titre'}
Rendement actuel : ${r.rendement || '(non précisé)'}
Complément d'informations sur les quantités : ${r.yield_notes || '(aucun)'}
Ingrédients :
${liste || '(non fournis)'}
${moulesTxt}
Demande de l'utilisateur : "${String(prompt).slice(0, 1000)}"`;
}

// Rendement de la recette d'origine (quantité produite + complément
// d'informations) réécrit par l'IA pour le coefficient proposé : ce que
// l'utilisateur va réellement produire (taille de moule, pièces, personnes…).
// Affichage seul, jamais enregistré.
// Plusieurs `propositions` quand le rendement porte à la fois un nombre de
// pièces et une dimension de moule (moule agrandi OU moules multipliés).
export type RendementAjuste = { propositions: string[]; complement: string | null };

export type ResultatAjustement = {
  coefficient: number | null;
  explication: string;
  rendement_ajuste: RendementAjuste | null;
};

function texteCourt(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t || t.toLowerCase() === 'null') return null;
  return t.slice(0, 200);
}

function normaliseRendement(v: any): RendementAjuste | null {
  // `quantite` (texte seul) : format de la première version, encore accepté.
  const brutes: unknown[] = Array.isArray(v?.propositions) ? v.propositions : [v?.quantite];
  const propositions = [
    ...new Set(brutes.map(texteCourt).filter((t): t is string => t !== null)),
  ].slice(0, 3);
  const complement = texteCourt(v?.complement);
  return propositions.length || complement ? { propositions, complement } : null;
}

export function normaliseResultat(obj: any): ResultatAjustement {
  const explication = typeof obj?.explication === 'string' ? obj.explication.slice(0, 400) : '';
  let coefficient = obj?.coefficient;
  if (coefficient === null || coefficient === undefined) {
    return { coefficient: null, explication: explication || 'Demande trop imprécise pour en déduire un coefficient.', rendement_ajuste: null };
  }
  coefficient = parseFloat(String(coefficient).replace(',', '.'));
  if (!isFinite(coefficient) || coefficient <= 0) {
    return { coefficient: null, explication: explication || 'Coefficient non calculable pour cette demande.', rendement_ajuste: null };
  }
  return { coefficient: Math.round(coefficient * 100) / 100, explication, rendement_ajuste: normaliseRendement(obj?.rendement_ajuste) };
}
