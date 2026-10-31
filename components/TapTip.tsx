'use client';

// Infobulle tactile : le `title` HTML ne s'affiche jamais au doigt. Même
// mécanisme que `LockedAction` (Popover API native, positionnée au tap), pour
// un picto d'information seul. À ne pas poser à l'intérieur d'un lien : le tap
// naviguerait.
import { useId, useRef, type ReactNode } from 'react';

export function TapTip({
  message,
  children,
  className,
}: {
  /** Explication en une phrase, aussi lue comme nom accessible du picto. */
  message: string;
  children: ReactNode;
  className?: string;
}) {
  const popoverId = `tap-tip-${useId()}`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  function toggle() {
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 8 - 272))}px`;
    pop.style.top = `${rect.bottom + 6}px`;
    pop.togglePopover();
  }

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={message}
        aria-label={message}
        aria-describedby={popoverId}
        className={`inline-flex items-center border-0 bg-transparent p-0 ${className ?? ''}`}
      >
        {children}
      </button>
      <div
        ref={popRef}
        id={popoverId}
        popover="auto"
        role="tooltip"
        className="inset-auto m-0 w-max max-w-[17rem] whitespace-normal rounded border-0 bg-primary px-3 py-2 text-left font-body-md text-[12px] leading-snug text-white shadow-lg"
      >
        {message}
      </div>
    </span>
  );
}
