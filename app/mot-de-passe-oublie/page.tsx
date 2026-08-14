import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuthShell } from '@/components/AuthShell';
import { ForgotPasswordForm } from '@/components/ForgotPasswordForm';

export default async function MotDePasseOubliePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  // Déjà connecté : inutile de demander un lien de réinitialisation.
  if (await getCurrentUser()) redirect('/');

  return (
    <AuthShell>
      <ForgotPasswordForm initialEmail={email ?? ''} />
    </AuthShell>
  );
}
