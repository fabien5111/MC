'use client';

// Partage du carnet entier avec un autre membre — picto à côté d'Importer et
// Créer (app/carnet/page.tsx), même icône que le bouton Partager d'une
// recette. Une seule fenêtre pour les deux usages : accorder un nouveau
// partage (recherche + portée) et gérer ceux déjà émis (révocation).
//
// Écriture immédiate, pas d'acceptation du destinataire (celui-ci peut à
// tout moment révoquer sa propre ligne depuis l'onglet « Partagées avec moi » de son
// carnet — cf. lib/shares.ts).
//
// Suppression/ajout optimiste dans une liste locale initialisée depuis les
// props (motif ProfileTabs `delRecipe` / ImporterList `supprimer`) : la
// fenêtre reste ouverte après une action, `router.refresh()` seul laisserait
// la liste affichée figée jusqu'au prochain rendu serveur.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { MemberPicker, MemberAvatar } from '@/components/share/MemberPicker';
import { formatDate } from '@/lib/format';
import { SHARE_SCOPE_LABELS, type BookShareGiven, type Member, type ShareScope } from '@/lib/shares';

export function ShareBookButton({ ownerId, given }: { ownerId: string; given: BookShareGiven[] }) {
  const [open, setOpen] = useState(false);
  const { mutate, busy } = useMutation();
  const [items, setItems] = useState(given);
  useEffect(() => setItems(given), [given]);
  // Seul choix réel : inclure les brouillons ou non — le reste (recettes
  // privées comprises) est la portée de base, non négociable, cf. la case
  // « Toutes mes recettes privées » ci-dessous.
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const scope: ShareScope = includeDrafts ? 'all' : 'published';

  async function addShare(member: Member) {
    const ok = await mutate(
      () =>
        createClient()
          // Table absente des types tant que le SQL n'est pas appliqué (cf. lib/shares.ts).
          .from('book_shares' as any)
          .upsert({ owner_id: ownerId, shared_with_id: member.id, scope }, { onConflict: 'owner_id,shared_with_id' }),
      { errorLabel: 'Partage impossible', refresh: false },
    );
    if (ok) setItems((prev) => [{ scope, created_at: new Date().toISOString(), member }, ...prev.filter((i) => i.member.id !== member.id)]);
  }

  async function revoke(member: Member) {
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-pill border border-outline-variant px-4 py-2.5 text-[13px] font-semibold text-primary transition-colors hover:bg-surface-container"
      >
        <span className="material-symbols-outlined text-[18px]">share</span> Partager mon carnet
        {items.length > 0 ? ` (${items.length})` : ''}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Partager mon carnet"
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
                <span className="material-symbols-outlined">share</span> Partager mon carnet
              </h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="text-on-surface-variant hover:text-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 font-body-md text-sm text-on-surface-variant">
                  <input type="checkbox" checked disabled className="accent-primary" />
                  Toutes mes recettes privées
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-body-md text-sm">
                  <input
                    type="checkbox"
                    checked={includeDrafts}
                    onChange={(e) => setIncludeDrafts(e.target.checked)}
                    className="accent-primary"
                  />
                  Inclure mes brouillons
                </label>
                <p className="font-body-md text-[12px] text-on-surface-variant italic">
                  Vous pouvez aussi partager une recette privée à l’unité, depuis sa fiche.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Partager avec</span>
                <MemberPicker excludeIds={[ownerId, ...items.map((i) => i.member.id)]} onSelect={addShare} />
              </div>

              <div className="flex flex-col gap-3">
                <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Déjà partagé avec {items.length > 0 ? `(${items.length})` : ''}
                </span>
                {items.length === 0 ? (
                  <p className="font-body-md text-sm text-on-surface-variant italic">Votre carnet n’est partagé avec personne.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-outline-variant/40">
                    {items.map((i) => (
                      <li key={i.member.id} className="flex items-center gap-3 py-2">
                        <MemberAvatar member={i.member} />
                        <span className="flex flex-col min-w-0 flex-1">
                          <span className="font-body-md text-sm text-on-surface truncate">{i.member.full_name || 'Membre'}</span>
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
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
