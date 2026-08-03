// Filigrane discret signalant qu'une photo a été retravaillée par IA — même
// rendu partout où la photo est affichée (création/édition, relecture d'import,
// fiche recette). Le conteneur parent doit être `position: relative`.
export function AiPhotoBadge() {
  return (
    <span className="absolute left-2 bottom-1.5 z-10 flex items-center gap-1 text-[10px] font-medium text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)] pointer-events-none select-none">
      <span className="material-symbols-outlined text-[12px] leading-none">auto_awesome</span>
      Photo retravaillée avec l&apos;IA
    </span>
  );
}
