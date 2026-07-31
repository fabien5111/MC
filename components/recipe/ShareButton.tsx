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
      aria-label={copied ? 'Lien copié' : 'Partager'}
      title={copied ? 'Lien copié' : 'Partager'}
      className="flex items-center justify-center w-7 h-7 border border-secondary rounded-full hover:bg-secondary-container transition-colors"
    >
      <span className="material-symbols-outlined text-[16px]">{copied ? 'check' : 'share'}</span>
    </button>
  );
}
