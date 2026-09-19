'use client';

// Troisième mode de création, à côté de « Importer » et « Créer » (spec,
// critère d'acceptation 1).
//
// Un bouton et non un lien : la création d'un projet est une ÉCRITURE (une
// ligne `recipes` marquée projet, plus sa ligne satellite), et une écriture
// ne se déclenche pas sur une navigation — un prefetch de `<Link>` créerait
// des projets vides au simple survol.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { LockedAction } from '@/components/LockedAction';

const BTN =
  'flex items-center gap-1.5 rounded-pill border border-outline-variant px-4 py-2.5 text-[13px] font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-40';

export function NewProjectButton({ peutProjet = true }: { peutProjet?: boolean }) {
  const router = useRouter();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);

  async function creer() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/projet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (!r.ok || !data?.id) {
        dialog.alert(data?.erreur || "La création du projet a échoué.");
        return;
      }
      router.push(`/projets/${data.id}`);
    } catch {
      dialog.alert("La création du projet a échoué.");
    } finally {
      // Le voile reste porté par la navigation qui suit (NavigationSpinner) ;
      // ici on ne fait que rendre le bouton à nouveau cliquable si la
      // création a échoué.
      setBusy(false);
    }
  }

  // JEP-130 : ce bouton était rendu SANS aucun contrôle de droit — le seul
  // droit binaire dans ce cas. Le refus n'arrivait qu'après le clic, dans une
  // boîte de dialogue, après un aller-retour vers /api/projet. Il reste à sa
  // place, grisé, et dit pourquoi avant le clic. La route garde évidemment sa
  // garde (`verifierAcces`) : l'interface n'est jamais la garantie.
  if (!peutProjet) {
    return (
      <LockedAction
        label="Créer un projet"
        message="Le mode projet n'est pas inclus dans votre formule."
        className="rounded-pill border border-outline-variant px-4 py-2.5 text-[13px] font-semibold"
      >
        Projet
      </LockedAction>
    );
  }

  return (
    <>
      <LoadingOverlay visible={busy} label="Création du projet…" />
      <button type="button" onClick={creer} disabled={busy} className={BTN}>
        <span className="material-symbols-outlined text-[18px]">account_tree</span> Projet
      </button>
    </>
  );
}
