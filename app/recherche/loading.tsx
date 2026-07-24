// État de chargement de la page de recherche (Suspense de segment).
// Affiché pendant que les résultats se chargent : le fouet « Le Fouet »
// tourne au milieu de la page.
import { Spinner } from '@/components/Spinner';

export default function Loading() {
  return (
    <div className="flex min-h-[80vh] w-full items-center justify-center">
      <Spinner size={96} label="Recherche en cours…" />
    </div>
  );
}
