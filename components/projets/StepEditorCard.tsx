'use client';

// Carte d'édition d'une étape de préparation, calquée sur l'éditeur de recette
// (`/creer`, CreerForm) : même en-tête numéroté, mêmes champs de temps, mêmes
// sous-étapes en liste, même grille de photos, mêmes conseils repliables. Elle
// édite un `ComponentStepDraft` (le pivot du mode projet) et ne sait rien de
// l'écriture en base : c'est `ComponentResolver` qui enregistre, par
// `writeComponentContent` — jamais par l'enregistrement global de CreerForm,
// qui effacerait les `component_id`.
import { ImageSlot } from '@/components/ImageSlot';
import type { ComponentStepDraft } from '@/lib/projects';

type Ingredient = ComponentStepDraft['ingredients'][number];

const MAX_PHOTOS = 4;
const label = 'font-label-md text-label-md text-outline';
const zone =
  'w-full bg-surface-container-low border border-outline-variant p-4 font-body-md text-body-md focus:border-primary outline-none transition-colors resize-none overflow-hidden';

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function entier(v: string): number | null {
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 ? null : n;
}

export function StepEditorCard({
  step,
  index,
  units,
  datalistId,
  onChange,
  onIngredientChange,
  onIngredientAdd,
  onIngredientDelete,
  onDelete,
}: {
  step: ComponentStepDraft;
  index: number;
  units: string[];
  // Liste de suggestions d'ingrédients (datalist), absente si pas de référentiel.
  datalistId?: string;
  onChange: (patch: Partial<ComponentStepDraft>) => void;
  onIngredientChange: (j: number, patch: Partial<Ingredient>) => void;
  onIngredientAdd: () => void;
  onIngredientDelete: (j: number) => void;
  onDelete: () => void;
}) {
  const photos = step.photos ?? [];
  const sous = step.sous_etapes;
  const modeListe = Array.isArray(sous) && sous.length > 0;

  const majSous = (liste: string[]) => onChange({ sous_etapes: liste });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap md:flex-nowrap items-center gap-4 border-b border-primary pb-4">
        <span className="font-display-lg text-headline-lg text-primary">{String(index + 1).padStart(2, '0')}</span>
        <button type="button" onClick={onDelete} title="Supprimer l'étape" className="p-1 text-error hover:opacity-70 shrink-0 md:order-2">
          <span className="material-symbols-outlined">delete</span>
        </button>
        <div className="basis-full order-1 md:hidden" />
        <input
          value={step.title ?? ''}
          onChange={(e) => onChange({ title: e.target.value })}
          className="flex-grow order-1 editorial-input font-headline-md font-medium text-[20px] leading-[28px] md:text-headline-md text-primary"
          placeholder="Titre de l'étape (ex: Réalisation de la pâte)"
          type="text"
        />
      </div>

      <div className="flex flex-wrap gap-6">
        {(
          [
            ['TEMPS DE PRÉP', step.prep_time, (v: number | null) => onChange({ prep_time: v }), 'min'],
            ["TEMPS D'ATTENTE", step.wait_time, (v: number | null) => onChange({ wait_time: v }), 'min'],
            ['TEMPS DE CUISSON', step.cook_time, (v: number | null) => onChange({ cook_time: v }), 'min'],
            ['T°C DE CUISSON', step.cook_temp, (v: number | null) => onChange({ cook_temp: v }), '°C'],
          ] as const
        ).map(([lab, val, set, unit]) => (
          <div key={lab} className="flex flex-col w-44">
            <label className={`${label} text-left`}>{lab}</label>
            <div className="flex items-baseline gap-2">
              <span className="flex-1" />
              <input
                value={val ?? ''}
                onChange={(e) => set(entier(e.target.value))}
                className="editorial-input text-on-surface text-center shrink-0"
                style={{ width: '5rem' }}
                type="number"
                min={0}
              />
              <span className="flex-1 text-sm text-on-surface-variant">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <label className={`${label} whitespace-nowrap`}>À PRÉPARER LE JOUR J −</label>
        <input
          value={step.day_offset ?? ''}
          onChange={(e) => onChange({ day_offset: entier(e.target.value) || null })}
          className="editorial-input text-on-surface w-20"
          type="number"
          min={0}
          placeholder="0"
        />
        <span className="text-sm text-on-surface-variant italic">jour(s) avant dégustation</span>
      </div>

      <div className="flex flex-col">
        <div className="border-l-2 border-transparent pl-4 mb-2">
          <span className={label}>INGRÉDIENTS</span>
        </div>
        <div className="space-y-6">
          {step.ingredients.map((g, j) => (
            <div key={j} className="border-l-2 border-outline-variant/50 pl-4 space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <input
                  value={g.name}
                  // Nom saisi ≠ ingrédient rattaché : le rattachement est refait
                  // à l'enregistrement.
                  onChange={(e) => onIngredientChange(j, { name: e.target.value, ref_id: null })}
                  list={datalistId}
                  autoComplete="off"
                  placeholder="Ingrédient"
                  className="editorial-input text-on-surface min-w-0 flex-1"
                  type="text"
                />
                <input
                  value={g.quantity ?? ''}
                  // Quantité retouchée à la main : la ligne sort du recalcul
                  // global (base effacée), comme à l'étape « Quantités ».
                  onChange={(e) =>
                    onIngredientChange(j, {
                      quantity: e.target.value,
                      ...(g.base_quantity !== undefined ? { base_quantity: null } : {}),
                    })
                  }
                  className="w-16 editorial-input text-on-surface"
                  type="text"
                  placeholder="Qté"
                />
                <select
                  value={g.unit ?? ''}
                  onChange={(e) => onIngredientChange(j, { unit: e.target.value || null })}
                  className="editorial-input text-on-surface cursor-pointer"
                  style={{ width: 'auto' }}
                >
                  <option value=""></option>
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  {g.unit && !units.includes(g.unit) && <option value={g.unit}>{g.unit}</option>}
                </select>
                <button
                  type="button"
                  title="Supprimer"
                  onClick={() => onIngredientDelete(j)}
                  className="p-1 text-error hover:opacity-70 transition-opacity shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <textarea
                  value={g.comment ?? ''}
                  onChange={(e) => {
                    onIngredientChange(j, { comment: e.target.value || null });
                    autoGrow(e.target);
                  }}
                  ref={autoGrow}
                  className="editorial-input text-on-surface min-w-0 flex-[2] resize-none overflow-hidden"
                  rows={1}
                  placeholder="Commentaire (optionnel)"
                />
                {/* Allergènes en texte libre : ceux du référentiel s'ajoutent
                    d'eux-mêmes à l'affichage quand l'ingrédient y est rattaché. */}
                <input
                  value={g.allergen ?? ''}
                  onChange={(e) => onIngredientChange(j, { allergen: e.target.value || null })}
                  className="editorial-input text-on-surface min-w-0 flex-1"
                  type="text"
                  placeholder="Allergènes (optionnel)"
                />
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={onIngredientAdd} className="mt-3 flex items-center gap-2 text-secondary font-label-md text-label-md hover:underline w-fit">
          <span className="material-symbols-outlined">add</span> Ajouter un ingrédient
        </button>
      </div>

      <div className="flex flex-col">
        <label className={`${label} mb-2`}>
          DESCRIPTION{' '}
          <span className="italic normal-case font-normal font-body-md text-on-surface-variant">
            (Afin de faciliter le découpage en sous-étape, commencer vos lignes par -)
          </span>
        </label>
        {!modeListe ? (
          <>
            <textarea
              ref={autoGrow}
              value={step.description ?? ''}
              onChange={(e) => {
                onChange({ description: e.target.value });
                autoGrow(e.target);
              }}
              className={zone}
              placeholder="Décrivez les gestes techniques avec précision..."
              rows={6}
            />
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  // Une ligne = une sous-étape, le « - » de tête est retiré.
                  const lignes = (step.description ?? '')
                    .split('\n')
                    .map((l) => l.replace(/^\s*[-–•]\s*/, '').trim())
                    .filter(Boolean);
                  onChange({ sous_etapes: lignes.length ? lignes : [''], description: '' });
                }}
                className="flex items-center gap-2 text-secondary font-label-md text-label-md hover:underline"
              >
                <span className="material-symbols-outlined">format_list_bulleted</span> Éclater en sous-étapes
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {(sous ?? []).map((t, k) => (
              <div key={k} className="flex items-start gap-2">
                <textarea
                  ref={autoGrow}
                  value={t}
                  onChange={(e) => {
                    majSous((sous ?? []).map((x, m) => (m === k ? e.target.value : x)));
                    autoGrow(e.target);
                  }}
                  onKeyDown={(e) => {
                    // Entrée → nouvelle sous-étape juste après.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      const l = [...(sous ?? [])];
                      l.splice(k + 1, 0, '');
                      majSous(l);
                    }
                  }}
                  className="flex-1 min-h-[3.5rem] bg-surface-container-low border border-outline-variant p-3 font-body-md text-body-md focus:border-primary outline-none transition-colors resize-none overflow-hidden"
                  placeholder="Sous-étape…"
                  rows={2}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  title="Supprimer"
                  onClick={() => {
                    const l = (sous ?? []).filter((_, m) => m !== k);
                    onChange({ sous_etapes: l.length ? l : null });
                  }}
                  className="p-1 text-error hover:opacity-70 shrink-0 mt-1"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-6">
              <button
                type="button"
                onClick={() => majSous([...(sous ?? []), ''])}
                className="flex items-center gap-2 text-secondary font-label-md text-label-md hover:underline"
              >
                <span className="material-symbols-outlined">add</span> Ajouter une sous-étape
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    description: (sous ?? []).filter((t) => t.trim()).map((t) => `- ${t.trim()}`).join('\n'),
                    sous_etapes: null,
                  })
                }
                className="flex items-center gap-2 text-on-surface-variant font-label-md text-label-md hover:underline"
              >
                <span className="material-symbols-outlined">notes</span> Revenir au texte libre
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-[12px] text-on-surface-variant">Cliquez ou glissez une photo sur un emplacement.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map((p, k) => (
            <div key={k} className="space-y-1.5">
              <div className="relative aspect-square border border-dashed border-outline-variant overflow-hidden">
                <ImageSlot
                  src={p.url}
                  originalSrc={p.original_url}
                  aiRetouched={p.ai_retouched}
                  onChange={(url) => onChange({ photos: photos.map((x, m) => (m === k ? { ...x, url, ai_retouched: false } : x)) })}
                  promptAiRetouched
                  onAiRetouchedChange={(v) => onChange({ photos: photos.map((x, m) => (m === k ? { ...x, ai_retouched: v } : x)) })}
                  onOriginalChange={(url) => onChange({ photos: photos.map((x, m) => (m === k ? { ...x, original_url: url } : x)) })}
                  onClear={() => onChange({ photos: photos.filter((_, m) => m !== k) })}
                  shape="rect"
                  maxWidth={800}
                  aspectRatio={1}
                  className="w-full h-full"
                />
              </div>
              <label className="flex items-start gap-1.5 text-[11px] leading-tight text-on-surface-variant cursor-pointer">
                <input
                  type="checkbox"
                  checked={p.ai_retouched}
                  onChange={(e) => onChange({ photos: photos.map((x, m) => (m === k ? { ...x, ai_retouched: e.target.checked } : x)) })}
                  className="w-3.5 h-3.5 mt-0.5 rounded border-outline accent-primary cursor-pointer shrink-0"
                />
                Indication photo retravaillée avec l&apos;IA
              </label>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <div className="relative aspect-square border border-dashed border-outline-variant overflow-hidden">
              <ImageSlot
                src={null}
                onChange={(url) => onChange({ photos: [...photos, { url, original_url: null, ai_retouched: false }] })}
                shape="rect"
                maxWidth={800}
                aspectRatio={1}
                placeholder={`Visuel ${photos.length + 1} — taille idéale : 800 × 800 px`}
                className="w-full h-full"
              />
            </div>
          )}
        </div>
      </div>

      <details open={!!step.tips} className="group border-b border-outline-variant">
        <summary className="flex justify-between items-center py-4 cursor-pointer list-none font-label-md text-label-md text-primary uppercase">
          <span>
            Conseils &amp; Astuces de l&apos;étape{' '}
            <span className="italic normal-case font-normal font-body-md text-on-surface-variant">
              (Ces informations seront affichées lors de la réalisation de la recette)
            </span>
          </span>
          <span className="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
        </summary>
        <div className="pb-6">
          <textarea
            ref={autoGrow}
            value={step.tips ?? ''}
            onChange={(e) => {
              onChange({ tips: e.target.value || null });
              autoGrow(e.target);
            }}
            className={`${zone} italic text-on-surface-variant`}
            placeholder="Une astuce particulière pour cette étape ?"
            rows={4}
          />
        </div>
      </details>
    </div>
  );
}
