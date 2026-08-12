// Route Handler — balayage IA de la boîte à idées pour repérer des paires de
// doublons parmi les idées encore ouvertes (aide à la fusion, back-office).
// Réservé aux administrateurs.
import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { callClaude, parseStrictJson } from '@/lib/ai/claude';
import { buildScanContenu, normaliseScanResultat } from '@/lib/ai/idea-duplicates';
import { getIdeaCandidatesForScan, getIdeaSummaries } from '@/lib/ideas-data';

export const maxDuration = 60;

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { erreur: "Détection IA indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée sur le serveur." },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });

  const candidates = await getIdeaCandidatesForScan();
  if (candidates.length < 2) return NextResponse.json({ paires: [] });

  try {
    // 3000 tokens : jusqu'à 20 paires avec leur raison tient largement dedans.
    const raw = await callClaude(apiKey, buildScanContenu(candidates), 3000, 50_000);
    const paires = normaliseScanResultat(parseStrictJson(raw.text), new Set(candidates.map((c) => c.id)));
    if (!paires.length) return NextResponse.json({ paires: [] });

    const ids = [...new Set(paires.flatMap((p) => [p.a, p.b]))];
    const summaries = await getIdeaSummaries(ids);
    const byId = new Map(summaries.map((s) => [s.id, s]));
    const enriched = paires
      .map((p) => {
        const a = byId.get(p.a);
        const b = byId.get(p.b);
        if (!a || !b) return null;
        // a = la plus votée : la fusion par défaut proposée à l'admin absorbe
        // la moins soutenue dans la plus soutenue.
        return a.votes_count >= b.votes_count
          ? { a, b, raison: p.raison }
          : { a: b, b: a, raison: p.raison };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    return NextResponse.json({ paires: enriched });
  } catch (e) {
    return NextResponse.json(
      { erreur: `La détection a échoué : ${(e as Error).message || 'réessayez dans un instant.'}` },
      { status: 502 },
    );
  }
}
