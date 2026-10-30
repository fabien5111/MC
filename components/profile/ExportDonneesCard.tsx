'use client';

// « Télécharger mes données » (RGPD, art. 15 et 20 — JEP-362, lot 2), dans
// `/reglages`, juste avant « Supprimer mon compte ». La route
// (`POST /api/compte/exporter`) fait tout : contrôle de la session, limite d'un
// export par 24 heures, trace au journal, assemblage de l'archive.
import { useState } from 'react';
import { SettingsCard } from '@/components/profile/SettingsCard';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { telechargerExport } from '@/lib/export-donnees-client';

export function ExportDonneesCard() {
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);

  async function telecharger() {
    setBusy(true);
    const r = await telechargerExport('/api/compte/exporter');
    setBusy(false);
    if (!r.ok) await dialog.alert(r.erreur);
  }

  return (
    <SettingsCard icon="download" title="Télécharger mes données" count={0} id="mes-donnees">
      <div className="flex flex-col gap-4">
        <LoadingOverlay visible={busy} />
        <p className="font-body-md text-body-md text-on-surface">
          Recevez une copie de toutes les données que Je pâtisse ! détient sur votre compte, dans un fichier JSON
          lisible et réutilisable par un autre service.
        </p>
        <ul className="list-disc pl-5 text-sm text-on-surface-variant flex flex-col gap-1">
          <li>
            Compte et profil, recettes (étapes, ingrédients, ustensiles, catégories), projets, fournées, avis, idées et
            votes, favoris, pâtissiers suivis, partages, listes, demandes de contact, abonnement, préférences de
            notification.
          </li>
          <li>Les photos n&apos;y figurent que par leur adresse.</li>
          <li>Un téléchargement par jour.</li>
        </ul>
        <button
          type="button"
          onClick={telecharger}
          disabled={busy}
          className="self-start border border-outline-variant rounded py-2.5 px-6 text-sm font-semibold hover:bg-surface-container-high transition-colors disabled:opacity-50"
        >
          Télécharger mes données
        </button>
      </div>
    </SettingsCard>
  );
}
