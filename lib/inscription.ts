// Mesure de l'inscription (JEP-89) : de quoi dire, côté navigateur, qu'un compte
// vient de terminer son inscription, et par quelle méthode.
//
// Pure, sans effet de bord : utilisable côté serveur (callback, route) comme
// côté client (composants).
//
// « Terminer » = le pseudo du compte est enregistré pour la PREMIÈRE fois, ni
// plus tôt (un compte e-mail non confirmé n'est pas un inscrit), ni plus tard
// (changer de pseudo n'est pas s'inscrire). Deux chemins y mènent, et ils ne
// se voient pas de la même façon :
//   - `/api/pseudo/choisir` répond au navigateur, qui envoie l'événement
//     lui-même ;
//   - `/auth/callback` écrit le pseudo d'une inscription par e-mail côté
//     serveur, puis redirige : seul un marqueur dans l'URL peut prévenir le
//     navigateur (`avecMarqueInscription`), lu puis retiré par
//     `components/InscriptionTracker.tsx`.

export type MethodeInscription = 'email' | 'google';

/** Paramètre d'URL qui porte le marqueur, retiré dès sa lecture. */
export const PARAM_INSCRIPTION = 'inscription';

export function estMethodeInscription(valeur: unknown): valeur is MethodeInscription {
  return valeur === 'email' || valeur === 'google';
}

/**
 * Méthode d'inscription d'un compte, d'après son fournisseur d'identité
 * (`app_metadata.provider`). Un fournisseur inconnu donne `null` : pas
 * d'événement plutôt qu'un paramètre hors de la liste fermée.
 */
export function methodeInscription(provider: string | null | undefined): MethodeInscription | null {
  return estMethodeInscription(provider) ? provider : null;
}

/**
 * Ajoute le marqueur à un chemin interne, sans toucher à ses autres
 * paramètres ni à son ancre. Sans méthode, le chemin est rendu tel quel.
 * L'hôte factice n'est là que pour que `URL` sache analyser un chemin relatif :
 * il n'apparaît jamais dans le résultat.
 */
export function avecMarqueInscription(chemin: string, methode: MethodeInscription | null): string {
  if (!methode) return chemin;
  const url = new URL(chemin, 'http://interne.invalid');
  url.searchParams.set(PARAM_INSCRIPTION, methode);
  return url.pathname + url.search + url.hash;
}
