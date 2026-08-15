// Route Handler — enregistrement du pseudo d'un membre connecté qui n'en a
// pas encore (`/choix-pseudo`, notamment après une première connexion Google).
//
// C'est la route qui ÉCRIT, et c'est pour ça qu'elle revalide tout plutôt que
// de faire confiance au passage précédent par `/api/pseudo/verifier` : un
// appel direct, sans écran, ne doit pas pouvoir poser n'importe quel pseudo.
// L'écriture se fait avec la clé service_role (lib/pseudo-data.ts), le
// navigateur n'écrit jamais `full_name` / `username` lui-même.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { enregistrerPseudo, verifierPseudoComplet } from '@/lib/pseudo-data';
import { PSEUDO_MAX_LENGTH } from '@/lib/pseudo';

export const maxDuration = 20;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Connexion requise.' }, { status: 401 });
  // Une session « en tant que » en lecture seule ne choisit pas le pseudo du
  // membre à sa place (même garde que `/creer`, `/importer`, `/relecture`).
  if (await isReadOnlySession()) {
    return NextResponse.json({ ok: false, message: 'Session de consultation (lecture seule).' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const saisie = typeof body?.pseudo === 'string' ? body.pseudo.slice(0, PSEUDO_MAX_LENGTH * 2) : '';

  const validation = await verifierPseudoComplet(saisie, user.id);
  if (!validation.ok) return NextResponse.json({ ok: false, message: validation.message });

  const ecriture = await enregistrerPseudo(
    user.id,
    validation.pseudo,
    validation.slug,
    user.email ?? null,
    user.app_metadata?.provider ?? null,
  );
  if (!ecriture.ok) return NextResponse.json({ ok: false, message: ecriture.message });

  return NextResponse.json({ ok: true, pseudo: validation.pseudo, slug: validation.slug });
}
