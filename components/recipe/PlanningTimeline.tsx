import { PictoAvance } from '@/components/recipe/PictoAvance';
import { dayLabel, planningDays } from '@/lib/recipe-view';

// « Planning de préparation » : une colonne par jour, un rond numéroté relié
// par un trait, l'étiquette du jour puis les titres d'étape en gras. Rendu pur,
// partagé par la fiche recette et le mode projet v2 — ne pas en recoder une
// seconde variante. `titre` et `note` sont facultatifs ; `className` pose le
// cadre (marges, bordures) propre à chaque écran.
type Jour = ReturnType<typeof planningDays>[number];

export function PlanningTimeline({
  days,
  id,
  className = '',
  sansTitre = false,
  note,
}: {
  days: Jour[];
  id?: string;
  className?: string;
  sansTitre?: boolean;
  note?: string;
}) {
  return (
    <div id={id} className={className}>
      {!sansTitre && (
        <h3 className="font-headline-md text-headline-md text-primary mb-8">Planning de préparation</h3>
      )}
      <div className="relative flex flex-col md:flex-row gap-8">
        <div className="hidden md:block absolute top-10 left-0 w-full h-[2px] bg-outline-variant" />
        {days.map((d, i) => (
          <div key={i} className="relative flex flex-col items-center text-center gap-4 z-10 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
              {i + 1}
            </div>
            <span className="font-label-md text-[12px] text-secondary">{dayLabel(d.offset)}</span>
            {d.items.map((it, k) => (
              <p key={k} className="font-body-md text-body-md font-semibold">
                {it.title || 'Sans titre'}
                {it.can_prepare_ahead && <PictoAvance note={it.advance_note} />}
              </p>
            ))}
          </div>
        ))}
      </div>
      {note && <p className="mt-4 text-center text-[12px] text-on-surface-variant">{note}</p>}
    </div>
  );
}
