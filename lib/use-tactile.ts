'use client';

import { useEffect, useState } from 'react';

// Appareil tactile (`pointer: coarse` : téléphone, tablette) — lu après le
// montage, faux au rendu serveur.
export function useTactile(): boolean {
  const [tactile, setTactile] = useState(false);
  useEffect(() => {
    try {
      setTactile(window.matchMedia('(pointer: coarse)').matches);
    } catch {
      setTactile(false);
    }
  }, []);
  return tactile;
}
