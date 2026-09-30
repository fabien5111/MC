import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Bientôt disponible — Je pâtisse !',
  robots: { index: false, follow: false },
};

export default function BientotDisponiblePage() {
  return (
    <div className="bg-surface font-body-md text-on-surface overflow-x-hidden min-h-screen flex flex-col">
      <main className="flex-grow flex items-center justify-center relative px-margin-mobile py-24">
        <div className="absolute inset-0 overflow-hidden -z-10 pointer-events-none">
          <div className="glow-sphere absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full bg-secondary-container/20 blur-[120px]" />
          <div className="glow-sphere absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] rounded-full bg-tertiary-fixed/10 blur-[100px]" />
        </div>

        <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
          <p className="maryse-logo-font text-5xl text-primary leading-none">Je pâtisse !</p>
          <h1 className="font-headline-md text-headline-md text-on-surface">
            Bientôt disponible
          </h1>
          <p className="text-on-surface-variant">
            Le site est en cours de préparation. Revenez très vite pour découvrir Je pâtisse !
          </p>
        </div>
      </main>
      {/* Pages légales, servies malgré `COMING_SOON` (cf. `PAGES_LEGALES`). */}
      <footer className="flex justify-center gap-8 px-margin-mobile py-6 text-[13px] text-on-surface-variant">
        <Link className="hover:text-primary underline underline-offset-2" href="/mentions-legales">
          Mentions légales
        </Link>
        <Link className="hover:text-primary underline underline-offset-2" href="/cgu">
          CGU
        </Link>
        <Link className="hover:text-primary underline underline-offset-2" href="/cgv">
          CGV
        </Link>
        <Link className="hover:text-primary underline underline-offset-2" href="/confidentialite">
          Confidentialité
        </Link>
      </footer>
    </div>
  );
}
