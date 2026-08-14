'use client';

// Bouton « Partager » de la fiche recette.
//
// Visiteur ou lecteur d'une recette partagée avec lui : comportement
// d'origine inchangé, clic direct (API Web Share si disponible, sinon copie
// du lien dans le presse-papiers) — il n'a de toute façon rien à gérer.
//
// Propriétaire de la recette : le clic ouvre un dialog avec, en plus du
// partage externe, le partage interne à un membre (immédiat, comme le
// partage du carnet — cf. ShareBookButton) et la liste de qui a déjà accès,
// directement ou via le partage de son carnet (lib/shares.ts
// `getRecipeShareInfo`, à tenir synchrone avec la policy RLS
// `recipes_partagees`).
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { MemberPicker, MemberAvatar } from '@/components/share/MemberPicker';
import type { Member, RecipeShareInfo } from '@/lib/shares';

export function ShareButton({
  title,
  recipeId,
  ownerId,
  isOwner = false,
  shareInfo,
}: {
  title: string;
  recipeId?: string;
  // Id de l'auteur = utilisateur courant côté propriétaire ; sert à écrire
  // `recipe_shares.owner_id` (vérifié par la RLS, jamais fait confiance côté
  // client seul).
  ownerId?: string;
  isOwner?: boolean;
  // Fournie seulement au propriétaire (lib/shares.ts `getRecipeShareInfo`) —
  // un visiteur n'a pas à savoir avec qui la recette est partagée.
  shareInfo?: RecipeShareInfo;
}) {
  const [copied, setCopied] = useState(false);

  async function shareExternal() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // annulation par l'utilisateur : rien à faire
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers indisponible : rien à faire
    }
  }

  if (!isOwner || !recipeId || !ownerId) {
    return (
      <button
        type="button"
        onClick={shareExternal}
        aria-label={copied ? 'Lien copié' : 'Partager'}
        title={copied ? 'Lien copié' : 'Partager'}
        className="flex items-center justify-center w-7 h-7 border border-secondary rounded-full hover:bg-secondary-container transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">{copied ? 'check' : 'share'}</span>
      </button>
    );
  }

  return (
    <OwnerShareButton
      title={title}
      recipeId={recipeId}
      ownerId={ownerId}
      shareInfo={shareInfo ?? { direct: [], viaBook: [] }}
      onShareExternal={shareExternal}
      copied={copied}
    />
  );
}

function OwnerShareButton({
  title,
  recipeId,
  ownerId,
  shareInfo,
  onShareExternal,
  copied,
}: {
  title: string;
  recipeId: string;
  ownerId: string;
  shareInfo: RecipeShareInfo;
  onShareExternal: () => void;
  copied: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { mutate, busy } = useMutation();
  const [direct, setDirect] = useState(shareInfo.direct);
  useEffect(() => setDirect(shareInfo.direct), [shareInfo]);

  async function addShare(member: Member) {
    const ok = await mutate(
      () =>
        createClient()
          // Table absente des types tant que le SQL n'est pas appliqué (cf. lib/shares.ts).
          .from('recipe_shares' as any)
          .upsert({ recipe_id: recipeId, owner_id: ownerId, shared_with_id: member.id }, { onConflict: 'recipe_id,shared_with_id' }),
      { errorLabel: 'Partage impossible', refresh: false },
    );
    if (ok) setDirect((prev) => [member, ...prev.filter((m) => m.id !== member.id)]);
  }

  async function revoke(member: Member) {
    const ok = await mutate(
      () =>
        createClient()
          .from('recipe_shares' as never)
          .delete()
          .eq('recipe_id', recipeId)
          .eq('shared_with_id', member.id),
      { confirm: `Retirer le partage de « ${title} » avec ${member.full_name || 'ce membre'} ?`, refresh: false },
    );
    if (ok) setDirect((prev) => prev.filter((m) => m.id !== member.id));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Partager"
        title="Partager"
        className="flex items-center justify-center w-7 h-7 border border-secondary rounded-full hover:bg-secondary-container transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">share</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Partager cette recette"
          className="fixed inset-0 z-[95] flex items-start justify-center bg-background/60 backdrop-blur-[2px] p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <LoadingOverlay visible={busy} />
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg my-8 bg-surface-container-low border border-outline-variant rounded-xl shadow-lg flex flex-col"
          >
            <div className="flex items-start justify-between gap-4 p-6 border-b border-outline-variant">
              <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-3">
                <span className="material-symbols-outlined">share</span> Partager cette recette
              </h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="text-on-surface-variant hover:text-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-6">
              <button
                type="button"
                onClick={onShareExternal}
                className="flex items-center gap-2 self-start rounded-pill border border-outline-variant px-4 py-2 font-label-md text-[13px] text-primary hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">{copied ? 'check' : 'ios_share'}</span>
                {copied ? 'Lien copié' : 'Copier le lien / partager'}
              </button>

              <div className="flex flex-col gap-3">
                <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Partager avec un membre</span>
                <MemberPicker excludeIds={[ownerId, ...direct.map((m) => m.id)]} onSelect={addShare} />
              </div>

              <div className="flex flex-col gap-3">
                <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Partagée avec {direct.length + shareInfo.viaBook.length > 0 ? `(${direct.length + shareInfo.viaBook.length})` : ''}
                </span>
                {direct.length === 0 && shareInfo.viaBook.length === 0 ? (
                  <p className="font-body-md text-sm text-on-surface-variant italic">Cette recette n’est partagée avec personne.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-outline-variant/40">
                    {direct.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 py-2">
                        <MemberAvatar member={m} />
                        <span className="flex-1 min-w-0 truncate font-body-md text-sm text-on-surface">{m.full_name || 'Membre'}</span>
                        <button
                          type="button"
                          onClick={() => revoke(m)}
                          title="Retirer ce partage"
                          className="flex items-center justify-center w-8 h-8 rounded-full text-error hover:bg-error/10 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">link_off</span>
                        </button>
                      </li>
                    ))}
                    {shareInfo.viaBook
                      .filter((m) => !direct.some((d) => d.id === m.id))
                      .map((m) => (
                        <li key={m.id} className="flex items-center gap-3 py-2">
                          <MemberAvatar member={m} />
                          <span className="flex-1 min-w-0 truncate font-body-md text-sm text-on-surface">{m.full_name || 'Membre'}</span>
                          <span className="font-body-md text-[11px] text-on-surface-variant italic">via le partage du carnet</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
