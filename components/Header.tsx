// En-tête + navigation partagés (Server Component).
//
// Quatre destinations, les mêmes que la barre basse (`lib/nav.ts`). Ce qui
// n'est pas une destination n'est pas dans la liste :
//  - **Créer** n'a plus de bouton ici — il ferait doublon avec celui d'en-tête
//    de `/carnet`, sa vraie maison (on crée une recette pour l'ajouter à son
//    carnet). Atteignable via Mon carnet, dans les deux chromes.
//  - **Compte** est un tiroir, ouvert par l'avatar (`AccountMenuButton`). Sur
//    mobile il est ouvert par la cinquième fente de la barre basse, d'où
//    l'avatar masqué ici en dessous du seuil.
//
// L'état de connexion est résolu côté serveur (session cookie) — pas de
// pré-masquage CSS ni de flash au chargement.
import Link from 'next/link';
import { getCurrentUser, getProfile, isManager, resolveAvatarUrl } from '@/lib/auth';
import { hasActiveBatches } from '@/lib/profile';
import { HeaderSearch } from '@/components/HeaderSearch';
import { AccountMenuButton } from '@/components/account/AccountMenuButton';
import { getHomeCategories } from '@/lib/taxonomy';
import { DESTINATIONS, type NavKey } from '@/lib/nav';

export async function Header({ current }: { current?: NavKey }) {
  const user = await getCurrentUser();
  const profile = user ? await getProfile(user.id) : null;
  // Accès au back-office (lien « Administration » du tiroir Compte) : admin
  // complet ou gestionnaire. `/admin` redirige lui-même un gestionnaire vers
  // son point d'entrée (il n'a pas le tableau de bord).
  const backOffice = user ? await isManager(user.id) : false;
  const avatarUrl = user ? resolveAvatarUrl(user, profile) : null;
  // Pastille d'« En cuisine » : présente dès qu'une session tourne, **sans
  // chiffre** — le compte se lit dans l'écran, pas dans le menu.
  const sessionEnCours = user ? await hasActiveBatches(user.id) : false;
  // Suggestions du panneau de recherche : les catégories promues par l'admin
  // sur l'accueil, jamais une liste codée en dur. Limitées à quatre pour que
  // le panneau reste une ligne.
  const suggestions = (await getHomeCategories())
    .slice(0, 4)
    .map((c) => ({ label: c.name, slug: c.slug }));

  return (
    <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4">
        <div className="flex items-center gap-6 xl:gap-10 min-w-0">
          <Link className="maryse-logo-font text-4xl text-primary leading-none whitespace-nowrap shrink-0" href="/">
            Je pâtisse !
          </Link>
          <nav className="hidden lg:flex gap-6 xl:gap-8 items-center whitespace-nowrap">
            {DESTINATIONS.map((d) => {
              const active = d.key === current;
              return (
                <Link
                  key={d.key}
                  href={d.href}
                  prefetch={d.key === 'carnet' || d.key === 'cuisine' ? false : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={`relative font-label-md text-label-md transition-colors ${
                    active
                      ? 'font-bold text-primary border-b-2 border-primary pb-0.5'
                      : 'text-on-surface-variant hover:text-primary'
                  }`}
                >
                  {d.label}
                  {d.key === 'cuisine' && sessionEnCours && <SessionDot />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <HeaderSearch suggestions={suggestions} />
          {user ? (
            <AccountMenuButton
              className="hidden lg:block"
              data={{
                name: profile?.full_name || user.email || 'Mon compte',
                avatarUrl,
                isManager: backOffice,
                handle: profile?.username || user.id,
              }}
            />
          ) : (
            <>
              {/* Visiteur : les quatre destinations restent visibles et sans
                  cadenas (« Mon carnet » et « En cuisine » mèneront à un écran
                  d'invitation). Seules les actions changent. */}
              <Link
                href="/connexion"
                className="hidden sm:block font-label-md text-label-md text-primary px-3 whitespace-nowrap hover:text-secondary transition-colors"
              >
                Se connecter
              </Link>
              <Link
                href="/connexion?inscription=1"
                className="font-label-md bg-primary text-on-primary px-4 py-2 rounded-pill text-sm whitespace-nowrap hover:shadow-lg transition-all active:scale-95"
              >
                Créer un compte
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// Pastille de session : disque de 9 px, halo de 2,5 px couleur de fond pour la
// détacher du libellé. Pas de chiffre — cf. commentaire en tête de fichier.
function SessionDot() {
  return (
    <span
      aria-label="Une préparation est en cours"
      role="img"
      className="absolute -top-1 -right-3 h-[9px] w-[9px] rounded-pill bg-primary ring-[2.5px] ring-surface"
    />
  );
}
