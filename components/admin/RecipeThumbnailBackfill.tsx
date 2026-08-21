'use client';

// Rétro-remplissage de `recipes.hero_thumb_url` pour les recettes créées
// avant l'ajout de cette colonne — sans lui, elles n'affichent que l'icône
// par défaut dans les listes de fournées d'« En cuisine » (CuisineContent),
// qui n'ont jamais chargé `hero_image_url` en pleine définition (cf.
// CLAUDE.md « Images »). Les recettes créées ou modifiées depuis en
// obtiennent déjà une à l'enregistrement (CreerForm).
//
// Traité par lots dans ce navigateur, pas par un job serveur : le projet ne
// dépend d'aucune lib d'image côté serveur (doctrine « compression côté
// client », lib/images.ts) et n'en gagne pas une pour ce seul usage. Chaque
// lot requête les recettes qui ont une photo mais pas encore de miniature —
// reprenable si interrompu, sans état à suivre entre deux passages.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resizeDataUrlToThumb } from '@/lib/images';

const BATCH_SIZE = 20;

export function RecipeThumbnailBackfill() {
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
          .is('hero_thumb_url', null)
          .limit(BATCH_SIZE);
        if (error) throw error;
        if (!data || data.length === 0) break;

        for (const r of data as { id: string; hero_image_url: string | null }[]) {
          try {
            const thumb = await resizeDataUrlToThumb(r.hero_image_url as string);
            const { error: updErr } = await supabase.from('recipes').update({ hero_thumb_url: thumb } as never).eq('id', r.id);
            if (updErr) throw updErr;
            setDone((n) => n + 1);
          } catch {
            // Image illisible (format non décodable, data corrompue…) :
            // marquée avec une chaîne vide plutôt que laissée à `null`, sinon
            // le lot suivant la reproposerait indéfiniment. Chaîne vide,
            // jamais retenue par `hero_thumb_url ? <img> : icône`
            // (CuisineContent) — se comporte comme une recette sans photo.
            await supabase.from('recipes').update({ hero_thumb_url: '' } as never).eq('id', r.id);
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
        <h3 className="font-headline-md text-xl text-primary">Miniatures des fournées</h3>
      </div>
      <p className="text-on-surface-variant mb-6">
        Génère la miniature des recettes créées avant son ajout, pour qu&apos;elles affichent une
        vignette dans les listes de fournées de l&apos;écran « En cuisine » au lieu de l&apos;icône
        par défaut. Les recettes créées ou modifiées depuis en ont déjà une — relancer ne les
        retouche pas.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-pill bg-primary px-6 py-2.5 font-label-md text-label-md text-on-primary disabled:opacity-60"
      >
        {running ? 'Génération en cours…' : 'Régénérer les miniatures'}
      </button>
      {(running || finished) && (
        <p className="mt-4 text-sm text-on-surface-variant">
          {done} miniature{done > 1 ? 's' : ''} générée{done > 1 ? 's' : ''}
          {failed > 0 ? ` · ${failed} image${failed > 1 ? 's' : ''} illisible${failed > 1 ? 's' : ''}` : ''}
          {finished ? ' · terminé' : ''}
        </p>
      )}
    </div>
  );
}
