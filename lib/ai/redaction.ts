// Invite de la rédaction des textes d'une recette (JEP-414).
//
// Une seule invite pour les deux usages (un champ, ou tous les champs vides) :
// la recette est envoyée UNE fois, suivie de la liste des champs demandés.
// Les règles de prudence sur la conservation sont ici et nulle part ailleurs :
// une durée fausse peut rendre malade, contrairement à une quantité fausse.
import {
  LONGUEUR_MAX,
  texteRecette,
  valeurActuelle,
  type CibleRedaction,
  type RecetteRedaction,
} from '@/lib/redaction-ia';

/** Version de l'invite, journalisée avec chaque appel (comparaisons futures). */
export const VERSION_INVITE_REDACTION = 'v1';

const CONSIGNE: Record<CibleRedaction['champ'], string> = {
  description:
    'Description de la recette : 2 à 4 phrases qui donnent envie (textures, saveurs, occasion), sans répéter la liste des ingrédients ni le déroulé.',
  conseils:
    'Conseils et astuces de la recette : astuces de réussite concrètes, erreurs fréquentes à éviter, variantes simples. Une idée par ligne, sans puces ni numéros.',
  degustation:
    "Dégustation et conservation : température et moment de dégustation, accompagnements éventuels, puis conservation (lieu, contenant, durée). Durées PRUDENTES : un dessert à base de crème, d'œufs peu cuits, de crème fouettée, de chantilly ou de fruits frais se garde au réfrigérateur, 24 à 48 h au plus ; ne jamais suggérer de laisser à température ambiante un dessert qui contient ce type d'appareil. Mentionner la congélation seulement si elle convient réellement.",
  conseil_etape:
    "Conseils de l'étape : 1 à 3 phrases propres à CETTE étape (geste, repère visuel ou de texture, température, piège à éviter). Rien qui concerne une autre étape.",
  avance_etape:
    "Préparation à l'avance de l'étape : indique si le résultat de cette étape peut être préparé à l'avance et conservé avant la suite (« possible »). Si oui, une note d'une seule ligne : durée, lieu et mode de conservation (ex. « 48 h au réfrigérateur, filmée au contact »), durée PRUDENTE. Si non (appareil à utiliser aussitôt : blancs montés, caramel, pâte levée en cours de pousse…), « possible » vaut false et le texte est vide.",
};

/**
 * Invite complète. `cibles` : les champs demandés, dans l'ordre de l'éditeur.
 * Un champ qui contient déjà du texte est COMPLÉTÉ : la proposition ne doit
 * pas répéter ce qui y est déjà (elle viendra en dessous).
 */
export function buildRedaction(r: RecetteRedaction, cibles: CibleRedaction[]): string {
  const demandes = cibles.map((c) => {
    const deja = valeurActuelle(r, c);
    const complement = deja
      ? ` Le champ contient déjà : « ${deja.slice(0, 600)} » — propose uniquement un COMPLÉMENT, sans le répéter.`
      : '';
    const cle = c.etape == null ? `{"champ": "${c.champ}"}` : `{"champ": "${c.champ}", "etape": ${c.etape}} (ÉTAPE ${c.etape + 1})`;
    return `- ${cle} — ${CONSIGNE[c.champ]} ${LONGUEUR_MAX[c.champ]} caractères au plus.${complement}`;
  });

  return `Tu es un pâtissier expérimenté qui aide l'auteur d'une recette à compléter sa fiche sur un site de partage de recettes de pâtisserie en français.

RÈGLES
- Appuie-toi UNIQUEMENT sur la recette ci-dessous : ne change ni les ingrédients, ni les quantités, ni les températures, ni les temps. N'invente pas d'ingrédient ou d'étape qui n'y figure pas.
- Si la recette ne permet pas d'écrire quelque chose de juste, écris moins plutôt que d'inventer.
- Style d'une fiche recette : phrases simples, à l'infinitif ou au vouvoiement, sans emoji, sans titre, sans markdown.
- Le texte sera relu par l'auteur avant d'être ajouté : propose un texte prêt à l'emploi, pas une liste d'options.
- Sécurité alimentaire : reste prudent sur toute durée de conservation, en cas de doute choisis la plus courte.
- Les numéros d'étape ("etape") partent de 0 dans la réponse : l'étape 1 est "etape": 0.

RECETTE
${texteRecette(r)}

CHAMPS À PROPOSER
${demandes.join('\n')}

RÉPONSE
Uniquement un objet JSON, sans texte autour :
{"propositions": [{"champ": "...", "etape": 0, "texte": "...", "possible": true}]}
- Une entrée par champ demandé, avec le même "champ" (et le même "etape" pour un champ d'étape ; pas de "etape" pour un champ de la recette).
- "possible" seulement pour "avance_etape".`;
}

/** Plafond de jetons de sortie, proportionné au nombre de champs. */
export function jetonsMax(nbCibles: number): number {
  return Math.min(4000, 300 + 220 * Math.max(1, nbCibles));
}
