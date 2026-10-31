'use client';

// Description d'une idée : 3 lignes, puis « Voir plus » pour déplier la carte.
// Le lien n'apparaît que si le texte dépasse réellement (mesure au rendu et au
// redimensionnement) — une description courte reste sans bouton inutile.
import { useEffect, useRef, useState } from 'react';

export function IdeaDescription({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const [deborde, setDeborde] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || ouvert) return;
    const mesurer = () => setDeborde(el.scrollHeight > el.clientHeight + 1);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, [ouvert, text]);

  return (
    <div className="mb-2">
      <p
        ref={ref}
        className={`text-sm text-on-surface-variant whitespace-pre-line break-words ${ouvert ? '' : 'line-clamp-3'}`}
      >
        {text}
      </p>
      {(deborde || ouvert) && (
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-expanded={ouvert}
          className="mt-1 -mb-2 py-2 text-sm font-semibold text-primary hover:underline"
        >
          {ouvert ? 'Voir moins' : 'Voir plus'}
        </button>
      )}
    </div>
  );
}
