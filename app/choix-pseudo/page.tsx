import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuthShell } from '@/components/AuthShell';
import { PseudoChooser } from '@/components/PseudoChooser';
import { aChoisiSonPseudo, suggestionPseudoLibre } from '@/lib/pseudo-data';
import { suggestionDepuisNom } from '@/lib/pseudo';

export const metadata: Metadata = { title: 'Choisir un pseudo | Je pâtisse !' };
export const dynamic = 'force-dynamic';

function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

// Passage OBLIGÉ pour tout compte sans pseudo — en pratique, toute première
// connexion Google : le trigger `handle_new_user` y recopie le nom du compte
// Google dans `profiles.full_name`, or ce nom est souvent l'état civil, que
// personne n'a choisi d'afficher publiquement à côté de ses recettes.
//
// Cette page n'appelle délibérément PAS `requireUser()` : c'est lui qui
// redirige ici quand le pseudo manque, l'appeler ferait tourner la
// redirection en boucle.
export default async function ChoixPseudoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const dest = safeNext(next);

  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?next=${encodeURIComponent(`/choix-pseudo?next=${dest}`)}`);
  if (await aChoisiSonPseudo(user.id)) redirect(dest);

  // Point de départ proposé : le pseudo saisi à l'inscription s'il n'a pas pu
  // être écrit, sinon le nom du profil Google, sinon la partie gauche de
  // l'adresse e-mail. Toujours modifiable — c'est l'objet même de l'écran.
  const meta = (user.user_metadata ?? {}) as { pseudo?: string; full_name?: string; name?: string };
  const base = suggestionDepuisNom(meta.pseudo || meta.full_name || meta.name || (user.email ?? '').split('@')[0] || '');
  // Suggérer un pseudo déjà pris ferait échouer le premier envoi sans que le
  // membre comprenne pourquoi.
  const suggestion = base ? await suggestionPseudoLibre(base) : '';

  return (
    <AuthShell>
      <PseudoChooser next={dest} suggestion={suggestion} />
    </AuthShell>
  );
}
