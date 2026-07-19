// Route Handler — Ajustement d'une recette par IA (coefficient multiplicateur).
// Auth via la session Supabase (cookies).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callClaude, parseStrictJson } from '@/lib/ai/claude';
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

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 3) return NextResponse.json({ erreur: "Décrivez l'ajustement souhaité." }, { status: 400 });

  try {
    const raw = await callClaude(apiKey, buildContenu(body.recette, prompt, body.moules_reference), 1000);
    return NextResponse.json(normaliseResultat(parseStrictJson(raw)));
  } catch {
    return NextResponse.json(
      { erreur: "L'ajustement a échoué, réessayez ou saisissez le coefficient manuellement." },
      { status: 502 },
    );
  }
}
