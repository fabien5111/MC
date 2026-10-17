'use client';

// Bouton « Créer » du carnet : un seul point d'entrée pour les trois façons
// d'ajouter une recette — la saisir, l'importer, composer un projet.
//
// Deux présentations pour un même contenu : menu déroulant à partir de 768 px,
// feuille remontante en dessous (cibles plus grandes au doigt, même motif que
// le tiroir Compte). Les deux boutons sont rendus ; `md:hidden` /
// `hidden md:block` départagent, et `BottomSheet` se referme seule au passage
// du seuil.
//
// « Créer un projet » : JEP-130, l'entrée reste visible mais grisée sans le
// droit `mode_projet` (`LockedAction` dit pourquoi avant le clic). Le lien
// `/projets/nouveau` n'écrit rien (JEP-254) : le projet n'est créé qu'au
// passage à l'étape 2, un `<Link>` est donc sans danger. La route garde sa
// propre garde (`verifierAcces`) : l'interface n'est jamais la garantie.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BottomSheet } from '@/components/BottomSheet';
import { LockedAction } from '@/components/LockedAction';

const ENTREES = [
  { href: '/creer', icon: 'edit_note', titre: 'Créer une recette', aide: 'Saisir une recette à la main' },
  { href: '/importer', icon: 'upload_file', titre: 'Importer une recette', aide: 'Texte, photos ou PDF lus par l’IA' },
  {
    href: '/projets/nouveau',
    icon: 'account_tree',
    titre: 'Créer un projet',
    aide: 'Assembler un dessert à partir de recettes de base',
    projet: true,
  },
] as const;

const BTN =
  'flex items-center gap-1.5 rounded-pill bg-primary px-4 py-2.5 text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95';

function Entrees({
  peutProjet,
  onNavigate,
  grand,
}: {
  peutProjet: boolean;
  onNavigate: () => void;
  grand: boolean;
}) {
  const ligne = grand ? 'min-h-16 px-5 py-3' : 'px-4 py-3';
  return (
    <>
      {ENTREES.map((e) => {
        const contenu = (
          <>
            <span className="material-symbols-outlined text-[22px] text-primary" aria-hidden>
              {e.icon}
            </span>
            <span className="flex flex-col text-left">
              <span className="text-[14px] font-semibold text-primary">{e.titre}</span>
              <span className="text-[12px] font-normal text-on-surface-variant">{e.aide}</span>
            </span>
          </>
        );
        if ('projet' in e && !peutProjet) {
          return (
            <div key={e.href} role="none" className={`flex items-center gap-3 ${ligne}`}>
              <LockedAction label={e.titre} message="Le mode projet n'est pas inclus dans votre formule.">
                <span className="flex flex-col text-left">
                  <span className="text-[14px] font-semibold">{e.titre}</span>
                  <span className="text-[12px] font-normal">{e.aide}</span>
                </span>
              </LockedAction>
            </div>
          );
        }
        return (
          <Link
            key={e.href}
            href={e.href}
            prefetch={false}
            role={grand ? undefined : 'menuitem'}
            onClick={onNavigate}
            className={`flex items-center gap-3 transition-colors hover:bg-surface-container focus:bg-surface-container focus:outline-none ${ligne}`}
          >
            {contenu}
          </Link>
        );
      })}
    </>
  );
}

export function CreateMenuButton({ peutProjet = true }: { peutProjet?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [feuille, setFeuille] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fermer = useCallback((rendreFocus = true) => {
    setMenu(false);
    if (rendreFocus) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onPointer = (e: PointerEvent) => {
      // Clic extérieur : on ne reprend pas le focus à qui désigne autre chose.
      if (!wrapRef.current?.contains(e.target as Node)) fermer(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fermer();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      if (items.length === 0) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      items[(i + delta + items.length) % items.length]?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu, fermer]);

  return (
    <>
      {/* ≥ 768 px : menu déroulant. */}
      <div ref={wrapRef} className="relative hidden md:block">
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
          className={BTN}
        >
          <span className="material-symbols-outlined text-[18px]">add</span> Créer
          <span className="material-symbols-outlined text-[18px]">expand_more</span>
        </button>
        {menu && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Créer"
            className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-outline-variant bg-white py-1 shadow-lg"
          >
            <Entrees peutProjet={peutProjet} onNavigate={() => setMenu(false)} grand={false} />
          </div>
        )}
      </div>

      {/* < 768 px : bouton pleine largeur + feuille remontante. */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={feuille}
        aria-controls="feuille-creer"
        onClick={() => setFeuille(true)}
        className={`${BTN} w-full justify-center md:hidden`}
      >
        <span className="material-symbols-outlined text-[18px]">add</span> Créer
      </button>
      <BottomSheet
        id="feuille-creer"
        open={feuille}
        onClose={() => setFeuille(false)}
        breakpoint="md"
        label="Créer"
        sheetClassName="max-h-[80vh] overflow-y-auto"
      >
        <div className="pb-[env(safe-area-inset-bottom)]">
          <Entrees peutProjet={peutProjet} onNavigate={() => setFeuille(false)} grand />
          <button
            type="button"
            onClick={() => setFeuille(false)}
            className="mt-1 w-full border-t border-outline-variant px-5 py-4 text-[14px] font-semibold text-on-surface-variant"
          >
            Annuler
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
