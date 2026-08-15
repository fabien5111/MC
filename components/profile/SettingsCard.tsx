'use client';

// Bloc repliable des réglages du compte — même habillage que
// `PasswordChangeCard` (bg-surface-container-lowest border border-outline-variant),
// replié par défaut avec le compte visible dans l'en-tête : ouvrir un bloc
// pour découvrir qu'il est vide serait plus frustrant qu'un compte à zéro
// affiché d'emblée.
import { useState } from 'react';

export function SettingsCard({
  icon,
  title,
  count,
  children,
}: {
  icon: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-6 bg-surface-container-lowest border border-outline-variant">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 p-8 md:p-10 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-[22px]">{icon}</span>
          <span className="font-headline-md text-headline-md text-primary">
            {title}
            {count > 0 ? ` (${count})` : ''}
          </span>
        </span>
        <span className="material-symbols-outlined text-on-surface-variant text-[24px] shrink-0">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && <div className="px-8 pb-8 md:px-10 md:pb-10">{children}</div>}
    </section>
  );
}
