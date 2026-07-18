import { redirect } from 'next/navigation';
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
    <main className="min-h-screen flex flex-col items-center justify-center px-margin-mobile py-16 bg-background">
      <p className="maryse-logo-font text-5xl text-primary mb-2">maryse club</p>
      <p className="text-on-surface-variant mb-8 text-center">
        La haute pâtisserie à la maison.
      </p>
      <LoginForm next={dest} />
    </main>
  );
}
