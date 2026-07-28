'use client';

// Liste ordonnée des photos d'un import : vignette, nom du fichier, poids, et
// deux façons de réordonner.
//
// Le glisser-déposer HTML5 ne fonctionne pas au toucher, or photographier une
// recette est d'abord un usage mobile : les flèches ne sont donc pas un
// agrément mais la seule commande utilisable sur téléphone. Le glisser-déposer
// vient en plus, pour l'ordinateur.
//
// L'ordre compte : c'est l'ordre de lecture de la recette, et le numéro de
// chaque photo est ce qui permet à l'IA de rattacher une étape à sa page.

export type PhotoChoisie = {
  id: string;
  nom: string;
  /** data-URL compressée : sert de vignette ici et de charge utile à l'envoi. */
  url: string;
  octets: number;
};

const poidsLisible = (octets: number): string =>
  octets < 1024 * 1024
    ? `${Math.max(1, Math.round(octets / 1024))} Ko`
    : `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;

export function PhotoOrderList({
  photos,
  onDeplacer,
  onSupprimer,
  disabled = false,
}: {
  photos: PhotoChoisie[];
  onDeplacer: (de: number, vers: number) => void;
  onSupprimer: (id: string) => void;
  disabled?: boolean;
}) {
  if (!photos.length) return null;

  // `overflow-hidden` : si la police d'icônes n'est pas encore chargée, le picto
  // s'affiche en toutes lettres et déborde du bouton, recouvrant le bouton
  // voisin et interceptant ses clics.
  const boutonCls =
    'shrink-0 w-8 h-8 overflow-hidden rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant';

  return (
    <ul className="mt-1 flex flex-col gap-2">
      {photos.map((p, i) => (
        <li
          key={p.id}
          draggable={!disabled}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', String(i));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const de = Number(e.dataTransfer.getData('text/plain'));
            if (Number.isInteger(de)) onDeplacer(de, i);
          }}
          className="flex items-center gap-3 border border-outline-variant rounded-xl p-2 pr-3 bg-surface-container-lowest"
        >
          {/* Poignée : c'est elle qui annonce que la ligne se déplace au
              glisser-déposer, le numéro seul ne le laissait pas deviner. */}
          <span
            aria-hidden="true"
            title="Glissez pour réordonner"
            className={`shrink-0 w-5 h-5 overflow-hidden flex items-center justify-center text-on-surface-variant/60 ${
              disabled ? 'opacity-40' : 'cursor-grab active:cursor-grabbing'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">drag_indicator</span>
          </span>
          <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-on-primary font-label-md text-[12px] flex items-center justify-center">
            {i + 1}
          </span>

          {/* La vignette est carrée et recadrée : trop petite pour relire une
              page. Au survol, l'image entière s'affiche en grand, sans rogner
              (`object-contain`) — c'est là qu'on vérifie qu'on a bien
              photographié la bonne page, et dans le bon ordre. */}
          <span className="relative shrink-0 group">
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URL */}
            <img
              src={p.url}
              alt=""
              className="w-14 h-14 rounded-lg object-cover border border-outline-variant pointer-events-none transition-transform group-hover:scale-105"
            />
            {/* `pointer-events-none` : l'aperçu ne doit intercepter ni le
                glisser-déposer ni le survol qui l'a fait apparaître. Masqué sur
                mobile, où il n'y a pas de survol. */}
            <span className="hidden sm:group-hover:block absolute left-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2 z-20 p-1 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg pointer-events-none">
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL */}
              <img
                src={p.url}
                alt=""
                className="block max-w-[min(340px,50vw)] max-h-[60vh] w-auto h-auto rounded-lg object-contain"
              />
            </span>
          </span>
          <span className="font-body-md flex-1 min-w-0 truncate" title={p.nom}>
            {p.nom}
          </span>
          <span className="text-sm text-on-surface-variant whitespace-nowrap hidden sm:inline">
            {poidsLisible(p.octets)}
          </span>
          <button
            type="button"
            onClick={() => onDeplacer(i, i - 1)}
            disabled={disabled || i === 0}
            title="Monter"
            aria-label={`Monter ${p.nom}`}
            className={boutonCls}
          >
            <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
          </button>
          <button
            type="button"
            onClick={() => onDeplacer(i, i + 1)}
            disabled={disabled || i === photos.length - 1}
            title="Descendre"
            aria-label={`Descendre ${p.nom}`}
            className={boutonCls}
          >
            <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
          </button>
          <button
            type="button"
            onClick={() => onSupprimer(p.id)}
            disabled={disabled}
            title="Retirer cette photo"
            aria-label={`Retirer ${p.nom}`}
            className="shrink-0 w-8 h-8 overflow-hidden rounded-full text-error flex items-center justify-center hover:bg-error hover:text-on-error transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
