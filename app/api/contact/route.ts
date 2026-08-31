// Route Handler — enregistrement d'une demande de contact (spec §7).
//
// Ordre imposé par la spécification, respecté ici : honeypot → délai →
// validation → débit → génération de référence → réduction du user-agent →
// INSERT → création du ticket Jira (si `bug`) → notification administrateur
// → réponse.
//
// **L'INSERT est le seul geste qui conditionne le succès.** Rien après lui
// (Jira, notification administrateur) ne peut faire échouer la réponse —
// cf. docs/contact-jira.md §2 : « un échec Jira ou un échec d'e-mail ne fait
// jamais perdre une demande ».
import { NextResponse } from 'next/server';
import { getCurrentUser, getProfile } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import {
  estPiegeRempli,
  premierChampEnErreur,
  reduireUserAgent,
  validerDemande,
  validerPhotos,
  verdictDelaiOuverture,
  type SaisieDemande,
} from '@/lib/contact';
import {
  debitIpDepasse,
  debitMembreDepasse,
  empreinteIp,
  enregistrerDemande,
  enregistrerPhotos,
  marquerJira,
  notifierAdmin,
  verifierOuverture,
} from '@/lib/contact-data';
import { creerTicketJira } from '@/lib/jira';
import { siteUrl } from '@/lib/site-url';

export const maxDuration = 20;

// Alphabet des vraies références (`lib/contact.ts`) exclut le zéro : cette
// valeur ne peut donc jamais coïncider avec une référence réellement écrite
// en base — sûr à renvoyer sans qu'aucune ligne n'existe derrière.
const REFERENCE_FACTICE = 'REF-000000';

function clientIp(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || null;
}

export async function POST(req: Request) {
  // Session « en tant que » en lecture seule : émettre une demande depuis ce
  // contexte l'attribuerait au membre impersonné pour un geste qu'il n'a pas
  // fait. Même repli que /api/import-url et /api/transcribe-photo.
  if (await isReadOnlySession()) {
    return NextResponse.json({ ok: false, erreur: 'Session de consultation.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as (SaisieDemande & {
    website?: unknown;
    formToken?: unknown;
    pageUrl?: unknown;
    appVersion?: unknown;
    photos?: unknown;
  }) | null;
  if (!body) return NextResponse.json({ ok: false }, { status: 400 });

  // 1. Honeypot : rempli → 200 silencieux, rien n'est écrit (spec §5.5.1).
  if (estPiegeRempli(body.website)) {
    return NextResponse.json({ ok: true, reference: REFERENCE_FACTICE });
  }

  // 2. Délai minimum d'ouverture (spec §5.5.2). Trois issues distinctes :
  //    une soumission trop rapide ou un jeton invalide sont des signatures de
  //    robot → 200 silencieux ; un jeton expiré (onglet resté ouvert plus de
  //    24 h) est un cas humain plausible → message franc, pas un silence
  //    trompeur (cf. docs/contact-jira.md).
  const ouvertureMs = verifierOuverture(body.formToken);
  const verdictDelai = verdictDelaiOuverture(ouvertureMs, Date.now());
  if (verdictDelai === 'premature' || verdictDelai === 'invalide') {
    return NextResponse.json({ ok: true, reference: REFERENCE_FACTICE });
  }
  if (verdictDelai === 'expire') {
    return NextResponse.json(
      { ok: false, expire: true, erreur: 'Ce formulaire est resté ouvert trop longtemps. Rechargez la page et réessayez.' },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();

  // 3. Validation (spec §7.4).
  const validation = validerDemande(body, !!user);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, errors: validation.errors, firstErrorField: premierChampEnErreur(validation.errors) },
      { status: 400 },
    );
  }

  // 4. Limitation de débit (spec §5.5.3), comptée en base — cf.
  //    docs/contact-jira.md §8 sur le choix de ne pas répéter le motif en
  //    mémoire de process de `/api/pseudo/verifier`.
  const ip = clientIp(req);
  const ipHash = await empreinteIp(ip);
  if (ipHash && (await debitIpDepasse(ipHash))) {
    return NextResponse.json({ ok: false, retryAfter: 600 }, { status: 429 });
  }
  if (user && (await debitMembreDepasse(user.id))) {
    return NextResponse.json({ ok: false, retryAfter: 86_400 }, { status: 429 });
  }

  // L'adresse d'un membre connecté vient de sa session, jamais du champ
  // envoyé (en lecture seule côté formulaire, mais un appel direct à cette
  // route pourrait y mettre n'importe quoi) — `validerDemande` renvoie déjà
  // `email: null` dans ce cas précisément pour ça. On la stocke quand même
  // (cf. docs/contact-jira.md §2.7) : `user_id` est en `ON DELETE SET NULL`,
  // et répondre à la demande (§10.2) exige une adresse.
  const email = validation.data.email ?? user?.email ?? null;
  const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 2048) : null;
  const browserContext = reduireUserAgent(req.headers.get('user-agent'));
  const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 40) : null;
  // Compressées côté client (lib/images.ts) avant envoi ; une entrée invalide
  // ou trop lourde est silencieusement écartée (validerPhotos), jamais
  // bloquante pour le reste de la demande.
  const photos = validerPhotos(body.photos);

  const resultat = await enregistrerDemande({
    type: validation.data.type,
    email,
    subject: validation.data.subject,
    message: validation.data.message,
    userId: user?.id ?? null,
    pageUrl,
    browserContext,
    appVersion,
    ipHash,
  });

  if (!resultat.ok) return NextResponse.json({ ok: false }, { status: 500 });

  // Pas d'entrée dans `contact_status_history` à la création : les trois
  // origines de cette table (admin, jira-webhook, jira-sync) désignent toutes
  // un acteur qui agit sur une demande existante, pas la création elle-même.
  // Le statut initial `recu` est déjà lisible sur la ligne (`created_at` +
  // `status`) ; l'historique ne s'ouvre qu'au premier changement réel.

  // Photos : restent dans Supabase, ne partent JAMAIS vers Jira — best-effort,
  // après l'INSERT principal, sans jamais conditionner la réponse au
  // demandeur (docs/contact-jira.md).
  await enregistrerPhotos(resultat.id, photos);

  // Création du ticket Jira (spec §8), UNIQUEMENT pour un signalement de bug
  // — `donnees-personnelles` n'y va JAMAIS (garantie doublée par la
  // contrainte SQL `contact_messages_jira_bug_only`, lot 1). Best-effort :
  // un échec est journalisé sur la ligne (`marquerJira`), jamais renvoyé au
  // demandeur, qui a déjà sa confirmation sur la seule foi de l'INSERT.
  let jiraIssueKey: string | null = null;
  if (resultat.type === 'bug') {
    const ticket = await creerTicketJira({
      reference: resultat.reference,
      subject: validation.data.subject,
      message: validation.data.message,
      userId: user?.id ?? null,
      pageUrl,
      browserContext,
      appVersion,
      // Jamais la photo elle-même dans le ticket — seulement un lien vers
      // l'écran où elle est visible, et seulement si une photo existe.
      photoAdminUrl: photos.length > 0 ? `${siteUrl()}/admin/contact/${resultat.reference}` : null,
    });
    await marquerJira(resultat.id, ticket);
    if (ticket.ok) jiraIssueKey = ticket.issueKey;
  }

  // Notification administrateur (spec §10.1) : best-effort, après l'INSERT
  // et l'éventuelle création Jira, sans jamais conditionner la réponse au
  // demandeur.
  const profil = user ? await getProfile(user.id) : null;
  await notifierAdmin(
    {
      id: resultat.id,
      reference: resultat.reference,
      type: resultat.type,
      subject: validation.data.subject,
      message: validation.data.message,
      created_at: new Date().toISOString(),
      page_url: pageUrl,
      browser_context: browserContext,
    },
    { label: profil?.full_name || (user ? 'Membre' : 'Visiteur'), email },
    jiraIssueKey,
  );

  return NextResponse.json({ ok: true, reference: resultat.reference });
}
