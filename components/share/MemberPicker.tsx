'use client';

// Recherche d'un membre par nom ou identifiant — brique commune aux deux
// écrans de partage interne (carnet entier `ShareBookButton`, recette précise
// `ShareButton`). Débounce 300 ms, `AbortController` sur la frappe suivante
// (même motif que `IngredientExpandDialog`), pas de recherche en dessous de
// deux caractères pour ne pas ramener tout le fonds de membres au premier
// caractère tapé.
import { useEffect, useRef, useState } from 'react';
import type { Member } from '@/lib/shares';

export function MemberPicker({
  excludeIds,
  onSelect,
  placeholder = 'Nom ou identifiant…',
}: {
  // Membres à ne pas reproposer (déjà partagé avec, soi-même…).
  excludeIds: string[];
  onSelect: (member: Member) => void;
  placeholder?: string;
}) {
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  // Lu au déclenchement de l'effet sans en faire une dépendance : la liste
  // exclue change à chaque partage accordé, ça ne doit pas relancer la
  // recherche en cours.
  const excludeRef = useRef(excludeIds);
  excludeRef.current = excludeIds;

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) {
      setItems([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/membres?q=${encodeURIComponent(t)}`, { signal: controller.signal });
        const data = await resp.json();
        setItems(((data.items ?? []) as Member[]).filter((m) => !excludeRef.current.includes(m.id)));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setItems([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder={placeholder}
        autoFocus
        className="border border-outline-variant rounded px-3 py-2 bg-white font-body-md text-sm text-on-surface focus:outline-none focus:border-primary"
      />
      {term.trim().length >= 2 && (
        <ul className="flex flex-col divide-y divide-outline-variant/40 max-h-56 overflow-y-auto border border-outline-variant rounded-lg">
          {items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(m);
                  setTerm('');
                  setItems([]);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-container transition-colors"
              >
                <MemberAvatar member={m} />
                <span className="flex flex-col">
                  <span className="font-body-md text-sm text-on-surface">{m.full_name || 'Membre'}</span>
                  {m.username && <span className="font-body-md text-[12px] text-on-surface-variant">@{m.username}</span>}
                </span>
              </button>
            </li>
          ))}
          {!searching && !items.length && (
            <li className="px-3 py-2 font-body-md text-sm text-on-surface-variant italic">Aucun membre trouvé.</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function MemberAvatar({ member, size = 28 }: { member: Pick<Member, 'full_name' | 'avatar_url'>; size?: number }) {
  if (member.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
    return <img src={member.avatar_url} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center shrink-0 font-label-md text-[11px] uppercase"
      style={{ width: size, height: size }}
    >
      {(member.full_name || '?').slice(0, 1)}
    </span>
  );
}
