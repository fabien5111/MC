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
export const VERSION_INVITE_REDACTION = 'v3';

// Répartition des rôles reprise de la compétence `fiche-composant` (19/11/2026) :
// le conseil d'ÉTAPE porte tout ce qui aide à réussir cette étape (il s'affiche
// en mode Pâtisser pendant la réalisation) ; les conseils de la RECETTE restent
// généraux et ne répètent jamais un conseil d'étape ; la conservation a son
// propre champ et n'apparaît nulle part ailleurs.
const CONSIGNE: Record<CibleRedaction['champ'], string> = {
  description:
    'Description de la recette : 2 à 4 phrases qui donnent envie (textures, saveurs, occasion), sans répéter la liste des ingrédients ni le déroulé.',
  conseils:
    "Conseils et astuces de la recette : uniquement du GÉNÉRAL — organisation et ordre de travail, matériel, choix et qualité des ingrédients, erreur qui traverse toute la recette, variantes et substitutions. Ne répète AUCUN conseil d'étape, qu'il figure déjà dans la recette ci-dessous ou qu'il soit proposé dans cette réponse : un geste, un repère ou un piège propre à une étape va dans le conseil de cette étape, jamais ici. Ne parle pas de conservation (champ à part). Si rien de général n'est utile à ajouter, écris peu. Une idée par ligne, sans puces ni numéros.",
  degustation:
    "Dégustation et conservation : température et moment de dégustation, accompagnements éventuels, puis conservation — lieu et emballage, durée au réfrigérateur, congélation et décongélation seulement si elles conviennent réellement. Durées PRUDENTES et réalistes pour CETTE recette : un dessert à base de crème, d'œufs crus ou peu cuits, de crème fouettée, de chantilly ou de fruits frais se garde au réfrigérateur 24 à 48 h au plus ; ne jamais suggérer de laisser à température ambiante un dessert qui contient ce type d'appareil. Aucun conseil de réalisation ici.",
  conseil_etape:
    "Conseils de l'étape : lus par le pâtissier PENDANT qu'il réalise l'étape, donc courts et actionnables, 1 à 3 phrases. Point critique, repère de texture, de température ou de couleur, erreur à éviter, geste qui fait la différence — propres à CETTE étape, rien qui concerne une autre étape ni la recette en général.",
  avance_etape:
    "Préparation à l'avance de l'étape : indique si le résultat de cette étape peut RÉELLEMENT être préparé à l'avance, d'après la recette, et conservé avant la suite (« possible »). Si oui, une note d'une seule ligne qui décrit l'étape elle-même, pas le dessert fini : durée courte, lieu et emballage (ex. « 48 h au réfrigérateur, filmée au contact »). Si non (appareil à utiliser aussitôt : blancs montés, caramel, pâte levée en cours de pousse…) ou en cas de doute, « possible » vaut false et le texte est vide.",
};

/** Champs de conservation : traités par un modèle plus fort (cf. `REDACTION_CONSERVATION_MODEL`). */
export function estChampConservation(c: CibleRedaction): boolean {
  return c.champ === 'degustation' || c.champ === 'avance_etape';
}

/**
 * Invite complète. `cibles` : les champs demandés, dans l'ordre de l'éditeur.
 * Un champ qui contient déjà du texte est COMPLÉTÉ : la proposition ne doit
 * pas répéter ce qui y est déjà (elle viendra en dessous).
 *
 * Les champs d'ÉTAPE sont demandés avant ceux de la recette : le modèle écrit
 * ainsi les conseils généraux en sachant ce qu'il vient de dire étape par
 * étape, et évite les doublons. La route remet les propositions dans l'ordre
 * de l'éditeur (`normaliserPropositions`).
 */
export function buildRedaction(r: RecetteRedaction, cibles: CibleRedaction[]): string {
  const ordonnees = [...cibles.filter((c) => c.etape != null), ...cibles.filter((c) => c.etape == null)];
  const demandes = ordonnees.map((c) => {
    const deja = valeurActuelle(r, c);
    // Préparation à l'avance : la note de l'auteur FAIT FOI, elle n'est jamais
    // « complétée » (une phrase en plus entrait en concurrence avec la sienne).
    const complement = deja && c.champ === 'avance_etape'
      ? ` Note actuelle de l'auteur : « ${deja.slice(0, 300)} ». Elle fait foi : si l'étape s'y prête, « possible » vaut true et le texte reprend cette note telle quelle (reformulée au plus court, sans en changer la durée ni les conditions) ; ne propose jamais une autre durée.`
      : deja
      ? ` Le champ contient déjà : « ${deja.slice(0, 600)} » — propose uniquement un COMPLÉMENT, sans le répéter.`
      : '';
    const cle = c.etape == null ? `{"champ": "${c.champ}"}` : `{"champ": "${c.champ}", "etape": ${c.etape}} (ÉTAPE ${c.etape + 1})`;
    return `- ${cle} — ${CONSIGNE[c.champ]} ${LONGUEUR_MAX[c.champ]} caractères au plus.${complement}`;
  });

  return `Tu es chef pâtissier et formateur. Tu aides l'auteur d'une recette à compléter sa fiche sur un site de partage de recettes de pâtisserie en français.

RÈGLES
- Une recette éprouvée, aucune invention. Appuie-toi UNIQUEMENT sur la recette ci-dessous : ne change ni les ingrédients, ni les quantités, ni les températures, ni les temps, et ne contredis rien de ce qu'elle dit. N'invente pas d'ingrédient ou d'étape qui n'y figure pas.
- Si la recette ne permet pas d'écrire quelque chose de juste, écris moins plutôt que d'inventer.
- Chaque champ a son rôle et un contenu n'apparaît qu'à UN endroit : conseils d'étape (réalisation de l'étape), conseils de la recette (général), dégustation et conservation (conservation), description (envie de goûter). Ne répète pas d'un champ à l'autre, ni ce que la recette contient déjà.
- Style d'une fiche recette : phrases simples, à l'infinitif ou au vouvoiement, sans emoji, sans titre, sans markdown.
- Le texte sera relu par l'auteur avant d'être ajouté : propose un texte prêt à l'emploi, pas une liste d'options.
- Ce que la recette ou l'auteur a déjà écrit PRIME : une durée, une température ou une précision de conservation déjà écrite (dans la recette ou dans une note de l'auteur) n'est jamais raccourcie, rallongée ni contredite.
- Sécurité alimentaire : œufs crus, crèmes, refroidissement, chaîne du froid. Pour une durée que tu dois proposer toi-même (la recette n'en dit rien), reste prudent et, en cas de doute, choisis la plus courte.
- Les numéros d'étape ("etape") partent de 0 dans la réponse : l'étape 1 est "etape": 0.

RECETTE
${texteRecette(r)}

CHAMPS À PROPOSER
${demandes.join('\n')}

RÉPONSE
Uniquement un objet JSON, sans texte autour :
{"propositions": [{"champ": "...", "etape": 0, "texte": "...", "possible": true}]}
- Une entrée par champ demandé, avec le même "champ" (et le même "etape" pour un champ d'étape ; pas de "etape" pour un champ de la recette).
- "possible" seulement pour "avance_etape". Son "texte" est la note seule, sur une ligne, sans préambule (pas de « Possible… », pas de nom d'étape).

VÉRIFICATION AVANT DE RÉPONDRE
JSON valide ; une entrée par champ demandé ; aucun chiffre ni geste qui contredise la recette ; aucun conseil de recette qui répète un conseil d'étape ; aucune conservation hors du champ dégustation et conservation ; durées de conservation prudentes ; chaque texte dans sa limite de caractères.`;
}

/** Plafond de jetons de sortie, proportionné au nombre de champs. */
export function jetonsMax(nbCibles: number): number {
  return Math.min(4000, 300 + 220 * Math.max(1, nbCibles));
}
