// En-tête + navigation partagés (Server Component).
// Déduplique le header répété sur ~15 pages vanilla. L'état de connexion est
// résolu côté serveur (session cookie) — plus de pré-masquage CSS
// `data-auth="logged-in"` ni de flash au chargement.
import Link from 'next/link';
import { getCurrentUser, getProfile, isManager, resolveAvatarUrl } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { SignOutButton } from '@/components/SignOutButton';
import { HeaderSearch } from '@/components/HeaderSearch';
import { getHomeCategories } from '@/lib/taxonomy';

const NAV = [
  { href: '/', label: 'Accueil' },
  { href: '/blog', label: 'Le blog' },
  { href: '/profil', label: 'Mes recettes' },
  { href: '/profil#planning', label: 'Planning' },
  { href: '/profil#courses', label: 'Listes de courses' },
];

export async function Header({ current = '/' }: { current?: string }) {
  const user = await getCurrentUser();
  const profile = user ? await getProfile(user.id) : null;
  // Accès au back-office : admin complet ou gestionnaire. `/admin` redirige
  // un gestionnaire vers son point d'entrée (il n'a pas le tableau de bord).
  const backOffice = user ? await isManager(user.id) : false;
  const avatarUrl = user ? resolveAvatarUrl(user, profile) : null;
  // Impersonation en lecture seule : les entrées de création sont masquées.
  const readOnly = await isReadOnlySession();
  // Suggestions du panneau de recherche : les catégories promues par l'admin
  // sur l'accueil, jamais une liste codée en dur. Limitées à quatre pour que
  // le panneau reste une ligne.
  const suggestions = (await getHomeCategories())
    .slice(0, 4)
    .map((c) => ({ label: c.name, slug: c.slug }));

  return (
    <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4">
        <div className="flex items-center gap-10">
          <Link className="maryse-logo-font text-4xl text-primary leading-none" href="/">
            Je pâtisse !
          </Link>
          <nav className="hidden md:flex gap-8 items-center">
            {NAV.map((item) => {
              const active = item.href === current;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={item.href.startsWith('/profil') ? false : undefined}
                  className={
                    active
                      ? 'font-label-md text-label-md text-primary border-b-2 border-primary pb-0.5'
                      : 'font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <HeaderSearch suggestions={suggestions} />
          {user ? (
            <>
              {!readOnly && (
                <Link
                  href="/creer"
                  prefetch={false}
                  className="hidden sm:flex items-center gap-1 bg-primary text-on-primary pl-3 pr-4 py-2 rounded-full font-label-md text-label-md hover:shadow-lg transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span> Créer
                </Link>
              )}
              {backOffice && (
                <Link
                  href="/admin"
                  title="Administration"
                  className="material-symbols-outlined text-primary hover:opacity-70 transition-opacity p-1"
                >
                  admin_panel_settings
                </Link>
              )}
              <Link
                href="/profil"
                title="Mon profil"
                prefetch={false}
                className="w-9 h-9 rounded-full overflow-hidden border border-outline-variant block bg-surface-container"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                  <img src={avatarUrl} alt="Mon profil" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant flex items-center justify-center w-full h-full">
                    person
                  </span>
                )}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/connexion"
              className="font-label-md bg-primary text-on-primary px-4 py-2 rounded-full text-sm hover:opacity-90 transition-all active:scale-95"
            >
              Connexion
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
