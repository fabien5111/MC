'use client';

// Bannière d'accueil : une image par appareil (porté de loadBanner() du db.js).
// Le choix dépend de la largeur d'écran, connue seulement côté client.
import { useEffect, useState } from 'react';

export function HomeBanner({
  web,
  tablette,
  mobile,
  fallback,
}: {
  web?: string;
  tablette?: string;
  mobile?: string;
  fallback: string;
}) {
  const [src, setSrc] = useState(web || fallback);

  useEffect(() => {
    const pick = () => {
      const w = window.innerWidth;
      const byDevice = w >= 1024 ? web : w >= 768 ? tablette : mobile;
      setSrc(byDevice || web || fallback);
    };
    pick();
    window.addEventListener('resize', pick);
    return () => window.removeEventListener('resize', pick);
  }, [web, tablette, mobile, fallback]);

  return (
    <section className="relative w-full">
      <div
        className="relative w-full aspect-[2.5/1] min-h-[420px] md:min-h-[520px] overflow-hidden"
        style={{ maxWidth: 1983, margin: '0 auto' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin */}
        <img src={src} alt="Bannière Maryse Club" className="w-full h-full object-cover" />
      </div>
    </section>
  );
}
