// Route Handler — activer ou désactiver l'aide d'un membre (JEP-373) : toute
// l'aide de toutes les pages, ou celle d'une seule page.
//
//   POST { action: 'activer' | 'desactiver', page?: <slug> }
//
// - activer : supprime les masquages du périmètre (page entière, blocs et
//   vidéos) de `help_dismissals` ;
// - désactiver : pose un masquage « toute l'aide de la page » (kind = 'page')
//   par page du périmètre — même écriture que la croix d'un bloc.
//
// Clé service_role, parce que la policy de suppression de `help_dismissals`
// n'est pas démontrable depuis le dépôt (DDL posé à la main) ; tout est borné
// à `user_id` du membre connecté, jamais à une valeur fournie par le client, et
// les pages sont validées contre la liste du code (`HELP_PAGES`).
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { HELP_PAGES, helpBlocksForPage, isHelpPageSlug } from '@/lib/help-blocks';
import { getImpersonationContext } from '@/lib/impersonation';
import { refusSiCompteBloque } from '@/lib/moderation-route';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Connexion requise.' }, { status: 401 });
  // Aucune session « en tant que » : l'aide est celle du membre, l'administrateur
  // n'a pas à la régler à sa place.
  if (await getImpersonationContext()) {
    return NextResponse.json(
      { ok: false, message: 'Indisponible pendant une connexion « en tant que ».' },
      { status: 403 },
    );
  }
  const bloque = await refusSiCompteBloque(user.id, 'message');
  if (bloque) return bloque;

  const body = (await req.json().catch(() => null)) as { action?: unknown; page?: unknown } | null;
  const action = body?.action;
  if (action !== 'activer' && action !== 'desactiver') {
    return NextResponse.json({ ok: false, message: 'Action inconnue.' }, { status: 400 });
  }
  let slugs: string[] = HELP_PAGES.map((p) => p.slug);
  if (body?.page !== undefined && body.page !== null) {
    if (typeof body.page !== 'string' || !isHelpPageSlug(body.page)) {
      return NextResponse.json({ ok: false, message: 'Page d’aide inconnue.' }, { status: 400 });
    }
    slugs = [body.page];
  }

  try {
    const sb = createAdminClient();
    if (action === 'activer') {
      const cibles = slugs.flatMap((slug) => [slug, ...helpBlocksForPage(slug as (typeof HELP_PAGES)[number]['slug']).map((b) => b.key)]);
      const { error } = await sb.from('help_dismissals').delete().eq('user_id', user.id).in('target', cibles);
      if (error) throw new Error(error.message);
    } else {
      // Retirer d'abord un éventuel masquage de page déjà posé : pas de doublon,
      // sans dépendre de la forme de la clé primaire.
      const { error: e1 } = await sb
        .from('help_dismissals')
        .delete()
        .eq('user_id', user.id)
        .eq('kind', 'page')
        .in('target', slugs);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await sb
        .from('help_dismissals')
        .insert(slugs.map((target) => ({ user_id: user.id, kind: 'page', target })));
      if (e2) throw new Error(e2.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message }, { status: 503 });
  }
}
