'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// Événement émis par le sommaire de la fiche recette (RecetteToc) pour ouvrir
// un bloc replié avant de défiler jusqu'à lui.
export const EVENEMENT_OUVRIR_SECTION = 'mc-ouvrir-section'

/**
 * Liste repliée par défaut sur ses `visibles` premiers éléments (fiche recette :
 * ustensiles, liste complète des ingrédients). Un « élément » est tout nœud
 * portant `data-repli-debut` : un ingrédient à plusieurs lignes n'est ainsi
 * jamais coupé en deux. Le contenu reste rendu côté serveur, seule la hauteur
 * visible change. À l'impression la liste est toujours complète.
 */
export default function RepliableListe({
  children,
  sectionId,
  visibles = 2,
}: {
  children: ReactNode
  // Ancre du bloc (`sec-…`) : le sommaire l'ouvre par cet identifiant.
  sectionId: string
  visibles?: number
}) {
  const [ouvert, setOuvert] = useState(false)
  // null = pas encore mesuré ; sinon hauteur (px) des `visibles` premiers
  // éléments, ou -1 s'il n'y a rien à replier.
  const [limite, setLimite] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const mesurer = useCallback(() => {
    const el = ref.current
    if (!el) return
    const debuts = el.querySelectorAll<HTMLElement>('[data-repli-debut]')
    if (debuts.length <= visibles) {
      setLimite(-1)
      return
    }
    const haut = el.getBoundingClientRect().top
    setLimite(Math.round(debuts[visibles].getBoundingClientRect().top - haut))
  }, [visibles])

  useLayoutEffect(() => {
    mesurer()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    // Retours à la ligne : la hauteur des éléments change avec la largeur.
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mesurer])

  // Le sommaire ouvre le bloc visé avant de défiler.
  useEffect(() => {
    const surOuvrir = (e: Event) => {
      if ((e as CustomEvent<string>).detail === sectionId) setOuvert(true)
    }
    window.addEventListener(EVENEMENT_OUVRIR_SECTION, surOuvrir)
    return () => window.removeEventListener(EVENEMENT_OUVRIR_SECTION, surOuvrir)
  }, [sectionId])

  const repliable = limite !== -1
  const replie = repliable && !ouvert
  // Avant la mesure : hauteur d'attente (évite d'afficher toute la liste le
  // temps de l'hydratation).
  const hauteur = limite === null ? '9rem' : `${limite}px`

  return (
    <div>
      <div className="relative">
        <div
          ref={ref}
          style={replie ? { maxHeight: hauteur } : undefined}
          className={replie ? 'overflow-hidden print:!max-h-none print:!overflow-visible' : undefined}
        >
          {children}
        </div>
        {replie && (
          <div
            aria-hidden="true"
            className="no-print pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent"
          />
        )}
      </div>
      {repliable && (
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-expanded={ouvert}
          className="no-print mt-1 inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:underline"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            {ouvert ? 'expand_less' : 'expand_more'}
          </span>
          {ouvert ? 'Réduire' : 'Tout voir'}
        </button>
      )}
    </div>
  )
}
