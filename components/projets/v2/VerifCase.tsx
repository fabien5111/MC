'use client';

// Case de vérification d'une préparation (« étapes relues », « quantités
// vérifiées »), posée au bas du contenu qu'elle valide. Même point que dans le
// panneau « Reste à faire » : c'est la même empreinte (cf. `projectTodo`),
// cocher ici ou là revient au même. Rendu pur, l'écriture est faite par le
// parent. Rien n'est affiché si le point n'existe pas (préparation non
// résolue, migration pas jouée).
import type { TodoItem } from '@/lib/projects';

const ICONE: Record<TodoItem['etat'], { icon: string; cls: string }> = {
  fait: { icon: 'check_circle', cls: 'text-green-700' },
  afaire: { icon: 'radio_button_unchecked', cls: 'text-outline' },
  arefaire: { icon: 'history', cls: 'text-error' },
};

export function VerifCase({
  item,
  onToggle,
  busy,
}: {
  item: TodoItem | undefined;
  onToggle: (it: TodoItem) => void;
  busy: boolean;
}) {
  if (!item?.verif) return null;
  const ic = ICONE[item.etat];
  return (
    <button
      type="button"
      onClick={() => onToggle(item)}
      disabled={busy || item.bloque}
      title={item.bloque ? 'Recalculez d’abord les quantités' : item.etat === 'fait' ? 'Décocher' : 'Cocher quand c’est vérifié'}
      className="mt-4 flex items-center gap-2 text-left text-[14px] text-on-surface disabled:opacity-60"
    >
      <span className={`material-symbols-outlined text-[22px] ${ic.cls}`}>{ic.icon}</span>
      {item.libelle}
    </button>
  );
}
