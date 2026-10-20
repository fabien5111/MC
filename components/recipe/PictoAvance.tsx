// Picto « étape préparable à l'avance » (JEP-19) à côté du titre d'une étape
// dans un planning de préparation. Rendu pur ; la précision de l'auteur, si
// elle existe, complète l'infobulle.
export function PictoAvance({ note }: { note?: string | null }) {
  const titre = note ? `Peut être préparée à l'avance — ${note}` : "Cette étape peut être préparée à l'avance";
  return (
    <span
      className="material-symbols-outlined ml-1 align-middle text-[16px] leading-none text-primary"
      title={titre}
      aria-label={titre}
      role="img"
    >
      event_upcoming
    </span>
  );
}
