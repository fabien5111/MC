// Route Handler — vérification IA anti-doublons au moment de publier une
// idée (en complément des suggestions lexicales instantanées de
// `/api/idees/similaires`, qui ratent les reformulations sans mot commun).
// Auth requise (page appelante déjà protégée, contrôle refait ici).
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { callClaude, parseStrictJson } from '@/lib/ai/claude';
import { buildCheckContenu, normaliseCheckResultat } from '@/lib/ai/idea-duplicates';
import { getIdeaCandidatesForCheck, getIdeaSummaries } from '@/lib/ideas-data';
import { IDEA_DESCRIPTION_MAX, IDEA_TITLE_MAX } from '@/lib/ideas';
import { collecteurAppelsIa, enregistrerAppelsIa } from '@/lib/ai/usage-log';

export const maxDuration = 30;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Best-effort : une vérification IA indisponible ne doit pas bloquer la
    // publication (le titre-barre-de-recherche lexicale reste actif).
    return NextResponse.json({ matches: [] });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (await isReadOnlySession()) return NextResponse.json({ erreur: 'Session de consultation.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, IDEA_TITLE_MAX) : '';
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, IDEA_DESCRIPTION_MAX) : '';
  if (title.length < 5) return NextResponse.json({ matches: [] });

  const candidates = await getIdeaCandidatesForCheck();
  if (!candidates.length) return NextResponse.json({ matches: [] });

  const { sink, appels } = collecteurAppelsIa();
  try {
    const raw = await callClaude(apiKey, buildCheckContenu(title, description, candidates), 600, 20_000, undefined, undefined, undefined, sink);
    const matches = normaliseCheckResultat(parseStrictJson(raw.text), new Set(candidates.map((c) => c.id)));
    if (!matches.length) return NextResponse.json({ matches: [] });

    const summaries = await getIdeaSummaries(matches.map((m) => m.id));
    const byId = new Map(summaries.map((s) => [s.id, s]));
    const enriched = matches
      .map((m) => {
        const s = byId.get(m.id);
        return s ? { ...s, reason: m.raison } : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    return NextResponse.json({ matches: enriched });
  } catch (e) {
    console.error('verifier-doublon:', (e as Error).message);
    // Échec de l'IA : ne bloque pas la publication, comme l'absence de clé.
    return NextResponse.json({ matches: [] });
  } finally {
    // Best-effort, hors du chemin de réponse : le coût de la vérification
    // anti-doublon est une charge de GESTION (modération de la boîte à
    // idées), jamais imputée au membre qui dépose l'idée.
    void enregistrerAppelsIa('idee_doublon', user.id, appels);
  }
}
