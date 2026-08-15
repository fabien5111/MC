// Pseudo d'un membre — logique PURE (aucun accès réseau ni base), utilisée
// côté navigateur (formulaire d'inscription, écran de choix du pseudo) comme
// côté serveur (route de vérification). Motif `search-params.ts` /
// `ideas.ts` : le data-fetching vit à part, dans `lib/pseudo-data.ts`.
//
// Le pseudo remplace l'ancien « Nom complet » et alimente DEUX colonnes :
//
//   saisie « Fabien Chenu »
//     → profiles.full_name = "Fabien Chenu"   (affichage, casse et accents gardés)
//     → profiles.username  = "fabien-chenu"   (adresse du profil public /u/…)
//
// L'unicité insensible à la casse demandée au produit est portée par le
// SLUG, pas par le texte affiché : « Fabien » et « fabien » produisent tous
// deux `fabien`, le second est donc refusé par l'index unique sans qu'aucun
// code ne s'en occupe. Le même mécanisme attrape gratuitement « Élise » vs
// « Elise » et « Fabien » vs « Fabien! ».

// Longueur maximale : 20. Ce n'est pas la base qui décide, c'est la carte de
// recette — l'auteur y est affiché en `text-xs` sous un titre déjà serré
// (`RecipeCardLayout`), et au-delà d'une vingtaine de caractères le nom
// tronque sur mobile. 20 tient par ailleurs sous le plafond de 30 du slug,
// espaces convertis en tirets compris : aucun pseudo valide ne peut donc
// produire un handle tronqué (deux pseudos distincts colleraient alors sur
// la même URL).
export const PSEUDO_MAX_LENGTH = 20;
// En deçà de 3, le squattage des pseudos courts devient un jeu et 1-2
// caractères ne distinguent personne.
export const PSEUDO_MIN_LENGTH = 3;
// Plafond du slug, aligné sur `normalizeUsername` (components/profile/ProfileHeader).
export const PSEUDO_SLUG_MAX_LENGTH = 30;

// Message unique de refus (grossièreté, usurpation, nom réservé…). Volontairement
// muet sur le motif : détailler, c'est apprendre à contourner. Le motif réel
// part dans les journaux serveur.
export const PSEUDO_REFUS = 'Pseudo non autorisé';

// Lettres (accents compris), chiffres, espace, tiret, apostrophe et point.
// Tout le reste est retiré à la frappe plutôt que rejeté à l'envoi : une
// erreur de format est plus frustrante qu'une correction silencieuse (même
// parti pris que `normalizeUsername`). Ni `%` ni `_` ne passent, ce dont
// dépend la recherche d'unicité par `ilike` (lib/pseudo-data.ts).
const CARACTERES_INTERDITS = /[^\p{L}\p{N} '’.-]/gu;

// Noms qui donneraient à un membre l'apparence de l'équipe du site. Un
// « Admin » crédible est un vecteur d'arnaque plus efficace qu'une insulte.
const PSEUDOS_RESERVES = new Set([
  'admin',
  'administrateur',
  'administration',
  'moderateur',
  'moderation',
  'gestionnaire',
  'support',
  'contact',
  'equipe',
  'staff',
  'root',
  'system',
  'systeme',
  'jepatisse',
  'je-patisse',
  'maryse',
  'maryse-club',
  'maryseclub',
  'officiel',
  'official',
  'null',
  'undefined',
  'anonyme',
]);

// Premier filet, LOCAL : la modération IA (lib/ai/pseudo-moderation.ts) est
// best-effort — clé absente ou API en panne, elle laisse passer. Sans cette
// liste, une panne de l'API Anthropic ouvrirait grand la porte aux pseudos
// les plus évidents. Elle ne prétend pas être exhaustive : c'est l'IA qui
// couvre les variantes, les personnalités et la diffamation.
//
// Comparaison par MOT du slug, jamais par sous-chaîne : « con » en
// sous-chaîne refuserait « Constance », « Conchita » ou « Second ».
const MOTS_INTERDITS = new Set([
  'connard',
  'connasse',
  'conard',
  'salope',
  'salaud',
  'pute',
  'putain',
  'encule',
  'enculee',
  'enfoire',
  'batard',
  'bite',
  'couille',
  'couilles',
  'chatte',
  'nique',
  'niquer',
  'ntm',
  'pd',
  'pede',
  'tapette',
  'negre',
  'bougnoule',
  'youpin',
  'sale-arabe',
  'nazi',
  'hitler',
  'fuck',
  'fucker',
  'bitch',
  'nigger',
  'cunt',
  'porn',
  'porno',
]);

// Retire les caractères non autorisés, écrase les espaces multiples et borne
// la longueur. Conserve un éventuel espace final : l'utilisateur est peut-être
// en train de taper « Jean Dupont ».
export function nettoyerSaisiePseudo(saisie: string): string {
  return filtrerCaracteres(saisie).slice(0, PSEUDO_MAX_LENGTH);
}

// Même filtrage, SANS bornage : `suggestionDepuisNom` a besoin du nom entier
// pour pouvoir couper sur un espace plutôt qu'au milieu d'un mot.
function filtrerCaracteres(saisie: string): string {
  return saisie
    .replace(CARACTERES_INTERDITS, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s+/, '');
}

// « FABIEN » → « Fabien », « JEAN DUPONT » → « Jean Dupont ».
//
// Ne s'applique QUE si le pseudo ne contient aucune minuscule et compte au
// moins 3 lettres : « JP » ou « MC » sont des initiales légitimes, pas un cri.
// À n'appeler qu'à la sortie du champ ou à la validation, jamais à la frappe —
// corriger « FAB » en « Fab » dès la troisième lettre empêcherait de taper
// « FABIEN ».
export function normaliserCassePseudo(pseudo: string): string {
  const lettres = pseudo.match(/\p{L}/gu) ?? [];
  if (lettres.length < 3) return pseudo;
  if (lettres.some((c) => c !== c.toLocaleUpperCase('fr-FR'))) return pseudo;
  return pseudo
    .toLocaleLowerCase('fr-FR')
    .replace(/(^|[\s\-'’.])(\p{L})/gu, (_m, avant: string, lettre: string) => avant + lettre.toLocaleUpperCase('fr-FR'));
}

// Adresse du profil public (`/u/[handle]`) dérivée du pseudo : minuscules,
// sans accent, chiffres et tirets. C'est la forme sur laquelle porte
// l'unicité.
export function pseudoSlug(pseudo: string): string {
  return pseudo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marques diacritiques isolées par NFD
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, PSEUDO_SLUG_MAX_LENGTH)
    .replace(/-$/, ''); // la troncature peut laisser un tiret en fin
}

export type PseudoValide = { ok: true; pseudo: string; slug: string };
export type PseudoInvalide = { ok: false; message: string };
export type ValidationPseudo = PseudoValide | PseudoInvalide;

// Contrôles qui ne demandent ni base ni IA : format, longueur, noms réservés,
// grossièretés évidentes. Renvoie le pseudo NORMALISÉ (casse corrigée,
// espaces rognés) et son slug — c'est cette forme-là qui doit être écrite,
// jamais la saisie brute.
export function validerPseudo(saisie: string): ValidationPseudo {
  const pseudo = normaliserCassePseudo(nettoyerSaisiePseudo(saisie).trim());

  if (pseudo.length < PSEUDO_MIN_LENGTH) {
    return { ok: false, message: `Le pseudo doit contenir au moins ${PSEUDO_MIN_LENGTH} caractères.` };
  }
  if (pseudo.length > PSEUDO_MAX_LENGTH) {
    return { ok: false, message: `Le pseudo ne peut pas dépasser ${PSEUDO_MAX_LENGTH} caractères.` };
  }
  if (!/\p{L}/u.test(pseudo)) {
    return { ok: false, message: 'Le pseudo doit contenir au moins une lettre.' };
  }

  const slug = pseudoSlug(pseudo);
  // Un pseudo fait uniquement de ponctuation autorisée (« ... », « --- ») a
  // bien 3 caractères mais ne peut pas former d'adresse de profil.
  if (slug.length < PSEUDO_MIN_LENGTH) {
    return { ok: false, message: 'Ce pseudo ne permet pas de former une adresse de profil valide.' };
  }

  const mots = slug.split('-');
  if (PSEUDOS_RESERVES.has(slug) || mots.some((m) => PSEUDOS_RESERVES.has(m) || MOTS_INTERDITS.has(m))) {
    return { ok: false, message: PSEUDO_REFUS };
  }

  return { ok: true, pseudo, slug };
}

// Point de départ proposé sur `/choix-pseudo` à un membre arrivé par Google :
// son nom de profil Google, ramené aux caractères autorisés et à 20
// caractères — sans couper un mot en deux quand c'est évitable.
export function suggestionDepuisNom(nom: string): string {
  const propre = normaliserCassePseudo(filtrerCaracteres(nom).trim());
  if (propre.length <= PSEUDO_MAX_LENGTH) return propre;
  const coupe = propre.slice(0, PSEUDO_MAX_LENGTH);
  const dernierEspace = coupe.lastIndexOf(' ');
  return (dernierEspace >= PSEUDO_MIN_LENGTH ? coupe.slice(0, dernierEspace) : coupe).trim();
}

// Variante numérotée d'un pseudo déjà pris (« Fabien » → « Fabien 2 »), en
// rognant la base autant qu'il faut pour rester sous les 20 caractères.
export function variantePseudo(base: string, rang: number): string {
  const suffixe = ` ${rang}`;
  const place = PSEUDO_MAX_LENGTH - suffixe.length;
  return `${base.slice(0, place).trim()}${suffixe}`;
}
