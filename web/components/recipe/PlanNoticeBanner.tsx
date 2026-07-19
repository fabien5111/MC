'use client';

// Bandeau de contexte planifié (porté de #plan-notice de recette.html) :
// texte + bouton « Démarrer la recette » (déroule le formulaire d'heure de
// dégustation puis crée une exécution) + crayon d'édition du plan.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { RecipeFull } from '@/lib/recipes';
import type { PlanningEntry } from '@/lib/profile';
import { normalizeOverrides, buildExecutionSnapshot } from '@/lib/recipe-plan';
import type { Json } from '@/lib/database.types';
import { PlanEditButton } from '@/components/recipe/PlanEditButton';

export function PlanNoticeBanner({ text, recipe, plan }: { text: string; recipe: RecipeFull; plan: PlanningEntry }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [time, setTime] = useState('12:00');
  const [busy, setBusy] = useState(false);

  async function start() {
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
      if (confirm(`Une session démarrée le ${d} est déjà en cours pour cette recette.\n\nOK : reprendre cette session.\nAnnuler : en démarrer une nouvelle.`)) {
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
    const overrides = normalizeOverrides(plan.overrides);
    const snapshot = buildExecutionSnapshot(recipe, plan, overrides);
    const { data, error } = await supabase
      .from('executions')
      .insert({ planning_id: plan.id, user_id: user.id, status: 'en_cours', degustation_at: degustationAt, snapshot: snapshot as unknown as Json })
      .select('id')
      .single();
    if (error) {
      alert('Erreur au démarrage de la session : ' + error.message);
      setBusy(false);
      return;
    }
    router.push(`/execution/${data.id}`);
  }

  const dateTxt = plan.planned_date
    ? new Date(plan.planned_date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  return (
    <>
      <div className="mb-8 border border-primary/30 bg-surface-container-low rounded-xl px-6 py-4 flex items-center gap-3 flex-wrap">
        <span className="material-symbols-outlined text-primary">event_available</span>
        <span className="font-body-md text-on-surface">{text}</span>
        {!starting && (
          <button
            type="button"
            onClick={() => setStarting(true)}
            className="ml-auto flex items-center gap-1 bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px] hover:shadow-lg transition-all active:scale-95 shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">play_arrow</span> Démarrer la recette
          </button>
        )}
        <PlanEditButton />
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
