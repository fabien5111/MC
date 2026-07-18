'use client';

// Gestion des recettes (porté de admin-recettes.html) : table « à valider »
// (valider / modifier / refuser) et table « validées & privées » (modifier /
// refuser). Mutations via le client Supabase navigateur puis router.refresh().
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { AdminRecipeRow } from '@/lib/admin';

const PLAN_LBL: Record<string, string> = { units: 'Quantité produite', mold: 'Moule', dimensions: 'Dimensions' };

export function RecipesManager({ pending, managed }: { pending: AdminRecipeRow[]; managed: AdminRecipeRow[] }) {
  const router = useRouter();

  async function setStatus(id: string, status: string) {
    const { error } = await createClient().from('recipes').update({ status }).eq('id', id);
    if (error) return void alert('Erreur : ' + error.message);
    router.refresh();
  }

  function Row({ r, isPending }: { r: AdminRecipeRow; isPending: boolean }) {
    return (
      <tr className="hover:bg-surface-container-low transition-colors">
        <td className="px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded bg-surface-container overflow-hidden flex items-center justify-center shrink-0">
              {r.hero_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL
                <img src={r.hero_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-on-surface-variant">image</span>
              )}
            </div>
            <Link href={`/recette/${r.id}`} className="font-medium text-on-surface hover:text-primary">
              {r.title || 'Sans titre'}
            </Link>
          </div>
        </td>
        <td className="px-6 py-4 text-sm text-on-surface">{r.profiles?.full_name || '—'}</td>
        <td className="px-6 py-4 text-sm text-on-surface-variant">{PLAN_LBL[r.measure_type || ''] || '—'}</td>
        <td className="px-6 py-4 text-sm text-on-surface-variant whitespace-nowrap">
          {r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
        </td>
        <td className="px-6 py-4">
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
              r.is_public === false ? 'bg-surface-container-highest text-on-surface-variant' : 'bg-primary-fixed text-on-primary-fixed'
            }`}
          >
            {r.is_public === false ? 'Privée' : 'Publique'}
          </span>
        </td>
        <td className="px-6 py-4 text-right">
          <div className="flex justify-end gap-2 flex-wrap">
            {isPending && (
              <button
                onClick={() => setStatus(r.id, 'published')}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-label-md hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span> Valider
              </button>
            )}
            <Link
              href={`/creer?id=${r.id}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary text-xs font-label-md transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">edit_note</span> Modifier
            </Link>
            <button
              onClick={() =>
                confirm(
                  isPending
                    ? 'Refuser cette recette ? Elle sera marquée « publication refusée » et renvoyée à son auteur.'
                    : 'Retirer cette recette ? Elle sera marquée « publication refusée » et renvoyée à son auteur.',
                ) && setStatus(r.id, 'rejected')
              }
              className="flex items-center gap-1 px-3 py-1.5 rounded border border-error text-error hover:bg-error-container text-xs font-label-md transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">block</span> Refuser
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function Table({ rows, isPending }: { rows: AdminRecipeRow[]; isPending: boolean }) {
    return (
      <div className="bg-surface-container-low border border-outline-variant rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[820px]">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              {['Recette', 'Auteur', 'Type de plan', 'Date', 'Visibilité'].map((h) => (
                <th key={h} className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  {h}
                </th>
              ))}
              <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">
                  {isPending ? 'Aucune recette en attente de validation.' : 'Aucune recette validée ou privée.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => <Row key={r.id} r={r} isPending={isPending} />)
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <main className="flex-1 p-margin-mobile md:p-margin-desktop space-y-12 max-w-[1400px] w-full">
      <section>
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="font-headline-md text-primary">Recettes à valider</h2>
          <span className="font-label-md text-label-md text-on-surface-variant">({pending.length})</span>
        </div>
        <Table rows={pending} isPending />
      </section>
      <section>
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="font-headline-md text-primary">Recettes validées et privées</h2>
          <span className="font-label-md text-label-md text-on-surface-variant">({managed.length})</span>
        </div>
        <Table rows={managed} isPending={false} />
      </section>
    </main>
  );
}
