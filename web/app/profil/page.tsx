import type { Metadata } from 'next';
import { requireUser, getProfile, isAdmin } from '@/lib/auth';
import { getUserRecipes } from '@/lib/recipes';
import { getFavorites, getPlanning, getShoppingLists } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileTabs, type UserRecipe } from '@/components/profile/ProfileTabs';

export const metadata: Metadata = { title: 'Mon Profil | Maryse Club' };

export default async function ProfilPage() {
  const user = await requireUser('/profil');
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const fallbackName = meta.full_name || meta.name || user.email || '';
  const fallbackAvatar = meta.avatar_url || meta.picture || null;

  // Profil applicatif ; créé au vol s'il n'existe pas encore (1re connexion).
  let profile = await getProfile(user.id);
  if (!profile) {
    const supabase = await createClient();
    await supabase.from('profiles').upsert({ id: user.id, full_name: fallbackName });
    profile = await getProfile(user.id);
  }

  const [recipes, favorites, planning, shoppingLists, admin] = await Promise.all([
    getUserRecipes(user.id),
    getFavorites(user.id),
    getPlanning(user.id),
    getShoppingLists(user.id),
    isAdmin(user.id),
  ]);

  return (
    <>
      <Header current="/profil" />
      <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop mb-24">
        <ProfileHeader
          userId={user.id}
          profile={profile}
          fallbackName={fallbackName}
          fallbackAvatar={fallbackAvatar}
          isAdmin={admin}
        />
        <ProfileTabs
          recipes={recipes as UserRecipe[]}
          favorites={favorites}
          planning={planning}
          shoppingLists={shoppingLists}
        />
      </main>
      <Footer />
      <MobileNav current="/profil" />
    </>
  );
}
