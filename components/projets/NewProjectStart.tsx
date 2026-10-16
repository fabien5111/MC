'use client';

// `/projets/nouveau` — étape 1 d'un projet qui n'existe pas encore (JEP-254,
// points 1 et 2). Rien n'est écrit tant que l'utilisateur ne passe pas à
// l'étape 2 : c'est alors seulement que /api/projet crée la recette-projet,
// avec l'intention et, si l'IA a été sollicitée, sa proposition (titre,
// format, composants). Le parcours reprend ensuite sur `/projets/[id]`, à
// l'étape 2, pré-rempli depuis la base — aucune donnée ne voyage d'une page à
// l'autre par le navigateur.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { ProjectIntentStep, type ProjectStartMode } from '@/components/projets/ProjectIntentStep';
import type { ProposedStructure } from '@/lib/ai/project-structure';

export function NewProjectStart({
  peutGenererIA,
  quotaProjetIA,
}: {
  peutGenererIA: boolean;
  quotaProjetIA: { allowed: boolean; limit?: number; usage?: number } | null;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string | undefined>(undefined);

  async function demarrer(mode: ProjectStartMode, intent: string) {
    if (busy) return;
    setBusy(true);
    try {
      let proposal: ProposedStructure | null = null;
      if (mode === 'ai') {
        setLabel('Composition du projet…');
        // Best-effort (spec §12) : une proposition indisponible ne bloque
        // rien, le projet est créé et l'étape 2 s'ouvre vierge.
        try {
          const r = await fetch('/api/projet/structure', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ intent }),
          });
          const data = (await r.json()) as ProposedStructure & { erreur?: string };
          if (data?.erreur) await dialog.alert(data.erreur);
          if (r.ok && data) proposal = data;
        } catch {
          // Silencieux : même comportement que sans IA.
        }
      }

      setLabel('Création du projet…');
      const r = await fetch('/api/projet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent, proposal }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.id) {
        dialog.alert(data?.erreur || 'La création du projet a échoué.');
        setBusy(false);
        return;
      }
      // `replace` : revenir en arrière depuis le projet ne doit pas rouvrir
      // un écran de création, qui en créerait un second. Le voile reste
      // affiché jusqu'au démontage par la navigation.
      router.replace(`/projets/${data.id}`);
    } catch {
      dialog.alert('La création du projet a échoué.');
      setBusy(false);
    }
  }

  return (
    <>
      <LoadingOverlay visible={busy} label={label} />
      <ProjectIntentStep
        peutGenererIA={peutGenererIA}
        quotaProjetIA={quotaProjetIA}
        disabled={busy}
        onSubmit={(mode, intent) => void demarrer(mode, intent)}
      />
    </>
  );
}
