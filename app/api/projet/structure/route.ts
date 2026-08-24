// Route Handler — proposition de structure d'un projet à partir de
// l'intention (spec §4, étapes 2 et 3 : format visé + composants ordonnés).
//
// **Best-effort**, même doctrine que /api/idees/verifier-doublon : clé
// absente, panne ou réponse illisible → proposition vide, jamais une erreur
// bloquante. Le dialogue doit rester utilisable entièrement à la main (spec
// §12, « Échec de l'IA »), et le brouillon reste enregistré dans tous les cas.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { callClaude, parseStrictJson } from '@/lib/ai/claude';
import { buildStructureContenu, normaliseStructure, INTENT_MAX } from '@/lib/ai/project-structure';
import { MAX_COMPONENTS } from '@/lib/projects';

export const maxDuration = 30;

const VIDE = { title: null, format: null, dims: {}, servings: null, components: [] };

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule).' }, { status: 403 });
  }
  if (!apiKey) return NextResponse.json(VIDE);

  const body = await req.json().catch(() => ({}));
  const intent = typeof body?.intent === 'string' ? body.intent.trim().slice(0, INTENT_MAX) : '';
  if (intent.length < 5) return NextResponse.json(VIDE);

  try {
    // 25 s : la route déclare `maxDuration = 30`, l'appel doit rendre la main
    // avant que l'hébergeur ne coupe la fonction.
    const raw = await callClaude(apiKey, buildStructureContenu(intent), 1200, 25_000);
    return NextResponse.json(normaliseStructure(parseStrictJson(raw.text), MAX_COMPONENTS));
  } catch (e) {
    console.error('projet/structure:', (e as Error).message);
    return NextResponse.json(VIDE);
  }
}
