// Lecteur vidéo d'une étape (lien externe YouTube / Vimeo saisi en édition).
// Rendu pur, pas d'accès Supabase — réutilisable en consultation comme en
// exécution guidée. À l'écran : lecteur intégré centré, taille d'une photo
// d'étape. À l'impression : uniquement le lien (le lecteur est en `no-print`),
// même pattern que l'auteur ou la source (cf. app/recette/[id]/page.tsx).
import { parseVideoUrl } from '@/lib/video';

export function StepVideoPlayer({ url }: { url: string }) {
  const video = parseVideoUrl(url);
  return (
    <div className="flex justify-center">
      <div className="no-print aspect-square w-full max-w-xs bg-surface-container-high border border-outline-variant overflow-hidden">
        {video ? (
          <iframe
            src={video.embedUrl}
            title="Vidéo de l'étape"
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-full flex flex-col items-center justify-center gap-2 text-primary underline underline-offset-2 hover:text-secondary"
          >
            <span className="material-symbols-outlined text-[32px]">play_circle</span>
            Voir la vidéo
          </a>
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden print:inline-flex items-center gap-2 text-primary"
      >
        <span className="material-symbols-outlined text-[18px]">play_circle</span>Vidéo : {url}
      </a>
    </div>
  );
}
