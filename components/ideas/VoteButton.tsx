'use client';

// Bouton de vote d'une idée (motif `FavoriteHeart`) : compteur total, état
// visuel « déjà voté », mise à jour optimiste. Renvoie vers /connexion si
// l'utilisateur n'est pas connecté.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';

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

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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
          router.push('/connexion');
          return null;
        }
        return next
          ? supabase.from('idea_votes').insert({ idea_id: ideaId, user_id: user.id })
          : supabase.from('idea_votes').delete().eq('idea_id', ideaId).eq('user_id', user.id);
      },
      { errorLabel: next ? 'Vote non enregistré' : 'Vote non retiré' },
    );
    if (!ok) {
      setHasVoted(!next); // rollback
      setVotes((v) => v - (next ? 1 : -1));
    }
  }

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
