// Moteur unique de notification (JEP-278) — SERVEUR UNIQUEMENT, client
// service_role. C'est le seul endroit qui décide où va un événement : cloche,
// e-mail immédiat, ou récapitulatif. Aucun module ne doit plus appeler
// `createNotification` + `sendEmailBestEffort` de son côté.
//
// Les tables du moteur (`notification_preferences`, `notification_outbox`,
// `email_digest_queue`, `email_quota`) ne figurent pas dans
// `lib/database.types.ts` tant que la migration n'est pas jouée puis les types
// régénérés : accès non typé, même motif que `lib/notifications-data.ts`.
//
// **Ce que `notifier` garantit** :
//  - jamais d'auto-notification (l'acteur n'est pas le destinataire) ;
//  - un événement verrouillé part toujours (cloche + e-mail), quoi que le
//    membre ait réglé ;
//  - un e-mail refusé ne part jamais ;
//  - best-effort : ne lève jamais — une notification manquée ne doit pas
//    faire échouer le traitement qui l'a provoquée (cron, webhook).
//
// **Ce qu'il ne fait pas** : savoir si la session appelante est en lecture
// seule (« en tant que »). Les événements nés d'une écriture navigateur passent
// par les triggers SQL → `notification_outbox`, et la RLS refuse l'écriture en
// lecture seule avant même que le trigger ne parte. Un appelant serveur qui
// agit pour le compte d'une session doit tester `isReadOnlySession()` lui-même.
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmailResultat } from '@/lib/email';
import { envoyerPush } from '@/lib/push-data';
import { composerMessagePush } from '@/lib/push';
import { membreBloque } from '@/lib/moderation-lecture';
import { siteUrl } from '@/lib/site-url';
import {
  CHEMIN_PREFERENCES,
  composerEmailNotification,
  enTetesDesinscription,
} from '@/lib/notification-email';
import {
  cleDeGroupe,
  composerNotification,
  decisionCanaux,
  definitionEvenement,
  lienNotification,
  pushEffectif,
  RYTHME_DEPUIS_BASE,
  RYTHME_VERS_BASE,
  type Categorie,
  type DonneesEvenement,
  type PreferencesMembre,
} from '@/lib/notification-events';

/** Plafond Brevo (plan gratuit) : 300 e-mails par jour. */
export const QUOTA_JOURNALIER = 300;
/** Part du quota gardée aux e-mails verrouillés : les autres s'arrêtent avant. */
export const RESERVE_VERROUILLES = 40;

// Client non typé : les tables du moteur n'existent pas encore dans les types générés.
type Db = SupabaseClient;
const vers = (admin: unknown): Db => admin as Db;

export type ResultatNotifier = {
  /** Notification écrite dans la cloche (ou regroupée dans une existante). */
  cloche: 'ecrite' | 'regroupee' | 'aucune';
  email: 'envoye' | 'file' | 'aucun' | 'echec';
  /** Message de l'échec SMTP, quand `email` vaut `echec` (tracé par l'appelant, JEP-277). */
  emailErreur?: string;
  /** Nombre d'appareils atteints par la notification push (0 si aucun ou canal coupé). */
  push?: number;
  /** Pourquoi rien n'est parti, le cas échéant. */
  raison?: 'inconnu' | 'auto' | 'doublon' | 'bloque';
};

export type ParamsNotifier = {
  userId: string;
  evenement: string;
  /** Membre à l'origine de l'événement — jamais notifié de sa propre action. */
  acteurId?: string | null;
  donnees?: DonneesEvenement;
  /** Unicité par membre : un second appel avec la même clé ne produit rien. */
  cleDedoublonnage?: string;
  /**
   * E-mail déjà composé par l'appelant (abonnement, contact, Stripe) : son
   * texte part à l'identique, dans le gabarit unique (JEP-277) — `html` n'est
   * que le corps, sans signature ni pied.
   */
  emailPrecompose?: { sujet: string; html?: string; texte: string; replyTo?: string };
  /**
   * La cloche seulement : l'e-mail de ce flux est déjà envoyé par l'appelant,
   * qui en suit l'état (ex. `contact_messages.deploy_email_status`, dont
   * l'idempotence repose sur une réservation en base). Le moteur ne le double pas.
   */
  sansEmail?: boolean;
  /**
   * L'e-mail seulement, ni cloche ni push : nouvel essai d'un e-mail dont
   * l'envoi a échoué alors que la cloche, elle, est déjà écrite (cron
   * d'abonnements, JEP-277). Sans lui, chaque nouvel essai doublerait la cloche.
   */
  sansCloche?: boolean;
  /**
   * Un e-mail « immédiat » rejoint la file du récapitulatif quotidien au lieu
   * de partir seul (JEP-375) : la passe quotidienne génère ses rappels puis
   * envoie aussitôt les récapitulatifs — le membre reçoit UN e-mail, en
   * sections, au lieu d'un par rappel.
   */
  regrouperEmail?: boolean;
};

type LignePrefs = { category: Categorie; in_app: boolean; email: boolean; rhythm: string; push?: boolean | null };

export async function lirePreferences(admin: unknown, userId: string): Promise<PreferencesMembre> {
  const table = () => vers(admin).from('notification_preferences');
  // `push` lue si la colonne existe ; sinon on relit sans elle plutôt que de
  // perdre TOUTES les préférences (un e-mail refusé repartirait).
  const avecPush = await table().select('category, in_app, email, rhythm, push').eq('user_id', userId);
  const lignes = avecPush.error
    ? (await table().select('category, in_app, email, rhythm').eq('user_id', userId)).data
    : avecPush.data;
  const prefs: PreferencesMembre = {};
  for (const l of (lignes ?? []) as LignePrefs[]) {
    prefs[l.category] = {
      site: l.in_app,
      email: l.email,
      rythme: RYTHME_DEPUIS_BASE[l.rhythm] ?? 'immediat',
      push: l.push ?? null,
    };
  }
  return prefs;
}

/**
 * Réserve un envoi dans le quota du jour — atomique côté base (RPC
 * `email_quota_reserver`). `verrouille` : peut dépasser le plafond « souple »
 * et puiser dans la réserve.
 */
export async function reserverQuota(admin: unknown, verrouille: boolean): Promise<boolean> {
  const plafond = verrouille ? QUOTA_JOURNALIER : QUOTA_JOURNALIER - RESERVE_VERROUILLES;
  const { data, error } = await vers(admin).rpc('email_quota_reserver', { p_plafond: plafond });
  if (error) {
    // Quota illisible : on laisse partir plutôt que de taire un e-mail. Brevo
    // reste le garde-fou final.
    console.error('notifier: quota illisible :', error.message);
    return true;
  }
  return data === true;
}

async function ecrireCloche(
  db: Db,
  p: ParamsNotifier,
  titre: string,
  corps: string,
  lien: string | null,
  groupe: string | null,
  donnees: DonneesEvenement,
  categorie: Categorie,
): Promise<'ecrite' | 'regroupee' | 'erreur'> {
  // Anti-rafale : une notification identique, rapprochée et NON LUE absorbe la suivante.
  if (groupe) {
    const { data: existante } = await db
      .from('notifications')
      .select('id, count, data')
      .eq('user_id', p.userId)
      .eq('group_key', groupe)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existante) {
      const ancien = (existante.data ?? {}) as DonneesEvenement;
      const nombre = (existante.count as number) + 1;
      const acteurs = [donnees.acteur, ...(ancien.acteurs ?? [])].filter((a): a is string => !!a).slice(0, 3);
      const fusion: DonneesEvenement = { ...donnees, acteurs, nombre };
      const def = definitionEvenement(p.evenement)!;
      const g = composerNotification(def, fusion);
      const { error } = await db
        .from('notifications')
        .update({ title: g.titre, body: g.corps, count: nombre, data: fusion, created_at: new Date().toISOString() })
        .eq('id', existante.id);
      if (!error) return 'regroupee';
      console.error('notifier: regroupement échoué :', error.message);
    }
  }
  const { error } = await db.from('notifications').insert({
    user_id: p.userId,
    kind: p.evenement,
    event: p.evenement,
    category: categorie,
    title: titre,
    body: corps,
    link: lien,
    group_key: groupe,
    data: donnees.acteur ? { ...donnees, acteurs: [donnees.acteur], nombre: 1 } : donnees,
  });
  if (error) {
    console.error(`notifier: écriture échouée (${p.evenement}, ${p.userId}) :`, error.message);
    return 'erreur';
  }
  return 'ecrite';
}

export async function notifier(admin: unknown, p: ParamsNotifier): Promise<ResultatNotifier> {
  try {
    return await notifierInterne(vers(admin), p);
  } catch (e) {
    console.error(`notifier: ${p.evenement} (${p.userId}) :`, (e as Error).message);
    return { cloche: 'aucune', email: 'aucun' };
  }
}

async function notifierInterne(db: Db, p: ParamsNotifier): Promise<ResultatNotifier> {
  const def = definitionEvenement(p.evenement);
  if (!def) {
    console.error(`notifier: événement inconnu « ${p.evenement} »`);
    return { cloche: 'aucune', email: 'aucun', raison: 'inconnu' };
  }
  if (p.acteurId && p.acteurId === p.userId) return { cloche: 'aucune', email: 'aucun', raison: 'auto' };

  // Compte suspendu ou désactivé (JEP-272, arbitrage du 06/10/2026) : plus
  // rien, cloche comprise, sauf les événements verrouillés (obligations
  // légales : souscription, résiliation, support…). Vérifié avant la
  // réservation de dédoublonnage, pour qu'un rappel écarté ici puisse encore
  // partir une fois le compte rétabli.
  if (!def.verrouille && (await membreBloque(db, p.userId))) {
    return { cloche: 'aucune', email: 'aucun', raison: 'bloque' };
  }

  // Unicité par membre, INDÉPENDANTE des canaux : un rappel quotidien ne doit
  // pas repartir à chaque passe du cron, que la cloche soit coupée ou non.
  // Réservée avant tout le reste (« réserver plutôt que constater »).
  if (p.cleDedoublonnage) {
    const { error } = await db.from('notification_dedupe').insert({ user_id: p.userId, dedupe_key: p.cleDedoublonnage });
    if (error?.code === '23505') return { cloche: 'aucune', email: 'aucun', raison: 'doublon' };
    if (error) console.error('notifier: réservation échouée :', error.message);
  }

  const donnees = p.donnees ?? {};
  // Lues même pour un événement verrouillé : son e-mail et sa cloche ignorent
  // les préférences, mais pas le canal « sur l'appareil » (cf. `pushEffectif`).
  const prefs = await lirePreferences(db, p.userId);
  const canaux = decisionCanaux(def, prefs);
  const avecPush = pushEffectif(prefs, def.rubrique);
  if (!canaux.site && canaux.email === 'aucun' && !avecPush) return { cloche: 'aucune', email: 'aucun' };

  const lien = lienNotification(def, donnees);
  const groupe = cleDeGroupe(p.evenement, def, donnees);
  const g = composerNotification(def, { ...donnees, nombre: donnees.nombre ?? 1 });

  let cloche: ResultatNotifier['cloche'] = 'aucune';
  if (canaux.site && !p.sansCloche) {
    const r = await ecrireCloche(db, p, g.titre, g.corps, lien, groupe, donnees, def.categorie);
    cloche = r === 'erreur' ? 'aucune' : r;
  }

  // Push : indépendant de la cloche (on peut vouloir l'un sans l'autre), et
  // sans effet tant que le membre n'a activé aucun appareil.
  const push = avecPush && !p.sansCloche ? await envoyerPush(db, p.userId, composerMessagePush(g.titre, g.corps, lien)) : 0;
  const resultat = await envoyerEmail(db, p, def, canaux.email, g, lien, cloche);
  return { ...resultat, push };
}

async function envoyerEmail(
  db: Db,
  p: ParamsNotifier,
  def: NonNullable<ReturnType<typeof definitionEvenement>>,
  canalEmail: ReturnType<typeof decisionCanaux>['email'],
  g: { titre: string; corps: string },
  lien: string | null,
  cloche: ResultatNotifier['cloche'],
): Promise<ResultatNotifier> {
  if (canalEmail === 'aucun' || p.sansEmail) return { cloche, email: 'aucun' };

  if (canalEmail !== 'immediat' || (p.regrouperEmail && !def.verrouille)) {
    await db.from('email_digest_queue').insert({
      user_id: p.userId,
      category: def.categorie,
      event: p.evenement,
      title: g.titre,
      body: g.corps,
      link: lien,
      rhythm: RYTHME_VERS_BASE[canalEmail === 'immediat' ? 'quotidien' : canalEmail],
    });
    return { cloche, email: 'file' };
  }

  // E-mail immédiat.
  const { data: profil } = await db.from('profiles').select('email, full_name').eq('id', p.userId).maybeSingle();
  if (!profil?.email) return { cloche, email: 'aucun' };

  if (!(await reserverQuota(db, !!def.verrouille))) {
    // Quota du jour épuisé : l'e-mail n'est pas perdu, il part dans le prochain récapitulatif.
    await db.from('email_digest_queue').insert({
      user_id: p.userId,
      category: def.categorie,
      event: p.evenement,
      title: g.titre,
      body: g.corps,
      link: lien,
      rhythm: 'daily',
    });
    return { cloche, email: 'file' };
  }

  const url = siteUrl();
  const prenom = (profil.full_name as string | null)?.split(' ')[0] ?? null;
  // Un e-mail verrouillé ne se désactive pas : pied « obligatoire », et pas
  // d'en-tête de désinscription trompeur.
  const pied = def.verrouille ? 'obligatoire' : 'preferences';
  const headers = def.verrouille ? undefined : enTetesDesinscription(`${url}${CHEMIN_PREFERENCES}`);
  const mail = p.emailPrecompose
    ? { sujet: p.emailPrecompose.sujet, html: p.emailPrecompose.html, texte: p.emailPrecompose.texte }
    : composerEmailNotification({ prenom, titre: g.titre, corps: g.corps, urlSite: url, lien });
  const r = await sendEmailResultat({
    to: profil.email as string,
    subject: mail.sujet,
    html: mail.html,
    text: mail.texte,
    pied,
    replyTo: p.emailPrecompose?.replyTo,
    headers,
  });
  return r.ok ? { cloche, email: 'envoye' } : { cloche, email: 'echec', emailErreur: r.erreur };
}
