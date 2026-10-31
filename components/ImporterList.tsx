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
const SM_COLS = 'sm:grid-cols-[minmax(0,1fr)_110px_44px_72px_28px_20px]';
const SM_COLS_ADMIN = 'sm:grid-cols-[minmax(0,1fr)_110px_44px_80px_72px_28px_20px]';

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
        const dateSuppr = suppressionProche(i.updated_at);
        return (
          // Ligne entière cliquable : le lien du titre s'étire sur toute la
          // ligne (`after:absolute after:inset-0`), les gestes distincts
          // (voir la recette, supprimer) restent au-dessus (`z-10`).
          // Sous 640 px : titre + geste sur une ligne, détails dessous ;
          // dès `sm`, la grille d'origine (le bloc des détails devient
          // `contents`, ses éléments retrouvent leur colonne).
          <div
            key={i.id}
            className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 border-b border-outline-variant/30 transition-colors hover:bg-surface-container/40 sm:gap-y-0 ${isAdmin ? SM_COLS_ADMIN : SM_COLS}`}
          >
            <Link
              href={`/relecture/${i.id}`}
              className="col-start-1 row-start-1 flex min-w-0 items-start gap-3 group hover:text-primary after:absolute after:inset-0 after:content-[''] sm:col-auto sm:row-auto sm:items-center"
            >
              <span className={`shrink-0 font-label-md text-[11px] px-2.5 py-0.5 rounded-full text-white ${cls}`}>
                {lbl}
              </span>
              <span className="min-w-0 font-body-md line-clamp-2 break-words group-hover:text-primary sm:truncate">
                {recette.titre || 'Sans titre'}
              </span>
            </Link>
            <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 sm:contents">
              <span className="min-w-0 max-w-[55%] truncate text-xs text-on-surface-variant sm:max-w-none sm:text-sm">{host}</span>
              <span className="text-xs text-error sm:text-sm">
                {alertes.length > 0 && <span title={alertes.join('\n')}>⚠ {alertes.length}</span>}
              </span>
              {isAdmin && (
                <span className="text-xs text-on-surface-variant sm:text-sm" title="Coût IA de cet import (admin uniquement)">
                  {i.cost_usd != null ? `${i.cost_usd.toFixed(3)} $` : '— $'}
                </span>
              )}
              {dateSuppr ? (
                <span
                  className="text-xs text-error sm:text-sm"
                  title={`Sans modification, cet import sera supprimé le ${dateSuppression(i.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}. Le rouvrir repart pour ${RETENTION_JOURS} jours.`}
                >
                  ⌛ {dateSuppression(i.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              ) : (
                <span className="text-xs text-on-surface-variant sm:text-sm">
                  {new Date(i.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
            {/* Zone de toucher de 44 px sur mobile ; l'icône reste à 18 px
                (la feuille des icônes impose `inline-block` : le centrage
                est porté par l'enveloppe, pas par l'icône). */}
            {i.recipe_id ? (
              <Link
                href={`/recette/${i.recipe_id}`}
                className="relative z-10 col-start-2 row-start-1 -my-2 -mr-2 flex h-11 w-11 items-center justify-center text-primary hover:text-primary/70 sm:col-auto sm:row-auto sm:m-0 sm:h-auto sm:w-auto"
                title="Voir la recette"
                aria-label="Voir la recette"
              >
                <span className="material-symbols-outlined text-[18px]">menu_book</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => supprimer(i.id)}
                className="relative z-10 col-start-2 row-start-1 -my-2 -mr-2 flex h-11 w-11 items-center justify-center text-on-surface-variant hover:text-error transition-colors sm:col-auto sm:row-auto sm:m-0 sm:h-auto sm:w-auto"
                title="Supprimer cet import"
                aria-label="Supprimer cet import"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            )}
            {/* Décoratif : toute la ligne est déjà le lien. */}
            <span aria-hidden="true" className="hidden text-on-surface-variant sm:block">
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
