// Route Handler — tâche planifiée du moteur de notifications (JEP-278).
//
// Un seul point d'entrée, plusieurs « passes » choisies par `?passe=` pour que
// chaque horaire du workflow `.github/workflows/cron-notifications.yml` ne
// fasse que ce qui le concerne :
//  - `outbox`   (toutes les 15 min) : fait entrer dans le moteur les événements
//                                      posés par les triggers SQL ;
//  - `quotidien` (05:30 UTC)        : rappels de fournée + récapitulatifs
//                                      quotidiens (+ hebdomadaires le lundi) ;
// Sans paramètre : `outbox` seule. Autorisation par `CRON_SECRET`, comme les
// autres crons.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { envoyerRecapitulatifs, viderOutbox } from '@/lib/notification-jobs-data';

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ erreur: "CRON_SECRET n'est pas configuré côté serveur." }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  const passe = new URL(req.url).searchParams.get('passe') ?? 'outbox';
  const admin = createAdminClient();
  const maintenant = new Date();

  const outbox = await viderOutbox(admin);
  if (passe !== 'quotidien') return NextResponse.json({ ok: true, passe, outbox });

  // Lundi (UTC) : la file hebdomadaire part avec la quotidienne.
  const recap = await envoyerRecapitulatifs(admin, { hebdo: maintenant.getUTCDay() === 1 });
  return NextResponse.json({ ok: true, passe, outbox, recap });
}
