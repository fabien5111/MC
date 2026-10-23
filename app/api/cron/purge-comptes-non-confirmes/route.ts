// Route Handler — tâche planifiée quotidienne : purge des comptes jamais
// confirmés (JEP-262, lot 4). Protégée par `CRON_SECRET`, comme les autres.
//
// **Rapport seul par défaut.** Sans `?appliquer=1`, la route ne supprime rien :
// elle liste les comptes qui le seraient (adresses masquées, identifiants
// abrégés — le rapport part dans les journaux GitHub Actions). C'est le
// workflow qui ajoute `appliquer=1`, et seulement quand la variable de dépôt
// `PURGE_COMPTES_ACTIVE` vaut `true` (même doctrine que `DEPLOIEMENT_ACTIF`).
// Le seuil est `UNCONFIRMED_ACCOUNT_TTL_DAYS` (défaut 30, plancher 7), au plus
// 20 suppressions par passage. Détail des critères : `lib/purge-comptes.ts`.
import { NextResponse } from 'next/server';
import { executerPurge } from '@/lib/purge-comptes-data';
import { MissingServiceKeyError } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ erreur: "CRON_SECRET n'est pas configuré côté serveur." }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  const appliquer = new URL(req.url).searchParams.get('appliquer') === '1';
  try {
    const rapport = await executerPurge(appliquer);
    console.log(
      `cron/purge-comptes: ${rapport.mode}, ${rapport.examines} examiné(s), ${rapport.candidats.length} candidat(s), ${rapport.supprimes} supprimé(s).`,
    );
    return NextResponse.json({ ok: true, ...rapport });
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    // Dans le doute on ne supprime rien : la passe du lendemain reprend du même état.
    console.error('cron/purge-comptes: passe interrompue :', (e as Error).message);
    return NextResponse.json({ ok: false, erreur: (e as Error).message }, { status: 502 });
  }
}
