import { Spinner } from '@/components/Spinner';

// Écran de chargement global (App Router) : Next l'affiche automatiquement
// pendant le rendu serveur de chaque page. Un seul fouet, plein écran.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner fullscreen />
    </div>
  );
}
