// Une étape de recette, telle que la fiche la présente : titre numéroté,
// pastilles de temps, ingrédients de l'étape, photos, vidéo, sous-étapes (ou
// description) et conseils. Rendu pur, sans état — partagé par la fiche
// recette (`app/recette/[id]`) et le mode projet v2, pour que les deux ne
// divergent jamais. Pas de `'use client'` : un Server Component peut le
// rendre ; seul `qty` (rendu d'une quantité, qui dépend des conversions de
// l'appelant) est fourni par l'appelant.
import type { ReactNode } from 'react';
import { formatTime } from '@/lib/format';
import { dayLabel } from '@/lib/recipe-view';
import type { IngredientView, RecipeStepView } from '@/lib/recipes';
import { StepPhotoGallery } from '@/components/recipe/StepPhotoGallery';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';

export function RecipeStep({
  step: s,
  index: i,
  anchorId,
  ingredients,
  qty,
  last,
}: {
  step: RecipeStepView;
  index: number;
  // Ancre du sommaire (`sec-etape-N`, cf. `stepAnchorId` de RecipeToc, recalculée
  // par l'appelant : cette fonction vit dans un module « use client »).
  anchorId: string;
  ingredients: IngredientView[];
  qty: (it: IngredientView) => ReactNode;
  last: boolean;
}) {
  const ings = [...ingredients].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const photos = [...(s.step_photos || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const stepTotal = (s.prep_time || 0) + (s.wait_time || 0) + (s.cook_time || 0);
  const badges: string[] = [
    dayLabel(Math.max(0, s.day_offset || 0)),
    s.prep_time ? `PRÉP ${formatTime(s.prep_time).toUpperCase()}` : '',
    s.wait_time ? `ATTENTE ${formatTime(s.wait_time).toUpperCase()}` : '',
    s.cook_time
      ? `CUISSON ${formatTime(s.cook_time).toUpperCase()}${s.cook_temp ? ' · ' + s.cook_temp + ' °C' : ''}`
      : s.cook_temp
        ? `CUISSON ${s.cook_temp} °C`
        : '',
  ].filter(Boolean);
  return (
    <div
      id={anchorId}
      className={`scroll-mt-28 flex flex-col gap-6${last ? '' : ' pb-14 border-b-2 border-outline-variant'}`}
    >
      <div className="flex items-center justify-between border-b border-outline pb-4 flex-wrap gap-3">
        <h4 className="font-headline-md text-headline-md text-primary">
          {i + 1}. {s.title || 'Étape ' + (i + 1)}
        </h4>
        <div className="print-fs-9 flex gap-4 text-on-surface-variant font-label-md text-[12px] flex-wrap">
          {badges.map((b, k) => (
            <span key={k} className="bg-surface-variant px-3 py-1">
              {b}
            </span>
          ))}
          {stepTotal > 0 && (
            <span className="bg-primary text-white px-3 py-1">TOTAL {formatTime(stepTotal).toUpperCase()}</span>
          )}
        </div>
      </div>
      {ings.length > 0 && (
        <details className="group border border-outline-variant mb-2" open>
          <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
            <span className="font-label-md text-label-md text-primary">Ingrédients de l&apos;étape</span>
            <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="p-4 bg-white">
            <ul className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 sm:gap-x-10 print:gap-x-10">
              {ings.map((it) => (
                <li key={it.id} className="py-2 border-b border-outline-variant/30" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                  <span className="font-label-md text-label-md text-primary">
                    <span className="hidden print:inline-block align-text-bottom w-4 h-4 border-2 border-on-surface mr-2" />
                    {qty(it)}
                  </span>
                  <span className="font-body-md text-body-md break-words">
                    {it.name}
                    {it.comment && <span className="print-fs-9 text-on-surface-variant text-sm italic"> — {it.comment}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
      <StepPhotoGallery photos={photos} />
      {s.video_url && <StepVideoPlayer url={s.video_url} />}
      {Array.isArray(s.sous_etapes) && s.sous_etapes.length > 0 ? (
        <ul className="flex flex-col gap-3 font-body-lg text-body-lg leading-relaxed text-on-surface">
          {s.sous_etapes.map((t, k) => (
            <li key={k} className="flex gap-3">
              <span className="text-primary shrink-0">–</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : s.description ? (
        <div className="font-body-lg text-body-lg leading-relaxed text-on-surface whitespace-pre-line">{s.description}</div>
      ) : null}
      {s.tips && (
        <details className="group border border-outline-variant" open>
          <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
            <span className="font-label-md text-label-md text-primary">Conseils &amp; Astuces de l&apos;étape</span>
            <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="p-4 bg-white font-body-md text-body-md italic whitespace-pre-line">{s.tips}</div>
        </details>
      )}
    </div>
  );
}
