'use client';

// Sommaire d'article : liste des H2/H3 du contenu, avec suivi de la lecture.
//
// La zone « active » est la **bande haute** de la fenêtre, pas son centre
// (`rootMargin: '-100px 0px -70% 0px'`) : c'est ce qu'on vient de dépasser qui
// indique où l'on est, pas ce qu'on aperçoit en bas de l'écran. Les 100 px du
// haut compensent l'en-tête collant, comme le `scroll-mt-[110px]` des titres.
import { useEffect, useRef, useState } from 'react';
import type { Heading } from '@/lib/blog-content';

export function ArticleToc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null);
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!headings.length) return;

    const targets = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-100px 0px -70% 0px' },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null; // un sommaire d'une entrée n'aide personne

  return (
    <aside className="order-1 lg:order-2 mb-10 lg:mb-0">
      <div className="lg:sticky lg:top-[100px]">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline mb-3">
          Sommaire
        </p>
        <nav ref={nav} aria-label="Sommaire de l'article">
          {headings.map((h) => {
            const on = h.id === active;
            return (
              <a
                key={h.id}
                href={`#${h.id}`}
                aria-current={on ? 'location' : undefined}
                className={[
                  'block leading-snug border-l-2 transition-colors',
                  h.level === 3 ? 'pl-6 py-1.5 text-[12.5px]' : 'pl-3 py-1.5 text-[13.5px]',
                  on
                    ? 'text-primary font-semibold border-primary'
                    : 'text-on-surface-variant border-[#e8d9d9] hover:text-primary hover:border-outline-variant',
                ].join(' ')}
              >
                {h.text}
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
