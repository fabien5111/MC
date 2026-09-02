// Route Handler — « Resynchroniser maintenant » (spec §11.3), pour ne pas
// attendre la réconciliation quotidienne. Réservé à l'admin complet.
//
// Reprend le chemin du webhook/de la réconciliation (`synchroniserStatut`),
// avec `forcer: true` (lot 12) : contourne UNIQUEMENT `memeStatutJira`, une
// optimisation pour l'automatique qui n'a pas lieu d'être sur un clic
// explicite — sans elle, une demande dont le `jira_status` stocké est déjà
// celui reçu (parce qu'une synchronisation antérieure buguée l'a écrit sans
// appliquer le bon statut de demande — cf. docs/contact-jira.md §13.9-13.10)
// resterait bloquée pour toujours, le bouton devenant inopérant. La
// protection d'une clôture manuelle (`jiraPeutEcraser`), elle, reste
// entière : un geste manuel ne doit jamais la contourner.
import { NextResponse } from 'next/server';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { withContactSchema } from '@/lib/contact-types';
import { createAdminClient } from '@/lib/supabase/admin';
import { lireConfigStatuts, rechercherStatutsJira } from '@/lib/jira';
import { synchroniserStatut, type MessageSync } from '@/lib/contact-sync-data';
import { MissingServiceKeyError } from '@/lib/supabase/admin';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });

  const { id } = await params;

  try {
    const client = withContactSchema(createAdminClient());
    const { data: message } = await client
      .from('contact_messages')
      .select(
        'id, reference, subject, type, email, user_id, status, status_source, jira_status, jira_status_id, deploy_notify, deploy_email_status, jira_issue_key',
      )
      .eq('id', id)
      .maybeSingle();
    if (!message?.jira_issue_key) {
      return NextResponse.json({ erreur: 'Aucun ticket Jira associé à cette demande.' }, { status: 400 });
    }

    const resultat = await rechercherStatutsJira([message.jira_issue_key]);
    if (!resultat.ok) return NextResponse.json({ erreur: resultat.error }, { status: 502 });

    const statutRecu = resultat.statuts.get(message.jira_issue_key);
    if (!statutRecu) return NextResponse.json({ erreur: 'Ticket introuvable côté Jira.' }, { status: 404 });

    await synchroniserStatut(message as MessageSync, statutRecu, lireConfigStatuts(), 'jira-sync', true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }
}
