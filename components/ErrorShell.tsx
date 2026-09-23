import Link from 'next/link';
import { DESTINATIONS } from '@/lib/nav';

// Ossature des deux écrans d'impasse du site — `app/not-found.tsx` (404) et
// `app/error.tsx` (erreur de rendu). Extraite pour qu'ils soient
// rigoureusement identiques : ce sont les deux seuls écrans où l'utilisateur
// arrive sans l'avoir voulu, et où la sortie EST tout le contenu utile. Avant
// elle, ni l'un ni l'autre n'existait : les quatorze `notFound()` du site
// servaient la page nue de Next (« 404 | This page could not be found »), sans
// en-tête, sans barre basse et sans un seul lien — le cul-de-sac le plus dur
// du produit, atteignable par une URL mal tapée, un marque-page périmé ou une
// recette supprimée.
//
// **Chrome statique, et non `Header`/`Footer`/`MobileNav`** — trois raisons,
// dont deux sont des contraintes, pas des préférences :
//  - `app/error.tsx` est forcément un Client Component (contrat de Next) : il
//    ne peut pas rendre les composants serveur qui lisent la session ;
//  - `app/not-found.tsx` est pré-rendu au build pour les URL sans route — y
//    lire les cookies ferait échouer la construction ;
//  - une page d'erreur n'a aucune raison de payer les lectures de session que
//    coûte le chrome complet, sur un rendu qui n'aboutira à rien.
// Conséquence assumée : ni avatar, ni loupe, ni pastille « en cuisine ». Les
// quatre destinations, elles, viennent de `lib/nav.ts` comme les deux chromes
// ordinaires — c'est la table qui décide, jamais une liste recopiée ici, sans
// quoi cet écran aurait un jour une entrée que le reste du site n'a pas.
export function ErrorShell({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  // Sortie propre à l'écran, posée au-dessus des destinations : le
  // « Réessayer » de `app/error.tsx`, qui rejoue le rendu plutôt que de
  // quitter la page. Absente sur un 404, où il n'y a rien à réessayer.
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface font-body-md text-on-surface overflow-x-hidden min-h-screen flex flex-col">
      <header className="w-full">
        <nav className="flex justify-center items-center w-full px-margin-mobile md:px-margin-desktop py-6 max-w-container-max mx-auto">
          <Link className="maryse-logo-font text-4xl text-primary leading-none" href="/">
            Je pâtisse !
          </Link>
        </nav>
      </header>

      <main className="flex-grow flex items-center justify-center px-margin-mobile py-12 md:py-20">
        <div className="w-full max-w-xl flex flex-col items-center gap-5 text-center">
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
            {eyebrow}
          </p>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary">{title}</h1>
          <div className="flex flex-col gap-3 font-body-md text-body-md text-on-surface-variant leading-relaxed">
            {children}
          </div>

          {action}

          {/* Les sorties. Les quatre destinations plus la recherche : soit
              exactement ce que porte le chrome ordinaire, moins ce qui dépend
              de la session. « Mon carnet » et « En cuisine » restent proposés
              à un visiteur, sans cadenas — même doctrine que `Header.tsx`,
              ils mèneront à l'écran de connexion. */}
          <nav className="mt-6 flex flex-wrap justify-center gap-3">
            {DESTINATIONS.map((d, i) => (
              <Link
                key={d.key}
                href={d.href}
                prefetch={false}
                className={
                  i === 0
                    ? 'font-label-md bg-primary text-on-primary px-5 py-2.5 rounded-pill text-sm whitespace-nowrap hover:shadow-lg transition-all active:scale-95'
                    : 'font-label-md border border-outline-variant text-on-surface-variant px-5 py-2.5 rounded-pill text-sm whitespace-nowrap hover:text-primary hover:border-primary transition-colors active:scale-95'
                }
              >
                {d.label}
              </Link>
            ))}
            <Link
              href="/recherche"
              prefetch={false}
              className="font-label-md border border-outline-variant text-on-surface-variant px-5 py-2.5 rounded-pill text-sm whitespace-nowrap hover:text-primary hover:border-primary transition-colors active:scale-95"
            >
              Rechercher
            </Link>
          </nav>
        </div>
      </main>
    </div>
  );
}
