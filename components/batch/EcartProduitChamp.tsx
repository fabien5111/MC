'use client';

import { useEffect, useState } from 'react';
import { normaliserEcartProduit } from '@/lib/batch-lecons';

// « Quantité obtenue » d'une étape : ce qu'elle a produit de trop ou de
// moins que nécessaire, en grammes. Un nombre et non une phrase : l'éditeur de
// la recette (et le mode projet) en tire un coefficient pour les ingrédients
// de l'étape. Écrit à la sortie du champ (ou au changement de sens).
export function EcartProduitChamp({ valeur, disabled, onChange }: { valeur: number | null; disabled: boolean; onChange: (v: number | null) => void }) {
  const [grammes, setGrammes] = useState(valeur ? String(Math.abs(valeur)) : '');
  const [sens, setSens] = useState<'trop' | 'manque'>(valeur != null && valeur < 0 ? 'manque' : 'trop');
  useEffect(() => {
    setGrammes(valeur ? String(Math.abs(valeur)) : '');
    if (valeur) setSens(valeur < 0 ? 'manque' : 'trop');
  }, [valeur]);
  const ecrire = (g: string, sn: 'trop' | 'manque') => {
    const v = normaliserEcartProduit(g, sn);
    if (v !== valeur) onChange(v);
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <label className="font-label-md text-[12px] uppercase tracking-widest text-outline" title="Ce que l’étape a produit de trop ou de moins que nécessaire : sert à ajuster les ingrédients de l’étape dans la recette.">
        Quantité obtenue
      </label>
      <input
        inputMode="decimal"
        disabled={disabled}
        value={grammes}
        placeholder="—"
        onChange={(e) => setGrammes(e.target.value)}
        onBlur={() => ecrire(grammes, sens)}
        aria-label="Écart en grammes"
        className={`w-20 border rounded px-2 py-1 text-right focus:ring-1 focus:ring-primary ${
          valeur ? 'border-green-700 bg-green-50' : 'border-outline-variant bg-surface-container-low'
        }`}
      />
      <span className="text-on-surface-variant">g</span>
      <select
        disabled={disabled}
        value={sens}
        onChange={(e) => {
          const sn = e.target.value as 'trop' | 'manque';
          setSens(sn);
          ecrire(grammes, sn);
        }}
        className="border border-outline-variant rounded px-2 py-1 bg-surface-container-low"
      >
        <option value="trop">en trop</option>
        <option value="manque">manquants</option>
      </select>
      <span className="text-[12px] text-outline">par rapport à ce qu’il fallait</span>
    </div>
  );
}
