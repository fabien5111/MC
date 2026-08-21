'use client';

// Rétro-remplissage des dérivés de `recipes.hero_image_url` pour les recettes
// créées avant l'ajout de chacun — sans lui, elles n'affichent que l'icône
// par défaut ou transportent l'image pleine définition là où une miniature
// suffit (cf. CLAUDE.md « Images »). Composant générique, monté une fois par
// dérivé (app/admin/photos/page.tsx) : `hero_thumb_url` (~96 px, listes de
// fournées d'« En cuisine ») et `hero_card_url` (~480 px, cartes recette —
// accueil, recherche, carnet, profils, suggestions). Les recettes créées ou
// modifiées depuis en obtiennent déjà un à l'enregistrement (CreerForm).
//
// Traité par lots dans ce navigateur, pas par un job serveur : le projet ne
// dépend d'aucune lib d'image côté serveur (doctrine « compression côté
// client », lib/images.ts) et n'en gagne pas une pour ce seul usage. Chaque
// lot requête les recettes qui ont une photo mais pas encore ce dérivé —
// reprenable si interrompu, sans état à suivre entre deux passages.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resizeDataUrlToThumb } from '@/lib/images';

const BATCH_SIZE = 20;

export function RecipeImageBackfill({
  column,
  maxWidth,
  quality,
  title,
  description,
}: {
  // Absente de lib/database.types.ts tant que sa migration n'a pas été
  // régénérée (npm run gen:types) — même contournement que dans CreerForm.
  column: 'hero_thumb_url' | 'hero_card_url';
  maxWidth: number;
  quality?: number;
  title: string;
  description: string;
}) {
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);

  async function run() {
    setRunning(true);
    setFinished(false);
    setDone(0);
    setFailed(0);
    const supabase = createClient();
    try {
      for (;;) {
        const { data, error } = await supabase
          .from('recipes')
          .select('id, hero_image_url')
          .not('hero_image_url', 'is', null)
          .is(column, null)
          .limit(BATCH_SIZE);
        if (error) throw error;
        if (!data || data.length === 0) break;

        for (const r of data as { id: string; hero_image_url: string | null }[]) {
          try {
            const derived = await resizeDataUrlToThumb(r.hero_image_url as string, maxWidth, 'image/jpeg', quality);
            const { error: updErr } = await supabase
              .from('recipes')
              .update({ [column]: derived } as never)
              .eq('id', r.id);
            if (updErr) throw updErr;
            setDone((n) => n + 1);
          } catch {
            // Image illisible (format non décodable, data corrompue…) :
            // marquée avec une chaîne vide plutôt que laissée à `null`, sinon
            // le lot suivant la reproposerait indéfiniment. Chaîne vide,
            // jamais retenue par `hero_card_url || hero_image_url || …`
            // (RecipeCardLayout) — se comporte comme un dérivé absent.
            await supabase
              .from('recipes')
              .update({ [column]: '' } as never)
              .eq('id', r.id);
            setFailed((n) => n + 1);
          }
        }
      }
      setFinished(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-8 ambient-shadow">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-headline-md text-xl text-primary">{title}</h3>
      </div>
      <p className="text-on-surface-variant mb-6">{description}</p>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-pill bg-primary px-6 py-2.5 font-label-md text-label-md text-on-primary disabled:opacity-60"
      >
        {running ? 'Génération en cours…' : 'Régénérer'}
      </button>
      {(running || finished) && (
        <p className="mt-4 text-sm text-on-surface-variant">
          {done} image{done > 1 ? 's' : ''} générée{done > 1 ? 's' : ''}
          {failed > 0 ? ` · ${failed} illisible${failed > 1 ? 's' : ''}` : ''}
          {finished ? ' · terminé' : ''}
        </p>
      )}
    </div>
  );
}
