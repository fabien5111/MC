import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';

// Destination de retour après connexion (paramètre ?next=), bornée aux
// chemins internes pour éviter une redirection ouverte.
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const dest = safeNext(next);

  // Déjà connecté : inutile de rester sur la page de connexion.
  if (await getCurrentUser()) redirect(dest);

  return (
    <div className="bg-surface font-body-md text-on-surface overflow-x-hidden min-h-screen flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-md">
        <nav className="flex justify-center items-center w-full px-margin-mobile md:px-margin-desktop py-6 max-w-container-max mx-auto">
          <Link className="maryse-logo-font text-4xl text-primary leading-none" href="/">
            maryse club
          </Link>
        </nav>
      </header>

      <main className="flex-grow flex items-center justify-center relative px-margin-mobile py-24 md:py-32">
        <div className="absolute inset-0 overflow-hidden -z-10 pointer-events-none">
          <div className="glow-sphere absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full bg-secondary-container/20 blur-[120px]" />
          <div className="glow-sphere absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] rounded-full bg-tertiary-fixed/10 blur-[100px]" style={{ animationDelay: '-5s' }} />
        </div>

        <LoginForm next={dest} />
      </main>

      <footer className="mt-auto bg-surface-container-low border-t border-outline-variant">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-margin-mobile md:px-margin-desktop py-8 max-w-container-max mx-auto gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <Link className="maryse-logo-font text-3xl text-primary" href="/">
              maryse club
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
