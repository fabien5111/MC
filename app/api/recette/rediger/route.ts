// Route Handler — Rédaction des textes d'une recette par IA (JEP-414).
//
// Deux usages, une seule route :
//   - `{ recette, cible }` : un champ (description, conseils, dégustation,
//     conseils ou préparation à l'avance d'une étape), 1 crédit ;
//   - `{ recette, tout: true }` : tous les champs VIDES, recomptés ICI (jamais
//     d'après ce que dit le navigateur), 1 crédit par tranche de 3, 2 au moins.
//
// Rien n'est écrit en base : la route rend des propositions, l'éditeur les
// ajoute au formulaire au geste du membre. Droit `redaction_ia` (PLUS, PRO,
// essai PRO), vérifié par `reserverCredits` avant le débit.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { callClaude, parseStrictJson } from '@/lib/ai/claude';
import { buildRedaction, jetonsMax, VERSION_INVITE_REDACTION } from '@/lib/ai/redaction';
import { collecteurAppelsIa, enregistrerAppelsIa } from '@/lib/ai/usage-log';
import { estRefusCredits, reserverCredits } from '@/lib/quota-route';
import { COUT_REDACTION_CHAMP, coutCompletion } from '@/lib/credits-ia';
import { refusSiCompteBloque } from '@/lib/moderation-route';
import {
  champsVides,
  cibleValide,
  lireCible,
  normaliserPropositions,
  normaliserRecette,
  type CibleRedaction,
} from '@/lib/redaction-ia';

export const maxDuration = 60;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { erreur: "Rédaction IA indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée sur le serveur." },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  // Compte suspendu ou désactivé (JEP-272) : les appels IA échappent à la RLS.
  const compteBloque = await refusSiCompteBloque(user.id);
  if (compteBloque) return compteBloque;
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule).' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const recette = normaliserRecette(body?.recette);
  if (!recette) {
    return NextResponse.json({ erreur: 'Donnez au moins un titre ou une étape à la recette.' }, { status: 400 });
  }

  const tout = body?.tout === true;
  let cibles: CibleRedaction[];
  if (tout) {
    cibles = champsVides(recette).cibles;
    if (!cibles.length) {
      return NextResponse.json({ erreur: 'Aucun champ vide à compléter.' }, { status: 400 });
    }
  } else {
    const cible = lireCible(body?.cible);
    if (!cible || !cibleValide(recette, cible)) {
      return NextResponse.json({ erreur: 'Champ inconnu, ou étape vide.' }, { status: 400 });
    }
    cibles = [cible];
  }

  const action = tout ? 'redaction_completion' : 'redaction_champ';
  const cout = tout ? coutCompletion(cibles.length) : COUT_REDACTION_CHAMP;
  const quota = await reserverCredits(user.id, action, cout, {
    detail: { champs: cibles.length, invite: VERSION_INVITE_REDACTION },
  });
  if (estRefusCredits(quota)) return quota.refus;

  const { sink, appels } = collecteurAppelsIa();
  try {
    const raw = await callClaude(apiKey, buildRedaction(recette, cibles), jetonsMax(cibles.length), 50_000, undefined, undefined, undefined, sink);
    const propositions = normaliserPropositions(parseStrictJson(raw.text), cibles);
    if (!propositions.length) {
      await quota.rendre();
      return NextResponse.json({ erreur: "L'IA n'a rien proposé, réessayez." }, { status: 502 });
    }
    return NextResponse.json({ propositions, credits: cout });
  } catch (e) {
    await quota.rendre();
    console.error('recette/rediger:', (e as Error).message);
    return NextResponse.json({ erreur: 'La proposition a échoué, réessayez. Vos crédits ont été rendus.' }, { status: 502 });
  } finally {
    await enregistrerAppelsIa('redaction_ia', user.id, appels);
  }
}
