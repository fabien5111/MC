// Barre de navigation basse (mobile), partagée.
//
// Cinq fentes : Accueil · Carnet · **bouton central** · En cuisine · Le blog
// (proposition D de l'ergonomie mobile, étape 2). Les quatre destinations sont
// celles du bureau (`lib/nav.ts`), dans un ordre propre à la barre basse : les
// deux plus fréquentes encadrent le bouton central, le blog passe au bord.
//
// Le **bouton central** sert à agir (`BoutonCentral`) : « Actions » sur un écran
// qui en déclare (fiche recette, fournée, /creer, relecture, projet), « Créer »
// ailleurs, « Se connecter » pour un visiteur. Le **profil** a quitté la barre :
// c'est l'avatar de l'en-tête qui ouvre le tiroir Compte (`Header.tsx`).
//
// La bascule avec l'en-tête bureau se fait à 1024 px (`lg`), le seuil unique
// du produit — c'est aussi celui du tiroir de la recherche avancée. Elle était
// à 768 px : entre les deux, un utilisateur voyait la barre basse **et**
// l'en-tête bureau complet selon les pages.
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { hasActiveBatches } from '@/lib/profile';
import { BoutonCentral } from '@/components/BoutonCentral';
import { PlanningIcon, DISC } from '@/components/PlanningIcon';
import { DESTINATIONS, type NavKey } from '@/lib/nav';

const SLOT = 'flex min-w-0 flex-col items-center justify-center';

export async function MobileNav({
  current,
  centre,
}: {
  current?: NavKey;
  // `'actions'` : l'écran déclarera des actions au bouton central (via
  // `RecipeToc`). Sert seulement au premier rendu, pour que le bouton ne
  // s'affiche pas « Créer » le temps de l'hydratation.
  centre?: 'actions';
}) {
  // Même parallélisation que `Header.tsx` : les deux composants sont rendus
  // sur chaque page. La mémoïsation par requête (`cache()` React) fait que le
  // second des deux ne paie rien.
  const user = await getCurrentUser();
  const sessionEnCours = user ? await hasActiveBatches(user.id) : false;

  const parCle = Object.fromEntries(DESTINATIONS.map((d) => [d.key, d]));
  const fente = (key: NavKey) => {
    const d = parCle[key];
    const active = d.key === current;
    return (
      <Link
        key={d.key}
        href={d.href}
        prefetch={d.key === 'carnet' || d.key === 'cuisine' ? false : undefined}
        aria-current={active ? 'page' : undefined}
        className={`${SLOT} ${active ? 'text-primary' : 'text-on-surface-variant'}`}
      >
        <span className="relative flex h-6 items-center">
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
        <span className={`nav-label mt-1 whitespace-nowrap font-label-md text-[10px] leading-tight ${active ? 'font-bold' : ''}`}>{d.shortLabel}</span>
      </Link>
    );
  };

  return (
    // Réserve d'encoche : sans elle, l'indicateur d'accueil des iPhone se pose
    // sur les libellés. La hauteur rendue qui en découle est déclarée une fois
    // dans `--mobile-nav-h` (app/globals.css) — tout ce qui se pose au-dessus
    // de cette barre s'y réfère. Le rond central déborde vers le haut sans
    // changer cette hauteur.
    <nav
      className="mobile-nav-bar lg:hidden fixed bottom-0 left-0 w-full bg-surface-container-low border-t border-outline-variant z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5 items-center py-3">
        {fente('accueil')}
        {fente('carnet')}
        <div className={SLOT}>
          <BoutonCentral connecte={!!user} indice={centre} />
        </div>
        {fente('cuisine')}
        {fente('blog')}
      </div>
    </nav>
  );
}
