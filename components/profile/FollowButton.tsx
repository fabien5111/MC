'use client';

// Bouton « Suivre » du profil public — deux états, plein puis contour
// « Abonné » (cf. CLAUDE.md). Même motif que FavoriteHeart : mise à jour
// optimiste, écriture ciblée (insert/delete) directement sur `follows`, pas
// de passage par useMutation ici — un visiteur non connecté doit être envoyé
// vers la connexion plutôt que de déclencher une alerte de session lecture
// seule qui ne le concerne pas.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function FollowButton({
  profileId,
  currentUserId,
  initialFollowing,
}: {
  profileId: string;
  // `null` : visiteur non connecté — le clic renvoie vers la connexion plutôt
  // que d'écrire.
  currentUserId: string | null;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!currentUserId) {
      router.push(`/connexion?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    if (busy) return;
    const next = !following;
    setFollowing(next); // optimiste
    setBusy(true);
    const supabase = createClient();
    const { error } = next
      ? await supabase.from('follows').insert({ follower_id: currentUserId, following_id: profileId })
      : await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', profileId);
    setBusy(false);
    if (error) {
      setFollowing(!next); // annule l'optimisme
      console.error('FollowButton:', error.message);
      return;
    }
    router.refresh(); // compteur d'abonnés, fil des abonnements
  }

  // Propre profil : pas de bouton (on ne se suit pas soi-même).
  if (currentUserId === profileId) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      className={
        following
          ? 'flex items-center gap-2 whitespace-nowrap rounded-pill border border-primary px-6 py-2.5 font-label-md text-[13px] text-primary transition-all hover:bg-error hover:text-white hover:border-error disabled:opacity-60'
          : 'flex items-center gap-2 whitespace-nowrap rounded-pill bg-primary px-6 py-2.5 font-label-md text-[13px] text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-60'
      }
    >
      <span className="material-symbols-outlined text-[18px]">{following ? 'how_to_reg' : 'person_add'}</span>
      {following ? 'Abonné' : 'Suivre'}
    </button>
  );
}
