'use client';

// Gestion des recettes (porté de admin-recettes.html) : table « à valider »
// (valider / modifier / refuser) et table « validées & privées » (modifier /
// refuser). Mutations via useMutation (écriture navigateur + resynchro serveur).
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import type {
  AdminRecipeRow,
  RecipeAnalysisSummary,
  RecipeSimilarityMatchSummary,
  MatchFeedbackVerdict,
  CalibrationBucket,
} from '@/lib/admin';
import { MODERATION_CATEGORIES } from '@/lib/ai/moderation';
import { buildAnalysisSummary } from '@/lib/ai/analysis-summary';
import { formatUsd } from '@/lib/ai/cost';

const PLAN_LBL: Record<string, string> = { units: 'Quantité produite', mold: 'Moule', dimensions: 'Dimensions' };

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(MODERATION_CATEGORIES.map((c) => [c.code, c.label]));

const FLAG_STYLE: Record<string, string> = {
  vert: 'bg-primary-fixed text-on-primary-fixed',
  orange: 'bg-tertiary-container text-on-tertiary-container',
  rouge: 'bg-error-container text-on-error-container',
};

// Commande de réindexation complète (§6.3 : « Prévoir une commande de
// réindexation complète »). Remet l'index de similarité en cohérence avec
// l'état réel du corpus publié — utile après une dérive (recette supprimée
// hors de ce parcours, migration…), pas un geste courant.
function ReindexBar() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function reindexAll() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/reindex-recette', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full: true }),
      });
      const data = (await res.json()) as { indexed?: number; total?: number; retires?: number; erreur?: string };
      setResult(res.ok ? `${data.indexed}/${data.total} recette(s) indexée(s), ${data.retires ?? 0} entrée(s) retirée(s).` : data.erreur || 'Échec.');
    } catch {
      setResult('Échec de la réindexation.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3 text-xs text-on-surface-variant">
      <button
        type="button"
        onClick={reindexAll}
        disabled={running}
        className="px-3 py-1.5 rounded border border-outline-variant hover:text-primary hover:border-primary font-label-md transition-colors disabled:opacity-50"
      >
        {running ? 'Réindexation…' : 'Réindexer le corpus (similarité)'}
      </button>
      {result && <span>{result}</span>}
    </div>
  );
}

// Surligne l'occurrence de `mark` dans `text` (recherche par sous-chaîne
// exacte — le serveur fournit `commun`, garanti présent dans le texte qui
// l'a produit ; absent ou introuvable, le texte s'affiche simplement sans
// surlignage plutôt que de faire planter l'affichage).
function Highlighted({ text, mark }: { text: string; mark?: string }) {
  if (!mark) return <>{text}</>;
  const idx = text.indexOf(mark);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-tertiary-container text-on-tertiary-container rounded px-0.5">{text.slice(idx, idx + mark.length)}</mark>
      {text.slice(idx + mark.length)}
    </>
  );
}

// Une carte de correspondance (§9) : deux jauges distinctes et libellées —
// « le texte rédigé est l'indicateur de copie, les ingrédients/structure
// sont informatifs » (§4.1/§4.2, vocabulaire « similarité rédactionnelle
// élevée » plutôt que « plagiat »). Vue comparative côte à côte avec
// surlignage du passage commun (§9 : « l'élément le plus important de
// l'écran »), et retour de calibration (§9 : « deux boutons "Faux positif" /
// "Copie confirmée" qui alimentent recipe_analysis_feedback »).
function MatchCard({ match, initialFeedback }: { match: RecipeSimilarityMatchSummary; initialFeedback?: MatchFeedbackVerdict }) {
  const isExterne = match.source_type === 'externe';
  // Couche B approximée par jugement Claude (lib/ai/reformulation.ts) : pas
  // de séquence commune littérale par construction (c'est une reformulation,
  // pas une copie), score rédactionnel jugé plutôt que mesuré — comme les
  // correspondances externes, annoncé comme une estimation.
  const isReformulation = match.detection_method === 'embedding';
  const ex = match.matched_excerpts?.[0];
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState<MatchFeedbackVerdict | undefined>(initialFeedback);

  async function vote(verdict: 'faux_positif' | 'confirme') {
    setVoting(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // `recipe_analysis_feedback` absente des types générés tant que la
      // migration du lot 1 n'a pas été régénérée — accès non typé, comme le
      // reste du contrôle IA.
      const { error } = await (supabase as any)
        .from('recipe_analysis_feedback')
        .insert({ analysis_id: match.analysis_id, match_id: match.id, admin_id: user.id, verdict });
      if (!error) setVoted(verdict);
    } finally {
      setVoting(false);
    }
  }

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
        {isReformulation && <span className="text-[11px] text-on-surface-variant italic">reformulation détectée, jugement IA</span>}
      </div>
      <div className={`mt-2 grid ${isExterne ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
        <div>
          <p className="text-[10.5px] uppercase tracking-wider text-on-surface-variant">Texte rédigé — indicateur de copie</p>
          <p className="text-sm font-semibold text-on-surface">
            {match.editorial_score.toFixed(0)} %{' '}
            {(isExterne || isReformulation) && (
              <span className="font-normal text-on-surface-variant">
                ({isExterne ? 'estimation IA, hors site' : 'estimation IA, reformulation'})
              </span>
            )}
          </p>
        </div>
        {!isExterne && (
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-on-surface-variant">Ingrédients et structure</p>
            <p className="text-sm font-semibold text-on-surface-variant">{match.structural_score.toFixed(0)} % — normal pour une recette classique</p>
          </div>
        )}
      </div>
      {ex && (ex.extrait_soumis || ex.extrait_source) && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Recette soumise</p>
            <p className="text-[12px] italic text-on-surface bg-tertiary-container/40 rounded px-2 py-1">
              « <Highlighted text={ex.extrait_soumis} mark={ex.commun} /> »
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">{isExterne ? 'Page trouvée' : 'Recette source'}</p>
            <p className="text-[12px] italic text-on-surface bg-tertiary-container/40 rounded px-2 py-1">
              « <Highlighted text={ex.extrait_source} mark={ex.commun} /> »
            </p>
          </div>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        {voted ? (
          <span className="text-[11px] text-on-surface-variant italic">
            Retour enregistré : {voted === 'faux_positif' ? 'faux positif' : voted === 'confirme' ? 'copie confirmée' : 'incertain'}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => vote('faux_positif')}
              disabled={voting}
              className="px-2 py-1 rounded border border-outline-variant text-[11px] text-on-surface-variant hover:text-primary hover:border-primary transition-colors disabled:opacity-50"
            >
              Faux positif
            </button>
            <button
              type="button"
              onClick={() => vote('confirme')}
              disabled={voting}
              className="px-2 py-1 rounded border border-error text-[11px] text-error hover:bg-error-container transition-colors disabled:opacity-50"
            >
              Copie confirmée
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Écran de statistiques simple (§9 : « taux de faux positifs par tranche de
// score »), calculé depuis les retours de calibration ci-dessus — tranches
// reprenant les seuils de drapeau du §8, précisément ce que ce retour doit
// aider à ajuster.
function CalibrationStats({ buckets }: { buckets: CalibrationBucket[] }) {
  const hasData = buckets.some((b) => b.total > 0);
  return (
    <section className="border border-outline-variant rounded-xl p-5 bg-surface-container-low">
      <h2 className="font-headline-md text-base text-primary">Calibration de l&apos;analyse IA</h2>
      <p className="text-[12.5px] text-on-surface-variant mt-1">
        Taux de faux positifs par tranche de similarité rédactionnelle, à partir des retours « Faux positif » / « Copie confirmée ».
      </p>
      {!hasData ? (
        <p className="text-on-surface-variant text-sm italic mt-3">Aucun retour enregistré pour le moment.</p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-4">
          {buckets.map((b) => (
            <div key={b.label} className="text-center">
              <p className="text-[11px] uppercase tracking-wider text-on-surface-variant">{b.label}</p>
              <p className="text-2xl font-semibold text-on-surface">{b.total ? `${b.tauxFauxPositifs} %` : '—'}</p>
              <p className="text-[11px] text-on-surface-variant">
                {b.fauxPositifs}/{b.total} faux positif{b.fauxPositifs > 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Panneau « Analyse automatique » (§9) — drapeau + phrase de synthèse en
// en-tête (toujours visible, pas besoin de déplier pour l'essentiel),
// catégories de modération avec extrait verbatim, correspondances de
// similarité avec retour de calibration, et relance manuelle (§10).
function AnalysisPanel({
  recipeId,
  analysis,
  matches,
  feedback,
}: {
  recipeId: string;
  analysis: RecipeAnalysisSummary | undefined;
  matches: RecipeSimilarityMatchSummary[];
  feedback: Record<number, MatchFeedbackVerdict>;
}) {
  const { refresh } = useMutation();
  const [relancing, setRelancing] = useState(false);
  const [open, setOpen] = useState(false);

  async function relancer() {
    setRelancing(true);
    try {
      // `force` contourne le cache par empreinte de contenu (§6.4) : une
      // relance manuelle doit toujours recalculer, même sans changement du
      // texte — sinon le bouton renvoie silencieusement l'ancien résultat.
      await fetch('/api/moderation-recette', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipeId, force: true }),
      });
      refresh();
    } finally {
      setRelancing(false);
    }
  }

  const categories = analysis?.moderation_details?.categories ?? [];
  const topMatch = matches[0];
  const summary =
    analysis?.status === 'termine'
      ? buildAnalysisSummary({
          moderationVerdict: analysis.moderation_verdict,
          moderationCategories: categories,
          editorialMax: analysis.editorial_similarity_max ?? 0,
          longestSequence: topMatch?.longest_common_sequence ?? 0,
          topMatchTitle: topMatch?.source_title ?? null,
          topMatchIsExternal: topMatch?.source_type === 'externe',
        })
      : null;

  return (
    <div className="text-sm">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-on-surface hover:text-primary transition-colors shrink-0"
        >
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
                  : (analysis.overall_flag ?? '—')}
          </span>
        </button>
        {summary && <p className="text-xs text-on-surface-variant pt-1">{summary}</p>}
      </div>

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
                {matches.length} correspondance{matches.length > 1 ? 's' : ''} trouvée{matches.length > 1 ? 's' : ''}
              </p>
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} initialFeedback={feedback[m.id]} />
              ))}
            </div>
          )}
          {analysis?.moderation_details?.external_note && (
            <p className="text-[11px] text-on-surface-variant italic">{analysis.moderation_details.external_note}</p>
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
          {analysis?.status === 'termine' && (
            <p className="text-[11px] text-on-surface-variant">
              Coût de l&apos;analyse : {analysis.cost_usd != null ? formatUsd(analysis.cost_usd) : 'inconnu (antérieure au suivi des coûts)'}
              {analysis.cost_tokens != null && ` · ${analysis.cost_tokens.toLocaleString('fr-FR')} tokens`}
              {!!analysis.cost_searches && ` · ${analysis.cost_searches} recherche${analysis.cost_searches > 1 ? 's' : ''} web`}
            </p>
          )}
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

// Trois lignes possibles pour une recette dans cette console : en attente de
// décision, déjà publiée/privée, ou refusée (§9). Un enum plutôt qu'un
// booléen `isPending` — le refus introduit un troisième état, pas
// simplement la négation du premier.
type RowMode = 'pending' | 'managed' | 'rejected';

export function RecipesManager({
  pending,
  managed,
  rejected,
  analyses,
  matches,
  feedback,
  calibration,
}: {
  pending: AdminRecipeRow[];
  managed: AdminRecipeRow[];
  rejected: AdminRecipeRow[];
  analyses: Record<string, RecipeAnalysisSummary>;
  matches: Record<number, RecipeSimilarityMatchSummary[]>;
  feedback: Record<number, MatchFeedbackVerdict>;
  calibration: CalibrationBucket[];
}) {
  const { mutate } = useMutation();
  const dialog = useDialog();

  async function setStatus(id: string, status: string, moderationNote?: string) {
    // `moderation_note` absente des types générés tant que cette migration
    // n'a pas été régénérée (`npm run gen:types`) — payload non typé pour ce
    // seul appel, comme le reste du contrôle IA en attendant.
    const payload: Record<string, unknown> = { status };
    if (moderationNote !== undefined) payload.moderation_note = moderationNote;
    const ok = await mutate(() => createClient().from('recipes').update(payload as never).eq('id', id));
    if (ok) {
      // Maintenance de l'index de similarité (§6.3) : « Valider »/« Republier »
      // publient (entrée à ajouter), « Refuser »/« Retirer » dépublient (entrée
      // à retirer) — la route détermine laquelle des deux depuis le statut réel
      // en base.
      fetch('/api/reindex-recette', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipeId: id }),
      }).catch(() => {});
    }
  }

  function Row({ r, mode }: { r: AdminRecipeRow; mode: RowMode }) {
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
            {mode === 'pending' && (
              <button
                onClick={() => setStatus(r.id, 'published')}
                title="Valider"
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-label-md hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span> Valider
              </button>
            )}
            {mode === 'rejected' && (
              <button
                onClick={() => setStatus(r.id, 'published')}
                title="Republier (annule le refus)"
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-label-md hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span> Republier
              </button>
            )}
            <Link
              href={`/creer?id=${r.id}`}
              title="Modifier"
              className="flex items-center gap-1 px-3 py-1.5 rounded border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary text-xs font-label-md transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">edit_note</span> Modifier
            </Link>
            {mode !== 'rejected' && (
              <button
                onClick={async () => {
                  // « Rejeter avec motif » (§9) : le motif remplace le simple
                  // confirm() — sans messagerie interne pour le transmettre à
                  // l'auteur (fonctionnalité distincte, pas encore construite),
                  // il est au moins enregistré sur la recette plutôt que perdu.
                  const motif = await dialog.prompt(
                    mode === 'pending' ? 'Motif du refus :' : 'Motif du retrait (la recette sera dépubliée) :',
                    { required: true, placeholder: 'Ex. : recette déjà publiée par un autre membre, contenu inapproprié…' },
                  );
                  if (motif !== null) setStatus(r.id, 'rejected', motif.trim());
                }}
                title={mode === 'pending' ? 'Refuser' : 'Retirer (dépublier)'}
                className="flex items-center gap-1 px-3 py-1.5 rounded border border-error text-error hover:bg-error-container text-xs font-label-md transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">block</span> Refuser
              </button>
            )}
          </div>
        </td>
      </tr>
      {mode === 'rejected' && r.moderation_note && (
        <tr>
          <td colSpan={6} className="px-6 pb-2 -mt-2">
            <p className="text-xs text-on-surface-variant">
              <span className="font-semibold text-on-surface">Motif du refus :</span> {r.moderation_note}
            </p>
          </td>
        </tr>
      )}
      {(mode === 'pending' || mode === 'rejected') && (
        <tr className="border-b border-outline-variant last:border-0">
          <td colSpan={6} className="px-6 pb-4 -mt-2">
            <AnalysisPanel
              recipeId={r.id}
              analysis={analyses[r.id]}
              matches={analyses[r.id] ? matches[analyses[r.id].id] ?? [] : []}
              feedback={feedback}
            />
          </td>
        </tr>
      )}
      </>
    );
  }

  const EMPTY_LABEL: Record<RowMode, string> = {
    pending: 'Aucune recette en attente de validation.',
    managed: 'Aucune recette validée ou privée.',
    rejected: 'Aucune recette refusée.',
  };

  function Table({ rows, mode }: { rows: AdminRecipeRow[]; mode: RowMode }) {
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
                  {EMPTY_LABEL[mode]}
                </td>
              </tr>
            ) : (
              rows.map((r) => <Row key={r.id} r={r} mode={mode} />)
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <main className="flex-1 p-margin-mobile md:p-margin-desktop space-y-12 max-w-[1400px] w-full">
      <ReindexBar />
      <section>
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="font-headline-md text-primary">Recettes à valider</h2>
          <span className="font-label-md text-label-md text-on-surface-variant">({pending.length})</span>
        </div>
        <Table rows={pending} mode="pending" />
      </section>
      <section>
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="font-headline-md text-primary">Recettes validées et privées</h2>
          <span className="font-label-md text-label-md text-on-surface-variant">({managed.length})</span>
        </div>
        <Table rows={managed} mode="managed" />
      </section>
      <section>
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="font-headline-md text-primary">Recettes refusées</h2>
          <span className="font-label-md text-label-md text-on-surface-variant">({rejected.length})</span>
        </div>
        <Table rows={rejected} mode="rejected" />
      </section>
      <CalibrationStats buckets={calibration} />
    </main>
  );
}
