'use client';

// Formulaire de création d'idée + prévention des doublons, à deux niveaux :
//
//  - lexicale et instantanée pendant la frappe (le champ titre agit comme
//    barre de recherche, motif IngredientPicker : debounce 300 ms, requête
//    annulée à chaque frappe) ;
//  - sémantique à la validation (`/api/idees/verifier-doublon`) : un appel IA
//    par frappe serait lent et coûteux, donc déclenché seulement au moment de
//    publier, et repère les reformulations sans mot commun que le trigramme
//    rate ("minuteur qui se lance tout seul" ↔ "chronomètre automatique").
//
// Dans tous les cas, la publication reste possible — "forçage de création"
// du spec : l'utilisateur reste seul juge que son idée est vraiment nouvelle.
// Un premier clic sur "Publier" lance la vérification IA ; si elle remonte
// des correspondances, le même bouton devient "Publier quand même" et un
// second clic publie sans revérifier (la vérification n'a lieu qu'une fois
// par saisie, invalidée dès que le titre ou la description change).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { SimilarIdeaRow } from '@/components/ideas/SimilarIdeaRow';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { IDEA_DESCRIPTION_MAX, IDEA_TITLE_MAX, type IdeaSummary, type SimilarIdea } from '@/lib/ideas';

const SUGGEST_DEBOUNCE_MS = 300;
const TITLE_MIN = 5;

type AiMatch = IdeaSummary & { reason: string };

export function IdeaForm() {
  const router = useRouter();
  const { mutate } = useMutation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<SimilarIdea[]>([]);
  const [searching, setSearching] = useState(false);

  // null = pas encore vérifié pour la saisie actuelle ; [] = vérifié, aucune
  // correspondance ; non vide = correspondances à confirmer avant publication.
  const [aiMatches, setAiMatches] = useState<AiMatch[] | null>(null);
  const [aiChecking, setAiChecking] = useState(false);

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

  // Toute modification du texte invalide la vérification IA précédente.
  function changeTitle(v: string) {
    setTitle(v.slice(0, IDEA_TITLE_MAX));
    setAiMatches(null);
  }
  function changeDescription(v: string) {
    setDescription(v.slice(0, IDEA_DESCRIPTION_MAX));
    setAiMatches(null);
  }

  const titleValid = title.trim().length >= TITLE_MIN && title.trim().length <= IDEA_TITLE_MAX;

  async function actuallySubmit() {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titleValid || submitting || aiChecking) return;

    if (aiMatches === null) {
      setAiChecking(true);
      let matches: AiMatch[] = [];
      try {
        const res = await fetch('/api/idees/verifier-doublon', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title, description }),
        });
        if (res.ok) {
          const data = (await res.json()) as { matches?: AiMatch[] };
          matches = data.matches ?? [];
        }
      } catch {
        // Échec de la vérification IA : traité comme "rien trouvé", ne
        // bloque pas la publication.
      }
      setAiChecking(false);
      setAiMatches(matches);
      if (matches.length) return; // affiche les correspondances, attend confirmation
    }

    await actuallySubmit();
  }

  return (
    <>
      <LoadingOverlay
        visible={submitting || aiChecking}
        label={aiChecking ? 'Vérification des doublons…' : "Enregistrement de l'idée…"}
      />

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
              onChange={(e) => changeTitle(e.target.value)}
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
                <SimilarIdeaRow key={s.id} id={s.id} title={s.title} status={s.status} votesCount={s.votes_count} hasVoted={s.has_voted} />
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
            onChange={(e) => changeDescription(e.target.value)}
            placeholder="Quelques phrases pour préciser le besoin."
            rows={4}
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-3 text-[14px] text-on-surface placeholder:text-outline/70 focus:border-primary focus:outline-none resize-none"
          />
          <p className="text-[12px] text-outline mt-1.5 text-right">
            {description.length}/{IDEA_DESCRIPTION_MAX}
          </p>
        </div>

        {aiMatches !== null && aiMatches.length > 0 && (
          <div className="border border-secondary/40 rounded-lg p-4 bg-secondary-container/20">
            <p className="text-[12.5px] text-on-surface-variant mb-3">
              <span className="material-symbols-outlined text-[16px] align-text-bottom mr-1">auto_awesome</span>
              L&apos;IA a repéré des idées au sens proche, même formulées autrement — un vote suffit peut-être :
            </p>
            <div className="flex flex-col gap-2">
              {aiMatches.map((m) => (
                <SimilarIdeaRow
                  key={m.id}
                  id={m.id}
                  title={m.title}
                  status={m.status}
                  votesCount={m.votes_count}
                  hasVoted={m.has_voted}
                  reason={m.reason}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={!titleValid || submitting || aiChecking}
            className="bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
          >
            {aiMatches && aiMatches.length > 0 ? 'Publier quand même' : "Publier l'idée"}
          </button>
        </div>
      </form>
    </>
  );
}
