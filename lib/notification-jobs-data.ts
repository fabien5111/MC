// Tâches de fond du moteur de notifications (JEP-278) — SERVEUR UNIQUEMENT,
// appelées par `GET /api/cron/notifications`, sans aucune session : tout passe
// par le client service_role.
//
//  1. `viderOutbox`  — les événements nés d'une écriture du navigateur
//     (favori, abonnement, validation en back-office…) sont posés dans
//     `notification_outbox` par des triggers SQL ; c'est ici qu'ils entrent
//     dans le moteur. Le navigateur ne fournit jamais lui-même une
//     notification : rien à falsifier.
//  2. `envoyerRecapitulatifs` — un seul e-mail par membre et par passe, qui
//     rassemble ce que `notifier` a mis en file.
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmailBestEffort } from '@/lib/email';
import { membreBloque } from '@/lib/moderation-lecture';
import { siteUrl } from '@/lib/site-url';
import { CHEMIN_PREFERENCES, composerRecapitulatif, enTetesDesinscription, type LigneRecap } from '@/lib/notification-email';
import { definitionEvenement, preferenceEffective, type Categorie, type DonneesEvenement } from '@/lib/notification-events';
import { lirePreferences, notifier, reserverQuota } from '@/lib/notifier';

type Db = SupabaseClient;
const vers = (admin: unknown): Db => admin as Db;

const TAILLE_LOT = 200;
const ESSAIS_MAX = 3;

type LigneOutbox = {
  id: number;
  event: string;
  recipient_id: string | null;
  actor_id: string | null;
  data: DonneesEvenement | null;
  attempts: number;
};

/** Admins et gestionnaires : destinataires des événements de modération. */
async function equipeBackOffice(db: Db): Promise<string[]> {
  const { data } = await db.from('profiles').select('id').in('role', ['admin', 'gestionnaire']);
  return (data ?? []).map((r) => r.id as string);
}

export async function viderOutbox(admin: unknown): Promise<{ traites: number; echecs: number }> {
  const db = vers(admin);
  const { data: lot, error } = await db
    .from('notification_outbox')
    .select('id, event, recipient_id, actor_id, data, attempts')
    .is('processed_at', null)
    .lt('attempts', ESSAIS_MAX)
    .order('id', { ascending: true })
    .limit(TAILLE_LOT);
  if (error) {
    console.error('notifications/outbox: lecture échouée :', error.message);
    return { traites: 0, echecs: 0 };
  }

  let traites = 0;
  let echecs = 0;
  const noms = new Map<string, { nom: string | null; handle: string | null }>();
  const acteurDe = async (id: string | null): Promise<{ nom: string | null; handle: string | null }> => {
    if (!id) return { nom: null, handle: null };
    if (!noms.has(id)) {
      const { data } = await db.from('profiles').select('full_name, username').eq('id', id).maybeSingle();
      noms.set(id, {
        nom: (data?.full_name as string | null) ?? null,
        handle: (data?.username as string | null) ?? null,
      });
    }
    return noms.get(id)!;
  };
  let equipe: string[] | null = null;

  for (const ligne of (lot ?? []) as LigneOutbox[]) {
    try {
      const def = definitionEvenement(ligne.event);
      if (!def) throw new Error(`événement inconnu « ${ligne.event} »`);
      const acteur = await acteurDe(ligne.actor_id);
      const donnees: DonneesEvenement = { ...(ligne.data ?? {}), acteur: acteur.nom, acteurHandle: acteur.handle };

      let destinataires: string[];
      if (ligne.recipient_id) destinataires = [ligne.recipient_id];
      else if (def.categorie === 'moderation') destinataires = equipe ??= await equipeBackOffice(db);
      else throw new Error('destinataire absent');

      for (const userId of destinataires) {
        await notifier(db, { userId, evenement: ligne.event, acteurId: ligne.actor_id, donnees });
      }
      await db.from('notification_outbox').update({ processed_at: new Date().toISOString() }).eq('id', ligne.id);
      traites++;
    } catch (e) {
      echecs++;
      await db
        .from('notification_outbox')
        .update({ attempts: ligne.attempts + 1, error: (e as Error).message.slice(0, 500) })
        .eq('id', ligne.id);
      console.error(`notifications/outbox: ligne ${ligne.id} (${ligne.event}) :`, (e as Error).message);
    }
  }
  return { traites, echecs };
}

type LigneFile = {
  id: number;
  user_id: string;
  category: Categorie;
  event: string;
  title: string;
  body: string;
  link: string | null;
  rhythm: 'daily' | 'weekly';
};

/**
 * Envoie les récapitulatifs en attente. `hebdo` : inclure aussi la file
 * hebdomadaire (le lundi) ; sinon seule la quotidienne part.
 *
 * Une file qui dépasse le quota du jour n'est PAS perdue : ses lignes restent
 * non envoyées et repartent à la passe suivante. Un membre qui a coupé
 * l'e-mail depuis la mise en file voit ses lignes écartées sans envoi — un
 * e-mail refusé ne part jamais.
 */
export async function envoyerRecapitulatifs(
  admin: unknown,
  opts: { hebdo: boolean },
): Promise<{ envoyes: number; ecartes: number; reportes: number }> {
  const db = vers(admin);
  const rythmes = opts.hebdo ? ['daily', 'weekly'] : ['daily'];
  const { data, error } = await db
    .from('email_digest_queue')
    .select('id, user_id, category, event, title, body, link, rhythm')
    .is('sent_at', null)
    .in('rhythm', rythmes)
    .order('id', { ascending: true })
    .limit(2000);
  if (error) {
    console.error('notifications/recap: lecture échouée :', error.message);
    return { envoyes: 0, ecartes: 0, reportes: 0 };
  }

  const parMembre = new Map<string, LigneFile[]>();
  for (const l of (data ?? []) as LigneFile[]) parMembre.set(l.user_id, [...(parMembre.get(l.user_id) ?? []), l]);

  let envoyes = 0;
  let ecartes = 0;
  let reportes = 0;
  const url = siteUrl();
  const maintenant = () => new Date().toISOString();

  for (const [userId, lignes] of parMembre) {
    const ids = lignes.map((l) => l.id);
    const prefs = await lirePreferences(db, userId);
    // Garde « e-mail refusé ne part jamais » : on revérifie au moment d'envoyer,
    // rubrique par rubrique (la ligne de la file ne porte que la catégorie, la
    // rubrique se déduit de l'événement). Une ligne dont l'événement a quitté
    // le catalogue retombe sur la préférence de sa catégorie.
    // Compte suspendu ou désactivé depuis la mise en file (JEP-272) : seuls
    // les événements verrouillés partent encore (cf. `notifier`).
    const bloque = await membreBloque(db, userId);
    const retenues = lignes.filter(
      (l) =>
        (!bloque || !!definitionEvenement(l.event)?.verrouille) &&
        preferenceEffective(prefs, definitionEvenement(l.event)?.rubrique ?? l.category).email,
    );
    if (retenues.length === 0) {
      await db.from('email_digest_queue').update({ sent_at: maintenant() }).in('id', ids);
      ecartes += lignes.length;
      continue;
    }
    const { data: profil } = await db.from('profiles').select('email, full_name').eq('id', userId).maybeSingle();
    if (!profil?.email) {
      await db.from('email_digest_queue').update({ sent_at: maintenant() }).in('id', ids);
      ecartes += lignes.length;
      continue;
    }
    if (!(await reserverQuota(db, false))) {
      reportes += lignes.length;
      continue;
    }
    const aHebdo = retenues.some((l) => l.rhythm === 'weekly');
    const mail = composerRecapitulatif({
      prenom: (profil.full_name as string | null)?.split(' ')[0] ?? null,
      rythme: aHebdo && !retenues.some((l) => l.rhythm === 'daily') ? 'hebdo' : 'quotidien',
      urlSite: url,
      lignes: retenues.map<LigneRecap>((l) => ({ categorie: l.category, titre: l.title, corps: l.body, lien: l.link })),
    });
    const ok = await sendEmailBestEffort({
      to: profil.email as string,
      subject: mail.sujet,
      html: mail.html,
      text: mail.texte,
      headers: enTetesDesinscription(`${url}${CHEMIN_PREFERENCES}`),
    });
    if (ok) {
      await db.from('email_digest_queue').update({ sent_at: maintenant() }).in('id', ids);
      envoyes++;
    } else {
      // Échec d'envoi : on garde la file, la passe suivante réessaie. Brevo
      // tient sa propre liste de rebonds.
      reportes += lignes.length;
    }
  }
  return { envoyes, ecartes, reportes };
}

const CLE_QUOTIDIEN = 'notifications_quotidien_du';

/**
 * Réserve la passe quotidienne d'un jour (AAAA-MM-JJ de Zurich) : vrai pour
 * UN seul appelant, faux pour les autres. Doctrine « réserver plutôt que
 * constater » : deux passes `outbox` simultanées ne la jouent pas deux fois.
 * Le marqueur vit dans `site_settings` (clé/valeur, écrite par le service_role
 * uniquement) — pas de migration, et la valeur n'est qu'une date.
 */
export async function reserverQuotidien(admin: unknown, jour: string): Promise<boolean> {
  const db = vers(admin);
  const { error } = await db.from('site_settings').insert({ key: CLE_QUOTIDIEN, value: jour });
  if (!error) return true;
  if (error.code !== '23505') {
    // Illisible : on ne bloque pas la passe quotidienne, ses rappels sont dédoublonnés.
    console.error('notifications/quotidien: réservation impossible :', error.message);
    return false;
  }
  // La ligne existe : on ne la prend que si elle porte un autre jour. Le `neq`
  // fait l'arbitrage côté base — un seul des appelants simultanés la modifie.
  const { data, error: errMaj } = await db
    .from('site_settings')
    .update({ value: jour, updated_at: new Date().toISOString() })
    .eq('key', CLE_QUOTIDIEN)
    .neq('value', jour)
    .select('key');
  if (errMaj) {
    console.error('notifications/quotidien: réservation impossible :', errMaj.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/** Rend la réservation (la passe a échoué avant d'avoir pu rien faire d'utile) : la suivante réessaiera. */
export async function libererQuotidien(admin: unknown): Promise<void> {
  await vers(admin).from('site_settings').update({ value: '' }).eq('key', CLE_QUOTIDIEN);
}
