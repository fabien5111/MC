// Suppression d'un compte et anonymisation (JEP-33) — SERVEUR uniquement, clé
// service_role. Point d'entrée UNIQUE des deux chemins : le membre depuis
// `/reglages` (`POST /api/compte/supprimer`) et l'admin depuis la fiche membre
// (`POST /api/admin/membres/[id]/anonymiser`). Logique pure et doctrine :
// `lib/anonymisation.ts`.
//
// Ordre, pensé pour qu'un échec laisse un état qu'on peut relancer :
// 1. profil fantôme (compte de connexion banni + profil « Membre supprimé ») —
//    rien n'est encore touché : un échec ici s'arrête proprement ;
// 2. journal admin (`member_moderation_events`, sur le fantôme) — sans trace,
//    pas de geste : un refus défait le fantôme ;
// 3. résiliation IMMÉDIATE chez Stripe — un refus défait le fantôme : on ne
//    supprime pas un compte qui continuerait d'être prélevé ;
// 4. ce qui est conservé passe au fantôme (avis, idées, historique de
//    paiement, crédits du mode projet, journaux) ;
// 5. ménage : contact (données personnelles, photos de jp-contact),
//    recettes et leurs photos, puis toutes les tables du membre ;
// 6. compte de connexion d'origine supprimé (GoTrue) — sa cascade emporte le
//    profil, les identités (Google compris) et tout ce qui resterait ;
// 7. e-mail de confirmation à l'ancienne adresse.
//
// Un transfert de l'étape 4 en échec arrête tout avant le ménage. Les étapes 5
// et suivantes, elles, ne s'interrompent pas sur une table en échec :
// chaque échec est journalisé et rendu en avertissement, et la cascade de
// l'étape 6 rattrape ce qui serait resté. Une table absente (migration pas
// jouée) est ignorée sans bruit.
//
// **Une table ajoutée plus tard qui porte une donnée personnelle doit être
// ajoutée ici** (`TABLES_A_VIDER`, ou au bloc des données conservées).
import { randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { createAdminClient } from '@/lib/supabase/admin';
import { appelStripe, MissingStripeConfigError } from '@/lib/billing-data';
import { cleIdempotence } from '@/lib/billing';
import { lireAbonnementModere } from '@/lib/moderation-actions';
import { invaliderBlocage } from '@/lib/moderation-garde';
import { cleDepuisUrlCanonique, supprimerObjet } from '@/lib/storage-data';
import { sendEmailResultat } from '@/lib/email';
import { siteUrl } from '@/lib/site-url';
import {
  ACTION_JOURNAL_ANONYMISATION,
  NOM_MEMBRE_SUPPRIME,
  STATUT_SUPPRIME,
  composerEmailSuppression,
  estProfilSupprime,
  identiteFantome,
  photosDeRecettes,
  remplacerPseudo,
  type OrigineSuppression,
} from '@/lib/anonymisation';

type Admin = ReturnType<typeof createAdminClient>;
type Db = SupabaseClient;
const vers = (client: Admin): Db => client as unknown as Db;
type Erreur = { message: string; code?: string } | null;

/** Table ou colonne absente (migration pas jouée) : rien à faire, pas un échec. */
function absente(e: Erreur): boolean {
  if (!e) return false;
  return (
    e.code === '42P01' ||
    e.code === '42703' ||
    e.code === 'PGRST205' ||
    e.code === 'PGRST204' ||
    /does not exist|Could not find the/i.test(e.message)
  );
}

/** Taille des lots `in(...)` : une URL PostgREST trop longue est refusée (414). */
const LOT = 100;
function enLots<T>(liste: T[], taille = LOT): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) lots.push(liste.slice(i, i + taille));
  return lots;
}

/** Liste de valeurs pour un filtre `in.(…)` dans un `or` PostgREST : chaque valeur entre guillemets. */
const listeOr = (valeurs: string[]) => `(${valeurs.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')})`;

/** Tables vidées de toute ligne du membre (colonne qui le désigne). Ordre indifférent. */
const TABLES_A_VIDER: [table: string, colonne: string][] = [
  ['batches', 'user_id'],
  ['shopping_lists', 'user_id'],
  ['shopping_items', 'user_id'],
  ['favorites', 'user_id'],
  ['follows', 'follower_id'],
  ['follows', 'following_id'],
  ['recipe_shares', 'owner_id'],
  ['recipe_shares', 'shared_with_id'],
  ['book_shares', 'owner_id'],
  ['book_shares', 'shared_with_id'],
  ['idea_votes', 'user_id'],
  ['imports', 'user_id'],
  ['notifications', 'user_id'],
  ['notification_preferences', 'user_id'],
  ['notification_outbox', 'recipient_id'],
  ['email_digest_queue', 'user_id'],
  ['notification_dedupe', 'user_id'],
  ['push_subscriptions', 'user_id'],
  ['recipe_lists', 'owner_id'],
  ['help_dismissals', 'user_id'],
  ['visit_sessions', 'user_id'],
  ['ad_events', 'user_id'],
  ['ai_usage', 'user_id'],
  ['usage_counters', 'user_id'],
  ['recipe_scale_costs', 'user_id'],
  ['planning', 'user_id'],
  ['executions_legacy', 'user_id'],
];

/** Données conservées, rattachées au fantôme (colonne → valeurs écrites en plus). */
const TABLES_TRANSFEREES: [table: string, colonne: string, extra: Record<string, unknown>][] = [
  ['subscriptions', 'user_id', {}],
  ['billing_customers', 'user_id', {}],
  ['notifications_sent', 'user_id', {}],
  ['subscription_requests', 'user_id', {}],
  ['member_moderation_events', 'member_id', {}],
  ['recipe_project_components', 'source_author_id', { source_author_name: NOM_MEMBRE_SUPPRIME }],
  ['impersonation_sessions', 'target_user_id', { target_email: null, target_name: NOM_MEMBRE_SUPPRIME }],
  ['articles', 'author_id', { author_name: NOM_MEMBRE_SUPPRIME }],
];

export type ResultatAnonymisation =
  | { ok: true; fantomeId: string; abonnementResilie: boolean; emailEnvoye: boolean; avertissements: string[] }
  | { ok: false; erreur: string; status: number };

type ProfilCible = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  status: string | null;
  role: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  cover_url: string | null;
};

export async function lireProfilCible(admin: Admin, membreId: string): Promise<ProfilCible | null> {
  const { data } = await vers(admin)
    .from('profiles')
    .select('id, full_name, username, email, status, role, avatar_url, banner_url, cover_url')
    .eq('id', membreId)
    .maybeSingle();
  return (data as ProfilCible | null) ?? null;
}

type SubscriptionStripe = { status?: string; schedule?: unknown };

/**
 * Résiliation IMMÉDIATE (et non à l'échéance, comme la résiliation en
 * libre-service) : le compte disparaît, rien ne doit plus être prélevé. Un
 * abonnement porté par un échéancier se résilie par l'échéancier (Stripe
 * refuse de toucher l'abonnement directement). Aucun remboursement
 * automatique : geste manuel du Dashboard, comme ailleurs. La table
 * `subscriptions` est alignée par le webhook (`customer.subscription.deleted`).
 */
async function resilierImmediatement(subscriptionId: string, membreId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const lu = await appelStripe<SubscriptionStripe>(`/subscriptions/${subscriptionId}`);
    if (!lu.ok) return lu.status === 404 ? { ok: true } : { ok: false, message: lu.message };
    if (lu.data.status === 'canceled' || lu.data.status === 'incomplete_expired') return { ok: true };
    const schedule =
      typeof lu.data.schedule === 'string'
        ? lu.data.schedule
        : ((lu.data.schedule as { id?: unknown } | null)?.id as string | undefined) ?? null;
    const r = schedule
      ? await appelStripe<unknown>(`/subscription_schedules/${schedule}/cancel`, {
          idempotencyKey: cleIdempotence('suppression-compte-echeancier', membreId, schedule),
          corps: {},
        })
      : await appelStripe<unknown>(`/subscriptions/${subscriptionId}`, { methode: 'DELETE' });
    return r.ok ? { ok: true } : { ok: false, message: r.message };
  } catch (e) {
    if (e instanceof MissingStripeConfigError) return { ok: false, message: e.message };
    throw e;
  }
}

/** État de l'abonnement à annoncer avant confirmation : y a-t-il quelque chose à résilier ? */
export async function abonnementAResilier(admin: Admin, membreId: string): Promise<{ libelle: string; stripe: boolean } | null> {
  const { etat } = await lireAbonnementModere(admin, membreId);
  return etat ? { libelle: etat.libelle, stripe: etat.stripe } : null;
}

/** Supprime une liste d'URL d'un conteneur ; renvoie le nombre d'échecs. */
async function supprimerPhotos(conteneur: 'photos' | 'contact', urls: string[]): Promise<number> {
  let echecs = 0;
  for (const url of urls) {
    const cle = cleDepuisUrlCanonique(conteneur, url);
    if (!cle) continue; // data-URL ou valeur imprévue : partie avec la ligne.
    if (!(await supprimerObjet(conteneur, cle))) echecs++;
  }
  return echecs;
}

export async function anonymiserMembre(
  client: Admin,
  p: { membreId: string; origine: OrigineSuppression; adminId?: string | null; motif?: string | null },
): Promise<ResultatAnonymisation> {
  const db = vers(client);
  const avertissements: string[] = [];
  const noter = (quoi: string, e: Erreur) => {
    if (!e || absente(e)) return;
    console.error(`anonymisation (${quoi}):`, e.message);
    avertissements.push(`${quoi} : ${e.message}`);
  };

  const profil = await lireProfilCible(client, p.membreId);
  if (!profil) return { ok: false, erreur: 'Membre introuvable.', status: 404 };
  if (estProfilSupprime(profil.status)) return { ok: false, erreur: 'Ce compte a déjà été supprimé.', status: 409 };
  // L'adresse de connexion fait foi (profiles.email peut être en retard).
  const { data: compte } = await client.auth.admin.getUserById(p.membreId);
  const emailOrigine = compte?.user?.email ?? profil.email ?? null;
  const variantesEmail = emailOrigine ? [...new Set([emailOrigine, emailOrigine.toLowerCase()])] : [];
  const etaitDesactive = profil.status === 'disabled';

  // ── 1. Fantôme ───────────────────────────────────────────
  const identite = identiteFantome(randomUUID());
  const cree = await client.auth.admin.createUser({
    email: identite.email,
    password: randomBytes(32).toString('hex'),
    email_confirm: true,
    ban_duration: '876000h',
    user_metadata: { full_name: NOM_MEMBRE_SUPPRIME },
  });
  if (cree.error || !cree.data.user) {
    return { ok: false, erreur: `Création du profil anonyme impossible : ${cree.error?.message ?? 'réponse vide'}`, status: 502 };
  }
  const fantomeId = cree.data.user.id;
  const defaireFantome = async () => {
    const { error } = await client.auth.admin.deleteUser(fantomeId);
    if (error) console.error('anonymisation (fantôme non défait):', error.message);
    await db.from('profiles').delete().eq('id', fantomeId);
  };

  // `handle_new_user` a pu créer la ligne : upsert, jamais insert.
  const { error: ecritureFantome } = await db.from('profiles').upsert(
    {
      id: fantomeId,
      full_name: NOM_MEMBRE_SUPPRIME,
      username: identite.slug,
      email: null,
      status: STATUT_SUPPRIME,
      // `role` est NOT NULL : on le laisse au défaut de la colonne (membre ordinaire).
      bio: null,
      avatar_url: null,
      banner_url: null,
      cover_url: null,
    },
    { onConflict: 'id' },
  );
  if (ecritureFantome) {
    await defaireFantome();
    return {
      ok: false,
      erreur:
        `Profil anonyme non enregistré : ${ecritureFantome.message}. ` +
        `Si une contrainte refuse le statut « ${STATUT_SUPPRIME} », la migration JEP-33 doit être jouée d'abord.`,
      status: 500,
    };
  }

  // ── 2. Journal (admin) ───────────────────────────────────
  if (p.origine === 'admin') {
    const { error } = await db.from('member_moderation_events').insert({
      member_id: fantomeId,
      admin_id: p.adminId ?? null,
      action: ACTION_JOURNAL_ANONYMISATION,
      reason: p.motif ?? null,
    });
    if (error) {
      await defaireFantome();
      return {
        ok: false,
        erreur:
          `Journal non écrit : ${error.message}. Sans trace, l'anonymisation n'est pas lancée ` +
          `(la contrainte de « action » doit accepter « ${ACTION_JOURNAL_ANONYMISATION} »).`,
        status: 500,
      };
    }
  }

  // ── 3. Abonnement ────────────────────────────────────────
  const { subscriptionId } = await lireAbonnementModere(client, p.membreId);
  let abonnementResilie = false;
  if (subscriptionId) {
    const r = await resilierImmediatement(subscriptionId, p.membreId);
    if (!r.ok) {
      await defaireFantome();
      return {
        ok: false,
        erreur: `Résiliation de l'abonnement refusée par Stripe : ${r.message}. Rien n'a été supprimé.`,
        status: 502,
      };
    }
    abonnementResilie = true;
  }

  // ── 4. Conservé, rattaché au fantôme ─────────────────────
  if (etaitDesactive) {
    // Avis et idées d'un compte désactivé étaient masqués : ils ne
    // réapparaissent pas sous « Membre supprimé ».
    noter('avis', (await db.from('comments').delete().eq('user_id', p.membreId)).error);
    noter('idées', (await db.from('ideas').delete().eq('author_id', p.membreId)).error);
  } else {
    // `batch_id` vise une fournée du membre, qui va disparaître.
    noter('avis', (await db.from('comments').update({ user_id: fantomeId, batch_id: null }).eq('user_id', p.membreId)).error);
    noter('idées', (await db.from('ideas').update({ author_id: fantomeId }).eq('author_id', p.membreId)).error);
  }
  for (const [table, colonne, extra] of TABLES_TRANSFEREES) {
    noter(table, (await db.from(table).update({ [colonne]: fantomeId, ...extra }).eq(colonne, p.membreId)).error);
  }
  // Essais : l'empreinte de l'adresse est une donnée personnelle.
  noter(
    'trials',
    (await db.from('trials').update({ user_id: fantomeId, email_hash: `supprime:${randomUUID()}` }).eq('user_id', p.membreId)).error,
  );

  // Un transfert en échec ne doit pas finir dans la cascade de l'étape 6 (avis
  // ou historique de paiement perdus) : on s'arrête AVANT tout ménage. Ce qui
  // est déjà passé au fantôme y reste ; relancer achève l'opération (un second
  // fantôme reprend le reste).
  if (avertissements.length > 0) {
    return {
      ok: false,
      erreur: `Transfert des données conservées incomplet, rien n'a été supprimé : ${avertissements.join(' ; ')}`,
      status: 500,
    };
  }

  // Notifications déjà délivrées à d'autres membres qui nomment le membre
  // (« Alice a mis votre recette en favori ») : repérées par son adresse
  // publique, réécrites sans son pseudo.
  if (profil.username) {
    const { data: notifs, error } = await db
      .from('notifications')
      .select('id, title, body, data, link')
      .eq('data->>acteurHandle', profil.username)
      .limit(1000);
    noter('notifications des autres', error);
    const pseudo = profil.full_name ?? '';
    for (const n of (notifs ?? []) as { id: string; title: string | null; body: string | null; data: Record<string, unknown> | null; link: string | null }[]) {
      const donnees = { ...(n.data ?? {}), acteur: NOM_MEMBRE_SUPPRIME, acteurHandle: null };
      // Le lien « voir son profil » mènerait à une adresse qui n'existe plus.
      const lien = n.link === `/u/${profil.username}` ? '/notifications' : n.link;
      noter(
        'notifications des autres',
        (
          await db
            .from('notifications')
            .update({ title: remplacerPseudo(n.title, pseudo), body: remplacerPseudo(n.body, pseudo), data: donnees, link: lien })
            .eq('id', n.id)
        ).error,
      );
    }
  }
  // File d'envoi : les événements encore à notifier dont il est l'acteur
  // partiraient avec son pseudo.
  noter('file de notifications', (await db.from('notification_outbox').delete().eq('actor_id', p.membreId).is('processed_at', null)).error);
  noter('file de notifications', (await db.from('notification_outbox').update({ actor_id: null }).eq('actor_id', p.membreId)).error);

  // ── 5a. Contact ──────────────────────────────────────────
  const filtreContact = emailOrigine
    ? `user_id.eq.${p.membreId},email.in.${listeOr(variantesEmail)}`
    : `user_id.eq.${p.membreId}`;
  const { data: demandes, error: lectureContact } = await db
    .from('contact_messages')
    .select('id, jira_issue_key')
    .or(filtreContact);
  noter('demandes de contact', lectureContact);
  const lignesDemandes = (demandes ?? []) as { id: string; jira_issue_key: string | null }[];
  if (lignesDemandes.length > 0) {
    const ids = lignesDemandes.map((d) => d.id);
    const { data: reponses } = await db.from('contact_replies').select('id').in('message_id', ids);
    const idsReponses = ((reponses ?? []) as { id: string }[]).map((r) => r.id);
    const { data: photosDemandes } = await db.from('contact_message_photos').select('url').in('message_id', ids);
    const { data: photosReponses } = idsReponses.length
      ? await db.from('contact_reply_photos').select('url').in('reply_id', idsReponses)
      : { data: [] };
    const urls = [...((photosDemandes ?? []) as { url: string }[]), ...((photosReponses ?? []) as { url: string }[])].map((x) => x.url);
    const echecs = await supprimerPhotos('contact', urls);
    if (echecs) avertissements.push(`jp-contact : ${echecs} photo(s) non supprimée(s)`);
    noter('photos de contact', (await db.from('contact_message_photos').delete().in('message_id', ids)).error);
    if (idsReponses.length) noter('photos de contact', (await db.from('contact_reply_photos').delete().in('reply_id', idsReponses)).error);

    // Sans ticket Jira : la demande part entière. Avec ticket (déjà
    // pseudonymisé) : la ligne reste, débarrassée de l'identité.
    const sansTicket = lignesDemandes.filter((d) => !d.jira_issue_key).map((d) => d.id);
    const avecTicket = lignesDemandes.filter((d) => d.jira_issue_key).map((d) => d.id);
    if (sansTicket.length) noter('demandes de contact', (await db.from('contact_messages').delete().in('id', sansTicket)).error);
    if (avecTicket.length) {
      noter(
        'demandes de contact',
        (
          await db
            .from('contact_messages')
            .update({ email: null, ip_hash: null, user_id: null, browser_context: null, deploy_notify: false })
            .in('id', avecTicket)
        ).error,
      );
    }
  }
  noter('réponses de contact', (await db.from('contact_replies').update({ author_id: null }).eq('author_id', p.membreId)).error);
  noter('historique de contact', (await db.from('contact_status_history').update({ author_id: null }).eq('author_id', p.membreId)).error);

  // ── 5b. Recettes et leurs photos ─────────────────────────
  const { data: recettes, error: lectureRecettes } = await db
    .from('recipes')
    .select('id, hero_image_url, hero_image_original_url, hero_thumb_url, hero_card_url')
    .eq('author_id', p.membreId);
  noter('recettes', lectureRecettes);
  const lignesRecettes = (recettes ?? []) as { id: string; hero_image_url: string | null; hero_image_original_url: string | null; hero_thumb_url: string | null; hero_card_url: string | null }[];
  if (lignesRecettes.length > 0) {
    const idsRecettes = lignesRecettes.map((r) => r.id);
    const photosEtapes: { url: string | null; original_url: string | null }[] = [];
    for (const lot of enLots(idsRecettes)) {
      const { data: etapes } = await db.from('recipe_steps').select('id').in('recipe_id', lot);
      const idsEtapes = ((etapes ?? []) as { id: string }[]).map((e) => e.id);
      for (const lotEtapes of enLots(idsEtapes)) {
        const { data } = await db.from('step_photos').select('url, original_url').in('step_id', lotEtapes);
        photosEtapes.push(...((data ?? []) as { url: string | null; original_url: string | null }[]));
      }
    }
    const urls = photosDeRecettes(lignesRecettes, photosEtapes);
    for (const lot of enLots(idsRecettes)) noter('recettes', (await db.from('recipes').delete().in('id', lot)).error);

    // Une photo encore citée ailleurs (duplicata, extraction d'étapes : copies
    // par URL) reste sur le stockage.
    const encoreCitees = new Set<string>();
    // Lots courts : chaque URL figure six fois dans la requête (414 au-delà).
    for (const lot of enLots(urls, 10)) {
      const l = listeOr(lot);
      const [etapes, entetes] = await Promise.all([
        db.from('step_photos').select('url, original_url').or(`url.in.${l},original_url.in.${l}`),
        db
          .from('recipes')
          .select('hero_image_url, hero_image_original_url, hero_thumb_url, hero_card_url')
          .or(['hero_image_url', 'hero_image_original_url', 'hero_thumb_url', 'hero_card_url'].map((c) => `${c}.in.${l}`).join(',')),
      ]);
      if (etapes.error || entetes.error) {
        // Doute : on garde tout le lot plutôt que de casser la copie d'un autre.
        lot.forEach((u) => encoreCitees.add(u));
        continue;
      }
      for (const l of [...(etapes.data ?? []), ...(entetes.data ?? [])] as Record<string, string | null>[]) {
        Object.values(l).forEach((v) => v && encoreCitees.add(v));
      }
    }
    const echecs = await supprimerPhotos('photos', urls.filter((u) => !encoreCitees.has(u)));
    if (echecs) avertissements.push(`jp-photos : ${echecs} photo(s) de recette non supprimée(s)`);
  }

  // ── 5c. Tout le reste du membre ──────────────────────────
  for (const [table, colonne] of TABLES_A_VIDER) {
    noter(table, (await db.from(table).delete().eq(colonne, p.membreId)).error);
  }
  // Jamais `ilike` : « _ » y est un joker, une autre adresse pourrait tomber.
  if (emailOrigine) noter('allowlist', (await db.from('allowlist').delete().in('email', variantesEmail)).error);
  const echecsProfil = await supprimerPhotos('photos', [profil.avatar_url, profil.banner_url, profil.cover_url].filter((u): u is string => !!u));
  if (echecsProfil) avertissements.push(`jp-photos : ${echecsProfil} image(s) de profil non supprimée(s)`);

  // ── 6. Compte de connexion d'origine ─────────────────────
  const { error: suppression } = await client.auth.admin.deleteUser(p.membreId);
  if (suppression && suppression.status !== 404) {
    return {
      ok: false,
      erreur:
        `Contenu supprimé, mais le compte de connexion n'a pas pu l'être : ${suppression.message}. ` +
        'Relancer la suppression achève l’opération.',
      status: 502,
    };
  }
  noter('profil', (await db.from('profiles').delete().eq('id', p.membreId)).error);
  invaliderBlocage(p.membreId);

  // ── 7. E-mail de confirmation ────────────────────────────
  let emailEnvoye = false;
  if (emailOrigine) {
    const mail = composerEmailSuppression({ origine: p.origine, motif: p.motif, abonnementResilie, urlSite: siteUrl() });
    const r = await sendEmailResultat({
      to: emailOrigine,
      subject: mail.sujet,
      text: mail.texte,
      pied: 'obligatoire',
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });
    emailEnvoye = r.ok;
  }

  return { ok: true, fantomeId, abonnementResilie, emailEnvoye, avertissements };
}
