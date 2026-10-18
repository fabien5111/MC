// DIAGNOSTIC TEMPORAIRE (JEP-282) — à retirer une fois l'accord des pluriels
// validé. Montre ce que CE nœud lit réellement dans `ingredient_refs.name_plural` :
// par le cache des référentiels (ce que voit le layout), puis en lecture directe
// sans cache, avec le rôle anonyme et avec la session. Réservé aux admins.
import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getIngredientNomsAccordables } from '@/lib/data/reference';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function lecture(sb: any) {
  const { data, error } = await sb.from('ingredient_refs').select('id, name, name_plural').not('name_plural', 'is', null);
  return { erreur: error?.message ?? null, nombre: data?.length ?? 0, extrait: (data ?? []).slice(0, 8) };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });

  const cache = await getIngredientNomsAccordables().catch((e) => ({ erreur: String(e) }));
  return NextResponse.json({
    heure: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    cacheDuLayout: 'parId' in cache ? { parId: Object.keys(cache.parId).length, parCle: Object.keys(cache.parCle) } : cache,
    lectureAnonyme: await lecture(createPublicClient()),
    lectureSession: await lecture(await createClient()),
  });
}
