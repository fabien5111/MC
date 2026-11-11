// Garde de quota pour les Route Handlers.
//
// Séparé de `lib/entitlements-data.ts` parce qu'il importe `NextResponse` :
// la couche de données, elle, est lue aussi par des Server Components qui
// n'ont rien à faire du typage HTTP.
//
// **Réserver plutôt que constater.** Le crédit est consommé AVANT l'appel
// facturé, et rendu si celui-ci échoue. La spécification proposait l'inverse
// (§5.2, « consume après le succès ») ; c'est intenable ici : entre un
// contrôle et un appel de trente secondes, dix requêtes simultanées passent
// toutes le contrôle et l'API est appelée dix fois. Réserver borne la
// dépense, ce qui est toute la raison d'être de ces quotas ; le crédit rendu
// répare le seul cas défavorable, l'échec.
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { blockingMessage, quotaFailure, type QuotaFailure, type Verdict } from '@/lib/entitlements';
import { CLE_CREDITS_IA, DROIT_ACTION, PAGES_PHOTO_MAX, type ActionCredits } from '@/lib/credits-ia';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getCurrentPlan,
  getEntitlements,
  getGrid,
  messageCreditsEpuises,
} from '@/lib/entitlements-data';

/**
 * Texte du refus, composé à partir de la grille — jamais écrit en dur par
 * route. Ajouter une fonctionnalité ou changer un plafond en back-office
 * change donc le message sans toucher au code.
 *
 * Exporté pour les rares routes qui doivent annoncer un refus SANS statut
 * d'erreur : /api/projet/structure est best-effort par construction, son
 * appelant traite tout statut non-2xx comme « pas de proposition » et
 * n'afficherait rien.
 */
export async function messageQuota(
  userId: string,
  key: string,
  echec: QuotaFailure,
  cout: number | null = null,
): Promise<string> {
  // JEP-76 / JEP-405 : les crédits IA insuffisants ont leur propre texte
  // (essai ou abonnement, date de recharge, solde restant face au coût) —
  // seule exception au texte déduit de la grille.
  if (key === CLE_CREDITS_IA && echec.code === 'EXCEEDED') {
    const m = await messageCreditsEpuises(userId, { limite: echec.limit, utilises: echec.usage, cout });
    return `${m.titre}. ${m.corps}`;
  }

  const [grille, plan] = await Promise.all([getGrid(), getCurrentPlan(userId)]);

  const verdict: Verdict =
    echec.code === 'EXCEEDED'
      ? { autorise: false, raison: 'LIMITE_ATTEINTE', limite: echec.limit, usage: echec.usage ?? 0 }
      : { autorise: false, raison: 'PLAN_INSUFFISANT', limite: null, usage: 0 };

  const message = blockingMessage(grille, key, plan?.code ?? '', verdict);
  return message ? `${message.titre}. ${message.corps}` : 'Cette action n’est pas disponible sur votre formule.';
}

async function refus(userId: string, key: string, echec: QuotaFailure, cout: number | null = null): Promise<NextResponse> {
  const texte = await messageQuota(userId, key, echec, cout);

  // 429 pour un quota épuisé (l'action redeviendra possible à la recharge),
  // 403 pour un droit que la formule n'ouvre pas (elle ne le redeviendra pas
  // sans changement de plan). La distinction porte l'information : elle dit à
  // l'appelant s'il doit attendre ou souscrire.
  return NextResponse.json(
    {
      erreur: texte,
      code: echec.code === 'EXCEEDED' ? 'QUOTA_EPUISE' : 'PLAN_INSUFFISANT',
    },
    { status: echec.code === 'EXCEEDED' ? 429 : 403 },
  );
}

/**
 * Vérifie un droit sans rien consommer. Pour les appels qui participent à une
 * action déjà décomptée ailleurs — la transcription d'une page, facturée mais
 * comptée une fois pour l'import entier.
 */
export async function verifierAcces(userId: string, key: string): Promise<NextResponse | null> {
  const droits = await getEntitlements(userId);
  if (droits[key]?.allowed) return null;
  return refus(userId, key, { code: 'DENIED', featureKey: key, usage: null, limit: null });
}

// ── Crédits IA (JEP-405) ────────────────────────────────────

export type ReservationCredits =
  | { refus: NextResponse }
  | {
      /** Ligne du journal `ai_credit_movements`, `null` si le journal manque. */
      mouvementId: number | null;
      /** Groupe de l'action : fourni par le navigateur (import photo) ou tiré ici. */
      groupe: string;
      /** Rend les crédits si l'action a finalement échoué (une seule fois). */
      rendre: () => Promise<void>;
    };

export function estRefusCredits(r: ReservationCredits): r is { refus: NextResponse } {
  return 'refus' in r;
}

/** Fonction SQL absente (migration pas jouée) : PostgREST ne la trouve pas. */
function fonctionAbsente(e: { code?: string; message?: string }): boolean {
  return e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? '');
}

/**
 * Débite `credits` crédits IA pour `action`, AVANT l'appel facturé (même
 * doctrine « réserver plutôt que constater » que `reserverQuota`).
 *
 * 1. Droit d'ACCÈS de l'action (`DROIT_ACTION`) : le mode projet reste fermé
 *    au PLUS, quel que soit son solde.
 * 2. `mc_debiter_credits` (SECURITY DEFINER, propriétaire `postgres`) consomme
 *    la dotation `credits_ia_mensuel` ET écrit la ligne du journal dans la même
 *    transaction : l'historique ne peut pas diverger du solde. Elle tient aussi
 *    le plafond de pages d'un import photo, sous verrou.
 *
 * Fonction absente (ordre de déploiement non respecté) : on laisse passer sans
 * débit, journalisé — « échouer en ouvert sur une erreur de configuration »
 * (docs/abonnements.md §1.5), le coût d'un appel IA étant de l'ordre du
 * centime.
 */
export async function reserverCredits(
  userId: string,
  action: ActionCredits,
  credits: number,
  opts: { groupe?: string | null; detail?: Record<string, unknown> } = {},
): Promise<ReservationCredits> {
  const acces = await verifierAcces(userId, DROIT_ACTION[action]);
  if (acces) return { refus: acces };

  const groupe = opts.groupe ?? randomUUID();
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc('mc_debiter_credits', {
    p_action: action,
    p_credits: credits,
    p_groupe: groupe,
    p_detail: opts.detail ?? {},
  });

  if (error) {
    if (fonctionAbsente(error)) {
      console.error('credits-ia : mc_debiter_credits absente — action laissée passer sans débit.');
      return { mouvementId: null, groupe, rendre: async () => {} };
    }
    if (String(error.message ?? '').startsWith('MC_CREDITS_PAGES_MAX')) {
      return {
        refus: NextResponse.json(
          { erreur: `${PAGES_PHOTO_MAX} photos au maximum par import.` },
          { status: 400 },
        ),
      };
    }
    const echec = quotaFailure(error);
    if (echec) return { refus: await refus(userId, CLE_CREDITS_IA, echec, credits) };
    console.error('credits-ia/debiter :', error.message);
    return {
      refus: NextResponse.json({ erreur: 'Crédits IA momentanément indisponibles, réessayez.' }, { status: 503 }),
    };
  }

  const mouvementId = typeof data === 'number' ? data : Number(data) || null;
  let rendu = false;
  return {
    mouvementId,
    groupe,
    rendre: async () => {
      if (rendu || mouvementId == null) return;
      rendu = true;
      await rendreCredits(mouvementId);
    },
  };
}

/**
 * Rend les crédits d'une ligne du journal (appel IA en échec). Passe par la clé
 * service_role : `mc_rendre_credits` n'est PAS exécutable par un membre, sans
 * quoi il suffirait de l'appeler depuis la console après un appel réussi pour
 * récupérer ses crédits. Silencieuse : l'échec qu'elle compense a déjà été
 * signalé à l'appelant.
 */
async function rendreCredits(mouvementId: number): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await (admin as any).rpc('mc_rendre_credits', { p_mouvement: mouvementId });
    if (error) console.error('credits-ia/rendre :', error.message);
  } catch (e) {
    console.error('credits-ia/rendre :', (e as Error).message);
  }
}

/**
 * Rattache les lignes d'un groupe à l'objet produit (l'import enregistré),
 * pour le lien de l'historique. Best-effort : un lien manquant n'enlève rien
 * au débit, déjà écrit.
 */
export async function lierCredits(
  userId: string,
  groupe: string,
  ref: { table: string; id: string | number },
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await (admin as any)
      .from('ai_credit_movements')
      .update({ ref_table: ref.table, ref_id: String(ref.id) })
      .eq('user_id', userId)
      .eq('groupe', groupe);
    if (error) console.error('credits-ia/lier :', error.message);
  } catch (e) {
    console.error('credits-ia/lier :', (e as Error).message);
  }
}

/**
 * Pages d'un import photo déjà débitées (et non rendues) dans ce groupe, sous
 * la session (RLS : ses propres lignes). Sert à n'appliquer le tarif de la
 * mise en forme photo (2 crédits) qu'à un import dont les pages ont
 * réellement été payées — sinon, un texte quelconque annoncé « photo »
 * échapperait au tarif par longueur. Lecture en échec : 0, donc tarif texte.
 */
export async function pagesPhotoDebitees(groupe: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await (supabase as any)
    .from('ai_credit_movements')
    .select('id', { count: 'exact', head: true })
    .eq('groupe', groupe)
    .eq('action', 'import_photo_page')
    .eq('statut', 'debite');
  if (error) return 0;
  return count ?? 0;
}
