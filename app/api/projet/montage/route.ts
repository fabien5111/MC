// Route Handler — proposition IA d'un plan de montage : la quantité visée
// (en grammes) pour chaque composant d'un projet, selon son rôle dans
// l'assemblage (JEP-254 — cas d'un insert dont personne ne connaît la
// quantité avant d'avoir choisi une recette).
//
// Comme /api/projet/composant, l'échec est ici REMONTÉ : c'est une action
// explicite du pâtissier, il doit savoir qu'elle n'a pas abouti plutôt que de
// voir des quantités rester vides sans explication.
//
// Ne touche à aucune table : elle reçoit la liste des composants depuis le
// client (id, nom, rôle) et rend une proposition par id. C'est l'appelant
// (ProjectQuantities) qui écrit `target_quantity` / `target_unit` avec sa
// propre session — même doctrine que /api/scale-recipe, qui ne connaît rien
// non plus de la recette en base.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { callClaude, parseStrictJson } from '@/lib/ai/claude';
import { buildAssemblyContenu, normaliseAssembly, type AssemblyComponentInput } from '@/lib/ai/project-assembly';
import { collecteurAppelsIa, enregistrerAppelsIa } from '@/lib/ai/usage-log';
import { estRefus, reserverQuota } from '@/lib/quota-route';

export const maxDuration = 30;

const MAX_COMPOSANTS = 12;

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
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : 'Dessert';
  const formatLabel = typeof body?.formatLabel === 'string' ? body.formatLabel.trim().slice(0, 120) : '';
  const servings =
    Number.isFinite(Number(body?.servings)) && Number(body.servings) > 0 ? Math.round(Number(body.servings)) : null;

  const composants: AssemblyComponentInput[] = (Array.isArray(body?.composants) ? body.composants : [])
    .slice(0, MAX_COMPOSANTS)
    .map((c: unknown) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return {
        id: Number(o.id),
        name: typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '',
        role: typeof o.role === 'string' ? o.role.trim().slice(0, 40) || null : null,
      };
    })
    .filter((c: AssemblyComponentInput) => Number.isFinite(c.id) && c.name.length > 0);
  if (!composants.length) return NextResponse.json({ erreur: 'Aucun composant à répartir.' }, { status: 400 });

  const quota = await reserverQuota(user.id, 'mode_projet_ia_mensuel');
  if (estRefus(quota)) return quota.refus;

  const { sink, appels } = collecteurAppelsIa();
  try {
    const raw = await callClaude(
      apiKey,
      buildAssemblyContenu({ title, formatLabel, servings }, composants),
      1500,
      25_000,
      undefined,
      undefined,
      undefined,
      sink,
    );
    const proposals = normaliseAssembly(
      parseStrictJson(raw.text),
      composants.map((c) => c.id),
    );
    if (!proposals.length) {
      await quota.rendre();
      return NextResponse.json({ erreur: 'La proposition est revenue vide, réessayez.' }, { status: 502 });
    }
    return NextResponse.json({ composants: proposals });
  } catch (e) {
    await quota.rendre();
    console.error('projet/montage:', (e as Error).message);
    return NextResponse.json({ erreur: 'La proposition a échoué, réessayez.' }, { status: 502 });
  } finally {
    // `await`, jamais `void` (cf. app/api/scale-recipe/route.ts) : sinon la
    // fonction serverless peut geler avant que l'écriture n'atteigne la base.
    await enregistrerAppelsIa('projet_montage', user.id, appels);
  }
}
