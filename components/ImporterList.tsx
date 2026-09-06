'use client';

// Liste « Mes imports » de la page /importer : lien vers la relecture, lien
// vers la recette créée le cas échéant, suppression (uniquement tant
// qu'aucune recette n'est rattachée) et coût IA réservé aux admins.
//
// Porte aussi l'ANNONCE de la rétention (§ 7.9). Une purge automatique qui ne
// se dit nulle part est indiscernable d'une perte de données : la mention
// générale est en tête, et l'échéance n'apparaît ligne par ligne que dans la
// dernière semaine — dater chaque import trente jours à l'avance
// transformerait la liste en compte à rebours.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { RETENTION_JOURS, dateSuppression, suppressionProche } from '@/lib/imports-retention';
import type { ImportRow } from '@/lib/imports';

const STATUT_LBL: Record<string, [string, string]> = {
  brouillon: ['Brouillon', 'bg-secondary'],
  verifiee: ['Vérifiée', 'bg-green-700'],
  publiee: ['Publiée', 'bg-primary'],
};

// Grille alignant les colonnes entre les lignes (colonne coût en plus pour un
// admin) : titre | source | alertes | [coût] | date | action | chevron.
const GRID_COLS = 'grid-cols-[minmax(0,1fr)_110px_44px_72px_28px_20px]';
const GRID_COLS_ADMIN = 'grid-cols-[minmax(0,1fr)_110px_44px_80px_72px_28px_20px]';

export function ImporterList({ imports, isAdmin }: { imports: ImportRow[]; isAdmin: boolean }) {
  const { mutate, busy } = useMutation();
  // Suppression optimiste locale : le spinner doit rester affiché jusqu'à ce
  // que l'import disparaisse effectivement de la liste, sans attendre le
  // router.refresh() (resynchronisation serveur en arrière-plan) — cf. règle
  // dans CLAUDE.md.
  const [list, setList] = useState(imports);
  useEffect(() => setList(imports), [imports]);

  async function supprimer(id: number) {
    const ok = await mutate(() => createClient().from('imports').delete().eq('id', id), {
      confirm: 'Supprimer définitivement cet import ?',
    });
    if (ok) setList((prev) => prev.filter((i) => i.id !== id));
  }

  if (list.length === 0) {
    return <p className="text-on-surface-variant italic text-sm">Aucun import pour le moment.</p>;
  }

  return (
    <div className="flex flex-col">
      <LoadingOverlay visible={busy} label="Suppression en cours…" />
      <p className="pb-3 text-[12.5px] text-on-surface-variant">
        Vos imports sont conservés {RETENTION_JOURS} jours après leur dernière modification, puis
        supprimés automatiquement. La recette créée à partir d’un import, elle, reste dans votre
        carnet.
      </p>
      {list.map((i) => {
        const recette = (i.recette ?? {}) as { titre?: string };
        const alertes = Array.isArray(i.alertes) ? (i.alertes as string[]) : [];
        const [lbl, cls] = STATUT_LBL[i.statut] || [i.statut, 'bg-secondary'];
        let host =
          i.source_type === 'texte'
            ? 'texte collé'
            : i.source_type === 'pdf'
              ? i.fichier_original || 'PDF'
              : i.source_type === 'photo'
                ? 'photos'
                : i.source_type;
        if (i.source_url) {
          try {
            host = new URL(i.source_url).hostname.replace(/^www\./, '');
          } catch {
            /* URL invalide : on garde le type de source */
          }
        }
        return (
          <div
            key={i.id}
            className={`grid ${isAdmin ? GRID_COLS_ADMIN : GRID_COLS} items-center gap-3 py-3 border-b border-outline-variant/30`}
          >
            <Link href={`/relecture/${i.id}`} className="flex items-center gap-3 min-w-0 group hover:text-primary">
              <span className={`shrink-0 font-label-md text-[11px] px-2.5 py-0.5 rounded-full text-white ${cls}`}>
                {lbl}
              </span>
              <span className="font-body-md truncate group-hover:text-primary">{recette.titre || 'Sans titre'}</span>
            </Link>
            <span className="text-sm text-on-surface-variant truncate">{host}</span>
            <span className="text-sm text-error">
              {alertes.length > 0 && <span title={alertes.join('\n')}>⚠ {alertes.length}</span>}
            </span>
            {isAdmin && (
              <span className="text-sm text-on-surface-variant" title="Coût IA de cet import (admin uniquement)">
                {i.cost_usd != null ? `${i.cost_usd.toFixed(3)} $` : '— $'}
              </span>
            )}
            {suppressionProche(i.updated_at) ? (
              <span
                className="text-sm text-error"
                title={`Sans modification, cet import sera supprimé le ${dateSuppression(i.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}. Le rouvrir repart pour ${RETENTION_JOURS} jours.`}
              >
                ⌛ {dateSuppression(i.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </span>
            ) : (
              <span className="text-sm text-on-surface-variant">
                {new Date(i.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {i.recipe_id ? (
              <Link
                href={`/recette/${i.recipe_id}`}
                className="material-symbols-outlined text-[18px] text-primary hover:text-primary/70"
                title="Voir la recette"
                aria-label="Voir la recette"
              >
                menu_book
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => supprimer(i.id)}
                className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-error transition-colors"
                title="Supprimer cet import"
                aria-label="Supprimer cet import"
              >
                delete
              </button>
            )}
            <Link
              href={`/relecture/${i.id}`}
              className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary"
            >
              chevron_right
            </Link>
          </div>
        );
      })}
    </div>
  );
}
