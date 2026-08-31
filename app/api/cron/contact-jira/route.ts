// Route Handler — tâche planifiée quotidienne : réconciliation Jira → suivi
// des demandes (spec §9.3). Filet de sécurité : Jira ne réessaie jamais un
// webhook dont la livraison a échoué, cette passe rattrape ce qui n'a pas
// été délivré.
//
// Seule tâche de ce chantier qui reste PLANIFIÉE — l'e-mail de déploiement,
// lui, part immédiatement au moment de la synchronisation (webhook comme
// réconciliation), cf. docs/contact-jira.md §2.2. Rien ici ne programme
// d'envoi différé.
import { NextResponse } from 'next/server';
import { lireConfigStatuts, rechercherStatutsJira } from '@/lib/jira';
import { getMessagesAvecTicketOuvert, synchroniserStatut } from '@/lib/contact-sync-data';

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ erreur: "CRON_SECRET n'est pas configuré côté serveur." }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  const messages = await getMessagesAvecTicketOuvert();
  if (messages.length === 0) {
    return NextResponse.json({ ok: true, examinees: 0, synchronisees: 0 });
  }

  const resultat = await rechercherStatutsJira(messages.map((m) => m.jira_issue_key));
  if (!resultat.ok) {
    // Échec du côté Jira (panne, authentification) : rien n'est perdu, la
    // tâche du lendemain reprendra depuis le même état — cf. la doctrine du
    // filet de sécurité (spec §9.3).
    console.error('cron/contact-jira: réconciliation impossible :', resultat.error);
    return NextResponse.json({ ok: false, erreur: resultat.error }, { status: 502 });
  }

  const config = lireConfigStatuts();
  let synchronisees = 0;
  for (const message of messages) {
    const statutRecu = resultat.statuts.get(message.jira_issue_key);
    if (!statutRecu) {
      // Ticket introuvable dans la réponse (supprimé côté Jira, ou clé
      // devenue invalide) : signalé, pas bloquant pour le reste du lot.
      console.warn(`cron/contact-jira: ${message.reference} — ticket ${message.jira_issue_key} absent de la réponse Jira.`);
      continue;
    }
    await synchroniserStatut(message, statutRecu, config, 'jira-sync');
    synchronisees++;
  }

  return NextResponse.json({ ok: true, examinees: messages.length, synchronisees });
}
