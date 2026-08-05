import type { Metadata } from 'next';
import { requireUser, getProfile, isAdmin } from '@/lib/auth';
import { getUserRecipes } from '@/lib/recipes';
import { getFavorites, getPlanning, getShoppingLists } from '@/lib/profile';
import { getFavoriteIds } from '@/lib/favorites';
import { getActiveExecutions, getActiveExecutionStepsForUser } from '@/lib/executions';
import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileTabs } from '@/components/profile/ProfileTabs';

export const metadata: Metadata = { title: 'Mon Profil | Maryse Club' };
// Jamais de cache (edge/CDN inclus) : le carnet doit toujours refléter les
// dernières recettes/favoris/planning de l'utilisateur, sans dépendre du seul
// appel implicite à cookies() pour désactiver la mise en cache.
export const dynamic = 'force-dynamic';

type SearchParams = { searchParams: Promise<{ impersonation?: string }> };

export default async function ProfilPage({ searchParams }: SearchParams) {
  const user = await requireUser('/profil');
  // Motif de redirection depuis une page d'écriture (cf. requireWritableSession).
  const { impersonation } = await searchParams;
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const fallbackName = meta.full_name || meta.name || user.email || '';
  const fallbackAvatar = meta.avatar_url || meta.picture || null;

  // Profil applicatif ; créé au vol s'il n'existe pas encore (1re connexion).
  // `email` et `provider` sont recopiés depuis la session : sans eux, le membre
  // s'affiche sans adresse dans Admin → Membres et la connexion « en tant que »
  // n'a plus d'adresse à qui adresser son lien temporaire.
  let profile = await getProfile(user.id);
  if (!profile) {
    const supabase = await createClient();
    await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fallbackName,
      email: user.email ?? null,
      provider: user.app_metadata?.provider ?? null,
    });
    profile = await getProfile(user.id);
  }

  const [recipes, favorites, planning, activeSessions, runningExecSteps, shoppingLists, admin, favIds] = await Promise.all([
    getUserRecipes(user.id),
    getFavorites(user.id),
    getPlanning(user.id),
    getActiveExecutions(user.id),
    getActiveExecutionStepsForUser(user.id),
    getShoppingLists(user.id),
    isAdmin(user.id),
    getFavoriteIds(),
  ]);

  return (
    <>
      <Header current="/profil" />
      <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop mb-24">
        {impersonation === 'lecture-seule' && (
          <p className="mt-6 flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[20px]" aria-hidden>
              visibility
            </span>
            Cette page n&apos;est pas accessible en session de consultation (lecture seule).
          </p>
        )}
        <ProfileHeader
          userId={user.id}
          profile={profile}
          fallbackName={fallbackName}
          fallbackAvatar={fallbackAvatar}
          isAdmin={admin}
        />
        <ProfileTabs
          recipes={recipes}
          favorites={favorites}
          planning={planning}
          activeSessions={activeSessions}
          runningExecSteps={runningExecSteps}
          shoppingLists={shoppingLists}
          favIds={[...favIds]}
        />
      </main>
      <Footer />
      <MobileNav current="/profil" />
    </>
  );
}
