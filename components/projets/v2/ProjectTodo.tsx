'use client';

// « Reste à faire » du projet (v2) : une jauge, le prochain geste, puis la
// liste des points regroupés par préparation. Les points constatés par la base
// se cochent d'eux-mêmes ; ceux que seul le membre peut confirmer (étapes
// relues, quantités vérifiées) sont des cases, valables tant que le contenu
// vérifié n'a pas changé (cf. `projectTodo`, `lib/projects.ts`). Rendu pur :
// l'écriture est faite par le parent.
import type { TodoItem } from '@/lib/projects';

// Défile jusqu'à l'ancre ; un volet replié qui la porte (« Ajustement des
// quantités ») est ouvert d'abord, sinon on arriverait sur un simple titre.
function allerA(ancre: string) {
  const el = document.getElementById(ancre);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const ICONE: Record<TodoItem['etat'], { icon: string; cls: string }> = {
  fait: { icon: 'check_circle', cls: 'text-green-700' },
  afaire: { icon: 'radio_button_unchecked', cls: 'text-outline' },
  arefaire: { icon: 'history', cls: 'text-error' },
};

export function ProjectTodo({
  items,
  onToggle,
  busy,
  id,
}: {
  id?: string;
  items: TodoItem[];
  onToggle: (it: TodoItem) => void;
  busy: boolean;
}) {
  const faits = items.filter((i) => i.etat === 'fait').length;
  const total = items.length;
  const pct = total ? Math.round((faits / total) * 100) : 0;
  const prochain = items.find((i) => i.etat !== 'fait');
  const groupes: { nom: string; items: TodoItem[] }[] = [];
  for (const it of items) {
    const g = groupes.find((x) => x.nom === it.groupe);
    if (g) g.items.push(it);
    else groupes.push({ nom: it.groupe, items: [it] });
  }

  return (
    <details id={id} open className="mb-6 scroll-mt-28 rounded-xl border border-dashed border-secondary/40 bg-surface-container-lowest p-4">
      <summary className="flex cursor-pointer flex-wrap items-center gap-3">
        <span className="font-label-md text-[13px] uppercase tracking-widest text-secondary">Reste à faire</span>
        <span className="font-label-md text-[12px] text-on-surface-variant">
          {faits} / {total}
          {faits === total && total > 0 ? ' · tout est fait' : ''}
        </span>
        <span className="h-2 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-surface-container-high" aria-hidden="true">
          <span className="block h-full rounded-full bg-green-700 transition-all" style={{ width: `${pct}%` }} />
        </span>
      </summary>

      {prochain && (
        <p className="mt-3 text-[13.5px] text-on-surface">
          Prochain geste :{' '}
          <button type="button" onClick={() => allerA(prochain.ancre)} className="text-primary underline underline-offset-2">
            {prochain.groupe === 'Le projet' ? prochain.libelle : `${prochain.groupe} — ${prochain.libelle}`}
          </button>
        </p>
      )}

      <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {groupes.map((g) => (
          <div key={g.nom}>
            <p className="mb-1 font-label-md text-[12px] uppercase tracking-widest text-outline">{g.nom}</p>
            <ul className="space-y-1">
              {g.items.map((it) => {
                const ic = ICONE[it.etat];
                return (
                  <li key={it.id} className="flex items-start gap-2 text-[13.5px]">
                    {it.verif ? (
                      <button
                        type="button"
                        onClick={() => onToggle(it)}
                        disabled={busy || it.bloque}
                        title={it.bloque ? 'Recalculez d’abord les quantités' : it.etat === 'fait' ? 'Décocher' : 'Cocher quand c’est vérifié'}
                        className={`material-symbols-outlined shrink-0 text-[20px] ${ic.cls} disabled:opacity-40`}
                      >
                        {ic.icon}
                      </button>
                    ) : (
                      <span className={`material-symbols-outlined shrink-0 text-[20px] ${ic.cls}`}>{ic.icon}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => allerA(it.ancre)}
                      className={`text-left ${it.etat === 'fait' ? 'text-on-surface-variant' : 'text-on-surface'}`}
                    >
                      {it.libelle}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-on-surface-variant">
        Les points « relues » et « vérifiées » se cochent à la main ; ils se décochent d’eux-mêmes si le contenu change
        ensuite.
      </p>
    </details>
  );
}
