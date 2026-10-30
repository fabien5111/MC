// Route Handler — « Télécharger mes données » depuis `/reglages` (RGPD,
// art. 15 et 20 — JEP-362, lot 2). Même archive que l'export de l'admin
// (`exporterDonneesMembre`), sur le seul compte connecté.
//
// Gardes :
// - vérification forte de la session (`getVerifiedUser`) : toutes les données
//   d'un compte ne sortent pas sur la foi d'un jeton peut-être révoqué ;
// - refusée en session « en tant que », QUEL QUE SOIT son mode : un admin
//   connecté à la place d'un membre exporte depuis la fiche, où le geste est
//   tracé à son nom ;
// - un export par 24 heures, compté dans le journal (`member_moderation_events`,
//   action `export_donnees`, `admin_id` nul) : la ligne est posée AVANT la
//   lecture (un second clic la trouve) et retirée si l'export échoue. Journal
//   illisible = export refusé. Les exports de l'admin ne comptent pas.
//
// Volontairement SANS `refusSiCompteBloque` : un membre suspendu ou désactivé
// garde son droit d'accès (RGPD, art. 15), comme son droit à l'effacement.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getVerifiedUser } from '@/lib/auth';
import { getImpersonationContext } from '@/lib/impersonation';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { exporterDonneesMembre } from '@/lib/export-donnees-data';
import { ACTION_JOURNAL_EXPORT, MOTIF_EXPORT_MEMBRE, exportAutorise, nomFichierExport } from '@/lib/export-donnees';

export async function POST() {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
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
  const db = admin as unknown as SupabaseClient;

  const { data: derniere, error: lecture } = await db
    .from('member_moderation_events')
    .select('created_at')
    .eq('member_id', user.id)
    .eq('action', ACTION_JOURNAL_EXPORT)
    .is('admin_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lecture) {
    console.error('compte/exporter: journal illisible :', lecture.message);
    return NextResponse.json({ erreur: 'Export momentanément indisponible. Réessayez plus tard.' }, { status: 500 });
  }
  const verdict = exportAutorise((derniere as { created_at: string } | null)?.created_at ?? null);
  if (!verdict.ok) {
    return NextResponse.json(
      { erreur: `Vous avez déjà téléchargé vos données aujourd’hui. Prochain export possible le ${verdict.prochainLe.toLocaleString('fr-FR', { timeZone: 'Europe/Zurich', dateStyle: 'long', timeStyle: 'short' })}.` },
      { status: 429 },
    );
  }

  const { data: ligne, error: journal } = await db
    .from('member_moderation_events')
    .insert({ member_id: user.id, admin_id: null, action: ACTION_JOURNAL_EXPORT, reason: MOTIF_EXPORT_MEMBRE })
    .select('id')
    .single();
  if (journal || !ligne) {
    console.error('compte/exporter: journal non écrit :', journal?.message);
    return NextResponse.json({ erreur: 'Export momentanément indisponible. Réessayez plus tard.' }, { status: 500 });
  }

  const r = await exporterDonneesMembre(admin, { membreId: user.id, origine: 'membre' });
  if (!r.ok) {
    const { error: retrait } = await db.from('member_moderation_events').delete().eq('id', ligne.id);
    if (retrait) console.error('compte/exporter: ligne de journal non retirée :', retrait.message);
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
