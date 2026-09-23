'use client';

// Bouton de vote d'une idée (motif `FavoriteHeart`) : compteur total, état
// visuel « déjà voté », mise à jour optimiste. Renvoie vers /connexion si
// l'utilisateur n'est pas connecté.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { connexionHref } from '@/lib/nav';
import { intentPath, useResumeIntent } from '@/lib/use-resumable-intent';

export function VoteButton({
  ideaId,
  initialVotes,
  initialHasVoted,
  size = 'md',
}: {
  ideaId: string;
  initialVotes: number;
  initialHasVoted: boolean;
  // 'sm' : suggestions anti-doublons (vue création), à côté d'un champ.
  size?: 'md' | 'sm';
}) {
  const router = useRouter();
  const { busy, mutate } = useMutation();
  const [votes, setVotes] = useState(initialVotes);
  const [hasVoted, setHasVoted] = useState(initialHasVoted);

  // Séparé du gestionnaire de clic : `useResumeIntent` rejoue ce geste au
  // montage, sans événement souris à annuler (il n'y en a pas).
  async function apply() {
    if (busy) return;
    const next = !hasVoted;
    setHasVoted(next); // optimiste
    setVotes((v) => v + (next ? 1 : -1));
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          // `intentPath` restitue le tri/la page en cours ET rejoue le vote
          // au retour — cf. use-resumable-intent.ts.
          router.push(connexionHref(intentPath('vote', ideaId)));
          return null;
        }
        return next
          ? // `upsert` + `ignoreDuplicates` : même précaution que
            // `FavoriteButton`/`FavoriteHeart` (cf. leur commentaire) — le
            // rejeu au retour de connexion (`useResumeIntent`) doit rester
            // sans effet si l'écriture a déjà abouti par un autre chemin,
            // plutôt que de lever une violation de contrainte unique.
            supabase
              .from('idea_votes')
              .upsert({ idea_id: ideaId, user_id: user.id }, { onConflict: 'idea_id,user_id', ignoreDuplicates: true })
          : supabase.from('idea_votes').delete().eq('idea_id', ideaId).eq('user_id', user.id);
      },
      { errorLabel: next ? 'Vote non enregistré' : 'Vote non retiré' },
    );
    if (!ok) {
      setHasVoted(!next); // rollback
      setVotes((v) => v - (next ? 1 : -1));
    }
  }

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void apply();
  }

  // Un par idée : seul le bouton dont `ideaId` correspond au marqueur réagit.
  useResumeIntent('vote', ideaId, hasVoted, apply);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={hasVoted ? 'Retirer mon vote' : 'Voter pour cette idée'}
      className={`flex flex-col items-center justify-center rounded-xl border shrink-0 transition-colors disabled:opacity-60 ${
        size === 'sm' ? 'w-11 h-11' : 'w-14 h-14'
      } ${
        hasVoted
          ? 'bg-primary text-on-primary border-primary'
          : 'border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
      }`}
    >
      <span className={`material-symbols-outlined leading-none ${size === 'sm' ? 'text-[16px]' : 'text-[20px]'}`}>
        arrow_upward
      </span>
      <span className={`font-bold mt-0.5 ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}>{votes}</span>
    </button>
  );
}
