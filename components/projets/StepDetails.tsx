'use client';

// Détails d'une étape de composant, dans la fenêtre de saisie
// (`ComponentResolver`) : jour, temps, température, astuce et photos — ce que
// l'éditeur de recette porte sur chaque étape et que le brouillon d'un
// composant (`ComponentStepDraft`) transportait déjà sans pouvoir le saisir.
// Repliés par défaut : la plupart des étapes n'en ont pas besoin, et la
// fenêtre est déjà longue.
import { ImageSlot } from '@/components/ImageSlot';
import { dayLabel } from '@/lib/recipe-view';
import type { ComponentStepDraft } from '@/lib/projects';

const champ =
  'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[13px] outline-none focus:border-primary';
const etiquette = 'mb-0.5 block text-[11px] font-semibold uppercase text-on-surface-variant';

// Plus loin que J − 7 n'a pas de sens pour une préparation de pâtisserie.
const JOURS = [0, 1, 2, 3, 4, 5, 6, 7];
const MAX_PHOTOS = 3;

function entier(v: string): number | null {
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 ? null : n;
}

export function StepDetails({
  step,
  onChange,
}: {
  step: ComponentStepDraft;
  onChange: (patch: Partial<ComponentStepDraft>) => void;
}) {
  const photos = step.photos ?? [];
  const rempli =
    !!step.day_offset ||
    step.prep_time != null ||
    step.cook_time != null ||
    step.wait_time != null ||
    step.cook_temp != null ||
    !!step.tips ||
    photos.length > 0;

  return (
    <details open={rempli} className="mb-3 rounded-lg bg-surface-container-low px-3 py-2">
      <summary className="cursor-pointer text-[12px] font-semibold text-primary">
        Jour, temps, astuce et photos
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <label className={etiquette}>Jour</label>
          <select
            value={step.day_offset ?? 0}
            onChange={(e) => onChange({ day_offset: Number(e.target.value) || null })}
            className={champ}
          >
            {JOURS.map((j) => (
              <option key={j} value={j}>
                {dayLabel(j)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={etiquette}>Prép. (min)</label>
          <input
            value={step.prep_time ?? ''}
            onChange={(e) => onChange({ prep_time: entier(e.target.value) })}
            inputMode="numeric"
            className={champ}
          />
        </div>
        <div>
          <label className={etiquette}>Cuisson (min)</label>
          <input
            value={step.cook_time ?? ''}
            onChange={(e) => onChange({ cook_time: entier(e.target.value) })}
            inputMode="numeric"
            className={champ}
          />
        </div>
        <div>
          <label className={etiquette}>Temp. (°C)</label>
          <input
            value={step.cook_temp ?? ''}
            onChange={(e) => onChange({ cook_temp: entier(e.target.value) })}
            inputMode="numeric"
            className={champ}
          />
        </div>
        <div>
          <label className={etiquette}>Repos (min)</label>
          <input
            value={step.wait_time ?? ''}
            onChange={(e) => onChange({ wait_time: entier(e.target.value) })}
            inputMode="numeric"
            className={champ}
          />
        </div>
      </div>
      <div className="mt-3">
        <label className={etiquette}>Astuce</label>
        <input
          value={step.tips ?? ''}
          onChange={(e) => onChange({ tips: e.target.value || null })}
          placeholder="Le détail qui fait la différence (optionnel)"
          className={champ}
        />
      </div>
      <div className="mt-3">
        <label className={etiquette}>Photos</label>
        <div className="flex flex-wrap gap-2">
          {photos.map((ph, k) => (
            <div key={k} className="h-24 w-24">
              <ImageSlot
                src={ph.url}
                originalSrc={ph.original_url}
                aiRetouched={ph.ai_retouched}
                onChange={(url) =>
                  onChange({ photos: photos.map((p, m) => (m === k ? { ...p, url, ai_retouched: false } : p)) })
                }
                onOriginalChange={(url) =>
                  onChange({ photos: photos.map((p, m) => (m === k ? { ...p, original_url: url } : p)) })
                }
                promptAiRetouched
                onAiRetouchedChange={(v) =>
                  onChange({ photos: photos.map((p, m) => (m === k ? { ...p, ai_retouched: v } : p)) })
                }
                onClear={() => onChange({ photos: photos.filter((_, m) => m !== k) })}
                shape="rounded"
                maxWidth={800}
                aspectRatio={1}
                className="h-full w-full"
              />
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <div className="h-24 w-24">
              <ImageSlot
                src={null}
                onChange={(url) => onChange({ photos: [...photos, { url, original_url: null, ai_retouched: false }] })}
                shape="rounded"
                maxWidth={800}
                aspectRatio={1}
                placeholder="Ajouter"
                className="h-full w-full"
              />
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
