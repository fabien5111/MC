'use client';

// Case d'attestation d'âge (JEP-34), partagée par le formulaire d'inscription
// (`LoginForm`) et l'écran `/choix-pseudo` (`PseudoChooser`) — un compte Google
// ne passe jamais par le premier, c'est sur le second qu'il atteste.
//
// Placée immédiatement au-dessus du bouton de validation, et traitée comme la
// case des CGU : tant qu'elle n'est pas cochée, le parent désactive son
// bouton (arbitrage produit — la spec prévoyait un message à la tentative, ce
// qu'un bouton désactivé rend sans objet). Le blocage qui fait foi reste
// côté serveur pour `/choix-pseudo`.
import { AGE_ATTESTATION_TEXTE } from '@/lib/attestation-age';

export function AgeAttestationCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id="age-attestation"
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 rounded-none accent-primary-container focus:ring-primary-container border-outline transition-all cursor-pointer"
      />
      <label className="font-body-md text-sm text-on-surface-variant cursor-pointer select-none" htmlFor="age-attestation">
        {AGE_ATTESTATION_TEXTE}
      </label>
    </div>
  );
}
