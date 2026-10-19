'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { DUREE_NUIT_MIN, depuisMinutes, uniteParDefaut, versMinutes, type UniteDuree } from '@/lib/duree';

// Champ de durée en minutes OU en heures (JEP-20) : un nombre et un sélecteur
// « min / h ». Le parent ne voit que des MINUTES (texte, '' si vide) — ses
// états et ses conversions à l'enregistrement restent inchangés.
//
// Changer d'unité garde le nombre tapé (« 12 » saisi en minutes puis passé en
// heures = 12 h) : c'est l'erreur qu'on corrige en touchant l'unité. Une durée
// déjà enregistrée s'ouvre dans son unité naturelle (720 → 12 h,
// `uniteParDefaut`). Le raccourci « Une nuit » pose 12 h.
export function DureeInput({
  value,
  onChange,
  inputClassName,
  inputStyle,
  placeholderMinutes,
  nuit = true,
  ariaLabel,
  pleineLargeur = false,
}: {
  value: string;
  onChange: (minutes: string) => void;
  inputClassName?: string;
  inputStyle?: CSSProperties;
  // Valeur suggérée (somme des étapes…), présentée dans l'unité courante.
  placeholderMinutes?: number;
  nuit?: boolean;
  ariaLabel?: string;
  // Occupe toute la largeur de sa cellule (grille de l'éditeur des temps du
  // mode projet) au lieu de se caler sur la largeur du champ.
  pleineLargeur?: boolean;
}) {
  const minutesExt = lireMinutes(value);
  const [unite, setUnite] = useState<UniteDuree>(() => uniteParDefaut(minutesExt));
  const [texte, setTexte] = useState(() => depuisMinutes(minutesExt, uniteParDefaut(minutesExt)));

  // Valeur changée d'ailleurs (réinitialisation, « revenir à la somme »…) :
  // on la réaffiche dans son unité naturelle. L'écho de notre propre saisie
  // tombe juste et ne touche à rien — sinon « 1, » deviendrait « 1 » sous les
  // doigts.
  useEffect(() => {
    if (versMinutes(texte, unite) === minutesExt) return;
    const u = uniteParDefaut(minutesExt);
    setUnite(u);
    setTexte(depuisMinutes(minutesExt, u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutesExt]);

  const emettre = (t: string, u: UniteDuree) => {
    const m = versMinutes(t, u);
    onChange(m == null ? '' : String(m));
  };

  return (
    <span className={pleineLargeur ? 'flex w-full flex-col items-start gap-0.5' : 'inline-flex flex-col items-start gap-0.5'}>
      <span className={pleineLargeur ? 'flex w-full items-baseline gap-1' : 'inline-flex items-baseline gap-1'}>
        <input
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            emettre(e.target.value, unite);
          }}
          className={inputClassName}
          style={inputStyle}
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          aria-label={ariaLabel}
          placeholder={placeholderMinutes ? depuisMinutes(placeholderMinutes, unite) : undefined}
        />
        <select
          value={unite}
          onChange={(e) => {
            const u = e.target.value as UniteDuree;
            setUnite(u);
            emettre(texte, u);
          }}
          aria-label="Unité de durée"
          className="bg-transparent text-sm text-on-surface-variant border-0 border-b border-outline-variant py-0 pl-0 pr-5 focus:ring-0 focus:border-primary cursor-pointer"
        >
          <option value="min">min</option>
          <option value="h">h</option>
        </select>
      </span>
      {nuit && (
        <button
          type="button"
          onClick={() => {
            setUnite('h');
            setTexte(depuisMinutes(DUREE_NUIT_MIN, 'h'));
            onChange(String(DUREE_NUIT_MIN));
          }}
          className="text-[11.5px] text-primary underline underline-offset-2 whitespace-nowrap"
        >
          Une nuit (12 h)
        </button>
      )}
    </span>
  );
}

function lireMinutes(v: string): number | null {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}
