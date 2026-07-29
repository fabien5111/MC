import { Spinner } from '@/components/Spinner';

// Overlay plein écran avec le spinner « Le Fouet », pour toute action
// asynchrone dont l'attente doit bloquer visuellement l'interface (écriture
// serveur suivie d'une navigation, traitement IA…). Cf. CLAUDE.md, section
// « Spinner ». Factorisé depuis NavigationSpinner pour être réutilisable par
// les actions déclenchées hors navigation par lien (router.push programmatique).
export function LoadingOverlay({
  visible,
  label,
  // Par défaut le libellé n'est qu'un nom accessible : l'overlay reste muet à
  // l'écran, comme partout dans l'application. `showLabel` l'affiche, pour les
  // attentes longues où l'utilisateur a besoin de savoir où en est le
  // traitement (lecture de plusieurs photos, par exemple).
  showLabel = false,
}: {
  visible: boolean;
  label?: string;
  showLabel?: boolean;
}) {
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background/40 backdrop-blur-[2px] transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {visible ? (
        <div className="flex flex-col items-center gap-4">
          <Spinner size={84} label={label} />
          {showLabel && label ? (
            // Déjà annoncé par le nom accessible du spinner : on ne le fait pas
            // lire deux fois.
            <p aria-hidden="true" className="text-body-md text-secondary text-center px-6">
              {label}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
