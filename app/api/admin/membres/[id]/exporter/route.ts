// Route Handler — « Exporter les données » d'un membre depuis sa fiche
// (RGPD, art. 15 et 20 — JEP-362, lot 1). Réservée à l'admin complet, vérifié
// auprès du serveur d'authentification, comme le reste de la fiche ; refusée
// en session « en tant que ».
//
// Le journal (`member_moderation_events`, action `export_donnees`) est écrit
// AVANT la lecture : sans trace, pas d'export. Il est retiré si l'export
// échoue — aucune donnée n'est alors sortie. Réponse : le fichier JSON lui-même
// (`Content-Disposition: attachment`), jamais mis en cache.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { getImpersonationContext } from '@/lib/impersonation';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { exporterDonneesMembre } from '@/lib/export-donnees-data';
import { ACTION_JOURNAL_EXPORT, MOTIF_EXPORT_ADMIN, nomFichierExport } from '@/lib/export-donnees';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  if (await getImpersonationContext()) {
    return NextResponse.json({ erreur: 'Impossible en session « en tant que ».' }, { status: 403 });
  }
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }

  const { id: cibleId } = await params;
  const { data: cible } = await admin.from('profiles').select('id').eq('id', cibleId).maybeSingle();
  if (!cible) return NextResponse.json({ erreur: 'Membre introuvable.' }, { status: 404 });

  // Journal non typé : table absente de `database.types.ts`.
  const db = admin as unknown as SupabaseClient;
  const { data: ligne, error: journal } = await db
    .from('member_moderation_events')
    .insert({ member_id: cibleId, admin_id: user.id, action: ACTION_JOURNAL_EXPORT, reason: MOTIF_EXPORT_ADMIN })
    .select('id')
    .single();
  if (journal || !ligne) {
    console.error('exporter: journal non écrit :', journal?.message);
    return NextResponse.json(
      {
        erreur:
          `Export refusé : la trace n'a pas pu être écrite au journal (${journal?.message ?? 'aucune ligne'}). ` +
          `La contrainte de la colonne « action » doit accepter « ${ACTION_JOURNAL_EXPORT} » (migration JEP-362).`,
      },
      { status: 500 },
    );
  }

  const r = await exporterDonneesMembre(admin, { membreId: cibleId, origine: 'admin' });
  if (!r.ok) {
    const { error: retrait } = await db.from('member_moderation_events').delete().eq('id', ligne.id);
    if (retrait) console.error('exporter: ligne de journal non retirée :', retrait.message);
    return NextResponse.json({ erreur: r.erreur }, { status: r.status });
  }

  const genereLe = new Date(r.archive.a_propos.genere_le);
  return new NextResponse(JSON.stringify(r.archive, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomFichierExport(r.slug, genereLe)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
