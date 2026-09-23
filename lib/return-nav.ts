// Retour contextuel vers l'écran de liste d'où l'on vient (résultats de
// recherche, carnet, profil public, blog, en cuisine) — cf. « Retour
// contextuel partagé » de l'audit de navigation.
//
// Fonction pure, sur le même motif que `navKeyForPath` (lib/nav.ts) : une
// seule table plutôt qu'un test dispersé dans chaque écran de destination.
// Contrairement à `navKeyForPath`, qui rattache un écran à l'une des quatre
// destinations du chrome, celle-ci répond à une question différente : « le
// chemin donné est-il un écran de LISTE vers lequel il est utile de
// proposer un retour ? » — /fournee/[id] par exemple appartient à « En
// cuisine » pour `navKeyForPath`, mais n'est pas lui-même une liste.
//
// N'inclut PAS `/blog/[slug]` (un article n'est pas une liste) ni
// `/recette/[id]` (jamais l'origine d'un retour, seulement sa destination).

export type ReturnOrigin = { href: string; label: string };

// Prend `pathname` seul (sans recherche) : c'est `PreviousPathProvider`, seul
// appelant, qui reconstruit le lien complet avec la recherche d'origine — un
// retour vers `/recherche` doit restituer les facettes actives, pas juste la
// route nue.
export function labelForReturnPath(pathname: string): string | null {
  if (pathname === '/recherche') return 'Résultats de recherche';
  if (pathname === '/carnet') return 'Mon carnet';
  if (pathname === '/blog') return 'Le blog';
  if (pathname === '/en-cuisine') return 'En cuisine';
  const handle = /^\/u\/([^/]+)\/?$/.exec(pathname)?.[1];
  if (handle) return `@${decodeURIComponent(handle)}`;
  return null;
}

