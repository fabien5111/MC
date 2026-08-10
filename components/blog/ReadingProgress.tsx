'use client';

// Filet de progression de lecture, sous l'en-tête collant.
//
// Il n'est pas masqué sous `prefers-reduced-motion` : il ne s'anime pas de
// lui-même, il suit le défilement. Le retirer priverait d'un repère utile sans
// rien retirer de gênant.
//
// L'écouteur est `passive` : la largeur est écrite dans une variable CSS plutôt
// que via un état React, pour ne pas déclencher un rendu à chaque pixel de
// défilement.
import { useEffect, useRef } from 'react';

export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (bar.current) bar.current.style.width = `${ratio * 100}%`;
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div className="sticky top-[73px] z-40 h-0.5 bg-transparent" aria-hidden="true">
      <div ref={bar} className="h-full bg-primary" style={{ width: 0 }} />
    </div>
  );
}
