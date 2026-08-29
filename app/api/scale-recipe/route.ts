// Route Handler — Ajustement d'une recette par IA (coefficient multiplicateur).
// Auth via la session Supabase (cookies).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isReadOnlySession } from '@/lib/impersonation';
import { callClaude, parseStrictJson } from '@/lib/ai/claude';
import { buildContenu, normaliseResultat } from '@/lib/ai/scale-recipe';
import { collecteurAppelsIa, enregistrerAppelsIa } from '@/lib/ai/usage-log';

export const maxDuration = 30;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { erreur: "Ajustement IA indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée sur le serveur." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  // Facturée comme /api/import-url et /api/transcribe-photo : interdite
  // pendant une impersonation en lecture seule.
  if (await isReadOnlySession()) {
    return NextResponse.json(
      { erreur: 'Session de consultation (lecture seule) : ajustement impossible.' },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 3) return NextResponse.json({ erreur: "Décrivez l'ajustement souhaité." }, { status: 400 });

  const { sink, appels } = collecteurAppelsIa();
  try {
    // 25 s : la route déclare `maxDuration = 30`, l'appel doit rendre la main
    // avant que l'hébergeur ne coupe la fonction.
    const raw = await callClaude(
      apiKey,
      buildContenu(body.recette, prompt, body.moules_reference),
      1000,
      25_000,
      undefined,
      undefined,
      undefined,
      sink,
    );

    return NextResponse.json(normaliseResultat(parseStrictJson(raw.text)));
  } catch {
    return NextResponse.json(
      { erreur: "L'ajustement a échoué, réessayez ou saisissez le coefficient manuellement." },
      { status: 502 },
    );
  } finally {
    // `await`, jamais `void` : sur une fonction serverless Vercel, la requête
    // HTTP en vol d'un `void` non attendu peut être coupée net dès la réponse
    // envoyée (gel de l'environnement d'exécution) — la ligne ne part jamais.
    // `enregistrerAppelsIa` avale déjà toutes ses erreurs en interne (best-
    // effort), donc l'attendre ne remet pas en cause la doctrine « le journal
    // ne casse jamais la réponse » : ça change seulement le moment où la
    // fonction est autorisée à se terminer.
    await enregistrerAppelsIa('ajustement_quantites', user.id, appels);
  }
}
