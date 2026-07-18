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
  Si une hauteur manque, suppose la même qu'à l'origine.
  MAIS si une table « Moules de référence » est fournie et que le moule de départ
  ET le moule cible y figurent (ou correspondent clairement), utilise plutôt le
  rapport des NOMBRES DE PERSONNES : cible / départ.

- « J'ai seulement X d'un ingrédient » : coefficient = X / quantité actuelle de cet ingrédient.
- Le coefficient doit être strictement positif ; arrondis-le à 2 décimales.
- Si la demande est ambiguë, impossible ou sans rapport avec un redimensionnement,
  renvoie coefficient null et explique brièvement pourquoi.

Calcule d'abord, dans le champ "calcul", les surfaces ou volumes chiffrés de départ
et cible ET leur rapport ; déduis-en SEULEMENT ENSUITE le coefficient.
Réponds UNIQUEMENT par un objet JSON valide, sans texte ni balises autour :
{"calcul": "<surfaces/volumes chiffrés de départ et cible + le rapport, en une ligne>", "coefficient": <nombre ou null>, "explication": "<une phrase claire en français pour l'utilisateur, mentionnant la méthode employée>"}`;

type Ingredient = { nom?: string; name?: string; quantite?: unknown; quantity?: unknown; unite?: string; unit?: string };
type Recette = { titre?: string; title?: string; rendement?: unknown; ingredients?: Ingredient[] };
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
Ingrédients :
${liste || '(non fournis)'}
${moulesTxt}
Demande de l'utilisateur : "${String(prompt).slice(0, 1000)}"`;
}

export function normaliseResultat(obj: any): { coefficient: number | null; explication: string } {
  const explication = typeof obj?.explication === 'string' ? obj.explication.slice(0, 400) : '';
  let coefficient = obj?.coefficient;
  if (coefficient === null || coefficient === undefined) {
    return { coefficient: null, explication: explication || 'Demande trop imprécise pour en déduire un coefficient.' };
  }
  coefficient = parseFloat(String(coefficient).replace(',', '.'));
  if (!isFinite(coefficient) || coefficient <= 0) {
    return { coefficient: null, explication: explication || 'Coefficient non calculable pour cette demande.' };
  }
  return { coefficient: Math.round(coefficient * 100) / 100, explication };
}
