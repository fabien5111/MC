// Invalide le cache des données de référence (`lib/data/reference.ts`,
// `unstable_cache`) après une écriture sur un référentiel.
//
// Sans cet appel, une unité ajoutée depuis Admin → Listes resterait invisible
// jusqu'à 24 h — c'est précisément ce qui permet des durées de cache aussi
// longues : la propagation ne dépend pas du délai, mais de l'invalidation.
//
// **Session requise, mais pas le rôle admin.** Les référentiels ne sont pas
// modifiés que depuis le back-office : l'éditeur de recette crée des tags, des
// ustensiles et des ingrédients de référence à la volée (`CreerForm`,
// `RelectureEditor`). Qui a le droit d'écrire est tranché par la RLS, à
// l'écriture ; exiger ici un rôle plus strict que celui-là interdirait à une
// écriture pourtant autorisée d'invalider son propre cache — le pire des deux
// mondes. Régénérer une étiquette n'expose aucune donnée et ne coûte, au pire,
// qu'une relecture de table de référence.
//
// 403/401 en JSON plutôt que `requireUser()` : la route est appelée en
// `fetch()`, pas naviguée — une redirection HTML vers /connexion ne serait
// d'aucune aide à l'appelant.
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { REFERENCE_TAG, referenceTag } from '@/lib/data/reference';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });

  const { table } = (await req.json().catch(() => ({}))) as { table?: string };

  // Sans nom de table : on invalide tout. Le coût est négligeable (ces tables
  // sont petites) et c'est le comportement le plus sûr pour un appelant qui ne
  // sait pas exactement ce qu'il a touché.
  revalidateTag(REFERENCE_TAG);
  if (table) revalidateTag(referenceTag(table));

  return NextResponse.json({ ok: true });
}
