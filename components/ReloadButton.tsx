'use client';

// Bouton « Réessayer » de `/hors-ligne`. Composant à part parce que la page
// elle-même doit rester un Server Component simple — c'est la seule page que
// le service worker précache (cf. son commentaire de tête) — sans y importer
// de logique client.
//
// `location.reload()` plutôt que `router.refresh()` : un rendu serveur
// (Server Component) ne peut de toute façon pas aboutir sans réseau, un
// rechargement complet est donc la seule chose qui ait un sens ici — et
// c'est aussi ce qui retente la requête que le service worker a fait échouer.
export function ReloadButton() {
  return (
    <button
      type="button"
      onClick={() => location.reload()}
      className="font-label-md border-2 border-primary text-primary px-8 py-3 rounded-pill text-[12.5px] uppercase tracking-[0.18em] hover:bg-primary hover:text-on-primary transition-all active:scale-95"
    >
      Réessayer
    </button>
  );
}
