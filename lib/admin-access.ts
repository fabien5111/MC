// Périmètre du back-office ouvert au rôle `gestionnaire`.
//
// Module volontairement PUR (aucun import Supabase / next/headers) : il est
// consommé aussi bien par la barre latérale, qui est un Client Component, que
// par les gardes serveur de `lib/auth.ts`.
//
// Le layout `/admin` laisse entrer admin ET gestionnaire ; chaque écran
// réservé à l'admin complet se referme ensuite lui-même avec
// `requireFullAdmin()`. Conséquence à connaître : **un nouvel écran d'admin
// est ouvert au gestionnaire tant qu'on ne l'a pas explicitement refermé.**
// La règle est donc : toute page ajoutée sous `app/admin/` appelle
// `requireFullAdmin()` en première ligne, sauf si elle figure ci-dessous.

// Point d'entrée d'un gestionnaire dans la console : il n'a pas le tableau de
// bord, `/admin` le redirige donc ici.
export const MANAGER_LANDING = '/admin/recettes';

export type AdminNavItem = {
  href: string;
  label: string;
  icon: string;
  // Écran ouvert au gestionnaire (défaut : admin complet uniquement).
  manager?: boolean;
};

// Ordre : « Tableau de bord » en tête, le reste trié alphabétiquement — pas
// de sens métier à préserver ici, contrairement à `SECTIONS` de
// admin-lists-config.ts.
export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: 'Tableau de bord', icon: 'dashboard' },
  { href: '/admin/abonnements', label: 'Abonnements', icon: 'card_membership' },
  { href: '/admin/aide', label: "Blocs d'aide", icon: 'help_center' },
  { href: '/admin/blog', label: 'Blog', icon: 'article', manager: true },
  { href: '/admin/idees', label: 'Boîte à idées', icon: 'lightbulb' },
  { href: '/admin/commentaires', label: 'Commentaires', icon: 'forum' },
  { href: '/admin/contact', label: 'Contact', icon: 'mail' },
  { href: '/admin/inconnus', label: 'Éléments inconnus', icon: 'help' },
  { href: '/admin/listes', label: 'Gestion des listes', icon: 'list_alt' },
  { href: '/admin/membres', label: 'Membres', icon: 'group' },
  { href: '/admin/photos', label: 'Photos du site', icon: 'photo_library' },
  { href: '/admin/partenaires', label: 'Publicités', icon: 'campaign' },
  { href: '/admin/recette-a-la-une', label: 'Recette à la une', icon: 'star' },
  { href: '/admin/recettes', label: 'Recettes', icon: 'menu_book', manager: true },
  { href: '/admin/test-email', label: 'Test e-mail', icon: 'forward_to_inbox' },
];
