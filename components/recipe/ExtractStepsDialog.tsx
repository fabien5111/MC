'use client';

// « Extraire des étapes » — sur la fiche recette (JEP-258, plan Pro) : les
// étapes cochées deviennent une nouvelle recette, brouillon privé du membre
// qui extrait. Copie seule : la recette affichée n'est ni modifiée ni reliée
// à la copie ; son auteur, s'il n'est pas celui qui extrait, est crédité dans
// la source de la copie.
//
// La fenêtre ne propose que le nom et le rendement (poids des ingrédients,
// modifiable) ; le contenu est relu et écrit par `POST /api/recette/extraire`,
// qui ne reçoit d'ici que des identifiants d'étapes. Le reste se complète
// ensuite dans l'éditeur, où l'on arrive directement — comme après
// « Dupliquer la recette ».
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HelpBlockSlot } from '@/components/help/HelpBlockSlot';
import type { HelpBlocksState } from '@/components/help/useHelpBlocks';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { translateQuotaError } from '@/lib/quota-message-client';
import type { ConversionRef, UnitRef } from '@/lib/ingredient-conversions';
import { EXTRACTION_TITRE_MAX, lirePoidsSaisi, poidsExtraction, titreParDefaut } from '@/lib/extraction-etapes';

export type EtapeAExtraire = {
  id: number;
  title: string | null;
  ingredients: { name: string; quantity: string | null; unit: string | null; ref_id: number | null }[];
};

const INPUT = 'border border-outline-variant rounded px-3 py-2 bg-white font-body-md text-sm text-on-surface focus:outline-none focus:border-primary';
const LBL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

export function ExtractStepsDialog({
  recipeId,
  recipeTitle,
  steps,
  conversions,
  units,
  densities,
  onClose,
  help,
}: {
  recipeId: string;
  recipeTitle: string;
  // Étapes de la recette, dans l'ordre de la fiche.
  steps: EtapeAExtraire[];
  conversions: ConversionRef[];
  units: UnitRef[];
  densities: { name: string; density_g_per_ml: number }[];
  onClose: () => void;
  // Aide de la page `recette` (JEP-373), tenue par le parent : la fenêtre se
  // démonte à la fermeture, un masquage ne doit pas être oublié.
  help?: HelpBlocksState;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const guard = useWriteGuard();
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  // Le voile ne ferme la fenêtre que si le clic y a COMMENCÉ : une sélection
  // de texte commencée dans un champ et relâchée au-dehors produit un `click`
  // sur le voile, qui fermait la fenêtre en pleine saisie.
  const pressionSurVoile = useRef(false);
  // Nom et poids suivent la sélection tant que l'utilisateur n'y a pas touché ;
  // une fois saisis, ils sont à lui.
  const [titre, setTitre] = useState<string | null>(null);
  const [poids, setPoids] = useState<string | null>(null);

  const retenues = useMemo(() => steps.filter((s) => selection.has(s.id)), [steps, selection]);
  const estimation = useMemo(
    () => poidsExtraction(retenues.flatMap((s) => s.ingredients), conversions, units, densities),
    [retenues, conversions, units, densities],
  );
  const titreAffiche = titre ?? (retenues.length ? titreParDefaut(retenues, recipeTitle) : '');
  const poidsAffiche = poids ?? (estimation.grams > 0 ? String(estimation.grams) : '');
  const poidsInvalide = poidsAffiche.trim() !== '' && lirePoidsSaisi(poidsAffiche) == null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  function basculer(id: number) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function creer() {
    if (busy || !retenues.length || !titreAffiche.trim() || poidsInvalide) return;
    if (!guard('Extraire des étapes')) return;
    setBusy(true);
    try {
      const resp = await fetch('/api/recette/extraire', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipeId,
          stepIds: retenues.map((s) => s.id),
          title: titreAffiche.trim(),
          yieldGrams: lirePoidsSaisi(poidsAffiche),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || typeof data?.id !== 'string') {
        const brut = typeof data?.erreur === 'string' ? data.erreur : `Erreur ${resp.status}`;
        dialog.alert((await translateQuotaError(brut)) ?? `Extraction impossible : ${brut}`);
        setBusy(false);
        return;
      }
      // Pas de remise à zéro : on quitte la page, le spinner reste jusqu'à
      // la navigation (même motif que « Dupliquer la recette »).
      router.push(`/creer?id=${data.id}`);
    } catch (e) {
      dialog.alert(`Extraction impossible : ${(e as Error).message || 'erreur inattendue'}`);
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Extraire des étapes en recette"
      className="fixed inset-0 z-[95] flex items-start justify-center bg-background/60 backdrop-blur-[2px] p-4 overflow-y-auto"
      onPointerDown={(e) => {
        pressionSurVoile.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const surVoile = pressionSurVoile.current && e.target === e.currentTarget;
        pressionSurVoile.current = false;
        if (surVoile && !busy) onClose();
      }}
    >
      <LoadingOverlay visible={busy} label="Création de la recette…" />
      <div
        className="w-full max-w-2xl my-8 bg-surface-container-low border border-outline-variant rounded-xl shadow-lg flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-outline-variant">
          <div className="flex flex-col gap-1">
            <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-3">
              <span className="material-symbols-outlined">content_cut</span>
              Extraire des étapes
            </h3>
            <p className="font-body-md text-sm text-on-surface-variant">
              Les étapes cochées deviennent une nouvelle recette, en brouillon privé dans votre carnet. Cette recette-ci
              n&apos;est pas modifiée ; si elle est d&apos;un autre membre, il est crédité dans la source de la copie.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer" className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Défile avec la fenêtre (jamais en `fixed`). */}
          {help && <HelpBlockSlot blockKey="recette.extraire" help={help} />}
          <fieldset className="flex flex-col gap-2">
            <legend className={`${LBL} mb-2`}>Étapes à extraire</legend>
            {steps.map((s, i) => (
              <label
                key={s.id}
                className="flex items-center gap-3 border border-outline-variant bg-white rounded px-3 py-2 cursor-pointer hover:border-primary"
              >
                <input type="checkbox" checked={selection.has(s.id)} onChange={() => basculer(s.id)} className="accent-primary w-4 h-4" />
                <span className="font-body-md text-sm text-on-surface flex-1">
                  {i + 1}. {s.title || `Étape ${i + 1}`}
                </span>
                <span className="font-label-md text-[11px] text-on-surface-variant whitespace-nowrap">
                  {s.ingredients.length} ingrédient{s.ingredients.length > 1 ? 's' : ''}
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-2">
            <label className={LBL} htmlFor="extraction-titre">
              Nom de la nouvelle recette
            </label>
            <input
              id="extraction-titre"
              className={INPUT}
              value={titreAffiche}
              maxLength={EXTRACTION_TITRE_MAX}
              placeholder="Cochez d’abord une étape"
              onChange={(e) => setTitre(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className={LBL} htmlFor="extraction-poids">
              Quantité produite (g)
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                id="extraction-poids"
                className={`${INPUT} w-32 ${poidsInvalide ? 'border-error' : ''}`}
                inputMode="decimal"
                value={poidsAffiche}
                onChange={(e) => setPoids(e.target.value)}
              />
              {poids !== null && estimation.grams > 0 && Number(poids) !== estimation.grams && (
                <button type="button" onClick={() => setPoids(null)} className="font-label-md text-[12px] text-primary underline underline-offset-2">
                  revenir au poids des ingrédients ({estimation.grams} g)
                </button>
              )}
            </div>
            <p className="font-body-md text-[12px] text-on-surface-variant">
              {retenues.length === 0
                ? 'Proposée d’après le poids des ingrédients des étapes cochées.'
                : estimation.grams > 0
                  ? `Poids des ingrédients : ${estimation.grams} g, avant la perte de réalisation (fouet, cul-de-poule…). Corrigez-la si besoin.`
                  : 'Aucun ingrédient pesable : laissez vide pour la renseigner plus tard dans l’éditeur.'}
            </p>
            {retenues.length > 0 && estimation.unconverted.length > 0 && (
              <p className="font-body-md text-[12px] text-on-surface-variant italic">
                Non comptés dans le poids :{' '}
                {estimation.unconverted.map((u) => [u.quantity, u.unit, u.name].filter((x) => x != null && x !== '').join(' ')).join(', ')}.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-outline-variant">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="font-label-md border border-outline-variant text-on-surface-variant px-5 py-2.5 rounded-pill text-sm hover:text-primary hover:border-primary transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={creer}
            disabled={busy || !retenues.length || !titreAffiche.trim() || poidsInvalide}
            className="font-label-md bg-primary text-on-primary px-5 py-2.5 rounded-pill text-sm hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Créer la recette
          </button>
        </div>
      </div>
    </div>
  );
}
