// Route Handler — tâche planifiée du moteur de notifications (JEP-278).
//
// Un seul point d'entrée, plusieurs « passes » choisies par `?passe=` pour que
// chaque horaire du workflow `.github/workflows/cron-notifications.yml` ne
// fasse que ce qui le concerne :
//  - `outbox`   (toutes les 15 min) : fait entrer dans le moteur les événements
//                                      posés par les triggers SQL ;
//  - `quotidien` (05:30 UTC)        : rappels de fournée + récapitulatifs
//                                      quotidiens (+ hebdomadaires le lundi) ;
// Sans paramètre : `outbox`, qui joue AUSSI la quotidienne du jour si elle n'a
// pas eu lieu (GitHub saute des créneaux) — voir `quotidienARattraper`.
// Autorisation par `CRON_SECRET`, comme les autres crons.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { envoyerRecapitulatifs, libererQuotidien, reserverQuotidien, viderOutbox } from '@/lib/notification-jobs-data';
import { genererRappels } from '@/lib/notification-rappels-data';
import { dateZurich, quotidienARattraper } from '@/lib/notification-rappels';

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

  // La passe quotidienne est jouée par son horaire (`quotidien`), ou rattrapée
  // par une passe `outbox` quand le créneau de 05:30 UTC a été sauté. Dans les
  // deux cas le jour est réservé : elle ne tourne qu'une fois par jour, sauf
  // demande explicite (`?passe=quotidien`), qui rejoue toujours — rappels et
  // récapitulatifs sont dédoublonnés.
  let rattrapage = false;
  if (passe === 'quotidien') {
    await reserverQuotidien(admin, dateZurich(maintenant));
  } else {
    const jour = quotidienARattraper(maintenant);
    if (!jour || !(await reserverQuotidien(admin, jour))) return NextResponse.json({ ok: true, passe, outbox });
    rattrapage = true;
  }

  try {
    // Les rappels d'abord : ils peuvent eux-mêmes alimenter la file des
    // récapitulatifs, qui part juste après.
    const rappels = await genererRappels(admin, maintenant);
    // Lundi (UTC) : la file hebdomadaire part avec la quotidienne.
    const recap = await envoyerRecapitulatifs(admin, { hebdo: maintenant.getUTCDay() === 1 });
    return NextResponse.json({ ok: true, passe, rattrapage, outbox, rappels, recap });
  } catch (e) {
    // Un échec avant tout envoi ne doit pas condamner le reste de la journée.
    if (rattrapage) await libererQuotidien(admin);
    throw e;
  }
}
