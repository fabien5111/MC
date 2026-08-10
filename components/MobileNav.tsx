// Barre de navigation basse (mobile), partagée.
//
// Cinq fentes : les **quatre destinations** (les mêmes qu'au bureau, cf.
// `lib/nav.ts`) plus le **profil**, qui n'est pas une destination mais le
// déclencheur du tiroir Compte en feuille remontante.
//
// Conséquence assumée : « Créer » n'est plus ici, la barre est pleine. Il
// remonte dans l'en-tête, en bouton rond — un bouton flottant aurait heurté
// celui du sommaire des fiches recette, posé au même coin.
//
// La bascule avec l'en-tête bureau se fait à 1024 px (`lg`), le seuil unique
// du produit — c'est aussi celui du tiroir de la recherche avancée. Elle était
// à 768 px : entre les deux, un utilisateur voyait la barre basse **et**
// l'en-tête bureau complet selon les pages.
import Link from 'next/link';
import { getCurrentUser, getProfile, resolveAvatarUrl, isAdmin } from '@/lib/auth';
import { hasActiveExecutions } from '@/lib/executions';
import { AccountSheetButton } from '@/components/account/AccountSheetButton';
import { PlanningIcon, DISC } from '@/components/PlanningIcon';
import { DESTINATIONS, type NavKey } from '@/lib/nav';

const SLOT = 'flex flex-col items-center justify-center';

export async function MobileNav({ current }: { current?: NavKey }) {
  const user = await getCurrentUser();
  const profile = user ? await getProfile(user.id) : null;
  const admin = user ? await isAdmin(user.id) : false;
  const sessionEnCours = user ? await hasActiveExecutions(user.id) : false;

  return (
    // Réserve d'encoche : sans elle, l'indicateur d'accueil des iPhone se pose
    // sur les libellés. La hauteur rendue qui en découle est déclarée une fois
    // dans `--mobile-nav-h` (app/globals.css) — tout ce qui se pose au-dessus
    // de cette barre s'y réfère.
    <nav
      className="lg:hidden fixed bottom-0 left-0 w-full bg-surface-container-low border-t border-outline-variant z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5 py-3">
        {DESTINATIONS.map((d) => {
          const active = d.key === current;
          return (
            <Link
              key={d.key}
              href={d.href}
              prefetch={d.key === 'carnet' || d.key === 'cuisine' ? false : undefined}
              aria-current={active ? 'page' : undefined}
              className={`${SLOT} ${active ? 'text-primary' : 'text-on-surface-variant'}`}
            >
              <span className="relative">
                {d.icon ? (
                  <span className="material-symbols-outlined text-[23px]">{d.icon}</span>
                ) : (
                  // « En cuisine » : le picto calendrier-horloge maison. Son
                  // disque doit être opaque **et** de la couleur de la barre,
                  // sinon la grille du calendrier transparaît sous le cadran.
                  <PlanningIcon size={23} discFill={DISC.surfaceContainerLow} strokeWidth={active ? 1.7 : 1.6} />
                )}
                {d.key === 'cuisine' && sessionEnCours && (
                  <span
                    role="img"
                    aria-label="Une préparation est en cours"
                    className="absolute -top-0.5 -right-1 h-[9px] w-[9px] rounded-pill bg-primary ring-[2.5px] ring-surface-container-low"
                  />
                )}
              </span>
              <span className={`mt-1 font-label-md text-[10px] ${active ? 'font-bold' : ''}`}>{d.shortLabel}</span>
            </Link>
          );
        })}

        {user ? (
          <AccountSheetButton
            className={`${SLOT} text-on-surface-variant`}
            data={{ name: profile?.full_name || user.email || 'Mon compte', avatarUrl: resolveAvatarUrl(user, profile), isAdmin: admin }}
          />
        ) : (
          // Visiteur : la fente garde sa place plutôt que de laisser un trou
          // qui décalerait les quatre autres d'un écran à l'autre.
          <Link href="/connexion" className={`${SLOT} text-on-surface-variant`}>
            <span className="material-symbols-outlined text-[23px]">person</span>
            <span className="mt-1 font-label-md text-[10px]">Se connecter</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
