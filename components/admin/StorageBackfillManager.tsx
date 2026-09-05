'use client';

// Écran du lot B3/B4 (§ 7.5/§ 8) : reprend, cible par cible, les images
// encore en data-URL vers le stockage objet (« Lancer »), puis relit après
// coup ce qui a déjà été déposé (« Vérifier »). Motif `RecipeImageBackfill`
// (bouton, compteurs, reprenable) étendu aux onze cibles listées dans
// `lib/backfill.ts` — mais chaque lot est traité SERVEUR (route
// `/api/admin/backfill-photos`, clé service_role) plutôt que par le client
// Supabase du navigateur : ces écritures/lectures touchent des lignes
// appartenant à n'importe quel membre, pas seulement celles de
// l'administrateur connecté.
//
// Jamais de suppression ici, ni de la data-URL d'origine (le dépôt l'écrase
// déjà en un seul geste, § 8 — la vérification ne protège donc plus une
// décision d'effacement, elle détecte seulement après coup un objet devenu
// illisible) ni d'un objet du stockage (réconciliation des orphelins,
// traitée à part — jamais dans cet écran).
import { useState } from 'react';
import { CIBLES_ORDRE } from '@/lib/backfill';

type EchecLot = { cle: string; colonne: string; motif: string };
type EtatCible = { running: boolean; finished: boolean; done: number; failed: number; details: EchecLot[] };
type ResultatLot = { traites: number; echecs: number; restant: boolean; details: EchecLot[] };

const ETAT_INITIAL: EtatCible = { running: false, finished: false, done: 0, failed: 0, details: [] };

type EchecVerification = { table: string; cle: string; colonne: string; url: string };
type EtatVerif = { running: boolean; done: boolean; ok: number; echecs: EchecVerification[] };
type ResultatVerification = { verifiees: number; ok: number; echecs: EchecVerification[] };

const VERIF_INITIALE: EtatVerif = { running: false, done: false, ok: 0, echecs: [] };

async function appelBackfill<T>(cible: string, action?: 'verifier'): Promise<T | null> {
  const res = await fetch('/api/admin/backfill-photos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(action ? { cible, action } : { cible }),
  });
  if (!res.ok) return null;
  return res.json();
}

export function StorageBackfillManager() {
  const [etats, setEtats] = useState<Record<string, EtatCible>>({});
  const [verifs, setVerifs] = useState<Record<string, EtatVerif>>({});

  async function lancer(cle: string) {
    setEtats((prev) => ({ ...prev, [cle]: { ...ETAT_INITIAL, running: true } }));
    let done = 0;
    let failed = 0;
    // Bornés : au-delà, la liste sert à repérer un motif récurrent, pas à
    // tout journaliser — le détail complet reste dans les journaux serveur
    // (console.error, lib/backfill-data.ts).
    let details: EchecLot[] = [];
    for (;;) {
      const resultat = await appelBackfill<ResultatLot>(cle);
      if (!resultat) break; // erreur réseau/serveur : on s'arrête, reprenable au prochain clic
      done += resultat.traites;
      failed += resultat.echecs;
      details = [...details, ...resultat.details].slice(0, 20);
      setEtats((prev) => ({ ...prev, [cle]: { running: true, finished: false, done, failed, details } }));
      if (!resultat.restant) break;
    }
    setEtats((prev) => ({ ...prev, [cle]: { running: false, finished: true, done, failed, details } }));
  }

  async function verifier(cle: string) {
    setVerifs((prev) => ({ ...prev, [cle]: { ...VERIF_INITIALE, running: true } }));
    const resultat = await appelBackfill<ResultatVerification>(cle, 'verifier');
    setVerifs((prev) => ({
      ...prev,
      [cle]: resultat
        ? { running: false, done: true, ok: resultat.ok, echecs: resultat.echecs }
        : { ...VERIF_INITIALE, done: true },
    }));
  }

  return (
    <div className="flex flex-col gap-3">
      {CIBLES_ORDRE.map(({ cle, label }) => {
        const etat = etats[cle] ?? ETAT_INITIAL;
        const verif = verifs[cle] ?? VERIF_INITIALE;
        return (
          <div key={cle} className="rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-label-md text-label-md text-on-surface">{label}</p>
                {(etat.running || etat.finished) && (
                  <p className="mt-0.5 text-[12.5px] text-on-surface-variant">
                    {etat.done} reprise{etat.done > 1 ? 's' : ''}
                    {etat.failed > 0 ? ` · ${etat.failed} échec${etat.failed > 1 ? 's' : ''}` : ''}
                    {etat.finished ? ' · terminé' : ''}
                  </p>
                )}
                {verif.done && (
                  <p className="mt-0.5 text-[12.5px] text-on-surface-variant">
                    Vérification : {verif.ok} OK
                    {verif.echecs.length > 0
                      ? ` · ${verif.echecs.length} introuvable${verif.echecs.length > 1 ? 's' : ''}`
                      : ''}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => verifier(cle)}
                  disabled={verif.running || etat.running}
                  className="rounded-pill border border-primary px-5 py-2 font-label-md text-label-md text-primary disabled:opacity-60"
                >
                  {verif.running ? 'Vérification…' : 'Vérifier'}
                </button>
                <button
                  type="button"
                  onClick={() => lancer(cle)}
                  disabled={etat.running || verif.running}
                  className="rounded-pill bg-primary px-5 py-2 font-label-md text-label-md text-on-primary disabled:opacity-60"
                >
                  {etat.running ? 'Reprise en cours…' : 'Lancer'}
                </button>
              </div>
            </div>
            {etat.details.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-outline-variant pt-3 text-[12px] text-on-surface-variant">
                {etat.details.map((e, i) => (
                  <li key={i} className="font-mono">
                    {e.colonne} — {e.cle} : {e.motif}
                  </li>
                ))}
              </ul>
            )}
            {verif.echecs.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-outline-variant pt-3 text-[12px] text-on-surface-variant">
                {verif.echecs.map((e, i) => (
                  <li key={i} className="font-mono">
                    {e.table}.{e.colonne} — {e.cle}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
