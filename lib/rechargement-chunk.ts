// Un fichier JavaScript du site qui n'arrive pas (502 passager, réseau
// mobile coupé, déploiement en cours) laisse l'écran d'erreur par défaut de
// Next, sans issue. On recharge UNE fois : la plupart du temps, le second
// essai passe. Garde en `sessionStorage` pour ne jamais boucler.
const CLE = 'jp-rechargement-chunk';

export function estErreurDeChunk(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  const texte = `${e?.name ?? ''} ${e?.message ?? ''}`;
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Loading CSS chunk/i.test(texte);
}

/** Recharge la page une fois si l'erreur vient d'un fichier non chargé. */
export function rechargerSiChunk(error: unknown): boolean {
  if (!estErreurDeChunk(error)) return false;
  try {
    if (window.sessionStorage.getItem(CLE)) return false;
    window.sessionStorage.setItem(CLE, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
