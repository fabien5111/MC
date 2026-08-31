import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hors connexion — Je pâtisse !',
  robots: { index: false, follow: false },
};

// Page de repli du service worker (public/sw.js → app/sw.js/route.ts) quand une
// navigation échoue faute de réseau. Volontairement statique et minimale :
// c'est la seule page que le service worker met en cache, et elle ne doit
// jamais avoir besoin d'une donnée qu'il ne peut pas lui-même fournir hors
// ligne (cf. doctrine « pas de HTML dynamique en cache » dans CLAUDE.md).
export default function HorsLignePage() {
  return (
    <div className="bg-surface font-body-md text-on-surface overflow-x-hidden min-h-screen flex flex-col">
      <main className="flex-grow flex items-center justify-center px-margin-mobile py-24">
        <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
          <p className="maryse-logo-font text-5xl text-primary leading-none">Je pâtisse !</p>
          <h1 className="font-headline-md text-headline-md text-on-surface">Pas de connexion</h1>
          <p className="text-on-surface-variant">
            Cette page a besoin du réseau pour s&apos;afficher. Vérifiez votre connexion, puis
            réessayez.
          </p>
        </div>
      </main>
    </div>
  );
}
