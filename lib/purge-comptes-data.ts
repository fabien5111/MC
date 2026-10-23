// Purge des comptes jamais confirmés (JEP-262, lot 4) — serveur seulement.
//
// `executerPurge(false)` ne supprime RIEN : il dresse le rapport des comptes qui
// le seraient. `executerPurge(true)` supprime les candidats, au plus
// `PLAFOND_SUPPRESSIONS` par passage, en réutilisant le chemin de suppression
// de la fiche membre (`supprimerCompteMembre`) — jamais une suppression ad hoc.
//
// **Refuser dans le doute, jamais l'inverse** : GoTrue muet, profil illisible
// ou contenu illisible font échouer la passe entière (une exception, donc un
// 5xx côté route) plutôt que d'en supprimer une partie sur des données
// incomplètes. L'absence d'un compte dans la liste (au-delà du garde-fou de
// pagination) veut dire « pas purgé », jamais « purgeable ».
import { createAdminClient } from '@/lib/supabase/admin';
import { listerUtilisateursAuth } from '@/lib/email-confirmation-data';
import { supprimerCompteMembre } from '@/lib/member-delete-data';
import {
  PLAFOND_SUPPRESSIONS,
  ageEnJours,
  filtreProfil,
  idAbrege,
  masquerEmail,
  premierFiltre,
  ttlJours,
  type CompteAuth,
  type MotifExclusion,
  type ProfilPurge,
  type RapportPurge,
} from '@/lib/purge-comptes';

// Découpage des `.in()` : une liste d'identifiants dans l'URL de PostgREST ne
// doit pas la rendre trop longue (414, cf. /api/recipes/picker).
const LOT = 50;

// Tout ce qui prouve qu'un compte a servi : une trace dans l'une de ces tables
// suffit à l'exclure. (table, colonne propriétaire.)
const TRACES_D_USAGE: [string, string][] = [
  ['recipes', 'author_id'],
  ['batches', 'user_id'],
  ['subscriptions', 'user_id'],
  ['comments', 'user_id'],
  ['ideas', 'author_id'],
  ['shopping_lists', 'user_id'],
  ['imports', 'user_id'],
];

function lots<T>(liste: T[], taille: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille));
  return out;
}

export async function executerPurge(appliquer: boolean, maintenant: Date = new Date()): Promise<RapportPurge> {
  const ttl = ttlJours(process.env.UNCONFIRMED_ACCOUNT_TTL_DAYS);
  const admin = createAdminClient();

  const comptes = await listerUtilisateursAuth();
  if (!comptes) throw new Error("GoTrue n'a pas répondu : aucune décision possible.");

  const exclus: Partial<Record<MotifExclusion, number>> = {};
  const compter = (m: MotifExclusion) => {
    exclus[m] = (exclus[m] ?? 0) + 1;
  };

  // 1. Ancienneté et confirmation : aucune lecture en base.
  let restants: CompteAuth[] = [];
  for (const c of comptes) {
    const motif = premierFiltre(c, maintenant, ttl);
    if (motif) compter(motif);
    else restants.push(c);
  }

  // 2. Profil : rôle et statut.
  const profils = new Map<string, ProfilPurge>();
  for (const groupe of lots(restants.map((c) => c.id), LOT)) {
    const { data, error } = await admin.from('profiles').select('id, role, status').in('id', groupe);
    if (error) throw new Error(`Lecture des profils impossible : ${error.message}`);
    for (const p of (data ?? []) as ProfilPurge[]) profils.set(p.id, p);
  }
  const apresProfil: CompteAuth[] = [];
  for (const c of restants) {
    const motif = filtreProfil(profils.get(c.id));
    if (motif) compter(motif);
    else apresProfil.push(c);
  }
  restants = apresProfil;

  // 3. Traces d'usage : une lecture illisible interrompt tout.
  const avecContenu = new Set<string>();
  const ids = restants.map((c) => c.id);
  for (const [table, colonne] of TRACES_D_USAGE) {
    for (const groupe of lots(ids, LOT)) {
      const { data, error } = await (admin as unknown as {
        from: (t: string) => {
          select: (c: string) => { in: (c: string, v: string[]) => Promise<{ data: Record<string, string>[] | null; error: { message: string } | null }> };
        };
      })
        .from(table)
        .select(colonne)
        .in(colonne, groupe);
      if (error) throw new Error(`Lecture de ${table} impossible : ${error.message}`);
      for (const ligne of data ?? []) avecContenu.add(ligne[colonne]);
    }
  }
  const candidatsBruts: CompteAuth[] = [];
  for (const c of restants) {
    if (avecContenu.has(c.id)) compter('contenu');
    else candidatsBruts.push(c);
  }

  // Les plus anciens d'abord : ce sont les plus sûrs, et le plafond coupe les récents.
  candidatsBruts.sort((a, b) => Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? ''));
  const candidats = candidatsBruts.map((c) => ({
    id: idAbrege(c.id),
    email: masquerEmail(c.email),
    creeLe: c.created_at ?? '',
    ageJours: ageEnJours(c, maintenant) ?? 0,
  }));

  const rapport: RapportPurge = {
    mode: appliquer ? 'suppression' : 'rapport',
    ttlJours: ttl,
    examines: comptes.length,
    exclus,
    candidats,
    plafonne: appliquer && candidatsBruts.length > PLAFOND_SUPPRESSIONS,
    supprimes: 0,
    echecs: [],
  };
  if (!appliquer) return rapport;

  for (const c of candidatsBruts.slice(0, PLAFOND_SUPPRESSIONS)) {
    const r = await supprimerCompteMembre(admin, c.id);
    if (r.ok) rapport.supprimes++;
    else rapport.echecs.push({ id: idAbrege(c.id), erreur: r.erreur });
  }
  return rapport;
}
