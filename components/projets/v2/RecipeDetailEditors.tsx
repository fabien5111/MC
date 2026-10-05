'use client';

// Éditeurs des éléments de recette de la v2 du mode projet : photo d'en-tête,
// type et catégories, ustensiles, difficulté, temps, conseils et source.
//
// Ils écrivent les MÊMES colonnes et tables que l'éditeur de recette
// (`CreerForm`), section par section — jamais par son enregistrement global,
// qui supprime et réinsère toutes les étapes et effacerait les
// `component_id` du projet (cf. CLAUDE.md « Dissolution assumée »). Chaque
// éditeur a son propre bouton « Enregistrer » : la saisie en cours n'est
// écrite qu'au geste, puis le parent resynchronise (`mutate`).
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { useMutation } from '@/lib/use-mutation';
import { ImageSlot } from '@/components/ImageSlot';
import { resizeDataUrlToThumb } from '@/lib/images';
import { televerserImage } from '@/lib/storage-client';
import { estDataUrlImage } from '@/lib/storage';
import type { RecipeFull } from '@/lib/recipes';

type Mutate = ReturnType<typeof useMutation>['mutate'];
export type RefOption = { id: number; name: string };
export type DifficultyOption = { id: number; name: string; level: number };

const btnPrimary =
  'rounded-pill bg-primary px-6 py-3 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-40';
const champ =
  'w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-body-md text-[15px] outline-none focus:border-primary';
const etiquette = 'mb-1 block font-label-md text-label-md text-outline';

// Écriture d'un ensemble de colonnes de la recette du projet.
function majRecette(recipeId: string, payload: Record<string, unknown>) {
  return createClient().from('recipes').update(payload as never).eq('id', recipeId);
}

function minutes(v: string): number | null {
  const n = parseInt(v, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// ── Photo d'en-tête ─────────────────────────────────────────────────────
// Même dépôt que `CreerForm` : la photo, son original et deux vignettes
// (listes « En cuisine » ~96 px, cartes ~480 px), recalculées seulement pour
// un dépôt frais — jamais en rechargeant dans un canvas une image déjà sur le
// stockage (cf. CLAUDE.md, « Image illisible »).
export function HeroEditor({ recipe, mutate, busy }: { recipe: RecipeFull; mutate: Mutate; busy: boolean }) {
  const [hero, setHero] = useState<string | null>(recipe.hero_image_url ?? null);
  const [original, setOriginal] = useState<string | null>(recipe.hero_image_original_url ?? recipe.hero_image_url ?? null);
  const [ai, setAi] = useState(recipe.hero_image_ai_retouched);
  const modifie = hero !== (recipe.hero_image_url ?? null) || ai !== recipe.hero_image_ai_retouched;

  async function enregistrer() {
    await mutate(
      async () => {
        try {
          if (!hero) {
            return await majRecette(recipe.id, {
              hero_image_url: null,
              hero_image_original_url: null,
              hero_thumb_url: null,
              hero_card_url: null,
              hero_image_ai_retouched: false,
            });
          }
          const frais = estDataUrlImage(hero);
          const [url, originalUrl, thumb, card] = await Promise.all([
            televerserImage('recette', hero),
            televerserImage('recette', original),
            frais ? televerserImage('recette', await resizeDataUrlToThumb(hero)) : Promise.resolve(undefined),
            frais
              ? televerserImage('recette', await resizeDataUrlToThumb(hero, 480, 'image/jpeg', 0.7))
              : Promise.resolve(undefined),
          ]);
          return await majRecette(recipe.id, {
            hero_image_url: url,
            hero_image_original_url: originalUrl,
            ...(thumb !== undefined ? { hero_thumb_url: thumb } : {}),
            ...(card !== undefined ? { hero_card_url: card } : {}),
            hero_image_ai_retouched: ai,
          });
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
      },
      { errorLabel: 'Enregistrement de la photo' },
    );
  }

  return (
    <div className="space-y-3">
      <label className={etiquette}>PHOTO DU DESSERT</label>
      <div className="aspect-[16/9] w-full max-w-xl">
        <ImageSlot
          src={hero}
          originalSrc={original}
          aiRetouched={ai}
          onChange={(url) => {
            setHero(url);
            setAi(false);
          }}
          promptAiRetouched
          onAiRetouchedChange={setAi}
          onOriginalChange={setOriginal}
          onClear={() => {
            setHero(null);
            setOriginal(null);
            setAi(false);
          }}
          shape="rounded"
          maxWidth={1400}
          placeholder="Déposez la photo du dessert fini"
          className="h-full w-full"
        />
      </div>
      {modifie && (
        <button type="button" onClick={enregistrer} disabled={busy} className={btnPrimary}>
          Enregistrer la photo
        </button>
      )}
    </div>
  );
}

// ── Type et catégories ──────────────────────────────────────────────────
export function TypeTagsEditor({
  recipe,
  typeId,
  types,
  tags,
  mutate,
  busy,
}: {
  recipe: RecipeFull;
  // `type_id` n'est pas porté par `RecipeFull` (seule la jointure l'est) :
  // la page le lit à part.
  typeId: number | null;
  types: RefOption[];
  tags: RefOption[];
  mutate: Mutate;
  busy: boolean;
}) {
  const initiaux = recipe.recipe_tags.map((t) => t.tags?.id).filter((id): id is number => id != null);
  const [type, setType] = useState(typeId ? String(typeId) : '');
  const [choisis, setChoisis] = useState<Set<number>>(new Set(initiaux));
  const modifie =
    type !== (typeId ? String(typeId) : '') ||
    choisis.size !== initiaux.length ||
    initiaux.some((id) => !choisis.has(id));

  async function enregistrer() {
    await mutate(
      async () => {
        const supabase = createClient();
        const { error } = await majRecette(recipe.id, { type_id: type ? Number(type) : null });
        if (error) return { error };
        // Même geste que l'éditeur : liaisons supprimées puis réinsérées.
        const { error: delErr } = await supabase.from('recipe_tags').delete().eq('recipe_id', recipe.id);
        if (delErr) return { error: delErr };
        if (!choisis.size) return { error: null };
        return supabase.from('recipe_tags').insert([...choisis].map((tag_id) => ({ recipe_id: recipe.id, tag_id })));
      },
      { errorLabel: 'Enregistrement du type et des catégories' },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={etiquette}>TYPE DE RECETTE</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className={`${champ} sm:w-auto`}>
          <option value="">— À préciser —</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={etiquette}>CATÉGORIES</label>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const actif = choisis.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={actif}
                onClick={() =>
                  setChoisis((prev) => {
                    const n = new Set(prev);
                    if (actif) n.delete(t.id);
                    else n.add(t.id);
                    return n;
                  })
                }
                className={`rounded-pill border px-3 py-1.5 text-[13px] transition-colors ${
                  actif ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant hover:border-primary'
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </div>
      {modifie && (
        <button type="button" onClick={enregistrer} disabled={busy} className={btnPrimary}>
          Enregistrer le type et les catégories
        </button>
      )}
    </div>
  );
}

// ── Ustensiles, difficulté, temps ───────────────────────────────────────
export function OrganisationEditor({
  recipe,
  difficultyId,
  difficulties,
  utensilNames,
  mutate,
  busy,
}: {
  recipe: RecipeFull;
  difficultyId: number | null;
  difficulties: DifficultyOption[];
  utensilNames: string[];
  mutate: Mutate;
  busy: boolean;
}) {
  const init = {
    ustensiles: [...recipe.recipe_utensils]
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((u) => ({ name: u.name, comment: u.comment ?? '' })),
    difficulte: difficultyId ? String(difficultyId) : '',
    prep: recipe.prep_time ? String(recipe.prep_time) : '',
    cook: recipe.cook_time ? String(recipe.cook_time) : '',
    wait: recipe.wait_time ? String(recipe.wait_time) : '',
    total: recipe.total_time ? String(recipe.total_time) : '',
  };
  const [ustensiles, setUstensiles] = useState(init.ustensiles);
  const [difficulte, setDifficulte] = useState(init.difficulte);
  const [prep, setPrep] = useState(init.prep);
  const [cook, setCook] = useState(init.cook);
  const [wait, setWait] = useState(init.wait);
  const [total, setTotal] = useState(init.total);
  const modifie =
    JSON.stringify({ ustensiles, difficulte, prep, cook, wait, total }) !== JSON.stringify(init);

  async function enregistrer() {
    await mutate(
      async () => {
        const supabase = createClient();
        const { error } = await majRecette(recipe.id, {
          difficulty_id: difficulte ? Number(difficulte) : null,
          prep_time: minutes(prep),
          cook_time: minutes(cook),
          wait_time: minutes(wait),
          total_time: minutes(total),
        });
        if (error) return { error };
        const { error: delErr } = await supabase.from('recipe_utensils').delete().eq('recipe_id', recipe.id);
        if (delErr) return { error: delErr };
        const rows = ustensiles
          .map((u, i) => ({ recipe_id: recipe.id, name: u.name.trim(), comment: u.comment.trim() || null, order_index: i }))
          .filter((u) => u.name);
        if (!rows.length) return { error: null };
        return supabase.from('recipe_utensils').insert(rows);
      },
      { errorLabel: 'Enregistrement des ustensiles, de la difficulté et des temps' },
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label className={etiquette}>USTENSILES</label>
        <ul className="space-y-2">
          {ustensiles.map((u, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={u.name}
                onChange={(e) => setUstensiles((prev) => prev.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                list="dl-ustensiles-v2"
                placeholder="Cercle à tarte"
                className={`${champ} min-w-0 flex-[2]`}
              />
              <input
                value={u.comment}
                onChange={(e) => setUstensiles((prev) => prev.map((x, k) => (k === i ? { ...x, comment: e.target.value } : x)))}
                placeholder="Commentaire (optionnel)"
                className={`${champ} min-w-0 flex-1`}
              />
              <button
                type="button"
                title="Retirer"
                onClick={() => setUstensiles((prev) => prev.filter((_, k) => k !== i))}
                className="p-1"
              >
                <span className="material-symbols-outlined text-[20px] text-error">delete</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setUstensiles((prev) => [...prev, { name: '', comment: '' }])}
          className="mt-2 text-[12.5px] font-semibold text-primary"
        >
          + Ustensile
        </button>
        <datalist id="dl-ustensiles-v2">
          {utensilNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      <div>
        <label className={etiquette}>DIFFICULTÉ</label>
        <select value={difficulte} onChange={(e) => setDifficulte(e.target.value)} className={`${champ} sm:w-auto`}>
          <option value="">— À préciser —</option>
          {difficulties.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={etiquette}>TEMPS (EN MINUTES)</label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['Préparation', prep, setPrep],
              ['Cuisson', cook, setCook],
              ['Repos', wait, setWait],
              ['Total', total, setTotal],
            ] as const
          ).map(([libelle, valeur, maj]) => (
            <div key={libelle}>
              <span className="mb-0.5 block text-[12px] text-on-surface-variant">{libelle}</span>
              <input value={valeur} onChange={(e) => maj(e.target.value)} inputMode="numeric" className={champ} />
            </div>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-on-surface-variant">
          Laissés vides, les temps sont calculés à partir de ceux des étapes.
        </p>
      </div>

      {modifie && (
        <button type="button" onClick={enregistrer} disabled={busy} className={btnPrimary}>
          Enregistrer
        </button>
      )}
    </div>
  );
}

// ── Conseils et source ──────────────────────────────────────────────────
export function ConseilsEditor({ recipe, mutate, busy }: { recipe: RecipeFull; mutate: Mutate; busy: boolean }) {
  const init = {
    tips: recipe.tips ?? '',
    serving: recipe.serving_advice ?? '',
    source: recipe.source ?? '',
    sourceUrl: recipe.source_url ?? '',
    videoUrl: recipe.video_url ?? '',
  };
  const [v, setV] = useState(init);
  const modifie = JSON.stringify(v) !== JSON.stringify(init);
  const maj = (k: keyof typeof init) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function enregistrer() {
    await mutate(
      () =>
        majRecette(recipe.id, {
          tips: v.tips.trim() || null,
          serving_advice: v.serving.trim() || null,
          source: v.source.trim() || null,
          source_url: v.sourceUrl.trim() || null,
          video_url: v.videoUrl.trim() || null,
        }),
      { errorLabel: 'Enregistrement des conseils' },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={etiquette}>CONSEILS</label>
        <textarea value={v.tips} onChange={maj('tips')} rows={3} className={champ} placeholder="Astuces de réalisation, conservation…" />
      </div>
      <div>
        <label className={etiquette}>CONSEILS DE SERVICE</label>
        <textarea value={v.serving} onChange={maj('serving')} rows={2} className={champ} placeholder="Température de dégustation, accompagnement…" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={etiquette}>SOURCE</label>
          <input value={v.source} onChange={maj('source')} className={champ} placeholder="Livre, chef…" />
        </div>
        <div>
          <label className={etiquette}>LIEN</label>
          <input value={v.sourceUrl} onChange={maj('sourceUrl')} inputMode="url" className={champ} placeholder="https://…" />
        </div>
        <div>
          <label className={etiquette}>VIDÉO</label>
          <input value={v.videoUrl} onChange={maj('videoUrl')} inputMode="url" className={champ} placeholder="https://youtube.com/…" />
        </div>
      </div>
      {modifie && (
        <button type="button" onClick={enregistrer} disabled={busy} className={btnPrimary}>
          Enregistrer
        </button>
      )}
    </div>
  );
}
