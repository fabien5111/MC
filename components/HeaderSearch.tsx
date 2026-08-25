'use client';
// Loupe de recherche du bandeau haut (Client Component).
//
// Desktop (≥ 1024 px) : au clic, une zone de saisie glisse en dessous du menu
// (panneau pleine largeur), avec l'accès aux critères avancés et une ligne de
// suggestions. Ces suggestions sont contextuelles — ce sont les catégories
// promues par l'admin sur l'accueil (tags `show_on_home`), résolues côté
// serveur par `Header` : jamais une liste codée en dur dans ce composant.
//
// Mobile (< 1024 px) : le clic mène directement à l'écran `/recherche`, qui
// porte sa propre expérience mobile (champ en tête de page + tiroir de
// critères `BottomSheet`). Le panneau glissant n'y fonctionne pas : le focus
// automatique du champ ouvre le clavier virtuel, qui recouvre le lien
// « Critères avancés » et les suggestions empilés dessous (mise en page
// `flex-col` sous 640 px) — parfois le champ lui-même selon le défilement au
// moment du clic, l'en-tête n'étant sticky qu'à partir de 1024 px.
//
// L'indicateur de chargement (fouet) pendant la navigation est géré
// globalement par NavigationSpinner (app/layout.tsx), qui détecte la
// soumission de ce formulaire `role="search"` et les clics sur les liens.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export type SearchSuggestion = { label: string; slug: string };

export function HeaderSearch({
  initialQuery = '',
  suggestions = [],
}: {
  initialQuery?: string;
  suggestions?: SearchSuggestion[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Bascule à 1024 px (`lg`) : même seuil que la colonne/tiroir de
  // `/recherche` (cf. `SearchFiltersPanel`).
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Focus automatique du champ à l'ouverture du panneau.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Fermeture au clavier (Échap) et au clic en dehors du panneau. Sans le
  // clic extérieur, le panneau restait ouvert derrière le reste de la page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function submit() {
    const q = value.trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    router.push(`/recherche?q=${encodeURIComponent(q)}`);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (wide ? setOpen((o) => !o) : router.push('/recherche'))}
        aria-label="Rechercher"
        aria-expanded={wide ? open : undefined}
        className="material-symbols-outlined text-primary hover:opacity-70 transition-opacity p-1"
      >
        search
      </button>

      {/* Panneau de recherche : glisse sous le menu, sur toute la largeur.
          Ancré au <header> (sticky = bloc conteneur des enfants absolus).
          La hauteur dépliée tient compte de la ligne de suggestions. */}
      <div
        ref={panelRef}
        className={`absolute left-0 top-full w-full bg-surface/95 backdrop-blur-md border-b border-outline-variant/30 shadow-lg overflow-hidden transition-all duration-300 ease-out ${
          open ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              role="search"
              className="flex-1 flex items-center gap-3"
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

            {/* Le tiroir de critères s'ouvre d'emblée à l'arrivée (`panel=1`),
                sur mobile ; au-dessus de 1024 px la colonne est déjà là. */}
            <Link
              href={value.trim() ? `/recherche?q=${encodeURIComponent(value.trim())}&panel=1` : '/recherche?panel=1'}
              onClick={() => setOpen(false)}
              className="shrink-0 flex items-center justify-center gap-1.5 font-label-md text-[12px] uppercase tracking-wider text-primary border border-primary rounded-full px-4 py-2.5 hover:bg-primary hover:text-on-primary transition-all"
            >
              <span className="material-symbols-outlined text-[17px]">tune</span>
              Critères avancés
            </Link>
          </div>

          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="facet-h mr-1">Suggestions</span>
              {suggestions.map((s) => (
                <Link
                  key={s.slug}
                  href={`/recherche?cat=${encodeURIComponent(s.slug)}`}
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 rounded-full text-[12.5px] border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-secondary hover:text-primary transition-all"
                >
                  {s.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
