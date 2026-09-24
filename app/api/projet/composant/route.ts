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
import { buildComponentContenu, draftToText, normaliseComponentRecipe } from '@/lib/ai/project-component';
import type { ComponentStepDraft } from '@/lib/projects';
import { collecteurAppelsIa, enregistrerAppelsIa } from '@/lib/ai/usage-log';
import { estRefus, reserverQuota } from '@/lib/quota-route';

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
    format: typeof body?.format === 'string' ? body.format.trim().slice(0, 120) : null,
    parts: Number.isFinite(Number(body?.servings)) && Number(body?.servings) > 0 ? Math.round(Number(body.servings)) : null,
  };

  // Nouvelle proposition (JEP-254, point 8) : la précédente, telle que le
  // pâtissier l'a sous les yeux, et ses consignes de correction. Sans
  // consigne, c'est une première demande.
  const consignes = typeof body?.consignes === 'string' ? body.consignes.trim().slice(0, 1000) : '';
  const precedente = Array.isArray(body?.precedente)
    ? draftToText(
        (body.precedente as ComponentStepDraft[])
          .slice(0, 12)
          .map((st) => ({
            ...st,
            title: typeof st?.title === 'string' ? st.title : null,
            description: typeof st?.description === 'string' ? st.description : null,
            ingredients: Array.isArray(st?.ingredients)
              ? st.ingredients.slice(0, 40).map((it) => ({
                  ...it,
                  name: typeof it?.name === 'string' ? it.name : '',
                  quantity: typeof it?.quantity === 'string' ? it.quantity : null,
                  unit: typeof it?.unit === 'string' ? it.unit : null,
                }))
              : [],
          })),
      )
    : '';
  const revision = consignes && precedente ? { precedente, consignes } : null;

  const quota = await reserverQuota(user.id, 'mode_projet_ia_mensuel');
  if (estRefus(quota)) return quota.refus;

  const { sink, appels } = collecteurAppelsIa();
  try {
    const raw = await callClaude(
      apiKey,
      buildComponentContenu(name, role, contexte, revision),
      2000,
      50_000,
      undefined,
      undefined,
      undefined,
      sink,
    );
    const recette = normaliseComponentRecipe(parseStrictJson(raw.text));
    if (!recette.steps.length) {
      await quota.rendre();
      return NextResponse.json({ erreur: 'La proposition est revenue vide, réessayez.' }, { status: 502 });
    }
    return NextResponse.json(recette);
  } catch (e) {
    await quota.rendre();
    console.error('projet/composant:', (e as Error).message);
    return NextResponse.json({ erreur: 'La proposition a échoué, réessayez.' }, { status: 502 });
  } finally {
    // `await`, jamais `void` (cf. app/api/scale-recipe/route.ts) : sinon la
    // fonction serverless peut geler avant que l'écriture n'atteigne la base.
    await enregistrerAppelsIa('projet_composant', user.id, appels);
  }
}
