'use client';

// Carte d'édition d'une étape de préparation, calquée sur l'éditeur de recette
// (`/creer`, CreerForm) : même en-tête numéroté, mêmes champs de temps, mêmes
// sous-étapes en liste, même grille de photos, mêmes conseils repliables. Elle
// édite un `ComponentStepDraft` (le pivot du mode projet) et ne sait rien de
// l'écriture en base : c'est `ComponentResolver` qui enregistre, par
// `writeComponentContent` — jamais par l'enregistrement global de CreerForm,
// qui effacerait les `component_id`.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageSlot } from '@/components/ImageSlot';
import type { ComponentStepDraft } from '@/lib/projects';

type Ingredient = ComponentStepDraft['ingredients'][number];

const MAX_PHOTOS = 4;
// Comme l'éditeur de recette : trois allergènes au plus par ingrédient.
const MAX_ALLERGENS = 3;
// Modes d'ajustement d'une étape — ceux de l'éditeur pour une recette en moule
// (un projet est toujours dimensionné sur un format).
const SCALING_OPTIONS: [string, string][] = [
  ['simple', 'Ajustement selon la taille du moule (volume)'],
  ['foncage', 'Recouvre une surface (pâte à tarte, glaçage…)'],
  ['aucun', "Pas d'ajustement pour cette étape"],
];

// Découpe la valeur stockée (« a, b ») en liste d'allergènes (max 3) — même
// règle que `parseAllergens` de CreerForm.
const parseAllergens = (raw: string | null | undefined): string[] =>
  (raw || '')
    .split(/[,;/]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, MAX_ALLERGENS);
const joinAllergens = (l: string[]): string | null => (l.length ? l.join(', ') : null);
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
  count,
  units,
  datalistId,
  allergenNames,
  refAllergens,
  collapsed,
  onToggleCollapse,
  onChange,
  onIngredientChange,
  onIngredientAdd,
  onIngredientDelete,
  onDelete,
  onInsertBefore,
  onReorder,
}: {
  step: ComponentStepDraft;
  index: number;
  // Nombre d'étapes du brouillon : la suppression n'est offerte que s'il y en a
  // plus d'une (comme dans l'éditeur).
  count: number;
  units: string[];
  // Liste de suggestions d'ingrédients (datalist), absente si pas de référentiel.
  datalistId?: string;
  // Allergènes du référentiel (menu + pastilles, comme dans l'éditeur) et
  // allergènes par ingrédient du référentiel (pré-remplissage au choix du nom).
  // Absents : champ texte libre.
  allergenNames?: string[];
  refAllergens?: Record<string, string>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onChange: (patch: Partial<ComponentStepDraft>) => void;
  onIngredientChange: (j: number, patch: Partial<Ingredient>) => void;
  onIngredientAdd: () => void;
  onIngredientDelete: (j: number) => void;
  onDelete: () => void;
  onInsertBefore: () => void;
  onReorder: (from: number, to: number) => void;
}) {
  const photos = step.photos ?? [];
  const sous = step.sous_etapes;
  const modeListe = Array.isArray(sous) && sous.length > 0;
  const [popup, setPopup] = useState<number | null>(null);
  const [draggingStep, setDraggingStep] = useState(false);

  const majSous = (liste: string[]) => onChange({ sous_etapes: liste });
  const idStep = `projet-etape-${index}`;

  return (
    <div
      id={idStep}
      onDragOver={(e) => {
        if (!draggingStep && !e.dataTransfer.types.includes('text/projet-etape')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        const from = e.dataTransfer.getData('text/projet-etape');
        if (from === '') return;
        e.preventDefault();
        setDraggingStep(false);
        onReorder(parseInt(from, 10), index);
      }}
      className={`scroll-mt-28${draggingStep ? ' opacity-50' : ''}`}
    >
      <div className="flex flex-wrap md:flex-nowrap items-center gap-4 border-b border-primary pb-4">
        <span
          className="material-symbols-outlined text-outline-variant select-none cursor-grab p-1 -m-1"
          title="Glisser pour déplacer l'étape"
          draggable
          onDragStart={(e) => {
            setDraggingStep(true);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/projet-etape', String(index));
          }}
          onDragEnd={() => setDraggingStep(false)}
        >
          drag_indicator
        </span>
        <span className="font-display-lg text-headline-lg text-primary">{String(index + 1).padStart(2, '0')}</span>
        <button type="button" onClick={onInsertBefore} title="Insérer une étape avant celle-ci" className="p-1 text-secondary hover:opacity-70 shrink-0 md:order-2">
          <span className="material-symbols-outlined">add_row_above</span>
        </button>
        <button type="button" onClick={onToggleCollapse} title="Replier / déplier l'étape" className="p-1 text-on-surface-variant hover:opacity-70 shrink-0 md:order-2">
          <span className="material-symbols-outlined">{collapsed ? 'expand_more' : 'expand_less'}</span>
        </button>
        {count > 1 && (
          <button type="button" onClick={onDelete} title="Supprimer l'étape" className="p-1 text-error hover:opacity-70 shrink-0 md:order-2">
            <span className="material-symbols-outlined">delete</span>
          </button>
        )}
        <div className="basis-full order-1 md:hidden" />
        <input
          value={step.title ?? ''}
          onChange={(e) => onChange({ title: e.target.value })}
          className="flex-grow order-1 editorial-input font-headline-md font-medium text-[20px] leading-[28px] md:text-headline-md text-primary"
          placeholder="Titre de l'étape (ex: Réalisation de la pâte)"
          type="text"
        />
      </div>

      {!collapsed && (
        <div className="space-y-8 mt-8">
          <div className="border-b border-outline-variant/60 pb-4 flex flex-wrap items-center gap-3">
            <label className="font-label-md text-label-md text-outline shrink-0 uppercase">Ajustement des quantités de cette étape</label>
            <select
              value={step.scaling_mode ?? 'simple'}
              onChange={(e) => onChange({ scaling_mode: e.target.value })}
              className="editorial-input text-on-surface cursor-pointer shrink-0"
              style={{ width: 'auto' }}
            >
              {SCALING_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
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
        <div className="border-l-2 border-transparent pl-4 xl:border-l-0 xl:pl-0 flex items-center gap-4 mb-2">
          <div className="flex-1 min-w-0">
            <span className={label}>INGRÉDIENTS</span>
          </div>
          <div className="w-20 shrink-0" />
          <div className="shrink-0">
            <span className={label}>UNITÉ</span>
            <div aria-hidden className="h-0 overflow-hidden">
              <select className="editorial-input invisible" style={{ width: 'auto' }} tabIndex={-1}>
                <option value=""></option>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="hidden xl:contents">
            <div className="flex-1 min-w-0">
              <span className={label}>ALLERGÈNES</span>
            </div>
            <div className="flex-1 min-w-0" />
            <button aria-hidden type="button" tabIndex={-1} className="p-1 invisible shrink-0">
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        </div>
        <div className="space-y-6">
          {step.ingredients.map((g, j) => {
            const alle = parseAllergens(g.allergen);
            return (
              <div key={j} className="border-l-2 border-outline-variant/50 pl-4 xl:border-l-0 xl:pl-0">
                <div className="flex flex-wrap xl:flex-nowrap items-center gap-x-4 gap-y-1.5">
                  <div className="relative flex-1 min-w-0">
                    <input
                      value={g.name}
                      // Nom saisi ≠ ingrédient rattaché : le rattachement est refait
                      // à l'enregistrement. Un ingrédient du référentiel pré-remplit
                      // ses allergènes (comme l'éditeur de recette).
                      onChange={(e) => {
                        const name = e.target.value;
                        const refKey = name.trim().toLowerCase();
                        if (refAllergens && Object.prototype.hasOwnProperty.call(refAllergens, refKey)) {
                          onIngredientChange(j, {
                            name,
                            ref_id: null,
                            allergen: joinAllergens(parseAllergens(refAllergens[refKey])),
                          });
                        } else {
                          onIngredientChange(j, { name, ref_id: null });
                        }
                      }}
                      list={datalistId}
                      autoComplete="off"
                      placeholder="Ingrédient"
                      className="editorial-input text-on-surface w-full"
                      type="text"
                      data-name-step={index}
                    />
                  </div>
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
                    className="w-16 xl:w-20 editorial-input text-on-surface"
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
                  <div className="basis-full xl:hidden" />
                  <div className="flex-1 min-w-0 order-1 xl:order-2">
                    <textarea
                      value={g.comment ?? ''}
                      onChange={(e) => {
                        onIngredientChange(j, { comment: e.target.value || null });
                        autoGrow(e.target);
                      }}
                      ref={autoGrow}
                      onKeyDown={(e) => {
                        // Tab (sans Maj) depuis le dernier champ de la dernière
                        // ligne → nouvelle ligne d'ingrédient, curseur dessus.
                        if (e.key === 'Tab' && !e.shiftKey && j === step.ingredients.length - 1) {
                          e.preventDefault();
                          onIngredientAdd();
                          setTimeout(() => {
                            const names = document.querySelectorAll<HTMLInputElement>(`[data-name-step="${index}"]`);
                            names[names.length - 1]?.focus();
                          }, 0);
                        }
                      }}
                      className="editorial-input text-on-surface w-full resize-none overflow-hidden"
                      rows={1}
                      placeholder="Commentaire (optionnel)"
                    />
                  </div>
                  <div className="basis-full xl:hidden order-2" />
                  <div className="flex-1 min-w-0 order-3 xl:order-1">
                    {allergenNames ? (
                      <>
                        <span className="xl:hidden block font-label-md text-[10px] uppercase tracking-widest text-outline mb-1">
                          Allergènes
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          {alle.map((a) => (
                            <span
                              key={a}
                              className="inline-flex items-center gap-0.5 bg-secondary-fixed text-on-secondary-fixed rounded-full pl-2 pr-0.5 py-0.5 text-[12px]"
                            >
                              {a}
                              <button
                                type="button"
                                title="Retirer"
                                onClick={() => onIngredientChange(j, { allergen: joinAllergens(alle.filter((x) => x !== a)) })}
                                className="hover:text-error transition-colors"
                              >
                                <span className="material-symbols-outlined text-[14px] align-middle">close</span>
                              </button>
                            </span>
                          ))}
                          {alle.length === 0 ? (
                            <select
                              value=""
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v) onIngredientChange(j, { allergen: v });
                              }}
                              className="editorial-input text-on-surface cursor-pointer italic"
                              style={{ width: 'auto' }}
                              title="Ajouter un allergène (table de référence)"
                            >
                              <option value="">Allergène (optionnel)</option>
                              {allergenNames.map((a) => (
                                <option key={a} value={a}>
                                  {a}
                                </option>
                              ))}
                            </select>
                          ) : (
                            alle.length < MAX_ALLERGENS && (
                              <button
                                type="button"
                                title="Ajouter un allergène"
                                onClick={() => setPopup(j)}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-outline-variant text-primary hover:bg-primary-container transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px]">add</span>
                              </button>
                            )
                          )}
                        </div>
                      </>
                    ) : (
                      // Sans référentiel : saisie libre.
                      <input
                        value={g.allergen ?? ''}
                        onChange={(e) => onIngredientChange(j, { allergen: e.target.value || null })}
                        className="editorial-input text-on-surface w-full"
                        type="text"
                        placeholder="Allergènes (optionnel)"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    title="Supprimer"
                    onClick={() => onIngredientDelete(j)}
                    className="p-1 text-error hover:opacity-70 transition-opacity shrink-0 order-4 xl:order-3"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
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
              rows={8}
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
                <span className="material-symbols-outlined">format_list_bulleted</span> Éclater en sous-étapes{' '}
                <span className="italic normal-case font-normal font-body-md text-on-surface-variant">
                  (Permet de suivre plus précisément le déroulé de la recette lors de l&apos;exécution)
                </span>
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {(sous ?? []).map((t, k) => (
              <div
                key={k}
                className="flex items-start gap-2"
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(`text/projet-sous-${index}`)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  const from = e.dataTransfer.getData(`text/projet-sous-${index}`);
                  if (from === '') return;
                  e.preventDefault();
                  e.stopPropagation();
                  const l = [...(sous ?? [])];
                  const [deplace] = l.splice(parseInt(from, 10), 1);
                  l.splice(k, 0, deplace);
                  majSous(l);
                }}
              >
                <span
                  className="material-symbols-outlined text-outline-variant select-none cursor-grab active:cursor-grabbing p-1 -m-1 mt-2 shrink-0"
                  title="Glisser pour déplacer"
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData(`text/projet-sous-${index}`, String(k));
                  }}
                >
                  drag_indicator
                </span>
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
                      setTimeout(() => {
                        document.querySelectorAll<HTMLTextAreaElement>(`[data-substep-step="${index}"]`)[k + 1]?.focus();
                      }, 0);
                    }
                  }}
                  data-substep-step={index}
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
      )}

      {popup !== null && allergenNames && typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const ing = step.ingredients[popup];
            if (!ing) return null;
            const selected = parseAllergens(ing.allergen);
            const toggle = (name: string) => {
              if (selected.includes(name)) onIngredientChange(popup, { allergen: joinAllergens(selected.filter((x) => x !== name)) });
              else if (selected.length < MAX_ALLERGENS) onIngredientChange(popup, { allergen: joinAllergens([...selected, name]) });
            };
            return (
              <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/30" onClick={() => setPopup(null)} />
                <div className="relative w-full max-w-sm bg-surface-bright border border-outline-variant rounded-xl shadow-xl p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-headline-md text-lg font-semibold text-primary">Allergènes</h3>
                    <button type="button" onClick={() => setPopup(null)} className="text-on-surface-variant hover:text-primary">
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-4">
                    {ing.name.trim() || 'Ingrédient'} — {selected.length}/{MAX_ALLERGENS} sélectionné(s)
                  </p>
                  <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                    {allergenNames.map((a) => {
                      const on = selected.includes(a);
                      const disabled = !on && selected.length >= MAX_ALLERGENS;
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => toggle(a)}
                          disabled={disabled}
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] border transition-colors ${
                            on
                              ? 'bg-primary text-on-primary border-primary'
                              : disabled
                                ? 'border-outline-variant text-on-surface-variant/40 cursor-not-allowed'
                                : 'border-outline-variant text-on-surface hover:bg-surface-container-high'
                          }`}
                        >
                          {on && <span className="material-symbols-outlined text-[16px]">check</span>}
                          {a}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPopup(null)}
                    className="mt-6 w-full bg-primary text-on-primary py-2.5 rounded-lg text-sm font-semibold hover:opacity-90"
                  >
                    Terminé
                  </button>
                </div>
              </div>
            );
          })(),
          document.body,
        )}
    </div>
  );
}
