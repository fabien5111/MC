'use client';

// « Fournée validée » : écran de tri des retours (JEP-381). Posé quand le membre
// valide une fournée (question de clôture, case du résumé) : liste les retours de
// CETTE fournée et ceux qu'elle a hérités, chacun avec son épingle. Ce qui reste
// épinglé sera rappelé dans toutes les fournées lancées par « Refaire » ; ce qui
// est désépinglé ne reviendra plus. Les épingles sont celles de partout ailleurs
// (`ChoixRemarque`, table `remarques_gardees`) : rien de nouveau n'est stocké.
import { ChoixRemarque, PorteeEdition, useLecons } from '@/components/batch/DerniereFois';
import type { Remarque } from '@/lib/batch-lecons';

// Intitulé court de ce que la remarque concerne.
function intitule(r: Remarque): string {
  if (r.nature === 'global') return 'Commentaire global';
  if (r.nature === 'ingredient') return r.libelle ? `${r.etapeTitre ? r.etapeTitre + ' · ' : ''}${r.libelle}` : r.etapeTitre ?? 'Ingrédient';
  if (r.nature === 'sous_etape') return `${r.etapeTitre ? r.etapeTitre + ' · ' : ''}${r.libelle ?? 'Sous-étape'}`;
  return r.etapeTitre ?? 'Étape';
}

function Ligne({ r }: { r: Remarque }) {
  return (
    <li className="flex items-start gap-1 border-l-2 border-primary/50 pl-3 text-sm text-primary">
      <ChoixRemarque r={r} />
      <span>
        <span className="font-bold not-italic">{intitule(r)}</span>
        {r.ecart && <span className="italic"> — {r.ecart}</span>}
        {r.texte && <span className="italic"> — {r.texte}</span>}
      </span>
    </li>
  );
}

export function ValidationFournee({ propres, onClose }: { propres: Remarque[]; onClose: () => void }) {
  const v = useLecons();
  const avecContenu = (r: Remarque) => !!(r.texte || r.ecart);
  const ici = propres.filter(avecContenu);
  const dejaVues = new Set(ici.map((r) => r.cle));
  // Retours hérités des fournées précédentes, encore affichés (épinglés ou non
  // jusqu'au rechargement), sans ceux de cette fournée.
  const herites = (v?.remarques ?? []).filter((r) => avecContenu(r) && !dejaVues.has(r.cle));
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Fournée validée">
      <PorteeEdition silencieux>
        <div className="w-full max-w-xl bg-white rounded-lg p-6 flex flex-col gap-4 shadow-xl max-h-[90vh] overflow-y-auto">
          <h2 className="font-headline-sm text-primary">Fournée validée</h2>
          <p className="text-sm text-on-surface-variant">
            Gardez épinglés les retours à retrouver quand vous <strong>refaites</strong> cette fournée ; désépinglez ceux qui ne servent plus.
            Vous pourrez toujours les modifier depuis le résumé de la fournée.
          </p>
          {ici.length === 0 && herites.length === 0 && <p className="text-sm text-on-surface-variant">Aucun retour à trier pour cette fournée.</p>}
          {ici.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">Retours de cette fournée</p>
              <ul className="flex flex-col gap-2">
                {ici.map((r) => (
                  <Ligne key={r.cle} r={r} />
                ))}
              </ul>
            </div>
          )}
          {herites.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">Retours des fournées précédentes</p>
              <ul className="flex flex-col gap-2">
                {herites.map((r) => (
                  <Ligne key={r.cle} r={r} />
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-primary text-on-primary rounded font-label-md">
              Terminer
            </button>
          </div>
        </div>
      </PorteeEdition>
    </div>
  );
}
