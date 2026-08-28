import Link from 'next/link';

// Ossature commune (en-tête minimal + fond + pied de page) des écrans
// d'authentification (`/connexion`, `/mot-de-passe-oublie`,
// `/reinitialiser-mot-de-passe`) : ni l'un ni l'autre n'a de layout partagé
// (pas de `Header`/`Footer` globaux, cf. `app/layout.tsx`), donc chacun
// définissait sa propre coquille avant cette extraction.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface font-body-md text-on-surface overflow-x-hidden min-h-screen flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-md">
        <nav className="flex justify-center items-center w-full px-margin-mobile md:px-margin-desktop py-6 max-w-container-max mx-auto">
          <Link className="maryse-logo-font text-4xl text-primary leading-none" href="/">
            Je pâtisse !
          </Link>
        </nav>
      </header>

      <main className="flex-grow flex items-center justify-center relative px-margin-mobile py-24 md:py-32">
        <div className="absolute inset-0 overflow-hidden -z-10 pointer-events-none">
          <div className="glow-sphere absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full bg-secondary-container/20 blur-[120px]" />
          <div className="glow-sphere absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] rounded-full bg-tertiary-fixed/10 blur-[100px]" style={{ animationDelay: '-5s' }} />
        </div>

        <div className="w-full max-w-md flex flex-col items-center gap-6">{children}</div>
      </main>

      <footer className="mt-auto bg-surface-container-low border-t border-outline-variant">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-margin-mobile md:px-margin-desktop py-8 max-w-container-max mx-auto gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <Link className="maryse-logo-font text-3xl text-primary" href="/">
              Je pâtisse !
            </Link>
            <p className="font-body-md text-body-md text-secondary">© 2024 Maryse-Club. Tous droits réservés.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
            <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary underline transition-all" href="#">
              Conditions
            </a>
            <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary underline transition-all" href="#">
              Confidentialité
            </a>
            <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary underline transition-all" href="#">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
