'use client';

// « Partages de mon carnet » des réglages — suivre à qui le carnet est ouvert
// et retirer un accès, sans passer par la fenêtre `ShareBookButton` (utile
// pour accorder un nouveau partage, mais pas pour les consulter tous d'un
// coup). Révocation : même écriture que `ShareBookButton.revoke`.
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { MemberAvatar } from '@/components/share/MemberPicker';
import { formatDate } from '@/lib/format';
import { SHARE_SCOPE_LABELS, type BookShareGiven } from '@/lib/shares';
import { SettingsCard } from '@/components/profile/SettingsCard';

export function BookSharesCard({ ownerId, given }: { ownerId: string; given: BookShareGiven[] }) {
  const { mutate, busy } = useMutation();
  const [items, setItems] = useState(given);

  async function revoke(member: BookShareGiven['member']) {
    const ok = await mutate(
      () =>
        createClient()
          .from('book_shares' as never)
          .delete()
          .eq('owner_id', ownerId)
          .eq('shared_with_id', member.id),
      { confirm: `Retirer le partage du carnet avec ${member.full_name || 'ce membre'} ?`, refresh: false },
    );
    if (ok) setItems((prev) => prev.filter((i) => i.member.id !== member.id));
  }

  return (
    <SettingsCard icon="menu_book" title="Partages de mon carnet" count={items.length}>
      <LoadingOverlay visible={busy} label="Mise à jour…" />
      {items.length === 0 ? (
        <p className="font-body-md text-sm text-on-surface-variant italic">Votre carnet n&apos;est partagé avec personne.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/40">
          {items.map((i) => (
            <li key={i.member.id} className="flex items-center gap-3 py-3">
              <Link href={`/u/${i.member.username || i.member.id}`} className="shrink-0">
                <MemberAvatar member={i.member} size={36} />
              </Link>
              <span className="flex flex-col min-w-0 flex-1">
                <Link
                  href={`/u/${i.member.username || i.member.id}`}
                  className="font-body-md text-sm text-on-surface truncate hover:text-primary hover:underline"
                >
                  {i.member.full_name || 'Membre'}
                </Link>
                <span className="font-body-md text-[12px] text-on-surface-variant">
                  {SHARE_SCOPE_LABELS[i.scope]}
                  {i.created_at ? ` · depuis le ${formatDate(i.created_at)}` : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => revoke(i.member)}
                title="Retirer ce partage"
                className="flex items-center justify-center w-8 h-8 rounded-full text-error hover:bg-error/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">link_off</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
