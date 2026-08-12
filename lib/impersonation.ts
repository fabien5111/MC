// Impersonation — « se connecter en tant que » un membre depuis le back-office.
//
// Principe : l'admin ne prend pas la place du membre dans sa propre session.
// Une route serveur génère un lien de connexion à usage unique (Supabase
// `generateLink`) que l'admin ouvre dans une fenêtre de navigation privée —
// sa session admin reste donc intacte dans sa fenêtre normale.
//
// Le niveau de droit (`read_only` / `write`) n'est PAS choisi au moment du
// clic : il est hérité de `profiles.impersonation_access` de l'admin qui
// déclenche l'action.
//
// Le mode actif n'est pas porté par un cookie mais par une ligne de la table
// `impersonation_sessions` (cible = utilisateur courant, démarrée, non
// terminée, non expirée) : la session impersonée ne peut donc pas se
// débrider en supprimant un cookie, et la même condition est réutilisable en
// SQL par la RLS (fonction `public.is_read_only_session()`).
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import {
  isImpersonationMode,
  withImpersonationSchema,
  type ImpersonationMode,
  type ImpersonationSessionRow,
} from '@/lib/impersonation-types';

// Durée de vie d'une session d'impersonation (à partir de la génération du
// lien). Au-delà, la session est ignorée : plus de bandeau, plus de bridage.
export const IMPERSONATION_TTL_MINUTES = 60;

export type ImpersonationContext = {
  sessionId: string;
  mode: ImpersonationMode;
  targetName: string;
  adminEmail: string | null;
  expiresAt: string;
};

// Session d'impersonation active dont l'utilisateur courant est la CIBLE, ou
// null. Mémoïsé par requête (layout racine + gardes de page partagent l'appel).
//
// Tolérant aux pannes, comme le middleware : si la migration n'est pas encore
// appliquée (table absente) ou si Supabase renvoie une erreur, on renvoie null
// plutôt que de casser le rendu de tout le site.
export const getImpersonationContext = cache(async (): Promise<ImpersonationContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = withImpersonationSchema(await createClient());
  const { data, error } = await supabase
    .from('impersonation_sessions')
    .select('id, mode, admin_email, target_name, target_email, expires_at')
    .eq('target_user_id', user.id)
    .not('started_at', 'is', null)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    sessionId: data.id,
    // Une valeur inattendue en base est traitée comme la plus restrictive.
    mode: isImpersonationMode(data.mode) ? data.mode : 'read_only',
    targetName: data.target_name || data.target_email || user.email || 'ce membre',
    adminEmail: data.admin_email,
    expiresAt: data.expires_at,
  };
});

// Vrai si la session courante est une impersonation en lecture seule.
export async function isReadOnlySession(): Promise<boolean> {
  const ctx = await getImpersonationContext();
  return ctx?.mode === 'read_only';
}

// Garde pour les pages d'écriture (/creer, /importer, /relecture) : renvoie
// vers le profil avec un motif affichable plutôt que de laisser l'utilisateur
// remplir un formulaire dont l'enregistrement sera refusé.
export async function requireWritableSession(): Promise<void> {
  if (await isReadOnlySession()) redirect('/reglages?impersonation=lecture-seule');
}

// Niveau de droit d'impersonation d'un admin (hérité par les sessions qu'il
// ouvre). Défaut prudent : lecture seule.
export async function getAdminImpersonationAccess(adminId: string): Promise<ImpersonationMode> {
  const supabase = withImpersonationSchema(await createClient());
  const { data } = await supabase
    .from('profiles')
    .select('impersonation_access')
    .eq('id', adminId)
    .maybeSingle();
  return isImpersonationMode(data?.impersonation_access) ? data.impersonation_access : 'read_only';
}

export type ImpersonationSessionWithEvents = ImpersonationSessionRow & {
  eventCount: number;
};

// Journal des connexions « en tant que » — back-office. Lecture via la session
// de l'admin (la RLS n'ouvre ce select qu'aux admins).
export async function getImpersonationSessions(limit = 25): Promise<ImpersonationSessionWithEvents[]> {
  const supabase = withImpersonationSchema(await createClient());
  const { data: sessions, error } = await supabase
    .from('impersonation_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !sessions?.length) return [];

  const ids = sessions.map((s) => s.id);
  const { data: events } = await supabase
    .from('impersonation_events')
    .select('session_id')
    .in('session_id', ids);

  const counts: Record<string, number> = {};
  (events ?? []).forEach((e) => {
    counts[e.session_id] = (counts[e.session_id] || 0) + 1;
  });

  return sessions.map((s) => ({ ...s, eventCount: counts[s.id] || 0 }));
}
