import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, getProfile } from '@/lib/auth';
import { getEtatModeration } from '@/lib/moderation-data';
import { formatDateHeure } from '@/lib/format';
import { AuthShell } from '@/components/AuthShell';
import { SignOutButton } from '@/components/SignOutButton';

export const metadata: Metadata = { title: 'Compte suspendu | Je pâtisse !' };
export const dynamic = 'force-dynamic';

// Écran d'arrivée d'un compte suspendu ou désactivé (JEP-272) : c'est vers lui
// que `requireUser()` redirige. Il n'appelle donc délibérément PAS
// `requireUser()` — ce serait une boucle de redirection.
//
// Le motif est montré au membre : c'est la décision d'un modérateur, pas une
// règle de détection à ne pas dévoiler (contrairement au refus d'un pseudo).
// Le seul recours indiqué est le formulaire de contact, qui reste ouvert à un
// compte bloqué.
export default async function CompteSuspenduPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  const profil = await getProfile(user.id);
  const etat = await getEtatModeration(user.id, profil?.status);
  // Suspension levée (à la main ou par sa date de fin) : rien à faire ici.
  if (etat.etat === 'actif') redirect('/');

  const suspendu = etat.etat === 'suspendu';

  return (
    <AuthShell>
      <div className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-6 space-y-4 text-center">
        <span className="material-symbols-outlined text-4xl text-error">block</span>
        <h1 className="font-headline-md text-2xl text-primary">{suspendu ? 'Compte suspendu' : 'Compte désactivé'}</h1>
        <p className="text-sm text-on-surface-variant">
          {suspendu
            ? etat.jusquAu
              ? <>Votre compte est suspendu jusqu&apos;au <strong>{formatDateHeure(etat.jusquAu)}</strong>. Vous pourrez de nouveau vous connecter à cette date.</>
              : <>Votre compte est suspendu jusqu&apos;à nouvel ordre.</>
            : <>Votre compte a été désactivé par l&apos;équipe de Je pâtisse !.</>}
        </p>
        {etat.motif && (
          <div className="rounded-lg bg-surface-container-low px-4 py-3 text-left">
            <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Motif</p>
            <p className="text-sm whitespace-pre-line">{etat.motif}</p>
          </div>
        )}
        <p className="text-sm text-on-surface-variant">
          Pour contester cette décision ou en savoir plus, écrivez-nous depuis le{' '}
          <Link href="/contact" className="text-primary underline">
            formulaire de contact
          </Link>
          .
        </p>
        <div className="flex justify-center pt-2">
          <SignOutButton />
        </div>
      </div>
    </AuthShell>
  );
}
