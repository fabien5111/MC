// Helpers d'authentification côté serveur (Server Components / Route Handlers).
// Remplacent requireAuth / requireAdmin / getUser du db.js vanilla, avec une
// vérification réellement côté serveur (la session vit dans les cookies).
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MANAGER_LANDING } from '@/lib/admin-access';
import type { Database } from '@/lib/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

// Ce que le site utilise réellement d'un utilisateur connecté : son id, son
// e-mail, et les métadonnées du compte (photo Google — cf. resolveAvatarUrl).
// Volontairement plus étroit que le `User` de supabase-js : ces trois champs
// sont présents dans le JWT, donc lisibles sans interroger le serveur
// d'authentification.
export type SessionUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
  /** `provider` sert à tracer l'origine du compte (`profiles.provider`). */
  app_metadata: Record<string, unknown>;
};

// Utilisateur courant, ou null. Ne redirige pas.
//
// **Lecture des claims du JWT, vérifiés localement** (`getClaims()`), et non
// plus `getUser()`. Mesure du 25/08/2026 : un seul `getUser()` déclenchait
// onze instructions SQL côté GoTrue (BEGIN, quatre SET, les lectures de
// `sessions`, `users`, `identities`, `mfa_factors`, `mfa_amr_claims`, COMMIT).
// À un appel par rendu de page, l'authentification pesait ~65 % de tout le
// trafic base restant une fois les référentiels mis en cache.
//
// Ce que ça change, et qu'il faut connaître : une session **révoquée**
// (déconnexion sur un autre appareil, compte supprimé, mot de passe changé)
// reste acceptée jusqu'à l'expiration de son jeton d'accès. La fenêtre vaut
// donc exactement le TTL configuré dans Supabase (Authentication → Sessions).
// Là où cette fenêtre est inacceptable — le back-office —, `getVerifiedUser()`
// ci-dessous interroge le serveur d'authentification pour de bon.
//
// Mémoïsé par requête (React cache) : Header, MobileNav et la page partagent
// un seul appel.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    user_metadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
    app_metadata: (claims.app_metadata ?? {}) as Record<string, unknown>,
  };
});

// Lecture brute du serveur d'authentification, mémoïsée par requête. Les deux
// accesseurs ci-dessous en dérivent : chacun avec son propre `cache()`, ils
// auraient produit deux `getUser()` pour la même session — exactement le
// doublon que la déduplication du profil a supprimé (cf. `getProfile`).
const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

// Vérification **forte** : interroge le serveur d'authentification, et voit
// donc une session révoquée immédiatement, sans attendre l'expiration du
// jeton. Coûteux (cf. `getCurrentUser`) — à réserver aux chemins où la
// révocation immédiate compte, c'est-à-dire le back-office.
export const getVerifiedUser = cache(async (): Promise<SessionUser | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    user_metadata: (user.user_metadata ?? {}) as Record<string, unknown>,
    app_metadata: (user.app_metadata ?? {}) as Record<string, unknown>,
  };
});

// Fournisseurs d'identité liés au compte (Google, e-mail…). **Absents du
// JWT** : les obtenir impose un vrai `getUser()`, avec le coût décrit
// ci-dessus. Un seul écran en a besoin (`/reglages`, pour savoir si le compte
// porte un mot de passe) — ne pas l'appeler ailleurs.
//
// `null` = information indisponible, à distinguer d'une liste vide : l'appelant
// doit alors retomber sur son hypothèse par défaut plutôt que d'affirmer
// l'absence de mot de passe.
export const getUserIdentities = cache(async (): Promise<{ provider: string }[] | null> => {
  const user = await getAuthUser();
  return user?.identities?.map((i) => ({ provider: i.provider })) ?? null;
});

// Fournisseur d'origine du compte (`google`, `email`…), tel qu'il est tracé
// dans `profiles.provider`. Passe par un helper plutôt que par un accès direct
// à `app_metadata` : les métadonnées du JWT ne sont pas typées, et deux sites
// d'appel faisaient chacun leur propre cast.
export function accountProvider(user: SessionUser): string | null {
  const p = user.app_metadata.provider;
  return typeof p === 'string' ? p : null;
}

// Exige une session ; redirige vers /connexion sinon.
//
// Exige AUSSI un pseudo choisi. La marque en est `profiles.username` (le slug
// n'est écrit que par les chemins qui ont validé le pseudo : unicité + IA),
// et non `full_name`, que le trigger `handle_new_user` remplit tout seul avec
// le nom du compte Google — un nom que son porteur n'a jamais choisi
// d'afficher publiquement à côté de ses recettes.
//
// La garde est ici, et pas dans le middleware, pour ne pas ajouter une
// requête base à chaque requête HTTP du site : toutes les pages privées
// passent par `requireUser`, et `getProfile` est mémoïsé par requête (React
// cache), donc les pages qui lisent déjà le profil ne paient rien.
//
// `/choix-pseudo` n'appelle délibérément pas cette fonction : ce serait une
// boucle de redirection.
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/connexion${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  }
  const profile = await getProfile(user.id);
  if (!profile?.username) {
    redirect(`/choix-pseudo${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  }
  return user;
}

// Colonnes du profil, énumérées plutôt que `select('*')`.
//
// La liste couvre exactement le type `Row` — le comportement est donc
// identique à celui de `select('*')`. Ce qu'on gagne est ailleurs : `profiles`
// porte trois colonnes d'image en data-URL (`avatar_url`, `banner_url`,
// `cover_url`) et cette ligne est lue à chaque rendu de page par le `Header`.
// Avec `select('*')`, toute colonne lourde ajoutée à la table rejoindrait
// silencieusement le payload de tout le site ; ici il faut l'écrire.
const PROFILE_COLUMN_LIST = [
  'id', 'email', 'full_name', 'username',
  'avatar_url', 'banner_url', 'cover_url', 'bio', 'notes',
  'role', 'plan', 'status', 'provider', 'is_admin', 'is_demo', 'impersonation_access',
  'followers_count', 'following_count', 'created_at',
  'website', 'website_url', 'instagram', 'instagram_url',
  'facebook_url', 'youtube_url', 'tiktok_url', 'pinterest_url',
  'notify_email',
] as const satisfies readonly (keyof Profile)[];

// `satisfies` ci-dessus attrape une colonne **inexistante** (faute de frappe) ;
// ce type-ci attrape une colonne **oubliée**. Les deux comptent, et la seconde
// est la plus vicieuse : `select()` est une chaîne, donc un nom erroné ne
// produit aucune erreur de compilation — seulement une erreur PostgREST au
// runtime, un profil `null`, et un membre renvoyé sur /choix-pseudo alors qu'il
// a déjà un pseudo.
//
// Conséquence voulue : ajouter une colonne à `profiles` puis régénérer les
// types (`npm run gen:types`) casse la compilation ici tant qu'on n'a pas
// tranché si elle a sa place dans une ligne lue à chaque rendu de page.
type ColonnesProfilManquantes = Exclude<keyof Profile, (typeof PROFILE_COLUMN_LIST)[number]>;

const PROFILE_COLUMNS: [ColonnesProfilManquantes] extends [never] ? string : never =
  PROFILE_COLUMN_LIST.join(', ');

// Profil applicatif (table profiles) de l'utilisateur donné.
//
// **Accesseur unique du profil.** Mémoïsé par requête (React cache) : le
// Header, la barre mobile et la page appelante partagent un seul appel. Ne pas
// rajouter de lecture directe de `profiles` ailleurs — c'est ce qui avait
// produit deux requêtes pour la même ligne à chaque rendu (5 572 appels
// `select role` + 4 306 `select *` au relevé du 25/08/2026).
export const getProfile = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  return (data as Profile | null) ?? null;
});

// Rôles applicatifs, portés par `profiles.role` (colonne texte de la base
// live — pas d'enum PostgreSQL, comme `recipes.status`) :
//
// - `admin`        — accès complet : tout le back-office, plus les privilèges
//                    d'édition disséminés dans le site (publication directe
//                    d'une recette, création de référentiels depuis l'éditeur,
//                    « connexion en tant que »…).
// - `gestionnaire` — back-office restreint : modération des recettes et
//                    rédaction du blog. Ni membres, ni référentiels, ni
//                    paramètres du site, ni impersonation.
// - toute autre valeur (`member`, null…) — membre ordinaire.
//
// Une valeur inconnue est traitée comme la plus restrictive.
export type AppRole = 'admin' | 'gestionnaire' | 'membre';

// Rôle de l'utilisateur donné.
//
// **Dérivé de `getProfile`, plus jamais lu par une requête à part.** Les deux
// visaient la même ligne : l'une ne prenait que `role`, l'autre tout le reste,
// et chacune portait son propre `cache()` — elles ne se dédupliquaient donc
// jamais entre elles. `Header` appelait précisément les deux
// (`getProfile` pour l'avatar, `isManager` pour le lien back-office), ce qui
// reproduisait le doublon sur chaque page du site.
//
// Une valeur inconnue est traitée comme la plus restrictive.
export const getRole = cache(async (userId: string): Promise<AppRole> => {
  const profile = await getProfile(userId);
  if (profile?.role === 'admin') return 'admin';
  if (profile?.role === 'gestionnaire') return 'gestionnaire';
  return 'membre';
});

// Session du back-office : les mêmes exigences que `requireUser()`, plus une
// vérification forte auprès du serveur d'authentification. C'est le seul
// endroit du site où la fenêtre de révocation de `getClaims()` (cf.
// `getCurrentUser`) est jugée inacceptable : un accès administrateur retiré
// doit prendre effet tout de suite, pas à l'expiration d'un jeton.
async function requireBackOfficeUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await getVerifiedUser())) redirect('/connexion');
  return user;
}

// Admin complet. Ne couvre PAS le gestionnaire : tous les appels existants
// (publication directe, création de tags/ingrédients, régie publicitaire…)
// gardent donc exactement le sens qu'ils avaient avant l'ajout du rôle.
export const isAdmin = cache(async (userId: string): Promise<boolean> => {
  return (await getRole(userId)) === 'admin';
});

// Accès au back-office : admin complet ou gestionnaire. C'est la garde du
// layout `/admin` ; le périmètre réellement ouvert au gestionnaire est
// déclaré dans `lib/admin-access.ts` et refermé page par page par
// `requireAdmin()`.
export const isManager = cache(async (userId: string): Promise<boolean> => {
  const role = await getRole(userId);
  return role === 'admin' || role === 'gestionnaire';
});

// Exige un admin ; redirige sinon. Renvoie l'utilisateur.
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireBackOfficeUser();
  if (!(await isAdmin(user.id))) redirect('/');
  return user;
}

// Exige un accès au back-office (admin ou gestionnaire) ; redirige sinon.
export async function requireManager(): Promise<SessionUser> {
  const user = await requireBackOfficeUser();
  if (!(await isManager(user.id))) redirect('/');
  return user;
}

// Garde des écrans du back-office réservés à l'admin complet. Un gestionnaire
// n'est pas renvoyé à l'accueil mais à son propre point d'entrée : il a bien
// accès à la console, simplement pas à cet écran-là.
export async function requireFullAdmin(): Promise<SessionUser> {
  const user = await requireBackOfficeUser();
  const role = await getRole(user.id);
  if (role === 'admin') return user;
  redirect(role === 'gestionnaire' ? MANAGER_LANDING : '/');
}

// Photo à afficher : photo « site » (data-URL dans profiles.avatar_url) en
// priorité, sinon photo Google des métadonnées de session. Une URL
// googleusercontent.com n'est jamais considérée comme photo « site ».
export function resolveAvatarUrl(user: SessionUser, profile: Profile | null): string | null {
  const siteAvatar = profile?.avatar_url;
  if (siteAvatar && !siteAvatar.includes('googleusercontent.com')) return siteAvatar;
  const meta = (user.user_metadata ?? {}) as { avatar_url?: string; picture?: string };
  return meta.avatar_url || meta.picture || null;
}
