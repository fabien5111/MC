// Invalide le cache des lectures publiques du blog (`lib/blog.ts`,
// `unstable_cache`, étiquette `blog`) après une écriture depuis l'éditeur.
//
// Les lectures publiques sont mises en cache 60 s ; sans cet appel, un
// article publié resterait invisible sur /blog jusqu'à expiration du délai —
// gênant pour la personne qui vient de cliquer sur « Publier ». Réservé au
// back-office (admin ou gestionnaire), à l'écriture uniquement : ce n'est pas
// une route de lecture, une régénération abusive n'expose aucune donnée mais
// n'a pas non plus à être publique.
//
// 403 JSON plutôt que `requireManager()` : cette route est appelée en
// `fetch()` depuis l'éditeur, pas naviguée — une redirection HTML vers
// /connexion ne serait d'aucune aide à l'appelant.
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isManager } from '@/lib/auth';
import { BLOG_TAG, articleTag } from '@/lib/blog';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });

  // Rôle via l'accesseur unique (mémoïsé) plutôt qu'une lecture directe de
  // `profiles` : c'est la dispersion de ces lectures qui produisait deux
  // requêtes pour la même ligne (cf. lib/auth.ts).
  if (!(await isManager(user.id))) {
    return NextResponse.json({ erreur: 'Réservé au back-office.' }, { status: 403 });
  }

  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string };
  revalidateTag(BLOG_TAG);
  if (slug) revalidateTag(articleTag(slug));

  return NextResponse.json({ ok: true });
}
