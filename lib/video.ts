// Détection de lien vidéo intégrable (YouTube / Vimeo) pour le lecteur affiché
// dans les étapes de recette. Fonction pure, pas d'accès réseau : l'URL est
// simplement reconnue puis transformée en URL d'intégration (iframe). Un lien
// non reconnu (autre plateforme, format inattendu) reste un simple lien
// cliquable côté affichage.
export type EmbeddableVideo = { provider: 'youtube' | 'vimeo'; embedUrl: string };

export function parseVideoUrl(raw: string): EmbeddableVideo | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return id ? { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = u.pathname === '/watch' ? u.searchParams.get('v') : (u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null);
    return id ? { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === 'vimeo.com') {
    const id = u.pathname.match(/^\/(\d+)/)?.[1];
    return id ? { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (host === 'player.vimeo.com') {
    const id = u.pathname.match(/^\/video\/(\d+)/)?.[1];
    return id ? { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }
  return null;
}
