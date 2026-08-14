'use client';

import { useMemo } from 'react';
import { evaluatePassword } from '@/lib/password';
import { MaryseIcon } from '@/components/MaryseIcon';

// Couleur des maryses de la jauge de complexité, par nombre de critères
// satisfaits : 1 → noire, 2 → rouge, 3 → orange, 4 (tout ok) → verte.
// Toutes les maryses atteintes partagent la même couleur, comme les paliers
// d'un feu tricolore plutôt qu'un dégradé continu.
const STRENGTH_ICON_COLOR = ['text-outline-variant', 'text-black', 'text-error', 'text-orange-600', 'text-green-600'];

// Jauge de complexité du mot de passe (une maryse par critère satisfait),
// partagée entre l'inscription (`LoginForm`) et la réinitialisation
// (`ResetPasswordForm`) — mêmes règles (`lib/password.ts`), même rendu.
export function PasswordStrengthGauge({ password }: { password: string }) {
  const strength = useMemo(() => evaluatePassword(password), [password]);

  return (
    <div className="pt-3 space-y-2">
      <div className="flex items-center gap-3">
        <div
          className="flex gap-2"
          role="progressbar"
          aria-label="Complexité du mot de passe"
          aria-valuemin={0}
          aria-valuemax={strength.total}
          aria-valuenow={strength.score}
          aria-valuetext={strength.label}
        >
          {strength.criteria.map((critere, i) => (
            <MaryseIcon
              key={critere.id}
              size={20}
              className={`transition-colors duration-300 ${
                i < strength.score ? STRENGTH_ICON_COLOR[strength.score] : 'text-outline-variant/40'
              }`}
            />
          ))}
        </div>
        <span className="font-label-md text-[12px] text-secondary">{password.length > 0 ? strength.label : ''}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {strength.criteria.map((critere) => (
          <li
            key={critere.id}
            className={`flex items-center gap-1 text-[12px] ${
              critere.ok ? 'text-primary' : 'text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] leading-none">
              {critere.ok ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            {critere.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
