// Route Handler — webhook système Jira (spec §9.2), déclenché sur
// `Issue: updated`. Doit répondre en moins de 3 secondes (spec §9.2.9) : le
// traitement reste local à une seule demande, aucun appel réseau sortant
// hormis l'e-mail de déploiement, best-effort et rapide (SES, région
// Francfort).
//
// **Vérification de signature sur le corps BRUT**, avant tout `JSON.parse` —
// Jira signe les octets envoyés, pas le JSON reparsé (qui peut réordonner
// les clés). C'est pourquoi cette route lit `req.text()` et non `req.json()`.
import { NextResponse } from 'next/server';
import { verifierSignatureWebhook, lireConfigStatuts } from '@/lib/jira';
import { getMessageByIssueKey, synchroniserStatut } from '@/lib/contact-sync-data';

export const maxDuration = 15;

type PayloadWebhook = {
  issue?: {
    key?: unknown;
    fields?: {
      status?: {
        id?: unknown;
        name?: unknown;
        statusCategory?: { key?: unknown };
      };
    };
  };
};

export async function POST(req: Request) {
  const secret = process.env.JIRA_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ erreur: "JIRA_WEBHOOK_SECRET n'est pas configurée." }, { status: 503 });
  }

  // Lu comme TEXTE, jamais `req.json()` en premier : la signature porte sur
  // les octets exacts envoyés par Jira.
  const corpsBrut = await req.text();
  const signature = req.headers.get('x-hub-signature');
  if (!verifierSignatureWebhook(corpsBrut, signature, secret)) {
    return NextResponse.json({ erreur: 'Signature invalide.' }, { status: 401 });
  }

  let payload: PayloadWebhook;
  try {
    payload = JSON.parse(corpsBrut);
  } catch {
    // Signature valide mais JSON illisible : ne devrait jamais arriver
    // (Jira signe ce qu'il envoie), mais un `200` silencieux reste la bonne
    // réponse — rien à traiter, rien à répéter.
    return NextResponse.json({ ok: true });
  }

  const issueKey = payload.issue?.key;
  const statusName = payload.issue?.fields?.status?.name;
  const statusId = payload.issue?.fields?.status?.id;
  const categoryKey = payload.issue?.fields?.status?.statusCategory?.key;
  if (typeof issueKey !== 'string' || typeof statusName !== 'string' || typeof categoryKey !== 'string') {
    // Événement sans les champs attendus (webhook mal configuré, ou type
    // d'événement inattendu malgré le filtre JQL côté Jira) : rien à faire.
    return NextResponse.json({ ok: true });
  }

  const message = await getMessageByIssueKey(issueKey);
  if (!message) {
    // Ticket qui ne correspond à aucune demande connue (spec §9.2.3) — 200
    // silencieux, sans effet de bord.
    return NextResponse.json({ ok: true });
  }

  await synchroniserStatut(
    message,
    { id: typeof statusId === 'string' ? statusId : null, nom: statusName, categorie: categoryKey },
    lireConfigStatuts(),
    'jira-webhook',
  );

  return NextResponse.json({ ok: true });
}
