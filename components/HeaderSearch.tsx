'use client';
// Loupe de recherche du bandeau haut (Client Component). Fermée, la loupe
// révèle un champ ; la saisie validée (Entrée ou clic loupe) redirige vers la
// page de résultats `/recherche?q=…`.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function HeaderSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit() {
    const q = value.trim();
    if (!q) {
      setOpen(true);
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
      className="flex items-center"
      role="search"
    >
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!value.trim()) setOpen(false);
        }}
        placeholder="Recette, ingrédient, auteur…"
        aria-label="Rechercher"
        className={`bg-surface-container rounded-full text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-300 ${
          open ? 'w-40 md:w-64 opacity-100 px-4 py-2 ml-1' : 'w-0 opacity-0 p-0 pointer-events-none'
        }`}
      />
      <button
        type="button"
        onClick={() => (open ? submit() : setOpen(true))}
        className="material-symbols-outlined text-primary hover:opacity-70 transition-opacity p-1"
        aria-label="Rechercher"
      >
        search
      </button>
    </form>
  );
}
