// Route Handler — enregistrement du pseudo d'un membre connecté qui n'en a
// pas encore (`/choix-pseudo`, notamment après une première connexion Google).
//
// C'est la route qui ÉCRIT, et c'est pour ça qu'elle revalide tout plutôt que
// de faire confiance au passage précédent par `/api/pseudo/verifier` : un
// appel direct, sans écran, ne doit pas pouvoir poser n'importe quel pseudo.
// L'écriture se fait avec la clé service_role (lib/pseudo-data.ts), le
// navigateur n'écrit jamais `full_name` / `username` lui-même.
import { NextResponse } from 'next/server';
import { getCurrentUser, getProfile, accountProvider } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import {
  aChoisiSonPseudo,
  dernierChangementPseudo,
  enregistrerPseudo,
  verifierPseudoComplet,
} from '@/lib/pseudo-data';
import { methodeInscription } from '@/lib/inscription';
import { PSEUDO_DELAI_CHANGEMENT_JOURS, PSEUDO_MAX_LENGTH, prochainChangementPseudo, validerPseudo } from '@/lib/pseudo';
import { formatDate } from '@/lib/format';
import { cguVersionValide } from '@/lib/cgu';
import { attestationAgeVersionValide } from '@/lib/attestation-age';
import { enregistrerAcceptationsInscription } from '@/lib/cgu-data';
import { refusSiCompteBloque } from '@/lib/moderation-route';

export const maxDuration = 20;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Connexion requise.' }, { status: 401 });
  // Compte suspendu ou désactivé (JEP-272) : la clé service_role et les appels
  // IA échappent à la RLS, la garde est donc ici.
  const compteBloque = await refusSiCompteBloque(user.id, 'message');
  if (compteBloque) return compteBloque;
  // Une session « en tant que » en lecture seule ne choisit pas le pseudo du
  // membre à sa place (même garde que `/creer`, `/importer`, `/relecture`).
  if (await isReadOnlySession()) {
    return NextResponse.json({ ok: false, message: 'Session de consultation (lecture seule).' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const saisie = typeof body?.pseudo === 'string' ? body.pseudo.slice(0, PSEUDO_MAX_LENGTH * 2) : '';

  // Lu AVANT toute écriture : après, tout compte « a un pseudo ». Cette route
  // sert à deux gestes — le premier choix (inscription, `/choix-pseudo`) et le
  // changement de pseudo d'un membre déjà inscrit (`/reglages`) — et ils
  // n'exigent pas la même chose : changer de pseudo n'est pas s'inscrire.
  const premiereFois = !(await aChoisiSonPseudo(user.id));

  if (premiereFois) {
    // CGU (JEP-129) : cet écran est le seul où un compte Google les accepte —
    // il n'est jamais passé par la case de `LoginForm`. Revérifié ici, jamais
    // seulement côté client : sans la version en vigueur, pas de pseudo.
    if (!cguVersionValide(body?.cguVersion)) {
      return NextResponse.json({
        ok: false,
        message: "Merci d'accepter les conditions d'utilisation en vigueur (rechargez la page si elles viennent de changer).",
      });
    }

    // Attestation d'âge (JEP-34) : même raison, même garde — un compte Google
    // n'a jamais vu la case de `LoginForm`, c'est ici qu'il la coche.
    if (!attestationAgeVersionValide(body?.ageAttestationVersion)) {
      return NextResponse.json({
        ok: false,
        message: "Merci de confirmer la condition d'âge (rechargez la page si elle vient de changer).",
      });
    }
  }

  // Format local d'abord (aucun accès base), pour savoir ce que la saisie change.
  const local = validerPseudo(saisie);
  if (!local.ok) return NextResponse.json({ ok: false, message: local.message });

  // Changement de pseudo : le délai ne porte que sur l'ADRESSE du profil (le
  // slug). Rectifier la casse ou les accents d'un pseudo sans toucher à son
  // slug ne consomme rien — l'adresse reste la même, aucun lien ne casse.
  // Contrôlé AVANT la vérification complète : un refus de délai ne doit pas
  // coûter un appel IA.
  const profil = premiereFois ? null : await getProfile(user.id);
  const adresseChange = !!profil && profil.username !== local.slug;
  if (adresseChange) {
    const echeance = prochainChangementPseudo(await dernierChangementPseudo(user.id));
    if (echeance) {
      return NextResponse.json({
        ok: false,
        message:
          `Vous avez déjà changé de pseudo récemment : un nouveau changement est possible ` +
          `à partir du ${formatDate(echeance.toISOString())} (un changement tous les ` +
          `${PSEUDO_DELAI_CHANGEMENT_JOURS} jours).`,
        prochainChangement: echeance.toISOString(),
      });
    }
  }

  // Rien ne change (même pseudo, même adresse) : on ne dépense ni vérification
  // d'unicité, ni appel IA, ni délai.
  if (profil && !adresseChange && profil.full_name === local.pseudo) {
    return NextResponse.json({ ok: true, pseudo: local.pseudo, slug: local.slug, inscription: null });
  }

  const validation = await verifierPseudoComplet(saisie, user.id);
  if (!validation.ok) return NextResponse.json({ ok: false, message: validation.message });

  // Avant le pseudo : `profiles.username` est la marque « passage obligé
  // franchi » (cf. `aChoisiSonPseudo`). L'écrire d'abord laisserait un compte
  // sortir de cet écran sans trace d'acceptation si la seconde écriture échouait.
  if (premiereFois) {
    const acceptation = await enregistrerAcceptationsInscription(user.id);
    if (!acceptation.ok) return NextResponse.json({ ok: false, message: acceptation.message });
  }

  const provider = accountProvider(user);

  const ecriture = await enregistrerPseudo(
    user.id,
    validation.pseudo,
    validation.slug,
    user.email ?? null,
    provider,
    adresseChange,
  );
  if (!ecriture.ok) return NextResponse.json({ ok: false, message: ecriture.message });

  // `inscription` : la méthode, quand c'est l'inscription qui se termine — le
  // navigateur en fait l'événement `sign_up` (JEP-89, lib/inscription.ts).
  return NextResponse.json({
    ok: true,
    pseudo: validation.pseudo,
    slug: validation.slug,
    inscription: premiereFois ? methodeInscription(provider) : null,
  });
}
