// Téléchargement de l'archive d'export (JEP-362) côté navigateur — partagé par
// la fiche membre (admin) et `/reglages` (membre). La route rend le fichier
// lui-même : on le récupère en Blob puis on déclenche l'enregistrement par un
// lien temporaire, le nom venant de `Content-Disposition`.

export type ResultatTelechargement = { ok: true } | { ok: false; erreur: string };

export async function telechargerExport(url: string): Promise<ResultatTelechargement> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST' });
  } catch (e) {
    return { ok: false, erreur: 'Erreur réseau : ' + ((e as Error).message || 'export impossible') };
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, erreur: (data as { erreur?: string })?.erreur || 'Export impossible.' };
  }
  const blob = await res.blob();
  const nom = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'je-patisse-donnees.json';
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(blob);
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  // Laisser au navigateur le temps de lancer l'enregistrement avant de libérer l'objet.
  setTimeout(() => URL.revokeObjectURL(lien.href), 10_000);
  return { ok: true };
}
