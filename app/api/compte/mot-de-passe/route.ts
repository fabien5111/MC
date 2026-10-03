// POST — alerte de sécurité après un changement de mot de passe (JEP-280).
//
// Appelée par `PasswordChangeCard` une fois `updateUser({ password })` abouti.
// GoTrue n'envoie rien dans ce cas ; l'alerte n'est utile que si le titulaire
// n'est PAS l'auteur du changement, d'où l'e-mail, et non la seule cloche.
//
// **Ne prend aucune donnée du navigateur** : la route notifie l'utilisateur de
// la session sur SON PROPRE compte, rien d'autre — il n'y a donc rien à
// falsifier, et au pire un membre se prévient lui-même. Un plafond d'une alerte
// par heure empêche d'en faire un envoi en boucle vers sa propre boîte.
// Événement VERROUILLÉ : part quelles que soient les préférences.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifier } from '@/lib/notifier';
import { siteUrl } from '@/lib/site-url';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule).' }, { status: 403 });
  }

  const heure = new Date().toISOString().slice(0, 13);
  const corps =
    'Le mot de passe de votre compte Je pâtisse ! vient d’être modifié.\n\n' +
    `Si ce n’est pas vous, réinitialisez-le sans attendre (${siteUrl()}/connexion) et contactez-nous (${siteUrl()}/contact).`;

  await notifier(createAdminClient(), {
    userId: user.id,
    evenement: 'mot_de_passe_change',
    donnees: { titre: 'Votre mot de passe a été modifié', detail: corps, lien: '/reglages' },
    cleDedoublonnage: `mot_de_passe:${user.id}:${heure}`,
    emailPrecompose: user.email
      ? {
          sujet: 'Votre mot de passe a été modifié',
          texte: corps,
          html: `<p>${corps.replace(/\n\n/g, '</p><p>')}</p>`,
          replyTo: process.env.EMAIL_REPLY_TO || undefined,
        }
      : undefined,
  });
  return NextResponse.json({ ok: true });
}
