import type { Metadata } from 'next';
import { requireUser, getProfile, isAdmin, getUserIdentities, accountProvider } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { PasswordChangeCard } from '@/components/profile/PasswordChangeCard';
import { FollowingCard } from '@/components/profile/FollowingCard';
import { BookSharesCard } from '@/components/profile/BookSharesCard';
import { RecipeSharesCard } from '@/components/profile/RecipeSharesCard';
import { NotificationsPreferenceCard } from '@/components/profile/NotificationsPreferenceCard';
import { getFollowCounts, getFollowing } from '@/lib/follows';
import { getBookSharesGiven, getRecipeSharesGiven } from '@/lib/shares-data';
import { getNotifyEmailPreference } from '@/lib/notifications-data';

export const metadata: Metadata = { title: 'Réglages du compte | Je pâtisse !' };
export const dynamic = 'force-dynamic';

type SearchParams = { searchParams: Promise<{ impersonation?: string }> };

// Ce qui reste de l'ancien `/profil` une fois son contenu parti dans ses vraies
// maisons : les recettes et les favoris au carnet, le planning, les sessions et
// les courses en cuisine. Ce qui demeure ici est vraiment du réglage — avatar,
// bannière, biographie, liens.
//
// Ce n'est **pas** le profil public : celui-ci est la vitrine (ce qu'on montre
// aux autres), celui-là l'atelier (ce qu'on règle pour soi). Deux métiers
// différents, donc deux écrans — le profil public arrivera avec les
// abonnements, dont il est le prérequis.
export default async function ReglagesPage({ searchParams }: SearchParams) {
  const user = await requireUser('/reglages');
  // Motif de redirection depuis une page d'écriture (cf. requireWritableSession).
  const { impersonation } = await searchParams;
  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
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
      provider: accountProvider(user),
    });
    profile = await getProfile(user.id);
  }

  const admin = await isAdmin(user.id);
  // Un compte lié à Google n'a pas forcément de mot de passe — présent
  // uniquement si une identité e-mail existe (inscription directe, ou compte
  // Google ayant ensuite lié un mot de passe).
  // `identities` n'est pas dans le JWT : cet appel-ci interroge réellement le
  // serveur d'authentification (cf. lib/auth.ts `getUserIdentities`). C'est
  // assumé pour cet écran, qui est rare — ne pas le reproduire ailleurs.
  const identities = await getUserIdentities();
  const hasPassword = identities ? identities.some((i) => i.provider === 'email') : true;

  const [followCounts, following, bookSharesGiven, recipeSharesGiven, notifyEmail] = await Promise.all([
    getFollowCounts(user.id),
    getFollowing(user.id),
    getBookSharesGiven(user.id),
    getRecipeSharesGiven(user.id),
    getNotifyEmailPreference(user.id),
  ]);

  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[1200px] px-margin-mobile md:px-margin-desktop">
        {impersonation === 'lecture-seule' && (
          <p className="mt-6 flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[20px]" aria-hidden>
              visibility
            </span>
            Cette page n&apos;est pas accessible en session de consultation (lecture seule).
          </p>
        )}
        <div className="pb-2 pt-12">
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">Mon compte</p>
          <h1 className="font-headline-lg text-[30px] leading-tight text-primary md:text-[42px]">
            Réglages du compte
          </h1>
        </div>
        <ProfileHeader
          userId={user.id}
          profile={profile}
          fallbackName={fallbackName}
          fallbackAvatar={fallbackAvatar}
          isAdmin={admin}
          followCounts={followCounts}
        />
        {user.email && <PasswordChangeCard email={user.email} hasPassword={hasPassword} />}
        <FollowingCard userId={user.id} following={following} />
        <BookSharesCard ownerId={user.id} given={bookSharesGiven} />
        <RecipeSharesCard ownerId={user.id} given={recipeSharesGiven} />
        <NotificationsPreferenceCard userId={user.id} notifyEmail={notifyEmail} />
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
