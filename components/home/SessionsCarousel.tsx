'use client';

// Carrousel « Fournées en cours » de l'accueil (membre, seulement si au
// moins une fournée est en cuisson — cf. README Écran 1).
//
// Une fournée par vue, `translateX` de 100 %, transition 300 ms, flèches
// désactivées en butée. **Tri par prochaine échéance** (fait en amont par
// `getActiveBatches`, jamais par heure de démarrage) — ce composant ne
// fait qu'afficher l'ordre reçu.
//
// Deux boutons Préparer/Cuisiner par carte, comme sur `/en-cuisine`
// (`ActiveBatchCard`) : chacun ouvre directement la fournée dans le bon
// mode, sans passer par l'écran générique.
//
// Pas de décompte (« dans 12 min ») : le modèle ne porte aucun ancrage
// horaire par étape. « Étape X sur Y · titre de l'étape » dit ce que l'on
// sait, sans en dire plus (cf. lot « En cuisine »).
import { useState } from 'react';
import Link from 'next/link';
import type { ActiveBatchRow } from '@/lib/profile';

export function SessionsCarousel({ sessions }: { sessions: ActiveBatchRow[] }) {
  const [i, setI] = useState(0);
  const atStart = i === 0;
  const atEnd = i === sessions.length - 1;

  return (
    <section className="pt-4 mb-20">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2.5">
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
            Fournées en cours
          </p>
          <span className="flex items-center gap-1.5 bg-primary text-on-primary rounded-full px-2 py-0.5 text-[10.5px] font-semibold">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70 motion-reduce:hidden" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            {sessions.length}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] text-on-surface-variant tabular-nums">
            {i + 1} / {sessions.length}
          </span>
          <button
            type="button"
            onClick={() => setI((v) => Math.max(0, v - 1))}
            disabled={atStart}
            aria-label="Session précédente"
            className="w-8 h-8 rounded-full border border-outline-variant flex items-center justify-center text-primary hover:bg-surface-container transition-colors disabled:opacity-30 disabled:cursor-default"
          >
            <span className="material-symbols-outlined text-[19px]">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => setI((v) => Math.min(sessions.length - 1, v + 1))}
            disabled={atEnd}
            aria-label="Session suivante"
            className="w-8 h-8 rounded-full border border-outline-variant flex items-center justify-center text-primary hover:bg-surface-container transition-colors disabled:opacity-30 disabled:cursor-default"
          >
            <span className="material-symbols-outlined text-[19px]">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {sessions.map((s) => {
            const { done, total, currentTitle } = s.progress;
            const etape = total > 0 ? `Étape ${Math.min(done + 1, total)} sur ${total}` : 'Fournée démarrée';
            return (
              <div key={s.id} className="w-full shrink-0 px-0.5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 border border-primary/35 bg-surface-container-low rounded-xl p-5 hover:shadow-lg transition-all">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50 motion-reduce:hidden" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] text-on-surface truncate">
                        <strong className="text-primary">{s.recipe_title || 'Fournée'}</strong>
                        {currentTitle ? <> — {currentTitle.toLowerCase()}</> : null}
                      </p>
                      {total > 0 && (
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="flex gap-1" style={{ width: 90 }}>
                            {Array.from({ length: total }, (_, k) => (
                              <span
                                key={k}
                                className={`h-1.5 flex-1 rounded-full ${k < done ? 'bg-primary' : 'bg-outline-variant'}`}
                              />
                            ))}
                          </span>
                          <span className="text-[12px] text-on-surface-variant truncate">{etape}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <Link
                      href={`/fournee/${s.id}?mode=preparer`}
                      className="flex items-center gap-1.5 border border-primary text-primary px-4 py-2.5 rounded-full text-[13px] font-semibold whitespace-nowrap hover:bg-primary/5 transition-colors tracking-wide"
                    >
                      <span className="material-symbols-outlined text-[18px]">tune</span> Préparer
                    </Link>
                    <Link
                      href={`/fournee/${s.id}?mode=cuisiner`}
                      className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2.5 rounded-full text-[13px] font-semibold whitespace-nowrap hover:shadow-lg transition-all tracking-wide"
                    >
                      <span className="material-symbols-outlined text-[18px]">skillet</span> Cuisiner
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[13px] text-on-surface-variant mt-3">
        Ces rappels n&apos;apparaissent que si des fournées sont en cuisson, triés par prochaine échéance.
      </p>
    </section>
  );
}
