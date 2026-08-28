// Route Handler — proposition IA d'une recette de base pour un composant
// (spec §5.4). La recette produite est copiée dans le projet comme le serait
// n'importe quelle recette existante : elle n'entre jamais au carnet toute
// seule, et s'édite ensuite exactement pareil.
//
// Contrairement à /api/projet/structure, l'échec est ici REMONTÉ : l'écran
// propose explicitement « demander une proposition à l'IA », et l'utilisateur
// doit savoir que rien n'est arrivé plutôt que de voir un composant rester
// vide sans explication. Les autres sources (carnet, favoris, pâtissiers
// suivis, saisie manuelle) restent disponibles.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { callClaude, parseStrictJson } from '@/lib/ai/claude';
import { buildComponentContenu, normaliseComponentRecipe } from '@/lib/ai/project-component';
import { collecteurAppelsIa, enregistrerAppelsIa } from '@/lib/ai/usage-log';

export const maxDuration = 60;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { erreur: "Proposition IA indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée sur le serveur." },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule).' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (name.length < 2) return NextResponse.json({ erreur: 'Nommez le composant.' }, { status: 400 });
  const role = typeof body?.role === 'string' ? body.role.trim().slice(0, 40) : null;
  const contexte = {
    titre: typeof body?.projectTitle === 'string' ? body.projectTitle.trim().slice(0, 120) : null,
    format: typeof body?.format === 'string' ? body.format.trim().slice(0, 40) : null,
    parts: Number.isFinite(Number(body?.servings)) && Number(body?.servings) > 0 ? Math.round(Number(body.servings)) : null,
  };

  const { sink, appels } = collecteurAppelsIa();
  try {
    const raw = await callClaude(
      apiKey,
      buildComponentContenu(name, role, contexte),
      2000,
      50_000,
      undefined,
      undefined,
      undefined,
      sink,
    );
    const recette = normaliseComponentRecipe(parseStrictJson(raw.text));
    if (!recette.steps.length) {
      return NextResponse.json({ erreur: 'La proposition est revenue vide, réessayez.' }, { status: 502 });
    }
    return NextResponse.json(recette);
  } catch (e) {
    console.error('projet/composant:', (e as Error).message);
    return NextResponse.json({ erreur: 'La proposition a échoué, réessayez.' }, { status: 502 });
  } finally {
    void enregistrerAppelsIa('projet_composant', user.id, appels);
  }
}
