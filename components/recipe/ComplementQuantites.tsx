'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * « Complément d'informations sur les quantités » de la fiche recette.
 * Replié par défaut sur 2 lignes ; le bouton n'apparaît que si le texte
 * dépasse réellement 2 lignes. À l'impression, le texte est toujours complet.
 */
export default function ComplementQuantites({ texte }: { texte: string }) {
  const [ouvert, setOuvert] = useState(false)
  const [depasse, setDepasse] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  // Mesure faite replié : si le contenu est plus haut que la zone visible,
  // il y a quelque chose à déplier. Refaite au redimensionnement (retour à la ligne).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const mesurer = () => {
      if (ouvert) return
      setDepasse(el.scrollHeight > el.clientHeight + 1)
    }
    mesurer()
    window.addEventListener('resize', mesurer)
    return () => window.removeEventListener('resize', mesurer)
  }, [texte, ouvert])

  return (
    <div className="pt-2 border-t border-outline-variant/40 text-left">
      <span className="print-fs-11 font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px] block mb-1">
        Complément d&apos;informations sur les quantités
      </span>
      <p
        ref={ref}
        className={`print-fs-11 font-body-md text-body-md italic text-on-surface-variant whitespace-pre-line text-left text-justify print:line-clamp-none ${
          ouvert ? '' : 'line-clamp-2'
        }`}
      >
        {texte}
      </p>
      {(depasse || ouvert) && (
        <button
          type="button"
          onClick={() => setOuvert(v => !v)}
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
