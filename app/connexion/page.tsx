import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AuthShell } from '@/components/AuthShell';

// Destination de retour après connexion (paramètre ?next=), bornée aux
// chemins internes pour éviter une redirection ouverte.
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; inscription?: string }>;
}) {
  const { next, error, inscription } = await searchParams;
  const dest = safeNext(next);

  // Motifs d'échec renvoyés par les routes d'authentification.
  const messageErreur =
    error === 'impersonation_expiree'
      ? "Ce lien de connexion « en tant que » a expiré ou a déjà été utilisé. Générez-en un nouveau depuis l'administration."
      : error === 'impersonation'
        ? "Lien de connexion « en tant que » invalide."
        : error === 'auth'
          ? 'La connexion a échoué. Merci de réessayer.'
          : null;

  // Déjà connecté : inutile de rester sur la page de connexion.
  if (await getCurrentUser()) redirect(dest);

  return (
    <AuthShell>
      {messageErreur && (
        <p className="w-full rounded-lg border border-error/40 bg-error-container px-4 py-3 text-sm text-on-error-container text-center">
          {messageErreur}
        </p>
      )}
      <LoginForm next={dest} initialMode={inscription ? 'signup' : 'signin'} />
    </AuthShell>
  );
}
