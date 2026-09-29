'use client';

// Fenêtre de souscription (JEP-29 §4.1, revue avec les CGV) : DEUX cases,
// séparées, obligatoires, non pré-cochées, avant toute ouverture de session
// Stripe Checkout ou toute montée en gamme :
//  1. acceptation des CGV (lien vers `/cgv`, nouvel onglet — quitter la
//     fenêtre pour les lire ferait perdre le geste en cours) ;
//  2. demande d'accès immédiat au service. Ce n'est PLUS une renonciation au
//     droit de rétractation : le membre garde ses 14 jours, avec un
//     remboursement au prorata de la durée restante (CGV art. 11,
//     L.221-25 du Code de la consommation). L'ancienne formule (« je renonce
//     expressément… ») ne tenait pas pour un service qui n'est pas
//     pleinement exécuté avant la fin du délai.
// Deux cases et non une seule : accepter un contrat et demander son
// exécution anticipée sont deux consentements distincts, chacun doit être
// donné par un geste propre.
//
// Fenêtre dédiée plutôt qu'un simple `dialog.confirm()` : une case à cocher
// n'entre pas dans le vocabulaire du Dialog générique (alert/confirm/prompt),
// et cocher-puis-cliquer est le geste attendu pour ce type de mention légale
// — un `confirm()` reviendrait à faire porter l'acceptation par le libellé
// du bouton, pas par un geste explicite et séparé.
//
// Ne pose aucun droit elle-même : elle ne fait que transmettre l'horodatage
// au moment du clic à la route serveur, qui revérifie tout (cf.
// app/api/abonnement/checkout/route.ts) — une case cochée côté navigateur ne
// prouve rien.
import { useState } from 'react';
import { CGV_CHEMIN } from '@/lib/cgv';

export function CheckoutWaiverDialog({
  planLabel,
  introduction,
  libelleAction,
  onClose,
  onConfirm,
}: {
  planLabel: string;
  // Ce qui va se passer, en toutes lettres — une souscription redirige vers
  // Stripe, une montée en gamme débite la carte enregistrée sur-le-champ.
  // Deux gestes qui engagent différemment, donc deux phrases distinctes.
  introduction: string;
  libelleAction: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [cgv, setCgv] = useState(false);
  const [accesImmediat, setAccesImmediat] = useState(false);
  const pret = cgv && accesImmediat;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Souscrire à ${planLabel}`}
      className="fixed inset-0 z-[95] flex items-start justify-center bg-background/60 backdrop-blur-[2px] p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md my-8 bg-surface-container-low border border-outline-variant rounded-xl shadow-lg flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-headline-md text-primary">Souscrire à {planLabel}</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm text-on-surface-variant">{introduction}</p>

          <label className="flex items-start gap-3 rounded-lg border border-outline-variant p-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={cgv}
              onChange={(e) => setCgv(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              J’ai lu et j’accepte les{' '}
              <a
                href={CGV_CHEMIN}
                target="_blank"
                rel="noopener"
                onClick={(e) => e.stopPropagation()}
                className="text-primary underline"
              >
                conditions générales de vente
              </a>
              .
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-outline-variant p-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={accesImmediat}
              onChange={(e) => setAccesImmediat(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Je demande l’accès immédiat à ma formule et reconnais qu’en cas de rétractation sous 14 jours, la
              part correspondant à la durée déjà écoulée restera due.
            </span>
          </label>
          <button
            type="button"
            disabled={!pret}
            onClick={onConfirm}
            className="w-full rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary transition-colors hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {libelleAction}
          </button>
        </div>
      </div>
    </div>
  );
}
