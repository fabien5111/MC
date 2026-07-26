import { Spinner } from '@/components/Spinner';

// Overlay plein écran avec le spinner « Le Fouet », pour toute action
// asynchrone dont l'attente doit bloquer visuellement l'interface (écriture
// serveur suivie d'une navigation, traitement IA…). Cf. CLAUDE.md, section
// « Spinner ». Factorisé depuis NavigationSpinner pour être réutilisable par
// les actions déclenchées hors navigation par lien (router.push programmatique).
export function LoadingOverlay({ visible, label }: { visible: boolean; label?: string }) {
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background/40 backdrop-blur-[2px] transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {visible ? <Spinner size={84} label={label} /> : null}
    </div>
  );
}
