'use client';

// Liste « Mes imports » de la page /importer : lien vers la relecture, lien
// vers la recette créée le cas échéant, suppression (uniquement tant
// qu'aucune recette n'est rattachée) et coût IA réservé aux admins.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import type { ImportRow } from '@/lib/imports';

const STATUT_LBL: Record<string, [string, string]> = {
  brouillon: ['Brouillon', 'bg-secondary'],
  verifiee: ['Vérifiée', 'bg-green-700'],
  publiee: ['Publiée', 'bg-primary'],
};

export function ImporterList({ imports, isAdmin }: { imports: ImportRow[]; isAdmin: boolean }) {
  const { mutate, busy } = useMutation();

  async function supprimer(id: number) {
    await mutate(() => createClient().from('imports').delete().eq('id', id), {
      confirm: 'Supprimer définitivement cet import ?',
    });
  }

  if (imports.length === 0) {
    return <p className="text-on-surface-variant italic text-sm">Aucun import pour le moment.</p>;
  }

  return (
    <div className="flex flex-col">
      <LoadingOverlay visible={busy} label="Suppression en cours…" />
      {imports.map((i) => {
        const recette = (i.recette ?? {}) as { titre?: string };
        const alertes = Array.isArray(i.alertes) ? (i.alertes as string[]) : [];
        const [lbl, cls] = STATUT_LBL[i.statut] || [i.statut, 'bg-secondary'];
        let host = i.source_type === 'texte' ? 'texte collé' : i.source_type;
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
            className="flex items-center gap-3 py-3 border-b border-outline-variant/30 flex-wrap"
          >
            <Link
              href={`/relecture/${i.id}`}
              className="flex items-center gap-3 flex-1 min-w-[180px] group hover:text-primary"
            >
              <span className={`font-label-md text-[11px] px-2.5 py-0.5 rounded-full text-white ${cls}`}>
                {lbl}
              </span>
              <span className="font-body-md group-hover:text-primary">{recette.titre || 'Sans titre'}</span>
            </Link>
            <span className="text-sm text-on-surface-variant">{host}</span>
            {alertes.length > 0 && (
              <span className="text-sm text-error" title={alertes.join('\n')}>
                ⚠ {alertes.length}
              </span>
            )}
            {isAdmin && (
              <span className="text-sm text-on-surface-variant" title="Coût IA de cet import (admin uniquement)">
                {i.cost_usd != null ? `${i.cost_usd.toFixed(4)} $` : '— $'}
              </span>
            )}
            <span className="text-sm text-on-surface-variant">
              {new Date(i.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </span>
            {i.recipe_id ? (
              <Link
                href={`/recette/${i.recipe_id}`}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[18px]">menu_book</span> Voir la recette
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => supprimer(i.id)}
                className="text-on-surface-variant hover:text-error transition-colors"
                title="Supprimer cet import"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
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
