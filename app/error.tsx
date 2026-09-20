'use client';

// Écran d'erreur de rendu (frontière d'erreur racine). Sans lui, une exception
// levée pendant le rendu d'une page servait l'écran par défaut de Next : un
// texte nu, sans en-tête ni le moindre lien — même cul-de-sac que le 404.
//
// Client Component obligatoire (contrat de Next : c'est lui qui porte le
// `reset`), donc sans accès à la session — d'où le chrome statique de
// `ErrorShell`, cf. son commentaire de tête.
import { useEffect } from 'react';
import { ErrorShell } from '@/components/ErrorShell';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // La trace part dans la console du navigateur ; côté serveur, Next l'a déjà
  // journalisée avec le même `digest`, ce qui permet de rapprocher les deux.
  useEffect(() => {
    console.error('Erreur de rendu :', error);
  }, [error]);

  return (
    <ErrorShell
      eyebrow="Erreur"
      title="Cette page n'a pas pu s'afficher"
      action={
        <button
          type="button"
          onClick={reset}
          className="font-label-md border-2 border-primary text-primary px-8 py-3 rounded-pill text-[12.5px] uppercase tracking-[0.18em] hover:bg-primary hover:text-on-primary transition-all active:scale-95"
        >
          Réessayer
        </button>
      }
    >
      <p>
        Quelque chose s&apos;est mal passé de notre côté. Rien de ce que vous aviez enregistré
        n&apos;est perdu — seul l&apos;affichage de cette page a échoué.
      </p>
      {/* `digest` est l'empreinte que Next pose sur l'erreur serveur et
          recopie dans ses journaux : c'est elle qui permet de retrouver
          l'incident exact à partir d'un signalement. Affichée telle quelle,
          elle ne révèle rien du message d'origine. */}
      {error.digest && (
        <p className="text-[12px] text-outline">
          Référence à nous communiquer : <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </ErrorShell>
  );
}
