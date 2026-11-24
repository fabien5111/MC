// « Points à vérifier » posés sur l'étape du projet (JEP-403) : rappel en
// lecture seule dans la fournée d'essai, hors du volet replié — c'est ce qu'on
// vient contrôler en cuisinant. Rien si la note est vide ou absente.
// Partagé par le déroulé (`StepCookCard`) et la vue « une étape à la fois ».
export function PointsAVerifierFournee({ texte }: { texte: string | null }) {
  if (!texte) return null;
  return (
    <div className="rounded-lg border border-amber-600/60 bg-amber-50 px-3 py-2">
      <p className="mb-1 flex items-center gap-1.5 font-label-md text-[12px] uppercase tracking-widest text-amber-800">
        <span className="material-symbols-outlined text-[18px]">flag</span>
        Points à vérifier
      </p>
      <div className="font-body-md text-[15px] whitespace-pre-line">{texte}</div>
    </div>
  );
}
