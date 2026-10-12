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
// Traité par lots depuis ce navigateur, mais les vignettes sont FABRIQUÉES PAR
// LE SERVEUR (`/api/stockage/vignettes`, lib/vignettes-data.ts) : relire la
// photo dans un canvas échouait faute d'en-tête CORS sur Swift. Chaque lot
// requête les recettes qui ont une photo mais pas ce dérivé (absent ou marqué
// vide par l'ancien rattrapage) — reprenable si interrompu, sans état à suivre
// entre deux passages. Un appel produit les DEUX vignettes : celle qui manque
// encore est écrite, l'autre n'est jamais remplacée.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { demanderVignettes } from '@/lib/storage-client';

type Ligne = { id: string; hero_image_url: string; hero_thumb_url: string | null; hero_card_url: string | null };

const BATCH_SIZE = 20;

export function RecipeImageBackfill({
  column,
  title,
  description,
}: {
  // Absente de lib/database.types.ts tant que sa migration n'a pas été
  // régénérée (npm run gen:types) — même contournement que dans CreerForm.
  column: 'hero_thumb_url' | 'hero_card_url';
  title: string;
  description: string;
}) {
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  // Cause de chaque échec (titre → message du serveur) : « illisible » ne
  // disait pas si la lecture, le décodage ou le dépôt avait échoué.
  const [causes, setCauses] = useState<string[]>([]);

  async function run() {
    setRunning(true);
    setFinished(false);
    setDone(0);
    setFailed(0);
    setCauses([]);
    const supabase = createClient();
    const echecs = new Set<string>();
    try {
      for (;;) {
        const { data, error } = await supabase
          .from('recipes')
          .select('id, hero_image_url, hero_thumb_url, hero_card_url')
          .not('hero_image_url', 'is', null)
          .or(`${column}.is.null,${column}.eq.`)
          .order('id')
          .limit(BATCH_SIZE + echecs.size);
        if (error) throw error;
        const lot = ((data ?? []) as Ligne[]).filter((r) => !echecs.has(r.id));
        if (lot.length === 0) break;

        for (const r of lot) {
          try {
            const v = await demanderVignettes(r.hero_image_url);
            const maj: Record<string, string> = {};
            if (!r.hero_thumb_url) maj.hero_thumb_url = v.thumb;
            if (!r.hero_card_url) maj.hero_card_url = v.card;
            const { error: updErr } = await supabase
              .from('recipes')
              .update(maj as never)
              .eq('id', r.id);
            if (updErr) throw updErr;
            setDone((n) => n + 1);
          } catch (e) {
            setCauses((c) => [...c, (e as Error).message]);
            // Échec : la colonne n'est pas touchée (jamais marquée d'une
            // chaîne vide, qui condamnait la ligne), et la recette est écartée
            // du reste de CE passage pour ne pas boucler dessus. Un nouveau
            // clic sur « Régénérer » la retente.
            echecs.add(r.id);
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
          {failed > 0 ? ` · ${failed} échec${failed > 1 ? 's' : ''}` : ''}
          {finished ? ' · terminé' : ''}
        </p>
      )}
      {causes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-error">
          {[...new Set(causes)].map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
