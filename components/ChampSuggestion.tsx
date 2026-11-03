'use client';

// Champ texte avec suggestions — remplace `<input list>` + `<datalist>`.
//
// Le `<datalist>` natif ne propose rien sur iPadOS (pas de barre de suggestions
// au-dessus du clavier) et ignore les accents. Ici la liste est dessinée par le
// site : insensible à la casse et aux accents (`filtrerSuggestions`), choisie
// d'un tap, sans dépendre du navigateur.
//
// Remplacement à l'identique d'un `<input>` : mêmes props, même `onChange`
// (événement natif de saisie). Choisir une suggestion écrit la valeur par le
// setter natif puis émet un événement `input` — le `onChange` du parent (qui
// corrige la ligature, pré-remplit l'allergène…) est donc appelé exactement
// comme pour une frappe.
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { filtrerSuggestions } from '@/lib/suggestions';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'list' | 'value'> & {
  value: string;
  // Noms proposés (référentiel). Liste vide : le champ se comporte comme un
  // `<input>` ordinaire.
  options: readonly string[];
};

type Position = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

export const ChampSuggestion = forwardRef<HTMLInputElement, Props>(function ChampSuggestion(
  { value, options, onChange, onFocus, onBlur, onKeyDown, ...reste },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const idListe = useId();
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const [pos, setPos] = useState<Position | null>(null);
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);

  const suggestions = useMemo(() => (ouvert ? filtrerSuggestions(options, value) : []), [ouvert, options, value]);
  const visible = ouvert && suggestions.length > 0;

  // La liste est portée dans <body> en position fixe : une zone repliable ou
  // défilante autour du champ la rognerait. Elle se place sous le champ, ou au-
  // dessus quand le clavier (visualViewport) ne laisse pas la place dessous.
  const placer = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const haut = vv?.offsetTop ?? 0;
    const bas = haut + (vv?.height ?? window.innerHeight);
    const dessous = bas - r.bottom - 8;
    const dessus = r.top - haut - 8;
    const largeur = Math.max(r.width, 220);
    const left = Math.min(Math.max(r.left, 8), Math.max(8, (vv?.width ?? window.innerWidth) - largeur - 8));
    if (dessous >= 180 || dessous >= dessus) {
      setPos({ left, width: largeur, top: r.bottom + 2, maxHeight: Math.max(120, Math.min(dessous, 320)) });
    } else {
      setPos({ left, width: largeur, bottom: (window.innerHeight - r.top) + 2, maxHeight: Math.max(120, Math.min(dessus, 320)) });
    }
  }, []);

  useLayoutEffect(() => {
    if (visible) placer();
  }, [visible, value, placer]);

  useEffect(() => {
    if (!visible) return;
    const rafraichir = () => placer();
    window.addEventListener('scroll', rafraichir, true);
    window.addEventListener('resize', rafraichir);
    window.visualViewport?.addEventListener('resize', rafraichir);
    window.visualViewport?.addEventListener('scroll', rafraichir);
    return () => {
      window.removeEventListener('scroll', rafraichir, true);
      window.removeEventListener('resize', rafraichir);
      window.visualViewport?.removeEventListener('resize', rafraichir);
      window.visualViewport?.removeEventListener('scroll', rafraichir);
    };
  }, [visible, placer]);

  // Un tap hors du champ et hors de la liste ferme la liste.
  useEffect(() => {
    if (!ouvert) return;
    const ferme = (e: PointerEvent) => {
      const cible = e.target as Node;
      if (inputRef.current?.contains(cible)) return;
      if ((cible as HTMLElement).closest?.(`[data-champ-suggestion="${idListe}"]`)) return;
      setOuvert(false);
    };
    document.addEventListener('pointerdown', ferme);
    return () => document.removeEventListener('pointerdown', ferme);
  }, [ouvert, idListe]);

  function choisir(valeur: string) {
    const el = inputRef.current;
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, valeur);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setOuvert(false);
    setActif(-1);
    el.focus();
  }

  return (
    <>
      <input
        {...reste}
        ref={inputRef}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-controls={visible ? idListe : undefined}
        aria-autocomplete="list"
        onChange={(e) => {
          setOuvert(true);
          setActif(-1);
          onChange?.(e);
        }}
        onFocus={(e) => {
          setOuvert(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // Fermeture différée : un tap sur une suggestion doit être pris en
          // compte avant que la liste ne disparaisse.
          setTimeout(() => setOuvert(false), 150);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (visible) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActif((a) => (a + 1) % suggestions.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActif((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
              return;
            }
            if (e.key === 'Enter' && actif >= 0) {
              e.preventDefault();
              choisir(suggestions[actif]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setOuvert(false);
              return;
            }
          }
          onKeyDown?.(e);
        }}
      />
      {monte && visible && pos
        ? createPortal(
            <ul
              id={idListe}
              role="listbox"
              data-champ-suggestion={idListe}
              className="fixed z-[200] overflow-y-auto overscroll-contain rounded-lg border border-outline-variant bg-surface-container-lowest shadow-xl"
              style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            >
              {suggestions.map((s, i) => (
                <li key={s} role="option" aria-selected={i === actif}>
                  <button
                    type="button"
                    tabIndex={-1}
                    // Garde le focus dans le champ (le clavier reste ouvert).
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => choisir(s)}
                    className={`block w-full min-h-[44px] px-3 py-2 text-left font-body-md text-[16px] text-on-surface ${
                      i === actif ? 'bg-surface-container-high' : 'hover:bg-surface-container-low'
                    }`}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
});
