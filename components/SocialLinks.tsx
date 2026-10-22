'use client';

// Réseaux sociaux de Je pâtisse ! dans l'en-tête (JEP-15).
//
// Deux présentations d'une même liste, choisies par CSS (le rendu serveur ne
// connaît pas la largeur de l'écran) :
//  - `SocialRondsHeader` — bureau et tablette (≥ 768 px) : ronds entre la
//    cloche et l'avatar (maquette 5a / 7a) ;
//  - `SocialBandeMobile` — mobile (< 768 px) : bande bordeaux au-dessus de
//    l'en-tête (7c), repliée au défilement vers le bas.
// Le parent ne les rend QUE si la liste n'est pas vide : ni groupe, ni filet,
// ni bande sans lien (`liensAffichables`).
//
// Glyphes monochromes `currentColor`, jamais les couleurs des marques. Les
// liens s'ouvrent dans un nouvel onglet ; le glyphe est `aria-hidden`, le
// nom accessible porté par `aria-label`.
import { useEffect } from 'react';
import { trackEvent } from '@/lib/analytics';
import { NOM_RESEAU, type ReseauSocial } from '@/lib/social-links';
import { TRACES_RESEAUX } from '@/lib/social-icons';

type Lien = { network: ReseauSocial; url: string };

function Glyphe({ reseau, taille }: { reseau: ReseauSocial; taille: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={taille}
      height={taille}
      fill="currentColor"
    >
      <path d={TRACES_RESEAUX[reseau]} />
    </svg>
  );
}

const attrsLien = (l: Lien) =>
  ({
    href: l.url,
    target: '_blank',
    rel: 'noopener noreferrer',
    'aria-label': `Je pâtisse ! sur ${NOM_RESEAU[l.network]}`,
  }) as const;

/** Ronds du bureau et de la tablette : visible dès 768 px. */
export function SocialRondsHeader({ liens }: { liens: Lien[] }) {
  return (
    // Filet séparateur (`#d6c2c3`) : 16 px avant le premier rond (12 px en
    // tablette), 6 px en plus avant l'avatar.
    <nav
      aria-label="Réseaux sociaux de Je pâtisse !"
      className="hidden md:block border-l border-[#d6c2c3] pl-3 lg:pl-4 mr-1.5"
    >
      <ul className="flex items-center gap-[5px] lg:gap-1.5">
        {liens.map((l) => (
          <li key={l.network}>
            <a
              {...attrsLien(l)}
              title={NOM_RESEAU[l.network]}
              onClick={() => trackEvent('social_click', { network: l.network, placement: 'header' })}
              className="flex h-7 w-7 lg:h-[30px] lg:w-[30px] items-center justify-center rounded-full border border-[#d6c2c3] bg-transparent text-[#300a12] transition-colors duration-150 hover:border-[#300a12] hover:bg-[#300a12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#300a12]"
            >
              <span className="lg:hidden flex">
                <Glyphe reseau={l.network} taille={12} />
              </span>
              <span className="hidden lg:flex">
                <Glyphe reseau={l.network} taille={13} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Défilement vers le bas au-delà de ce seuil : la bande se replie.
const SEUIL_REPLI_PX = 24;

/**
 * Bande mobile. Elle vit dans l'en-tête collant ; pour la replier, l'en-tête
 * remonte de sa hauteur (`top` négatif, cf. `.site-header` dans globals.css)
 * au lieu de translater la bande seule, qui laisserait un vide. Le repli est
 * piloté par l'attribut `data-bande` de <html> ; `prefers-reduced-motion`
 * retire la transition (apparition / disparition instantanée).
 */
export function SocialBandeMobile({ liens }: { liens: Lien[] }) {
  useEffect(() => {
    const racine = document.documentElement;
    let dernier = window.scrollY;
    let attente = false;
    const regler = () => {
      attente = false;
      const y = Math.max(window.scrollY, 0);
      if (y <= SEUIL_REPLI_PX) racine.dataset.bande = 'visible';
      else if (y > dernier) racine.dataset.bande = 'repliee';
      else if (y < dernier) racine.dataset.bande = 'visible';
      dernier = y;
    };
    const surDefilement = () => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(regler);
    };
    racine.dataset.bande = 'visible';
    window.addEventListener('scroll', surDefilement, { passive: true });
    return () => {
      window.removeEventListener('scroll', surDefilement);
      delete racine.dataset.bande;
    };
  }, []);

  return (
    <div
      className="md:hidden flex items-center justify-between bg-[#300a12] px-margin-mobile"
      style={{ minHeight: 'calc(32px + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#f5e4e4]">Suivre</span>
      <nav aria-label="Réseaux sociaux de Je pâtisse !">
        <ul className="flex items-center gap-4">
          {liens.map((l) => (
            <li key={l.network}>
              <a
                {...attrsLien(l)}
                onClick={() => trackEvent('social_click', { network: l.network, placement: 'mobile_strip' })}
                // Visuel de 15 px + 4 px de marge ; la zone cliquable est étendue
                // à ~44 px de haut par un pseudo-élément, sans agrandir le visuel.
                className="relative block p-1 text-[#fff8f7] after:absolute after:-inset-x-2 after:-inset-y-[11px] after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff8f7]"
              >
                <Glyphe reseau={l.network} taille={15} />
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
