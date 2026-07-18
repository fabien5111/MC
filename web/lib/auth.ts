// Helpers d'authentification côté serveur (Server Components / Route Handlers).
// Remplacent requireAuth / requireAdmin / getUser du db.js vanilla, avec une
// vérification réellement côté serveur (la session vit dans les cookies).
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
type User = NonNullable<
  Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>['auth']['getUser']>>['data']['user']
>;

// Utilisateur courant, ou null. Ne redirige pas.
// Mémoïsé par requête (React cache) : Header, MobileNav et la page partagent
// un seul appel getUser au lieu d'en refaire un chacun.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

// Exige une session ; redirige vers /connexion sinon.
export async function requireUser(next?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/connexion${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  }
  return user;
}

// Profil applicatif (table profiles) de l'utilisateur donné.
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data ?? null;
}

// Admin = profiles.role === 'admin' (la base live utilise `role`).
export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'admin';
}

// Exige un admin ; redirige sinon. Renvoie l'utilisateur.
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) redirect('/');
  return user;
}

// Photo à afficher : photo « site » (data-URL dans profiles.avatar_url) en
// priorité, sinon photo Google des métadonnées de session. Une URL
// googleusercontent.com n'est jamais considérée comme photo « site ».
export function resolveAvatarUrl(user: User, profile: Profile | null): string | null {
  const siteAvatar = profile?.avatar_url;
  if (siteAvatar && !siteAvatar.includes('googleusercontent.com')) return siteAvatar;
  const meta = (user.user_metadata ?? {}) as { avatar_url?: string; picture?: string };
  return meta.avatar_url || meta.picture || null;
}
