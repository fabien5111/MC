// Rappels planifiés du moteur de notifications (JEP-280) — SERVEUR UNIQUEMENT,
// joués par la passe `quotidien` de `/api/cron/notifications`, sans session.
//
// Quatre familles, toutes passées par `notifier()` avec une clé de
// dédoublonnage : relancer le cron (ou le rattraper à la main) ne renvoie
// JAMAIS deux fois le même rappel, que la cloche soit coupée ou non.
//  - une étape de fournée est à commencer aujourd'hui (jour J − n) ;
//  - la veille du jour J ;
//  - l'invitation à donner son avis, le lendemain d'une fournée terminée sans avis ;
//  - une de ses recettes devient « Recette de la semaine » (début de plage).
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifier } from '@/lib/notifier';
import { ajouterJours, dateZurich, etapesACommencer } from '@/lib/notification-rappels';

type Db = SupabaseClient;

type BatchActif = {
  id: string;
  user_id: string;
  recipe_title: string | null;
  planned_date: string;
  batch_steps: { title: string; day_offset: number | null; done: boolean }[];
};
type BatchTermine = { id: string; user_id: string; recipe_id: string | null; recipe_title: string | null };
type Plage = { id: string; recipe_id: string; recipes: { title: string; author_id: string } | null };

export async function genererRappels(
  admin: unknown,
  maintenant: Date,
): Promise<{ etapes: number; veille: number; avis: number; miseEnAvant: number }> {
  const db = admin as Db;
  const aujourdhui = dateZurich(maintenant);
  const demain = ajouterJours(aujourdhui, 1);
  const hier = ajouterJours(aujourdhui, -1);
  const compte = { etapes: 0, veille: 0, avis: 0, miseEnAvant: 0 };

  // ── Fournées planifiées : étapes du jour + veille ──────────────────────
  const { data: actifs, error: errActifs } = await db
    .from('batches')
    .select('id, user_id, recipe_title, planned_date, batch_steps(title, day_offset, done)')
    .eq('status', 'planifiee')
    .gte('planned_date', aujourdhui)
    .limit(2000);
  if (errActifs) console.error('rappels: fournées illisibles :', errActifs.message);

  for (const b of (actifs ?? []) as unknown as BatchActif[]) {
    const titre = b.recipe_title ?? 'votre fournée';
    const aFaire = etapesACommencer(b.batch_steps ?? [], b.planned_date, aujourdhui);
    if (aFaire.length > 0) {
      const r = await notifier(db, {
        userId: b.user_id,
        evenement: 'rappel_etape',
        donnees: { batchId: b.id, titre, detail: aFaire.join(', ') },
        cleDedoublonnage: `rappel_etape:${b.id}:${aujourdhui}`,
      });
      if (!r.raison) compte.etapes++;
    }
    if (b.planned_date === demain) {
      const r = await notifier(db, {
        userId: b.user_id,
        evenement: 'rappel_veille',
        donnees: { batchId: b.id, titre },
        cleDedoublonnage: `rappel_veille:${b.id}`,
      });
      if (!r.raison) compte.veille++;
    }
  }

  // ── Invitation à donner son avis : fournée terminée hier, sans avis ────
  const { data: termines, error: errTermines } = await db
    .from('batches')
    .select('id, user_id, recipe_id, recipe_title')
    .eq('status', 'terminee')
    .eq('review_dismissed', false)
    .eq('review_status', 'none')
    .not('recipe_id', 'is', null)
    .gte('date_fin', hier)
    .lt('date_fin', aujourdhui)
    .limit(2000);
  if (errTermines) console.error('rappels: fournées terminées illisibles :', errTermines.message);

  for (const b of (termines ?? []) as BatchTermine[]) {
    // Un seul avis par recette et par membre : s'il existe déjà (autre fournée),
    // inviter à le donner serait absurde.
    const { data: avis } = await db
      .from('comments')
      .select('id')
      .eq('recipe_id', b.recipe_id)
      .eq('user_id', b.user_id)
      .limit(1)
      .maybeSingle();
    if (avis) continue;
    const r = await notifier(db, {
      userId: b.user_id,
      evenement: 'invitation_avis',
      donnees: { batchId: b.id, titre: b.recipe_title ?? 'la recette' },
      cleDedoublonnage: `invitation_avis:${b.id}`,
    });
    if (!r.raison) compte.avis++;
  }

  // ── Recette mise en avant : le jour où la plage commence ───────────────
  const { data: plages, error: errPlages } = await db
    .from('featured_recipes')
    .select('id, recipe_id, recipes(title, author_id)')
    .eq('start_date', aujourdhui);
  if (errPlages) console.error('rappels: plages à l’honneur illisibles :', errPlages.message);

  for (const p of (plages ?? []) as unknown as Plage[]) {
    if (!p.recipes?.author_id) continue;
    const r = await notifier(db, {
      userId: p.recipes.author_id,
      evenement: 'recette_mise_en_avant',
      donnees: { recetteId: p.recipe_id, titre: p.recipes.title },
      cleDedoublonnage: `mise_en_avant:${p.id}`,
    });
    if (!r.raison) compte.miseEnAvant++;
  }

  return compte;
}
