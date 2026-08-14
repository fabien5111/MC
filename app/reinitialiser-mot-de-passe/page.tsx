import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { AuthShell } from '@/components/AuthShell';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';

// Atteinte depuis le lien reçu par e-mail (`/auth/callback` y échange le code
// de récupération contre une session avant de rediriger ici) : une session
// absente signifie un lien expiré, déjà utilisé, ou une arrivée directe sans
// passer par la demande — jamais un renvoi sec vers /connexion, qui ne
// dirait rien de la cause.
export default async function ReinitialiserMotDePassePage() {
  const user = await getCurrentUser();

  return (
    <AuthShell>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant p-8 md:p-12 text-center space-y-6">
          <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-primary">
            Lien invalide ou expiré
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Ce lien de réinitialisation n&apos;est plus valable. Demandez-en un nouveau.
          </p>
          <Link
            href="/mot-de-passe-oublie"
            className="inline-block text-primary font-semibold underline underline-offset-4 hover:text-secondary transition-colors"
          >
            Réinitialiser mon mot de passe
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
