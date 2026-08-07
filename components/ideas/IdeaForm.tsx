'use client';

// Formulaire de création d'idée + prévention des doublons.
//
// Le champ titre agit lui-même comme barre de recherche (motif
// IngredientPicker : debounce 300 ms, requête annulée à chaque frappe pour
// que seule la dernière réponse s'applique). Le bouton de soumission reste
// actif même quand des suggestions apparaissent — "forçage de création" du
// spec : l'utilisateur reste seul juge que son idée est vraiment nouvelle.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { StatusBadge } from '@/components/ideas/StatusBadge';
import { VoteButton } from '@/components/ideas/VoteButton';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { IDEA_DESCRIPTION_MAX, IDEA_TITLE_MAX, type SimilarIdea } from '@/lib/ideas';

const SUGGEST_DEBOUNCE_MS = 300;
const TITLE_MIN = 5;

export function IdeaForm() {
  const router = useRouter();
  const { mutate } = useMutation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<SimilarIdea[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = title.trim();
    if (t.length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/idees/similaires?q=${encodeURIComponent(t)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const { items } = (await res.json()) as { items: SimilarIdea[] };
        setSuggestions(items ?? []);
      } catch {
        // Requête annulée ou réseau indisponible : la liste reste en l'état.
      } finally {
        setSearching(false);
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [title]);

  const titleValid = title.trim().length >= TITLE_MIN && title.trim().length <= IDEA_TITLE_MAX;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !titleValid) return;
    setSubmitting(true);
    let newId: string | null = null;
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push('/connexion');
          return null;
        }
        const { data, error } = await supabase
          .from('ideas')
          .insert({ title: title.trim(), description: description.trim() || null, author_id: user.id })
          .select('id')
          .single();
        if (data) newId = data.id;
        return { error };
      },
      { refresh: false, errorLabel: 'Idée non enregistrée' },
    );
    if (ok && newId) {
      router.push(`/idees?tri=recent#idee-${newId}`);
    } else {
      setSubmitting(false);
    }
  }

  return (
    <>
      <LoadingOverlay visible={submitting} label="Enregistrement de l'idée…" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div>
          <label htmlFor="idea-title" className="font-label-md text-label-md text-on-surface-variant block mb-2">
            Titre
          </label>
          <div className="relative">
            <input
              id="idea-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, IDEA_TITLE_MAX))}
              placeholder="En une phrase courte : quelle fonctionnalité manque ?"
              autoComplete="off"
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-3 pr-9 text-[15px] text-on-surface placeholder:text-outline/70 focus:border-primary focus:outline-none"
            />
            {searching && (
              <span className="material-symbols-outlined text-[18px] text-outline absolute right-3 top-1/2 -translate-y-1/2 animate-spin">
                progress_activity
              </span>
            )}
          </div>
          <p className="text-[12px] text-outline mt-1.5 text-right">
            {title.trim().length}/{IDEA_TITLE_MAX}
          </p>
        </div>

        {suggestions.length > 0 && (
          <div className="border border-outline-variant rounded-lg p-4 bg-surface-container-low">
            <p className="text-[12.5px] text-on-surface-variant mb-3">
              Des idées proches existent déjà — un vote suffit peut-être :
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-outline-variant bg-surface-container-lowest"
                >
                  <VoteButton ideaId={s.id} initialVotes={s.votes_count} initialHasVoted={s.has_voted} size="sm" />
                  <p className="flex-1 min-w-0 text-[13.5px] text-on-surface truncate">{s.title}</p>
                  <StatusBadge status={s.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="idea-description" className="font-label-md text-label-md text-on-surface-variant block mb-2">
            Description <span className="text-outline">(facultatif)</span>
          </label>
          <textarea
            id="idea-description"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, IDEA_DESCRIPTION_MAX))}
            placeholder="Quelques phrases pour préciser le besoin."
            rows={4}
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-3 text-[14px] text-on-surface placeholder:text-outline/70 focus:border-primary focus:outline-none resize-none"
          />
          <p className="text-[12px] text-outline mt-1.5 text-right">
            {description.length}/{IDEA_DESCRIPTION_MAX}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={!titleValid || submitting}
            className="bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
          >
            Publier l&apos;idée
          </button>
        </div>
      </form>
    </>
  );
}
