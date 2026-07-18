'use client';

// Ajustement des quantités par IA (porté de mcAskAiScale de recette.html).
// L'utilisateur décrit l'adaptation en langage naturel ; /api/scale-recipe
// renvoie un coefficient + une explication ; on affiche les quantités ajustées.
// Vue seule (non persistée) — s'appuie sur le back-end déjà porté.
import { useState } from 'react';
import Link from 'next/link';
import type { MergedIngredient } from '@/lib/recipe-view';

function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

// Applique le coefficient à une quantité (numérique → multipliée ; sinon inchangée).
function scaleQty(qty: string, coef: number): string {
  const n = parseFloat(String(qty).replace(',', '.'));
  return isNaN(n) ? qty : fmtNum(n * coef);
}

export function ScaleWidget({
  recipeTitle,
  rendement,
  ingredients,
}: {
  recipeTitle: string;
  rendement: string | null;
  ingredients: MergedIngredient[];
}) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [coef, setCoef] = useState<number | null>(null);
  const [explication, setExplication] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  async function ask() {
    if (prompt.trim().length < 3) {
      alert("Décrivez l'ajustement souhaité.");
      return;
    }
    setBusy(true);
    setCoef(null);
    setExplication(null);
    setNeedLogin(false);
    try {
      const resp = await fetch('/api/scale-recipe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          recette: {
            titre: recipeTitle,
            rendement,
            ingredients: ingredients.map((m) => ({ nom: m.name, quantite: m.qty, unite: m.unit })),
          },
          moules_reference: [],
        }),
      });
      if (resp.status === 401) {
        setNeedLogin(true);
        return;
      }
      const data = await resp.json().catch(() => ({ erreur: `Réponse invalide du serveur (HTTP ${resp.status}).` }));
      if (!resp.ok) throw new Error(data.erreur || `Erreur ${resp.status}`);
      setExplication(data.explication || '');
      setCoef(data.coefficient != null && data.coefficient > 0 ? data.coefficient : null);
    } catch (e) {
      setExplication((e as Error).message);
      setCoef(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="group border border-primary/30 rounded-xl mt-6 bg-surface-container-low">
      <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
        <span className="font-label-md text-label-md text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">auto_awesome</span> Ajuster les quantités (IA)
        </span>
        <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div className="p-4 pt-0 flex flex-col gap-4">
        <p className="text-sm text-on-surface-variant">
          Décrivez l&apos;adaptation souhaitée — par exemple « pour 12 parts au lieu de 8 », « moule de 24 cm »,
          ou « je n&apos;ai que 200 g de beurre ».
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ask();
            }}
            placeholder="ex : pour 12 personnes"
            className="flex-1 min-w-[220px] border border-outline-variant rounded px-4 py-2.5 bg-white text-[15px] focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={ask}
            disabled={busy}
            className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all active:scale-95 disabled:opacity-60"
          >
            <span className={`material-symbols-outlined text-[18px]${busy ? ' animate-spin' : ''}`}>
              {busy ? 'progress_activity' : 'calculate'}
            </span>
            {busy ? 'Calcul…' : 'Ajuster'}
          </button>
        </div>

        {needLogin && (
          <p className="text-sm text-on-surface-variant">
            <Link href="/connexion" className="text-primary underline">
              Connectez-vous
            </Link>{' '}
            pour utiliser l&apos;ajustement IA.
          </p>
        )}

        {explication && (
          <div className="border border-outline-variant rounded-lg bg-white p-4">
            <p className="text-sm text-on-surface">{explication}</p>
            {coef != null && (
              <p className="mt-2 font-label-md text-label-md text-primary">
                Coefficient appliqué : × {fmtNum(coef)}
              </p>
            )}
          </div>
        )}

        {coef != null && (
          <div>
            <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">
              Quantités ajustées
            </p>
            <ul style={{ display: 'grid', gridTemplateColumns: 'max-content max-content max-content', columnGap: 28 }}>
              <li className="pb-1" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                <span />
                <span className="font-label-md text-[10px] uppercase text-primary text-center">Ajustée</span>
                <span className="font-label-md text-[10px] uppercase text-on-surface-variant text-center">Origine</span>
              </li>
              {ingredients.map((m, k) => (
                <li key={k} className="py-1.5 border-b border-outline-variant/30" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'center' }}>
                  <span className="font-body-md text-body-md">{m.name}</span>
                  <span className="font-label-md text-label-md text-primary text-center">
                    {[scaleQty(m.qty, coef), m.unit].filter(Boolean).join(' ')}
                  </span>
                  <span className="font-label-md text-label-md text-on-surface-variant text-center">
                    {[m.qty, m.unit].filter(Boolean).join(' ') || '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
