'use client';
// Loupe de recherche du bandeau haut (Client Component). Au clic, une zone de
// saisie glisse en dessous du menu (panneau pleine largeur). La saisie validée
// (Entrée ou bouton) redirige vers la page de résultats `/recherche?q=…` ; le
// fouet (Spinner « Le Fouet ») tourne pendant le chargement des résultats.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Spinner } from '@/components/Spinner';

export function HeaderSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus automatique du champ à l'ouverture du panneau.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Fermeture au clavier (Échap) quand le panneau est ouvert.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function submit() {
    const q = value.trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    // useTransition : `isPending` reste vrai jusqu'à ce que la page de
    // résultats soit chargée et rendue → le fouet tourne pendant la recherche.
    startTransition(() => {
      router.push(`/recherche?q=${encodeURIComponent(q)}`);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Rechercher"
        aria-expanded={open}
        className="material-symbols-outlined text-primary hover:opacity-70 transition-opacity p-1"
      >
        search
      </button>

      {/* Panneau de recherche : glisse sous le menu, sur toute la largeur.
          Ancré au <header> (sticky = bloc conteneur des enfants absolus). */}
      <div
        className={`absolute left-0 top-full w-full bg-surface/95 backdrop-blur-md border-b border-outline-variant/30 shadow-lg overflow-hidden transition-all duration-300 ease-out ${
          open ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
        }`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          role="search"
          className="max-w-[1200px] mx-auto flex items-center gap-3 px-margin-mobile md:px-margin-desktop py-4"
        >
          <span className="material-symbols-outlined text-on-surface-variant">search</span>
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Rechercher une recette, un ingrédient, un auteur…"
            aria-label="Rechercher"
            className="flex-1 bg-transparent text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 bg-primary text-on-primary px-5 py-2 rounded-full font-label-md text-label-md hover:shadow-lg transition-all active:scale-95"
          >
            Rechercher
          </button>
        </form>
      </div>

      {/* Fouet centré au milieu de l'écran pendant le chargement des résultats. */}
      {isPending && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/40 backdrop-blur-[2px]">
          <Spinner size={84} label="Recherche en cours" />
        </div>
      )}
    </>
  );
}
