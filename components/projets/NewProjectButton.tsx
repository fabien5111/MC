// Troisième mode de création, à côté de « Importer » et « Créer » (spec,
// critère d'acceptation 1).
//
// Un simple lien vers `/projets/nouveau` (JEP-254, point 1) : cliquer sur
// « Projet » n'écrit plus rien. Le projet n'est créé qu'au passage à l'étape
// 2 — ouvrir le mode projet puis renoncer ne laisse plus de projet vide dans
// le carnet. L'ancien bouton faisait l'écriture au clic, et évitait pour
// cette raison un `<Link>` (un préchargement au survol aurait créé des
// projets) ; la page d'arrivée n'écrivant rien, le lien est sans danger.
import Link from 'next/link';
import { LockedAction } from '@/components/LockedAction';

const BTN =
  'flex items-center gap-1.5 rounded-pill border border-outline-variant px-4 py-2.5 text-[13px] font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-40';

export function NewProjectButton({ peutProjet = true }: { peutProjet?: boolean }) {
  // JEP-130 : ce bouton était rendu SANS aucun contrôle de droit — le seul
  // droit binaire dans ce cas. Le refus n'arrivait qu'après le clic, dans une
  // boîte de dialogue, après un aller-retour vers /api/projet. Il reste à sa
  // place, grisé, et dit pourquoi avant le clic. La route garde évidemment sa
  // garde (`verifierAcces`) : l'interface n'est jamais la garantie.
  if (!peutProjet) {
    return (
      <LockedAction
        label="Créer un projet"
        message="Le mode projet n'est pas inclus dans votre formule."
        className="rounded-pill border border-outline-variant px-4 py-2.5 text-[13px] font-semibold"
      >
        Projet
      </LockedAction>
    );
  }

  return (
    <Link href="/projets/nouveau" className={BTN}>
      <span className="material-symbols-outlined text-[18px]">account_tree</span> Projet
    </Link>
  );
}
