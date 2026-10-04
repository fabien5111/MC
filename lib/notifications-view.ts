// Affichage des notifications — logique PURE partagée par la cloche de l'en-tête
// et la page /notifications (aucune lecture de base, aucun import
// `next/headers` : utilisable côté serveur comme côté client).
import { CATEGORIES, CATEGORIE_INFO } from '@/lib/notification-events';

/** Entrées montrées dans la cloche ; la page /notifications porte le reste. */
export const NOTIFICATIONS_CLOCHE = 5;
/** Entrées par page sur /notifications, puis par clic sur « Charger plus ». */
export const NOTIFICATIONS_PAGE = 20;

// ── Portée : « qui est concerné ? » ───────────────────────────────────────
//
// Une notification d'administration est une notification d'une catégorie
// « back-office » du catalogue (aujourd'hui : la modération). Tout le reste —
// y compris les anciennes lignes, nées avant que `category` n'existe — concerne
// le membre. La liste est DÉDUITE du catalogue : une catégorie back-office
// ajoutée demain y entre d'elle-même, sans second endroit à tenir.
export const PORTEES = ['toutes', 'membre', 'admin'] as const;
export type Portee = (typeof PORTEES)[number];

export const LIBELLE_PORTEE: Record<Portee, string> = {
  toutes: 'Toutes',
  membre: 'Membre',
  admin: 'Administrateur',
};

export const CATEGORIES_ADMIN: string[] = CATEGORIES.filter((c) => CATEGORIE_INFO[c].backOffice);

/**
 * Portée demandée par l'adresse (`?portee=`). Le filtre n'existe que pour un
 * administrateur ou un gestionnaire : un membre ordinaire n'a aucune
 * notification d'administration à écarter, et une portée « admin » forcée à la
 * main dans l'adresse ne doit rien lui montrer de différent.
 */
export function lirePortee(brut: string | undefined, peutFiltrer: boolean): Portee {
  if (!peutFiltrer) return 'toutes';
  return (PORTEES as readonly string[]).includes(brut ?? '') ? (brut as Portee) : 'toutes';
}

export function estNotificationAdmin(category: string | null): boolean {
  return category !== null && CATEGORIES_ADMIN.includes(category);
}

/**
 * Filtre PostgREST « concerne le membre » : catégorie absente OU hors
 * catégories d'administration. Un simple `not.in` écarterait les lignes sans
 * catégorie (NULL n'est dans aucun ensemble en SQL) — d'où le `is.null`.
 */
export function filtreMembre(): string {
  return `category.is.null,category.not.in.(${CATEGORIES_ADMIN.join(',')})`;
}

// ── Pagination ───────────────────────────────────────────────────────────
/** Nombre d'entrées à montrer d'après `?n=` : jamais moins d'une page. */
export function tailleAffichee(brut: string | undefined): number {
  const n = Math.round(Number(brut));
  return Number.isFinite(n) && n > NOTIFICATIONS_PAGE ? n : NOTIFICATIONS_PAGE;
}

// ── Nouveautés ───────────────────────────────────────────────────────────
type AvecLecture = { id: number; readAt: string | null };

/**
 * Identifiants des notifications non lues qu'on n'a pas encore « consultées »
 * dans cet écran : ce sont celles qu'on affiche en gras ET qu'on marque lues.
 * `dejaVus` évite de les remarquer à chaque rendu (la resynchronisation
 * serveur les rend lues, sans que le gras doive disparaître pendant la visite).
 */
export function nouvellesAConsulter(lignes: AvecLecture[], dejaVus: ReadonlySet<number>): number[] {
  return lignes.filter((n) => !n.readAt && !dejaVus.has(n.id)).map((n) => n.id);
}

// ── Passage de la cloche à la page ──────────────────────────────────────
//
// Ouvrir la cloche marque ses entrées lues en base : la page /notifications,
// qui s'ouvre ensuite, ne peut plus les reconnaître comme nouvelles par
// `read_at`. La cloche laisse donc la liste de ce qu'elle a montré en gras dans
// le `sessionStorage` (par membre : une session « en tant que » ne doit pas
// hériter de celle de l'administrateur), que la page lit une seule fois.
// Best-effort : stockage indisponible → la page se comporte comme sans.
type Stockage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const cleNouvelles = (userId: string) => `mc_notif_nouvelles:${userId}`;

function lireIds(brut: string | null): number[] {
  try {
    const v: unknown = JSON.parse(brut ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

/** Ajoute `ids` à ce que la cloche a montré en gras (cumul, sans doublon). */
export function memoriserNouvelles(stockage: Stockage | null, userId: string, ids: number[]): void {
  if (!stockage || ids.length === 0) return;
  try {
    const cle = cleNouvelles(userId);
    const cumul = new Set([...lireIds(stockage.getItem(cle)), ...ids]);
    stockage.setItem(cle, JSON.stringify([...cumul]));
  } catch {
    /* stockage plein ou refusé : sans conséquence */
  }
}

/** Lit puis efface ce que la cloche a laissé : la page l'utilise une fois. */
export function recupererNouvelles(stockage: Stockage | null, userId: string): number[] {
  if (!stockage) return [];
  try {
    const cle = cleNouvelles(userId);
    const ids = lireIds(stockage.getItem(cle));
    stockage.removeItem(cle);
    return ids;
  } catch {
    return [];
  }
}

/** `sessionStorage` si le navigateur l'autorise (l'accès seul peut lever). */
export function stockageSession(): Stockage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

// ── Dates ────────────────────────────────────────────────────────────────
export function relatif(dateIso: string, maintenant: number = Date.now()): string {
  const jours = Math.floor((maintenant - new Date(dateIso).getTime()) / 86_400_000);
  if (jours <= 0) return "Aujourd'hui";
  if (jours === 1) return 'Hier';
  return `Il y a ${jours} jours`;
}
