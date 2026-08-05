'use client';

// Bandeau de contexte planifié (porté de #plan-notice de recette.html) :
// texte + bouton « Démarrer la recette » (déroule le formulaire d'heure de
// dégustation puis crée une exécution) + crayon d'édition du plan.
//
// Démarrer matérialise l'exécution à partir du plan (executions +
// execution_steps/execution_substeps/execution_ingredients/execution_utensils),
// en figeant nom/unité/quantité prévue de chaque ligne — voir CLAUDE.md
// « Recettes planifiées » : ces colonnes ne sont plus jamais resynchronisées
// depuis le plan une fois la session créée.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { useDialog } from '@/components/Dialog';
import { materializeExecution, type PlanFull } from '@/lib/recipe-plan';
import { PlanEditButton } from '@/components/recipe/PlanEditButton';

type Supabase = ReturnType<typeof createClient>;

async function insertMaterializedExecution(supabase: Supabase, executionId: number, plan: PlanFull) {
  const mat = materializeExecution(plan);
  for (const step of mat.steps) {
    const { data: stepRow, error: stepErr } = await supabase
      .from('execution_steps')
      .insert({ execution_id: executionId, plan_step_id: step.plan_step_id, titre: step.titre, order_index: step.order_index, day_offset: step.day_offset })
      .select('id')
      .single();
    if (stepErr || !stepRow) throw stepErr || new Error('Étape non créée');
    if (step.substeps.length) {
      const { error } = await supabase.from('execution_substeps').insert(
        step.substeps.map((su) => ({ execution_id: executionId, execution_step_id: stepRow.id, plan_substep_id: su.plan_substep_id, texte: su.texte, order_index: su.order_index })),
      );
      if (error) throw error;
    }
    if (step.ingredients.length) {
      const { error } = await supabase.from('execution_ingredients').insert(
        step.ingredients.map((it) => ({
          execution_id: executionId,
          execution_step_id: stepRow.id,
          plan_ingredient_id: it.plan_ingredient_id,
          name: it.name,
          unit: it.unit,
          planned_quantity: it.planned_quantity,
          planned_text: it.planned_text,
        })),
      );
      if (error) throw error;
    }
  }
  if (mat.utensils.length) {
    const { error } = await supabase.from('execution_utensils').insert(mat.utensils.map((u) => ({ execution_id: executionId, plan_utensil_id: u.plan_utensil_id, name: u.name })));
    if (error) throw error;
  }
}

export function PlanNoticeBanner({ text, plan, autoStart = false }: { text: string; plan: PlanFull; autoStart?: boolean }) {
  const router = useRouter();
  const dialog = useDialog();
  const writeGuard = useWriteGuard();
  // Arrivée depuis le bouton « Démarrer une session » du planning (lien
  // ?demarrer=1) : le formulaire s'ouvre directement, sans clic intermédiaire
  // sur « Démarrer la recette ».
  const [starting, setStarting] = useState(autoStart);
  const [time, setTime] = useState('12:00');
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!writeGuard('Démarrage d’une exécution')) return;
    setBusy(true);
    const supabase = createClient();
    const { data: running } = await supabase
      .from('executions')
      .select('id, date_debut')
      .eq('planning_id', plan.id)
      .eq('status', 'en_cours')
      .order('date_debut', { ascending: false })
      .limit(1);
    if (running && running[0]) {
      const d = new Date(running[0].date_debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      if (await dialog.confirm(`Une session démarrée le ${d} est déjà en cours pour cette recette.\n\nOK : reprendre cette session.\nAnnuler : en démarrer une nouvelle.`)) {
        router.push(`/execution/${running[0].id}`);
        return;
      }
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/connexion');
      return;
    }
    const degustationAt = new Date(`${plan.planned_date}T${time}:00`).toISOString();
    const { data: execRow, error } = await supabase
      .from('executions')
      .insert({ planning_id: plan.id, user_id: user.id, status: 'en_cours', degustation_at: degustationAt })
      .select('id')
      .single();
    if (error || !execRow) {
      dialog.alert('Erreur au démarrage de la session : ' + (error?.message || 'création refusée'));
      setBusy(false);
      return;
    }
    try {
      await insertMaterializedExecution(supabase, execRow.id, plan);
    } catch (e) {
      await supabase.from('executions').delete().eq('id', execRow.id);
      dialog.alert('Erreur au démarrage de la session : ' + (e as Error).message);
      setBusy(false);
      return;
    }
    // La fiche recette rend l'historique des exécutions côté serveur
    // (getExecutions) : sans invalidation, la session qui démarre y manque.
    router.refresh();
    router.push(`/execution/${execRow.id}`);
  }

  const dateTxt = plan.planned_date
    ? new Date(plan.planned_date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  return (
    <>
      <div className="relative mb-8 border border-primary/30 bg-surface-container-low rounded-xl px-6 py-4 flex flex-col gap-2">
        <div className="absolute top-4 right-4">
          <PlanEditButton />
        </div>
        <div className="flex items-start gap-3 flex-wrap pr-8">
          <span className="material-symbols-outlined text-primary">event_available</span>
          <div className="flex flex-col gap-1">
            <span className="font-body-md text-on-surface">{text}</span>
            {plan.notes && <p className="font-body-md text-on-surface whitespace-pre-line">{plan.notes}</p>}
          </div>
        </div>
        {!starting && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStarting(true)}
              className="flex items-center gap-1 bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px] hover:shadow-lg transition-all active:scale-95 shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">play_arrow</span> Démarrer la recette
            </button>
          </div>
        )}
      </div>

      {starting && (
        <div className="mb-12 border border-secondary bg-surface-container-low rounded-xl p-6 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Heure de dégustation le {dateTxt}</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="border border-outline-variant rounded px-4 py-2 bg-white font-body-md" />
          </label>
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-label-md text-label-md flex items-center gap-1 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[16px]">play_arrow</span> {busy ? 'Démarrage…' : 'Démarrer'}
          </button>
          <button type="button" onClick={() => setStarting(false)} className="border border-outline px-5 py-2.5 rounded-full font-label-md text-label-md text-on-surface-variant">
            Annuler
          </button>
        </div>
      )}
    </>
  );
}
