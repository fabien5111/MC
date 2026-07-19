'use client';

// Bouton « Partager » (absent de la logique JS vanilla — simple <button> sans
// handler dans recette.html). On lui donne un comportement minimal utile :
// API Web Share si disponible, sinon copie du lien dans le presse-papiers.
import { useState } from 'react';

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // annulation par l'utilisateur : rien à faire
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers indisponible : rien à faire
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="flex items-center gap-2 px-3 py-1 border border-secondary rounded-full text-label-md font-label-md hover:bg-secondary-container transition-colors"
    >
      <span className="material-symbols-outlined text-[18px]">share</span> {copied ? 'Lien copié !' : 'Partager'}
    </button>
  );
}
