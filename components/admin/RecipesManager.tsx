'use client';

// Gestion des recettes (porté de admin-recettes.html) : table « à valider »
// (valider / modifier / refuser) et table « validées & privées » (modifier /
// refuser). Mutations via useMutation (écriture navigateur + resynchro serveur).
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import type { AdminRecipeRow, RecipeAnalysisSummary, RecipeSimilarityMatchSummary } from '@/lib/admin';
import { MODERATION_CATEGORIES } from '@/lib/ai/moderation';

const PLAN_LBL: Record<string, string> = { units: 'Quantité produite', mold: 'Moule', dimensions: 'Dimensions' };

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(MODERATION_CATEGORIES.map((c) => [c.code, c.label]));

const FLAG_STYLE: Record<string, string> = {
  vert: 'bg-primary-fixed text-on-primary-fixed',
  orange: 'bg-tertiary-container text-on-tertiary-container',
  rouge: 'bg-error-container text-on-error-container',
};

// Une carte de correspondance (§9) : deux jauges distinctes et libellées —
// « le texte rédigé est l'indicateur de copie, les ingrédients/structure
// sont informatifs » (§4.1/§4.2, vocabulaire « similarité rédactionnelle
// élevée » plutôt que « plagiat »). La plus longue séquence commune est
// affichée telle quelle : c'est la preuve la plus lisible pour trancher en
// quelques secondes (§9 : « l'élément le plus important de l'écran »).
function MatchCard({ match }: { match: RecipeSimilarityMatchSummary }) {
  const excerpt = match.matched_excerpts?.[0]?.extrait_soumis;
  return (
    <div className="border border-outline-variant rounded-lg p-3 bg-surface-container-lowest">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {match.source_recipe_id ? (
          <Link href={`/recette/${match.source_recipe_id}`} target="_blank" className="text-xs font-semibold text-primary hover:underline">
            {match.source_title || 'Recette du site'}
          </Link>
        ) : (
          <a href={match.source_url ?? undefined} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline">
            {match.source_title || match.source_url}
          </a>
        )}
        {(match.longest_common_sequence ?? 0) > 0 && (
          <span className="text-[11px] text-on-surface-variant">{match.longest_common_sequence} mots consécutifs identiques</span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10.5px] uppercase tracking-wider text-on-surface-variant">Texte rédigé — indicateur de copie</p>
          <p className="text-sm font-semibold text-on-surface">{match.editorial_score.toFixed(0)} %</p>
        </div>
        <div>
          <p className="text-[10.5px] uppercase tracking-wider text-on-surface-variant">Ingrédients et structure</p>
          <p className="text-sm font-semibold text-on-surface-variant">{match.structural_score.toFixed(0)} % — normal pour une recette classique</p>
        </div>
      </div>
      {excerpt && (
        <p className="mt-2 text-[12px] italic text-on-surface bg-tertiary-container/40 rounded px-2 py-1">« {excerpt} »</p>
      )}
    </div>
  );
}

// Panneau « Analyse automatique » (§9) — verdict de modération, catégories
// signalées avec extrait verbatim, correspondances de similarité (couche A),
// et relance manuelle (§10).
function AnalysisPanel({
  recipeId,
  analysis,
  matches,
}: {
  recipeId: string;
  analysis: RecipeAnalysisSummary | undefined;
  matches: RecipeSimilarityMatchSummary[];
}) {
  const { refresh } = useMutation();
  const [relancing, setRelancing] = useState(false);
  const [open, setOpen] = useState(false);

  async function relancer() {
    setRelancing(true);
    try {
      await fetch('/api/moderation-recette', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipeId }),
      });
      refresh();
    } finally {
      setRelancing(false);
    }
  }

  const categories = analysis?.moderation_details?.categories ?? [];

  return (
    <div className="text-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-on-surface hover:text-primary transition-colors">
        <span className="material-symbols-outlined text-[18px]">{open ? 'expand_less' : 'expand_more'}</span>
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
            analysis?.overall_flag ? FLAG_STYLE[analysis.overall_flag] : 'bg-surface-container-highest text-on-surface-variant'
          }`}
        >
          {!analysis
            ? 'Non analysée'
            : analysis.status === 'en_cours'
              ? 'Analyse en cours…'
              : analysis.status === 'echec'
                ? 'Analyse indisponible'
                : `Modération : ${analysis.moderation_verdict ?? '—'}`}
        </span>
      </button>

      {open && (
        <div className="mt-3 pl-6 space-y-3">
          {analysis?.status === 'echec' && (
            <p className="text-error text-xs">
              {analysis.error_message || 'Analyse indisponible.'} — vérification manuelle requise.
            </p>
          )}
          {analysis?.status === 'termine' && categories.length === 0 && (
            <p className="text-on-surface-variant text-xs italic">Aucun signalement de modération.</p>
          )}
          {matches.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-on-surface-variant">
                {matches.length} correspondance{matches.length > 1 ? 's' : ''} sur le site
              </p>
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          )}
          {categories.map((c, i) => (
            <div key={i} className="border border-outline-variant rounded-lg p-3 bg-surface-container-lowest">
              <div className="flex items-center justify-between gap-2">
                <span className="font-label-md text-xs font-semibold text-on-surface">{CATEGORY_LABEL[c.code] || c.code}</span>
                <span className="text-[11px] text-on-surface-variant">score {c.score.toFixed(2)}</span>
              </div>
              <p className="text-[12.5px] text-on-surface-variant mt-1">{c.explication}</p>
              {c.extraits.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {c.extraits.map((e, ei) => (
                    <li key={ei} className="text-[12px] italic text-on-surface bg-tertiary-container/40 rounded px-2 py-1">
                      « {e} »
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={relancer}
            disabled={relancing}
            className="px-3 py-1.5 rounded border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary text-xs font-label-md transition-colors disabled:opacity-50"
          >
            {relancing ? 'Analyse…' : "Relancer l'analyse"}
          </button>
        </div>
      )}
    </div>
  );
}

export function RecipesManager({
  pending,
  managed,
  analyses,
  matches,
}: {
  pending: AdminRecipeRow[];
  managed: AdminRecipeRow[];
  analyses: Record<string, RecipeAnalysisSummary>;
  matches: Record<number, RecipeSimilarityMatchSummary[]>;
}) {
  const { mutate } = useMutation();
  const dialog = useDialog();

  async function setStatus(id: string, status: string) {
    await mutate(() => createClient().from('recipes').update({ status }).eq('id', id));
  }

  function Row({ r, isPending }: { r: AdminRecipeRow; isPending: boolean }) {
    return (
      <>
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
                title="Valider"
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-label-md hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span> Valider
              </button>
            )}
            <Link
              href={`/creer?id=${r.id}`}
              title="Modifier"
              className="flex items-center gap-1 px-3 py-1.5 rounded border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary text-xs font-label-md transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">edit_note</span> Modifier
            </Link>
            <button
              onClick={async () => {
                const ok = await dialog.confirm(
                  isPending
                    ? 'Refuser cette recette ? Elle sera marquée « publication refusée » et renvoyée à son auteur.'
                    : 'Retirer cette recette ? Elle sera marquée « publication refusée » et renvoyée à son auteur.',
                );
                if (ok) setStatus(r.id, 'rejected');
              }}
              title={isPending ? 'Refuser (renvoyer en brouillon)' : 'Retirer (repasser en brouillon)'}
              className="flex items-center gap-1 px-3 py-1.5 rounded border border-error text-error hover:bg-error-container text-xs font-label-md transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">block</span> Refuser
            </button>
          </div>
        </td>
      </tr>
      {isPending && (
        <tr className="border-b border-outline-variant last:border-0">
          <td colSpan={6} className="px-6 pb-4 -mt-2">
            <AnalysisPanel recipeId={r.id} analysis={analyses[r.id]} matches={analyses[r.id] ? matches[analyses[r.id].id] ?? [] : []} />
          </td>
        </tr>
      )}
      </>
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
