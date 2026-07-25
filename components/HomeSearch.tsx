'use client';
// Barre de recherche centrale de l'accueil (Client Component). La validation
// redirige vers `/recherche?q=…` ; l'indicateur de chargement (fouet) est géré
// globalement par NavigationSpinner (app/layout.tsx), qui détecte la
// soumission de ce formulaire `role="search"`.
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export function HomeSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const q = value.trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    router.push(`/recherche?q=${encodeURIComponent(q)}`);
  }

  return (
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
  );
}
