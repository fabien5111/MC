'use client';

// Tiroir Compte du bureau : l'avatar de l'en-tête ouvre un panneau aligné à
// droite. Sur mobile, c'est la cinquième fente de la barre basse qui ouvre le
// même contenu en feuille remontante (`AccountSheetButton`) — d'où le
// `hidden lg:block` posé par l'appelant.
//
// Ce que ce composant prend en charge, et qui n'est pas négociable pour un
// menu : fermeture au clic extérieur et à `Échap`, **retour du focus à
// l'avatar** à la fermeture, et parcours des entrées aux flèches. Sans le
// retour du focus, refermer au clavier renvoie l'utilisateur en haut du
// document ; sans les flèches, `aria-haspopup="menu"` promet un menu et livre
// une liste de liens.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountMenuItems, type AccountMenuData } from '@/components/account/AccountMenuItems';

export function AccountMenuButton({ data, className = '' }: { data: AccountMenuData; className?: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fermeture + restitution du focus. Systématiquement passée par ici (voile,
  // Échap, activation d'une entrée) pour qu'aucun chemin de sortie n'oublie le
  // focus.
  const close = useCallback((giveBackFocus = true) => {
    setOpen(false);
    if (giveBackFocus) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      // Clic extérieur : on ferme sans rapatrier le focus — l'utilisateur est
      // en train de désigner autre chose, le lui reprendre serait un vol.
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
      if (items.length === 0) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : e.key === 'ArrowDown'
              ? (i + 1 + items.length) % items.length
              : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mon compte"
        onClick={() => setOpen((v) => !v)}
        className="block h-9 w-9 overflow-hidden rounded-pill border border-outline-variant bg-surface-container transition-all hover:ring-2 hover:ring-primary/20"
      >
        {data.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
          <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="material-symbols-outlined flex h-full w-full items-center justify-center text-[20px] text-on-surface-variant">
            person
          </span>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Mon compte"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xl"
        >
          <AccountMenuItems data={data} onNavigate={() => close(false)} />
        </div>
      )}
    </div>
  );
}
