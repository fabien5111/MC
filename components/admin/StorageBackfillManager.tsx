'use client';

// Écran du lot B3 (§ 7.5) : reprend, cible par cible, les images encore en
// data-URL vers le stockage objet. Motif `RecipeImageBackfill` (bouton,
// compteurs, reprenable) étendu aux onze cibles listées dans
// `lib/backfill.ts` — mais chaque lot est traité SERVEUR (route
// `/api/admin/backfill-photos`, clé service_role) plutôt que par le client
// Supabase du navigateur : ces écritures touchent des lignes appartenant à
// n'importe quel membre, pas seulement celles de l'administrateur connecté.
//
// Jamais de suppression de la data-URL d'origine ici — c'est le B4, une fois
// la reprise vérifiée.
import { useState } from 'react';
import { CIBLES_ORDRE } from '@/lib/backfill';

type EtatCible = { running: boolean; finished: boolean; done: number; failed: number };

const ETAT_INITIAL: EtatCible = { running: false, finished: false, done: 0, failed: 0 };

async function traiterUnLot(cle: string): Promise<{ traites: number; echecs: number; restant: boolean } | null> {
  const res = await fetch('/api/admin/backfill-photos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cible: cle }),
  });
  if (!res.ok) return null;
  return res.json();
}

export function StorageBackfillManager() {
  const [etats, setEtats] = useState<Record<string, EtatCible>>({});

  async function lancer(cle: string) {
    setEtats((prev) => ({ ...prev, [cle]: { ...ETAT_INITIAL, running: true } }));
    let done = 0;
    let failed = 0;
    for (;;) {
      const resultat = await traiterUnLot(cle);
      if (!resultat) break; // erreur réseau/serveur : on s'arrête, reprenable au prochain clic
      done += resultat.traites;
      failed += resultat.echecs;
      setEtats((prev) => ({ ...prev, [cle]: { running: true, finished: false, done, failed } }));
      if (!resultat.restant) break;
    }
    setEtats((prev) => ({ ...prev, [cle]: { running: false, finished: true, done, failed } }));
  }

  return (
    <div className="flex flex-col gap-3">
      {CIBLES_ORDRE.map(({ cle, label }) => {
        const etat = etats[cle] ?? ETAT_INITIAL;
        return (
          <div
            key={cle}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-4"
          >
            <div>
              <p className="font-label-md text-label-md text-on-surface">{label}</p>
              {(etat.running || etat.finished) && (
                <p className="mt-0.5 text-[12.5px] text-on-surface-variant">
                  {etat.done} reprise{etat.done > 1 ? 's' : ''}
                  {etat.failed > 0 ? ` · ${etat.failed} échec${etat.failed > 1 ? 's' : ''}` : ''}
                  {etat.finished ? ' · terminé' : ''}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => lancer(cle)}
              disabled={etat.running}
              className="rounded-pill bg-primary px-5 py-2 font-label-md text-label-md text-on-primary disabled:opacity-60"
            >
              {etat.running ? 'Reprise en cours…' : 'Lancer'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
