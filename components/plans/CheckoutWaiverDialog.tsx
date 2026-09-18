'use client';

// Case de renonciation au droit de rétractation (JEP-29 §4.1) : obligatoire,
// non pré-cochée, avant toute ouverture de session Stripe Checkout.
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

export function CheckoutWaiverDialog({
  planLabel,
  onClose,
  onConfirm,
}: {
  planLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [coche, setCoche] = useState(false);

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
          <p className="text-sm text-on-surface-variant">
            Vous allez être redirigé vers notre prestataire de paiement (Stripe) pour finaliser votre abonnement.
          </p>

          <label className="flex items-start gap-3 rounded-lg border border-outline-variant p-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={coche}
              onChange={(e) => setCoche(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Je demande l’accès immédiat au contenu numérique et je renonce expressément à mon droit de
              rétractation.
            </span>
          </label>

          <button
            type="button"
            disabled={!coche}
            onClick={onConfirm}
            className="w-full rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary transition-colors hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continuer vers le paiement
          </button>
        </div>
      </div>
    </div>
  );
}
