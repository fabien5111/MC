import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getFavoriteIds } from '@/lib/favorites';
import { getPublicProfile, getPublicProfileStats, getPublicProfileRecipes } from '@/lib/public-profile';
import { parsePublicProfileParams } from '@/lib/public-profile-params';
import { getFollowCounts, isFollowing } from '@/lib/follows';
import { activeLinks, normalizeUrl } from '@/lib/profile-links';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { RecipeCard } from '@/components/RecipeCard';
import { FollowButton } from '@/components/profile/FollowButton';
import { ShareButton } from '@/components/recipe/ShareButton';
import { ImpersonateButton } from '@/components/admin/ImpersonateButton';
import { PublicProfileToolbar } from '@/components/profile/PublicProfileToolbar';

type Params = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);
  return { title: profile ? `${profile.full_name || profile.username} | Je pâtisse !` : 'Profil introuvable' };
}

// La vitrine publique d'un pâtissier — pendant du carnet privé, mais un métier
// différent : rien de ce qui est un brouillon, un statut ou une action de
// modification n'y figure (cf. CLAUDE.md « Profil public »).
export default async function PublicProfilePage({ params, searchParams }: Params) {
  const { handle } = await params;
  const filters = parsePublicProfileParams(await searchParams);

  const profile = await getPublicProfile(handle);
  if (!profile) notFound();

  const [user, stats, recipes, favIds, followCounts] = await Promise.all([
    getCurrentUser(),
    getPublicProfileStats(profile.id),
    getPublicProfileRecipes(profile.id, filters),
    getFavoriteIds(),
    getFollowCounts(profile.id),
  ]);
  // Après le `getCurrentUser()` ci-dessus : `isFollowing` a besoin de son
  // résultat, donc hors du même `Promise.all`.
  const following = user ? await isFollowing(user.id, profile.id) : false;

  const isOwnProfile = user?.id === profile.id;
  // Bouton « Connecter en tant que » réservé à un admin regardant le profil
  // de quelqu'un d'autre — inutile de le calculer sur sa propre vitrine.
  const viewerIsAdmin = user && !isOwnProfile ? await isAdmin(user.id) : false;
  const name = profile.full_name || profile.username || 'Pâtissier';
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : null;
  const links = activeLinks(profile as never);

  return (
    <>
      <Header />
      <main className="mb-24 pb-8">
        {/* ── Bannière + identité ─────────────────────────────────────── */}
        <section className="relative">
          <div
            className="w-full overflow-hidden bg-surface-container-high"
            style={{ aspectRatio: '4 / 1', minHeight: 200, maxHeight: 320 }}
          >
            {profile.banner_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
              <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>

          <div className="mx-auto max-w-[1200px] px-margin-mobile md:px-margin-desktop">
            <div className="relative -mt-16 flex flex-col gap-6 md:-mt-14 md:flex-row md:items-end">
              <div className="h-32 w-32 shrink-0 overflow-hidden rounded-pill border-4 border-surface bg-surface-container shadow-lg md:h-36 md:w-36">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined flex h-full w-full items-center justify-center text-5xl text-on-surface-variant">
                    person
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 md:pb-3">
                <h1 className="font-headline-lg text-[30px] leading-tight text-primary md:text-[36px]">{name}</h1>
                {memberSince && <p className="mt-1 text-[13px] text-on-surface-variant">Membre depuis {memberSince}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3 md:pb-3">
                {isOwnProfile ? (
                  <Link
                    href="/reglages"
                    className="flex items-center gap-2 rounded-lg border border-primary px-6 py-3 font-label-md text-label-md text-primary transition-all hover:bg-primary hover:text-white"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span> Modifier le profil
                  </Link>
                ) : (
                  <FollowButton profileId={profile.id} currentUserId={user?.id ?? null} initialFollowing={following} />
                )}
                {viewerIsAdmin && (
                  <ImpersonateButton
                    profileId={profile.id}
                    name={name}
                    className="flex items-center gap-2 rounded-lg border border-outline-variant px-6 py-3 font-label-md text-label-md text-on-surface-variant transition-all hover:border-primary hover:text-primary disabled:opacity-50"
                  />
                )}
                <ShareButton title={name} />
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-y-6 lg:flex-row lg:items-start lg:gap-x-14">
              {profile.bio && (
                <p className="flex-1 text-[15px] leading-relaxed text-on-surface-variant" style={{ maxWidth: '68ch' }}>
                  {profile.bio}
                </p>
              )}
              <div className="flex shrink-0 gap-8">
                <Stat value={stats.recipeCount} label="Recettes" />
                <Stat value={followCounts.followers} label="Abonnés" />
                {stats.ratingAvg != null && <Stat value={stats.ratingAvg.toFixed(1)} label="Note moyenne" />}
              </div>
            </div>

            {links.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3 border-t border-outline-variant/30 pt-6">
                {links.map((l) => (
                  <a
                    key={l.field}
                    href={normalizeUrl(profile[l.field] || '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={l.label}
                    className="flex h-10 w-10 items-center justify-center rounded-pill border border-outline-variant text-secondary transition-all hover:bg-primary hover:text-white"
                  >
                    {l.svg ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                        <path d={l.svg} />
                      </svg>
                    ) : (
                      <span className="material-symbols-outlined text-[20px]">{l.icon}</span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Recettes publiées ───────────────────────────────────────── */}
        <section className="mx-auto mt-12 max-w-[1200px] px-margin-mobile md:px-margin-desktop">
          {/* Barre affichée seulement s'il y a quelque chose à trier : sur une
              vitrine encore vide, chercher et trier ne mènent nulle part. Le
              compteur vient des statistiques (jeu complet), pas de `recipes`,
              qui est déjà filtré — sinon la barre disparaîtrait sous les
              doigts dès qu'une recherche ne renvoie rien. */}
          {stats.recipeCount > 0 && <PublicProfileToolbar params={filters} />}

          {recipes.length > 0 ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {recipes.map((r) => (
                <RecipeCard key={r.id} recipe={r} isFav={favIds.has(r.id)} showPlan={!!user} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center italic text-on-surface-variant">
              {filters.q ? 'Aucune recette ne correspond à cette recherche.' : "Ce pâtissier n'a encore rien publié."}
            </p>
          )}
        </section>
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <span className="block font-headline-md text-[22px] leading-none text-primary">{value}</span>
      <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">{label}</span>
    </div>
  );
}
