'use client';

// Bouton « Coller » (JEP-408) : dépose l'image que le membre vient de copier
// (clic droit → Copier l'image, capture d'écran…). Ctrl+V fait déjà la même
// chose, mais ne se devine pas : ce bouton le rend visible. **Ouvert à tous
// les plans** — ce n'est pas un stockage en ligne.
//
// Visibilité : voir `lib/presse-papiers-client.ts`. Il n'apparaît que si une
// image est copiée, ou si le navigateur n'a pas encore autorisé la lecture
// (un premier clic déclenche alors sa demande).
import { useDialog } from '@/components/Dialog';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import {
  boutonCollerVisible,
  lireImagesCopiees,
  rafraichirPressePapiers,
  useEtatPressePapiers,
} from '@/lib/presse-papiers-client';

const LIBELLE = "Coller l'image copiée (Ctrl+V)";

export function BoutonColler({
  onFichiers,
  variante = 'bouton',
  className = '',
  disabled = false,
}: {
  onFichiers: (fichiers: File[]) => void;
  /** `pastille` : petit rond superposé à un emplacement de photo ; `bouton` : bouton secondaire. */
  variante?: 'pastille' | 'bouton';
  className?: string;
  disabled?: boolean;
}) {
  const etat = useEtatPressePapiers();
  const dialog = useDialog();
  const peutEcrire = useWriteGuard();
  if (!boutonCollerVisible(etat)) return null;

  async function coller() {
    if (!peutEcrire('Coller une image')) return;
    try {
      const fichiers = await lireImagesCopiees();
      if (!fichiers.length) {
        await dialog.alert(
          "Aucune image n'est copiée. Copiez une image (clic droit sur l'image → Copier l'image, ou une capture d'écran), puis cliquez de nouveau sur Coller.",
        );
        return;
      }
      onFichiers(fichiers);
    } catch (e) {
      void rafraichirPressePapiers(true);
      const refusee = (e as DOMException)?.name === 'NotAllowedError';
      await dialog.alert(
        refusee
          ? "Le navigateur n'a pas autorisé la lecture du presse-papiers. Autorisez-la dans la barre d'adresse (icône à gauche de l'adresse), ou utilisez Ctrl+V."
          : "Le presse-papiers n'a pas pu être lu. Utilisez Ctrl+V pour coller l'image.",
      );
    }
  }

  const classes =
    variante === 'pastille'
      ? `w-8 h-8 rounded-full bg-surface/90 text-on-surface flex items-center justify-center shadow-md hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-60 ${className}`
      : `inline-flex items-center gap-2 border border-primary text-primary rounded-full px-5 py-2 font-label-md text-label-md hover:bg-primary/5 transition-colors disabled:opacity-60 ${className}`;

  return (
    <button
      type="button"
      disabled={disabled}
      title={LIBELLE}
      aria-label={LIBELLE}
      className={classes}
      onClick={(e) => {
        // Posé sur un emplacement de photo : ne pas ouvrir le sélecteur de fichiers.
        e.stopPropagation();
        void coller();
      }}
    >
      <span className="material-symbols-outlined text-[18px]" aria-hidden>
        content_paste
      </span>
      {variante === 'bouton' ? 'Coller' : null}
    </button>
  );
}
