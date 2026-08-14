// Route Handler — Ajustement d'une recette par IA (coefficient multiplicateur).
// Auth via la session Supabase (cookies).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isReadOnlySession } from '@/lib/impersonation';
import { callClaude, parseStrictJson, IMPORT_MODEL } from '@/lib/ai/claude';
import { computeCost } from '@/lib/ai/cost';
import { buildContenu, normaliseResultat } from '@/lib/ai/scale-recipe';

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

  try {
    // 25 s : la route déclare `maxDuration = 30`, l'appel doit rendre la main
    // avant que l'hébergeur ne coupe la fonction.
    const raw = await callClaude(
      apiKey,
      buildContenu(body.recette, prompt, body.moules_reference),
      1000,
      25_000,
    );

    // Coût réel (cf. Coût IA, back-office) : `recipe_scale_costs` n'est pas
    // encore dans lib/database.types.ts tant que la migration n'a pas été
    // appliquée puis régénérée (cf. CLAUDE.md) — accès non typé en attendant,
    // même motif que `recipe_analysis` dans /api/moderation-recette.
    // Best-effort : un échec d'enregistrement du coût ne doit pas invalider
    // un ajustement par ailleurs réussi.
    try {
      const cost = computeCost(raw.usage, IMPORT_MODEL);
      const { error } = await (
        supabase.from('recipe_scale_costs' as any) as ReturnType<typeof supabase.from>
      ).insert({
        user_id: user.id,
        model: IMPORT_MODEL,
        input_tokens: raw.usage.inputTokens,
        output_tokens: raw.usage.outputTokens,
        cost_usd: cost?.usd ?? null,
      } as never);
      if (error) console.error('scale-recipe (coût):', error.message);
    } catch (costError) {
      console.error('scale-recipe (coût):', (costError as Error).message);
    }

    return NextResponse.json(normaliseResultat(parseStrictJson(raw.text)));
  } catch {
    return NextResponse.json(
      { erreur: "L'ajustement a échoué, réessayez ou saisissez le coefficient manuellement." },
      { status: 502 },
    );
  }
}
