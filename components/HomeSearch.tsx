'use client';
// Barre de recherche centrale de l'accueil (Client Component). Même principe
// que HeaderSearch : la validation redirige vers `/recherche?q=…` via
// useTransition, et le fouet (Spinner) tourne au milieu de l'écran pendant le
// chargement des résultats.
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Spinner } from '@/components/Spinner';

export function HomeSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  function submit() {
    const q = value.trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    startTransition(() => {
      router.push(`/recherche?q=${encodeURIComponent(q)}`);
    });
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        role="search"
        className="w-full max-w-2xl relative"
      >
        <input
          ref={inputRef}
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full bg-white border-none rounded-full py-5 px-8 text-body-md focus:ring-2 focus:ring-primary luxury-shadow transition-all"
          placeholder="Rechercher une recette, un ingrédient, un auteur..."
          aria-label="Rechercher une recette, un ingrédient ou un auteur"
          type="search"
        />
        <button
          type="submit"
          aria-label="Rechercher"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-on-primary p-3 rounded-full hover:bg-opacity-90 transition-colors shadow-lg"
        >
          <span className="material-symbols-outlined leading-none">search</span>
        </button>
      </form>

      {mounted &&
        isPending &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/50 backdrop-blur-[2px]">
            <Spinner size={96} label="Recherche en cours…" />
          </div>,
          document.body,
        )}
    </>
  );
}
