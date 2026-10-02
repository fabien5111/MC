// Consentement aux traceurs de mesure d'audience (JEP-128).
//
// Seul Google Analytics 4 en demande un : tout le reste du site (session,
// cookie témoin `mc_imp`, stockage local de confort) est strictement
// nécessaire, donc exempté (cf. § 10 de /confidentialite). D'où un unique
// choix binaire, pas un panneau de finalités — un réglage par catégorie
// n'aurait qu'une seule case à cocher.
//
// Le choix vit dans le stockage local du navigateur, jamais en base : il vaut
// pour un appareil, visiteur compris, et n'a pas à suivre le compte.
//
// Module appelable côté client uniquement (window/document) ; chaque accès est
// protégé, un stockage refusé (navigation privée stricte) valant « pas de
// choix » — le bandeau réapparaît, GA reste éteint.

/** Identifiant de mesure GA4 — absent : aucun traceur, donc aucun bandeau. */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';

/**
 * Site des testeurs : ses visites sont marquées `traffic_type: 'internal'`
 * (JEP-89), que le filtre de données « Trafic interne » de GA4 exclut des
 * rapports. Lu dans le navigateur plutôt que par variable d'environnement :
 * le même build sert `dev` et `www`, seul le nom d'hôte les distingue.
 */
export const GA_HOTE_INTERNE = 'dev.jepatisse.com';

const CLE = 'jp-consentement-audience';

/**
 * Durée de validité du choix, acceptation comme refus : 6 mois, durée que la
 * CNIL recommande avant de redemander (lignes directrices du 17/09/2020).
 */
const VALIDITE_MS = 182 * 24 * 60 * 60 * 1000;

/**
 * Durée de vie des cookies `_ga*` : 13 mois, plafond de la CNIL — GA pose
 * 2 ans par défaut. La conservation des données dans GA (14 mois) est un
 * autre réglage, côté console Google Analytics.
 */
export const GA_COOKIE_EXPIRES_S = 13 * 30 * 24 * 60 * 60;

/** Événement émis pour rouvrir le bandeau (« Gérer mes cookies »). */
export const EVENEMENT_OUVRIR = 'jp:gerer-cookies';
/** Événement émis à chaque choix enregistré, pour le composant qui charge GA. */
export const EVENEMENT_CHOIX = 'jp:consentement';

export type Choix = 'accepte' | 'refuse';

export function lireConsentement(): Choix | null {
  try {
    const brut = window.localStorage.getItem(CLE);
    if (!brut) return null;
    const { choix, le } = JSON.parse(brut) as { choix?: unknown; le?: unknown };
    if ((choix !== 'accepte' && choix !== 'refuse') || typeof le !== 'number') return null;
    if (Date.now() - le > VALIDITE_MS) return null;
    return choix;
  } catch {
    return null;
  }
}

export function enregistrerConsentement(choix: Choix) {
  try {
    window.localStorage.setItem(CLE, JSON.stringify({ choix, le: Date.now() }));
  } catch {
    // Stockage refusé : le choix vaut pour la page en cours seulement.
  }
  if (choix === 'refuse') retirerTraceursAudience();
  // Ré-acceptation dans la même page : `next/script` ne rejoue pas un script
  // déjà exécuté, le drapeau posé par un refus doit donc être levé ici.
  else if (GA_ID) (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = false;
  window.dispatchEvent(new CustomEvent<Choix>(EVENEMENT_CHOIX, { detail: choix }));
}

export function ouvrirGestionCookies() {
  window.dispatchEvent(new Event(EVENEMENT_OUVRIR));
}

/**
 * Retrait du consentement : coupe GA pour la page en cours (drapeau officiel
 * `ga-disable-<ID>`, le script déjà chargé ne se décharge pas) et efface ses
 * cookies. GA les pose sur le domaine le plus haut qu'il peut atteindre
 * (`.jepatisse.com` depuis `dev.jepatisse.com`) : on tente donc chaque niveau
 * du nom d'hôte, un effacement sur le mauvais domaine étant sans effet.
 */
export function retirerTraceursAudience() {
  if (GA_ID) (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true;
  const noms = document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((n) => n === '_ga' || n.startsWith('_ga_'));
  if (!noms.length) return;
  const parties = window.location.hostname.split('.');
  const domaines = [''];
  for (let i = 0; i < parties.length - 1; i++) domaines.push(`; domain=.${parties.slice(i).join('.')}`);
  for (const nom of noms) {
    for (const d of domaines) {
      document.cookie = `${nom}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
    }
  }
}
