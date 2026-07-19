// En-tête + navigation partagés (Server Component).
// Déduplique le header répété sur ~15 pages vanilla. L'état de connexion est
// résolu côté serveur (session cookie) — plus de pré-masquage CSS
// `data-auth="logged-in"` ni de flash au chargement.
import Link from 'next/link';
import { getCurrentUser, getProfile, isAdmin, resolveAvatarUrl } from '@/lib/auth';
import { SignOutButton } from '@/components/SignOutButton';

const NAV = [
  { href: '/', label: 'Accueil' },
  { href: '/profil', label: 'Mes recettes' },
  { href: '/profil#planning', label: 'Planning' },
  { href: '/profil#courses', label: 'Listes de courses' },
];

export async function Header({ current = '/' }: { current?: string }) {
  const user = await getCurrentUser();
  const profile = user ? await getProfile(user.id) : null;
  const admin = user ? await isAdmin(user.id) : false;
  const avatarUrl = user ? resolveAvatarUrl(user, profile) : null;

  return (
    <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4">
        <div className="flex items-center gap-10">
          <Link className="maryse-logo-font text-4xl text-primary leading-none" href="/">
            maryse club
          </Link>
          <nav className="hidden md:flex gap-8 items-center">
            {NAV.map((item) => {
              const active = item.href === current;
              return (
                <Link
                  key={item.href}
                  href={item.href}
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
          <button className="material-symbols-outlined text-primary hover:opacity-70 transition-opacity p-1" aria-label="Rechercher">
            search
          </button>
          {user ? (
            <>
              <Link
                href="/creer"
                className="hidden sm:flex items-center gap-1 bg-primary text-on-primary pl-3 pr-4 py-2 rounded-full font-label-md text-label-md hover:shadow-lg transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">add</span> Créer
              </Link>
              {admin && (
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
