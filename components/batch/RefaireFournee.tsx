'use client';

// « Refaire cette fournée » : fenêtre (message, date, commentaire) + duplication.
// Partagé par En cuisine (`CuisineContent`) et la fiche recette (« Mes fournées
// terminées ») — un seul code pour les deux portes d'entrée.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { BATCH_FULL_SELECT, type BatchFull } from '@/lib/recipe-plan';
import { translateQuotaError } from '@/lib/quota-message-client';

export type CibleRefaire = { id: number; recipe_title: string | null };

export function useRefaireFournee({ overlay = true }: { overlay?: boolean } = {}) {
  const dialog = useDialog();
  const writeGuard = useWriteGuard();
  const router = useRouter();
  const [refaisant, setRefaisant] = useState<number | null>(null);
  // Fenêtre : fournée ciblée, date et commentaire saisis.
  const [refaireCible, setRefaireCible] = useState<CibleRefaire | null>(null);
  const [refaireDate, setRefaireDate] = useState('');
  const [refaireNotes, setRefaireNotes] = useState('');

  // Duplique la fournée (jamais la recette) à une nouvelle date : toutes les
  // adaptations faites (ajustement, ingrédients ajoutés/retirés, étapes
  // déplacées, remplacements par une sous-recette, notes) sont reprises —
  // seul l'état d'avancement repart à zéro. Fonctionne même si la recette de
  // base a disparu depuis, la fournée étant autonome (cf. CLAUDE.md).
  async function refaire(plan: CibleRefaire) {
    if (!writeGuard('Recréation d’une fournée')) return;
    // Le commentaire de la fournée d'origine préremplit la fenêtre (modifiable).
    const { data } = await createClient().from('batches').select('notes').eq('id', plan.id).maybeSingle();
    setRefaireDate('');
    setRefaireNotes(((data as { notes?: string | null } | null)?.notes) ?? '');
    setRefaireCible(plan);
  }

  async function confirmerRefaire(plan: CibleRefaire, dateStr: string, notesSaisies: string) {
    setRefaireCible(null);
    setRefaisant(plan.id);
    const supabase = createClient();
    try {
      const { data, error } = await supabase.from('batches').select(BATCH_FULL_SELECT).eq('id', plan.id).maybeSingle();
      if (error || !data) throw error || new Error('Fournée introuvable');
      const source = data as unknown as BatchFull;

      const { data: newBatch, error: insErr } = await supabase
        .from('batches')
        .insert({
          user_id: source.user_id,
          recipe_id: source.recipe_id,
          recipe_title: source.recipe_title,
          planned_date: dateStr,
          factor: source.factor,
          adjust_label: source.adjust_label,
          status: 'planifiee',
          notes: notesSaisies.trim() || null,
          source_plan_id: source.id,
          measure_type: source.measure_type,
          yield_qty: source.yield_qty,
          yield_unit: source.yield_unit,
          yield_desc: source.yield_desc,
          yield_notes: source.yield_notes,
          recipe_description: source.recipe_description,
          recipe_tips: source.recipe_tips,
          recipe_serving_advice: source.recipe_serving_advice,
          recipe_source: source.recipe_source,
          recipe_source_url: source.recipe_source_url,
          recipe_video_url: source.recipe_video_url,
          difficulty_name: source.difficulty_name,
          difficulty_level: source.difficulty_level,
          mold_type_name: source.mold_type_name,
          mold_forme: source.mold_forme,
          mold_dims: source.mold_dims,
          tags_text: source.tags_text,
        })
        .select('id')
        .single();
      if (insErr || !newBatch) throw insErr || new Error('Fournée non créée');
      const batchId = newBatch.id;
      // Détail de l'ajustement par IA (cf. lib/batch-ai.ts) : colonne posée à
      // la main, absente des types générés — recopiée à part, échec ignoré.
      const adjustAi = (source as { adjust_ai?: unknown }).adjust_ai;
      if (adjustAi != null) {
        await supabase
          .from('batches')
          .update({ adjust_ai: adjustAi } as never)
          .eq('id', batchId);
      }

      const sortedSteps = [...source.batch_steps].sort((a, b) => a.order_index - b.order_index);
      const { data: stepRows, error: stepErr } = await supabase
        .from('batch_steps')
        .insert(
          sortedSteps.map((s) => ({
            batch_id: batchId,
            order_index: s.order_index,
            day_offset: s.day_offset,
            base_day_offset: s.base_day_offset,
            title: s.title,
            description: s.description,
            tips: s.tips,
            video_url: s.video_url,
            prep_time: s.prep_time,
            cook_time: s.cook_time,
            wait_time: s.wait_time,
            cook_temp: s.cook_temp,
            scaling_mode: s.scaling_mode,
            source_recipe_id: s.source_recipe_id,
            source_step_id: s.source_step_id,
            source_ingredient_id: s.source_ingredient_id,
            user_note: s.user_note,
          })),
        )
        .select('id')
        .order('order_index', { ascending: true });
      if (stepErr || !stepRows) throw stepErr || new Error('Étapes non créées');
      const idByOldStep = new Map(sortedSteps.map((s, i) => [s.id, stepRows[i].id]));

      const substepsToInsert = sortedSteps.flatMap((s) =>
        s.batch_substeps.map((su) => ({
          batch_step_id: idByOldStep.get(s.id)!,
          order_index: su.order_index,
          texte: su.texte,
          added: su.added,
          excluded_when_done: su.excluded_when_done,
        })),
      );
      if (substepsToInsert.length) {
        const { error } = await supabase.from('batch_substeps').insert(substepsToInsert);
        if (error) throw error;
      }

      const ingredientsToInsert = source.batch_ingredients.map((it) => ({
        batch_id: batchId,
        batch_step_id: it.batch_step_id != null ? (idByOldStep.get(it.batch_step_id) ?? null) : null,
        order_index: it.order_index,
        ref_id: it.ref_id,
        name: it.name,
        base_quantity: it.base_quantity,
        quantity: it.quantity,
        quantity_text: it.quantity_text,
        unit: it.unit,
        comment: it.comment,
        url: it.url,
        allergen: it.allergen,
        added: it.added,
        removed: it.removed,
        excluded_when_done: it.excluded_when_done,
        expanded_into_recipe_id: it.expanded_into_recipe_id,
        scaling_mode: it.scaling_mode,
        source_ingredient_id: it.source_ingredient_id,
        source_recipe_id: it.source_recipe_id,
      }));
      if (ingredientsToInsert.length) {
        const { error } = await supabase.from('batch_ingredients').insert(ingredientsToInsert);
        if (error) throw error;
      }

      if (source.batch_utensils.length) {
        const { error } = await supabase.from('batch_utensils').insert(
          source.batch_utensils.map((u) => ({
            batch_id: batchId,
            order_index: u.order_index,
            name: u.name,
            comment: u.comment,
            url: u.url,
            source_recipe_id: u.source_recipe_id,
          })),
        );
        if (error) throw error;
      }

      // Une fournée refaite se planifie : on arrive en mode Préparer.
      router.push(`/fournee/${batchId}?mode=preparer`);
    } catch (e) {
      const brut = (e as Error).message;
      const educatif = await translateQuotaError(brut);
      dialog.alert(educatif ?? 'Erreur lors de la recréation de la fournée : ' + brut);
      setRefaisant(null);
    }
  }

  const element = (
    <>
      {refaireCible && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setRefaireCible(null)}
        >
          <div className="w-full max-w-md bg-white rounded-lg p-6 flex flex-col gap-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-headline-sm text-primary">Refaire « {refaireCible.recipe_title || 'cette fournée'} »</h2>
            <p className="text-sm text-on-surface-variant">
              La fournée sera reprise à l’identique : ajustement, ingrédients, étapes et notes. Seul l’avancement repart à zéro (cases cochées, quantités réellement utilisées, commentaires du jour J).
            </p>
            <div className="flex flex-col gap-2">
              <label htmlFor="refaire-date" className="font-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
                Date de dégustation
              </label>
              <input
                id="refaire-date"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={refaireDate}
                onChange={(e) => setRefaireDate(e.target.value)}
                className="border border-outline-variant rounded px-3 py-2 bg-white font-body-md text-on-surface focus:outline-none focus:border-primary"
                style={{ width: '10rem', maxWidth: '100%' }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="refaire-notes" className="font-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
                Commentaire
              </label>
              <textarea
                id="refaire-notes"
                value={refaireNotes}
                onChange={(e) => setRefaireNotes(e.target.value)}
                rows={3}
                className="border border-outline-variant rounded px-3 py-2 bg-white font-body-md text-on-surface focus:outline-none focus:border-primary"
                placeholder="Une note personnelle sur cette fournée…"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRefaireCible(null)} className="px-4 py-2 border border-outline-variant rounded font-label-md text-on-surface-variant">
                Annuler
              </button>
              <button
                type="button"
                disabled={!refaireDate}
                onClick={() => confirmerRefaire(refaireCible, refaireDate, refaireNotes)}
                className="px-4 py-2 bg-primary text-on-primary rounded font-label-md disabled:opacity-50"
              >
                Refaire la fournée
              </button>
            </div>
          </div>
        </div>
      )}
      {overlay && <LoadingOverlay visible={refaisant !== null} label="Recréation de la fournée…" />}
    </>
  );

  return { refaire, refaisant, element };
}
