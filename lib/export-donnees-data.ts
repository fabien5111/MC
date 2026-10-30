// Export des données d'un membre (JEP-362) — SERVEUR uniquement, clé
// service_role. Lecture seule : rien n'est écrit ici (le journal est posé par
// les routes). Doctrine et assemblage : `lib/export-donnees.ts`.
//
// La clé service_role ignore la RLS : chaque lecture filtre elle-même sur le
// membre (colonne qui le désigne, ou identifiants de SES recettes, fournées,
// listes, demandes). Une lecture en échec arrête l'export ; une table absente
// (migration pas jouée) est ignorée sans bruit.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { createAdminClient } from '@/lib/supabase/admin';
import {
  composerArchive,
  imbriquer,
  nettoyer,
  parOrdre,
  remplacerParNom,
  type ArchiveExport,
  type CleRubrique,
  type OrigineExport,
} from '@/lib/export-donnees';

type Admin = ReturnType<typeof createAdminClient>;
type Db = SupabaseClient;
type Ligne = Record<string, unknown>;
type Erreur = { message: string; code?: string } | null;

/** Table ou colonne absente (migration pas jouée) : rien à exporter, pas un échec. */
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

class LectureEchouee extends Error {}

/** Lignes par page (plafond par défaut de PostgREST) et garde-fou du nombre de pages. */
const PAGE = 1000;
const PAGES_MAX = 50;
/** Taille des lots `in(...)` : une URL PostgREST trop longue est refusée (414). */
const LOT = 100;

function enLots<T>(liste: T[], taille = LOT): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) lots.push(liste.slice(i, i + taille));
  return lots;
}

type Filtre = { colonne: string; valeur: string } | { colonne: string; valeurs: string[] } | { or: string };
type Requete = ReturnType<ReturnType<Db['from']>['select']>;

/**
 * Toutes les lignes de `table` qui répondent au filtre, page par page (au-delà
 * de 1 000 lignes, PostgREST tronque sans erreur). Table absente : `[]`.
 * Toute autre erreur : `LectureEchouee`, qui arrête l'export.
 */
async function lire(db: Db, table: string, filtre: Filtre, ordre: string | null = 'id'): Promise<Ligne[]> {
  if ('valeurs' in filtre) {
    const toutes: Ligne[] = [];
    for (const lot of enLots(filtre.valeurs)) toutes.push(...(await lirePages(db, table, (q) => q.in(filtre.colonne, lot), ordre)));
    return toutes;
  }
  if ('or' in filtre) return lirePages(db, table, (q) => q.or(filtre.or), ordre);
  return lirePages(db, table, (q) => q.eq(filtre.colonne, filtre.valeur), ordre);
}

async function lirePages(db: Db, table: string, filtrer: (q: Requete) => Requete, ordre: string | null): Promise<Ligne[]> {
  const lignes: Ligne[] = [];
  for (let page = 0; page < PAGES_MAX; page++) {
    let q = filtrer(db.from(table).select('*'));
    if (ordre) q = q.order(ordre);
    const { data, error } = await q.range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      // Colonne absente : peut-être celle de l'ordre (toutes les tables n'ont
      // pas d'`id`) — on réessaie sans elle avant de conclure. Sans ordre, c'est
      // la colonne du filtre : table d'une migration pas jouée.
      if (error.code === '42703' && ordre && page === 0) {
        return lirePages(db, table, filtrer, ordre === 'id' ? 'created_at' : null);
      }
      if (absente(error)) return [];
      throw new LectureEchouee(`${table} : ${error.message}`);
    }
    const lu = (data ?? []) as Ligne[];
    lignes.push(...lu);
    if (lu.length < PAGE) return lignes;
  }
  throw new LectureEchouee(`${table} : plus de ${PAGE * PAGES_MAX} lignes, export à faire à la main`);
}

const ids = (lignes: Ligne[], colonne = 'id') =>
  [...new Set(lignes.map((l) => l[colonne]).filter((v): v is string => typeof v === 'string' || typeof v === 'number').map(String))];

/** Nom affiché des membres cités (suivis, partages) : la seule donnée d'un tiers admise. */
async function nomsAffiches(db: Db, membres: string[]): Promise<Map<string, string>> {
  const noms = new Map<string, string>();
  for (const lot of enLots(membres)) {
    const { data, error } = await db.from('profiles').select('id, full_name').in('id', lot);
    if (error) throw new LectureEchouee(`profiles (noms) : ${error.message}`);
    for (const p of (data ?? []) as { id: string; full_name: string | null }[]) noms.set(p.id, p.full_name ?? 'Membre sans pseudo');
  }
  return noms;
}

export type ResultatExport =
  | { ok: true; archive: ArchiveExport; slug: string | null }
  | { ok: false; erreur: string; status: number };

export async function exporterDonneesMembre(
  client: Admin,
  p: { membreId: string; origine: OrigineExport; maintenant?: Date },
): Promise<ResultatExport> {
  const db = client as unknown as Db;
  const membreId = p.membreId;
  try {
    // ── Compte ───────────────────────────────────────────────
    const profils = await lire(db, 'profiles', { colonne: 'id', valeur: membreId });
    const profil = profils[0];
    if (!profil) return { ok: false, erreur: 'Membre introuvable.', status: 404 };
    const { data: lu, error: erreurCompte } = await client.auth.admin.getUserById(membreId);
    if (erreurCompte && erreurCompte.status !== 404) {
      throw new LectureEchouee(`compte de connexion : ${erreurCompte.message}`);
    }
    const u = lu?.user;
    const connexion = u
      ? {
          email: u.email ?? null,
          email_confirme_le: u.email_confirmed_at ?? null,
          inscrit_le: u.created_at ?? null,
          derniere_connexion_le: u.last_sign_in_at ?? null,
          modes_de_connexion: (u.identities ?? []).map((i) => ({
            fournisseur: i.provider,
            email: (i.identity_data as { email?: string } | undefined)?.email ?? null,
            ajoute_le: i.created_at ?? null,
          })),
          // CGU, déclaration d'âge, pseudo d'inscription, nom transmis par Google.
          metadonnees: u.user_metadata ?? {},
        }
      : null;
    const email = u?.email ?? (typeof profil.email === 'string' ? profil.email : null);
    const variantesEmail = email ? [...new Set([email, email.toLowerCase()])] : [];
    const invitation = variantesEmail.length ? await lire(db, 'allowlist', { colonne: 'email', valeurs: variantesEmail }) : [];

    // ── Recettes ─────────────────────────────────────────────
    const recettes = await lire(db, 'recipes', { colonne: 'author_id', valeur: membreId });
    const idsRecettes = ids(recettes);
    const [etapes, groupes, ustensiles, liensTags, projets, composants] = idsRecettes.length
      ? await Promise.all([
          lire(db, 'recipe_steps', { colonne: 'recipe_id', valeurs: idsRecettes }),
          lire(db, 'ingredient_groups', { colonne: 'recipe_id', valeurs: idsRecettes }),
          lire(db, 'recipe_utensils', { colonne: 'recipe_id', valeurs: idsRecettes }),
          lire(db, 'recipe_tags', { colonne: 'recipe_id', valeurs: idsRecettes }, 'recipe_id'),
          lire(db, 'recipe_projects', { colonne: 'recipe_id', valeurs: idsRecettes }, 'recipe_id'),
          lire(db, 'recipe_project_components', { colonne: 'recipe_id', valeurs: idsRecettes }),
        ])
      : [[], [], [], [], [], []];
    const [photosEtapes, ingredients] = await Promise.all([
      etapes.length ? lire(db, 'step_photos', { colonne: 'step_id', valeurs: ids(etapes) }) : [],
      groupes.length ? lire(db, 'ingredients', { colonne: 'group_id', valeurs: ids(groupes) }) : [],
    ]);
    const idsTags = ids(liensTags, 'tag_id');
    const tags = idsTags.length ? await lire(db, 'tags', { colonne: 'id', valeurs: idsTags }) : [];
    const nomTag = new Map(tags.map((t) => [String(t.id), String(t.name ?? '')]));
    const categoriesParRecette = new Map<string, string[]>();
    for (const l of liensTags) {
      const r = String(l.recipe_id);
      categoriesParRecette.set(r, [...(categoriesParRecette.get(r) ?? []), nomTag.get(String(l.tag_id)) ?? String(l.tag_id)]);
    }
    const etapesCompletes = imbriquer(
      parOrdre(nettoyer(etapes, 'recipe_steps')),
      parOrdre(nettoyer(photosEtapes, 'step_photos')),
      'step_id',
      'photos',
    );
    const groupesComplets = imbriquer(
      parOrdre(nettoyer(groupes, 'ingredient_groups')),
      parOrdre(nettoyer(ingredients, 'ingredients')),
      'group_id',
      'ingredients',
    );
    let recettesCompletes = imbriquer(nettoyer(recettes, 'recipes'), etapesCompletes, 'recipe_id', 'etapes');
    recettesCompletes = imbriquer(recettesCompletes, groupesComplets, 'recipe_id', 'groupes_ingredients');
    recettesCompletes = imbriquer(recettesCompletes, parOrdre(nettoyer(ustensiles, 'recipe_utensils')), 'recipe_id', 'ustensiles');
    recettesCompletes = recettesCompletes.map((r) => ({ ...r, categories: categoriesParRecette.get(String(r.id)) ?? [] }));

    // ── Projets ──────────────────────────────────────────────
    const parProjet = new Map<string, Ligne[]>();
    for (const c of nettoyer(composants, 'recipe_project_components')) {
      const r = String(c.recipe_id);
      parProjet.set(r, [...(parProjet.get(r) ?? []), c]);
    }
    const projetsComplets = nettoyer(projets, 'recipe_projects').map((pr) => ({
      ...pr,
      preparations: (parProjet.get(String(pr.recipe_id)) ?? []).sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)),
    }));

    // ── Listes de recettes ───────────────────────────────────
    const listesRecettes = await lire(db, 'recipe_lists', { colonne: 'owner_id', valeur: membreId });
    const contenuListes = listesRecettes.length
      ? await lire(db, 'recipe_list_items', { colonne: 'list_id', valeurs: ids(listesRecettes) }, 'list_id')
      : [];

    // ── Fournées ─────────────────────────────────────────────
    const fournees = await lire(db, 'batches', { colonne: 'user_id', valeur: membreId });
    const idsFournees = ids(fournees);
    const [fEtapes, fIngredients, fUstensiles] = idsFournees.length
      ? await Promise.all([
          lire(db, 'batch_steps', { colonne: 'batch_id', valeurs: idsFournees }),
          lire(db, 'batch_ingredients', { colonne: 'batch_id', valeurs: idsFournees }),
          lire(db, 'batch_utensils', { colonne: 'batch_id', valeurs: idsFournees }),
        ])
      : [[], [], []];
    const fSousEtapes = fEtapes.length ? await lire(db, 'batch_substeps', { colonne: 'batch_step_id', valeurs: ids(fEtapes) }) : [];
    const fEtapesCompletes = imbriquer(
      parOrdre(nettoyer(fEtapes, 'batch_steps')),
      parOrdre(nettoyer(fSousEtapes, 'batch_substeps')),
      'batch_step_id',
      'sous_etapes',
    );
    // Les ingrédients restent rangés par fournée, avec leur `batch_step_id` :
    // une ligne peut ne viser aucune étape.
    let fourneesCompletes = imbriquer(nettoyer(fournees, 'batches'), fEtapesCompletes, 'batch_id', 'etapes');
    fourneesCompletes = imbriquer(
      fourneesCompletes,
      parOrdre(nettoyer(fIngredients, 'batch_ingredients')),
      'batch_id',
      'ingredients',
    );
    fourneesCompletes = imbriquer(fourneesCompletes, parOrdre(nettoyer(fUstensiles, 'batch_utensils')), 'batch_id', 'ustensiles');

    // ── Avis, idées, favoris ─────────────────────────────────
    const [avis, idees, votes, favoris] = await Promise.all([
      lire(db, 'comments', { colonne: 'user_id', valeur: membreId }),
      lire(db, 'ideas', { colonne: 'author_id', valeur: membreId }),
      lire(db, 'idea_votes', { colonne: 'user_id', valeur: membreId }, 'created_at'),
      lire(db, 'favorites', { colonne: 'user_id', valeur: membreId }, 'created_at'),
    ]);
    // Titre des idées soutenues : contenu public de la boîte à idées.
    const ideesVotees = votes.length ? await lire(db, 'ideas', { colonne: 'id', valeurs: ids(votes, 'idea_id') }) : [];
    const titreIdee = new Map(ideesVotees.map((i) => [String(i.id), i.title]));

    // ── Suivis et partages ───────────────────────────────────
    const [suivis, abonnes, carnetDonnes, carnetRecus, recettesDonnees, recettesRecues] = await Promise.all([
      lire(db, 'follows', { colonne: 'follower_id', valeur: membreId }, 'created_at'),
      lire(db, 'follows', { colonne: 'following_id', valeur: membreId }, 'created_at'),
      lire(db, 'book_shares', { colonne: 'owner_id', valeur: membreId }, 'created_at'),
      lire(db, 'book_shares', { colonne: 'shared_with_id', valeur: membreId }, 'created_at'),
      lire(db, 'recipe_shares', { colonne: 'owner_id', valeur: membreId }, 'created_at'),
      lire(db, 'recipe_shares', { colonne: 'shared_with_id', valeur: membreId }, 'created_at'),
    ]);
    const noms = await nomsAffiches(db, [
      ...ids(suivis, 'following_id'),
      ...ids(carnetDonnes, 'shared_with_id'),
      ...ids(carnetRecus, 'owner_id'),
      ...ids(recettesDonnees, 'shared_with_id'),
      ...ids(recettesRecues, 'owner_id'),
    ]);
    const sansColonne = (lignes: Ligne[], colonne: string) => lignes.map(({ [colonne]: _c, ...reste }) => reste);

    // ── Courses ──────────────────────────────────────────────
    const listesCourses = await lire(db, 'shopping_lists', { colonne: 'user_id', valeur: membreId });
    const articles = listesCourses.length ? await lire(db, 'shopping_list_items', { colonne: 'list_id', valeurs: ids(listesCourses) }) : [];
    const anciensArticles = await lire(db, 'shopping_items', { colonne: 'user_id', valeur: membreId });

    // ── Imports ──────────────────────────────────────────────
    const imports = await lire(db, 'imports', { colonne: 'user_id', valeur: membreId });

    // ── Contact ──────────────────────────────────────────────
    // Même filtre que l'anonymisation : demandes du compte ET demandes
    // envoyées avant connexion avec la même adresse.
    const listeOr = (v: string[]) => `(${v.map((x) => `"${x.replace(/"/g, '\\"')}"`).join(',')})`;
    const demandes = await lire(
      db,
      'contact_messages',
      { or: variantesEmail.length ? `user_id.eq.${membreId},email.in.${listeOr(variantesEmail)}` : `user_id.eq.${membreId}` },
      'created_at',
    );
    const idsDemandes = ids(demandes);
    const [reponses, historique, photosDemandes] = idsDemandes.length
      ? await Promise.all([
          lire(db, 'contact_replies', { colonne: 'message_id', valeurs: idsDemandes }, 'created_at'),
          lire(db, 'contact_status_history', { colonne: 'message_id', valeurs: idsDemandes }, 'changed_at'),
          lire(db, 'contact_message_photos', { colonne: 'message_id', valeurs: idsDemandes }),
        ])
      : [[], [], []];
    const photosReponses = reponses.length ? await lire(db, 'contact_reply_photos', { colonne: 'reply_id', valeurs: ids(reponses) }) : [];
    const reponsesCompletes = imbriquer(nettoyer(reponses, 'contact_replies'), nettoyer(photosReponses, 'contact_reply_photos'), 'reply_id', 'photos');
    let demandesCompletes = imbriquer(nettoyer(demandes, 'contact_messages'), reponsesCompletes, 'message_id', 'reponses');
    demandesCompletes = imbriquer(demandesCompletes, nettoyer(historique, 'contact_status_history'), 'message_id', 'historique_statut');
    demandesCompletes = imbriquer(demandesCompletes, nettoyer(photosDemandes, 'contact_message_photos'), 'message_id', 'photos');

    // ── Abonnement, notifications, journal, technique ───────
    const [
      abonnements,
      demandesAbonnement,
      clients,
      essais,
      emailsAbonnement,
      preferences,
      appareils,
      journal,
      visites,
      encarts,
      ia,
      compteurs,
    ] = await Promise.all([
      lire(db, 'subscriptions', { colonne: 'user_id', valeur: membreId }),
      lire(db, 'subscription_requests', { colonne: 'user_id', valeur: membreId }),
      lire(db, 'billing_customers', { colonne: 'user_id', valeur: membreId }, 'created_at'),
      lire(db, 'trials', { colonne: 'user_id', valeur: membreId }),
      lire(db, 'notifications_sent', { colonne: 'user_id', valeur: membreId }),
      lire(db, 'notification_preferences', { colonne: 'user_id', valeur: membreId }, 'category'),
      lire(db, 'push_subscriptions', { colonne: 'user_id', valeur: membreId }),
      lire(db, 'member_moderation_events', { colonne: 'member_id', valeur: membreId }, 'created_at'),
      lire(db, 'visit_sessions', { colonne: 'user_id', valeur: membreId }),
      lire(db, 'ad_events', { colonne: 'user_id', valeur: membreId }),
      lire(db, 'ai_usage', { colonne: 'user_id', valeur: membreId }),
      lire(db, 'usage_counters', { colonne: 'user_id', valeur: membreId }),
    ]);
    // Domaine du service de push seul : l'adresse complète est un jeton technique.
    const appareilsLisibles = nettoyer(appareils, 'push_subscriptions').map((a, i) => {
      const brut = appareils[i]?.endpoint;
      let service: string | null = null;
      try {
        service = typeof brut === 'string' ? new URL(brut).hostname : null;
      } catch {
        service = null;
      }
      return { ...a, service_de_push: service };
    });

    const donnees: Record<CleRubrique, unknown> = {
      compte: {
        connexion,
        profil: nettoyer([profil], 'profiles')[0],
        invitation: nettoyer(invitation, 'allowlist'),
      },
      recettes: recettesCompletes,
      projets: projetsComplets,
      listes_de_recettes: imbriquer(nettoyer(listesRecettes, 'recipe_lists'), nettoyer(contenuListes, 'recipe_list_items'), 'list_id', 'recettes'),
      fournees: fourneesCompletes,
      avis: nettoyer(avis, 'comments'),
      idees: {
        proposees: nettoyer(idees, 'ideas'),
        votes: votes.map((v) => ({ ...v, titre_idee: titreIdee.get(String(v.idea_id)) ?? null })),
      },
      favoris: nettoyer(favoris, 'favorites'),
      abonnements_patissiers: {
        suivis: sansColonne(remplacerParNom(suivis, 'following_id', noms, 'patissier'), 'follower_id'),
        nombre_abonnes: abonnes.length,
      },
      partages: {
        carnet_partage_avec: sansColonne(remplacerParNom(carnetDonnes, 'shared_with_id', noms, 'partage_avec'), 'owner_id'),
        carnets_recus_de: sansColonne(remplacerParNom(carnetRecus, 'owner_id', noms, 'recu_de'), 'shared_with_id'),
        recettes_partagees_avec: sansColonne(remplacerParNom(recettesDonnees, 'shared_with_id', noms, 'partage_avec'), 'owner_id'),
        recettes_recues_de: sansColonne(remplacerParNom(recettesRecues, 'owner_id', noms, 'recu_de'), 'shared_with_id'),
      },
      listes_de_courses: {
        listes: imbriquer(nettoyer(listesCourses, 'shopping_lists'), parOrdre(nettoyer(articles, 'shopping_list_items')), 'list_id', 'articles'),
        anciens_articles: nettoyer(anciensArticles, 'shopping_items'),
      },
      imports: nettoyer(imports, 'imports'),
      demandes_de_contact: demandesCompletes,
      abonnement_payant: {
        abonnements: nettoyer(abonnements, 'subscriptions'),
        demandes_de_souscription: nettoyer(demandesAbonnement, 'subscription_requests'),
        client_prestataire_de_paiement: nettoyer(clients, 'billing_customers'),
        essais: nettoyer(essais, 'trials'),
        emails_envoyes: nettoyer(emailsAbonnement, 'notifications_sent'),
      },
      notifications: {
        preferences: nettoyer(preferences, 'notification_preferences'),
        appareils: appareilsLisibles,
      },
      journal_moderation: nettoyer(journal, 'member_moderation_events'),
      donnees_techniques: {
        historique_de_connexion: nettoyer(visites, 'visit_sessions'),
        encarts_partenaires: nettoyer(encarts, 'ad_events'),
        utilisation_ia: nettoyer(ia, 'ai_usage'),
        compteurs_usage: nettoyer(compteurs, 'usage_counters'),
      },
    };

    return {
      ok: true,
      slug: typeof profil.username === 'string' ? profil.username : null,
      archive: composerArchive({ membreId, origine: p.origine, genereLe: p.maintenant ?? new Date(), donnees }),
    };
  } catch (e) {
    if (e instanceof LectureEchouee) {
      console.error('export-donnees :', e.message);
      return {
        ok: false,
        erreur: `Export interrompu : lecture impossible (${e.message}). Aucune archive incomplète n'est rendue ; réessayer plus tard.`,
        status: 502,
      };
    }
    throw e;
  }
}
