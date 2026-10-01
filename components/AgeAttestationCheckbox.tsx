'use client';

// Case d'attestation d'âge (JEP-34), partagée par le formulaire d'inscription
// (`LoginForm`) et l'écran `/choix-pseudo` (`PseudoChooser`) — un compte Google
// ne passe jamais par le premier, c'est sur le second qu'il atteste.
//
// Placée immédiatement au-dessus du bouton de validation. Le parent ne
// désactive PAS son bouton pour cette seule case : la spec demande qu'une
// tentative de validation la signale (contour rouge + message d'aide sous la
// case), ce qu'un bouton désactivé ne permettrait jamais de découvrir. Le
// blocage réel est dans le `submit` du parent, et côté serveur pour
// `/choix-pseudo`.
import { AGE_ATTESTATION_ERREUR, AGE_ATTESTATION_TEXTE } from '@/lib/attestation-age';

export function AgeAttestationCheckbox({
  checked,
  onChange,
  erreur,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Vrai après une tentative de validation sans la case cochée. */
  erreur: boolean;
}) {
  const visible = erreur && !checked;
  return (
    <div className="py-2">
      <div className="flex items-start gap-3">
        <input
          id="age-attestation"
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={visible}
          aria-describedby={visible ? 'age-attestation-erreur' : undefined}
          className={`mt-1 w-4 h-4 rounded-none accent-primary-container focus:ring-primary-container transition-all cursor-pointer ${
            visible ? 'outline outline-2 outline-offset-2 outline-error' : 'border-outline'
          }`}
        />
        <label
          className={`font-body-md text-sm cursor-pointer select-none ${visible ? 'text-error' : 'text-on-surface-variant'}`}
          htmlFor="age-attestation"
        >
          {AGE_ATTESTATION_TEXTE}
        </label>
      </div>
      {visible && (
        <p id="age-attestation-erreur" role="alert" className="text-[12px] text-error mt-2 ml-7">
          {AGE_ATTESTATION_ERREUR}
        </p>
      )}
    </div>
  );
}
