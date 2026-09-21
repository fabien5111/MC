// Utilitaires d'affichage, portés depuis db.js (formatTime, formatDate, stars).

export function formatTime(minutes: number | null | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// `timeZone` explicite, comme `formatDateHeure` ci-dessous et pour la même
// raison : sans elle, `toLocaleDateString` prend le fuseau du RUNTIME —
// celui du serveur (Virtuozzo, probablement UTC) au premier rendu, celui du
// visiteur à l'hydratation React. Une date proche de minuit heure de Paris
// pouvait donc afficher un jour différent selon qui la calculait, avec en
// prime un risque de désaccord serveur/client sur les appelants qui sont des
// Client Components (la plupart des 27 appelants de cette fonction).
// Repéré le 21/09 en testant les notifications d'abonnement (JEP-29) : sans
// rapport avec le défaut constaté ce jour-là, mais du même ordre.
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

// Date longue + heure (fiche recette, « Dernière modification » ; fin d'essai
// dans « Mon forfait », JEP-75) — même style que formatDate, sans la
// précision à la seconde de formatDateTime (orientée admin, pas utile à un
// visiteur).
//
// `timeZone` explicite : plusieurs appelants sont des Client Components
// (`ContactManager`, `ContactDetail`, `UsageCard`), donc rendus une première
// fois côté serveur (nœud Virtuozzo, sans fuseau positionné) puis
// réhydratés côté navigateur. Sans fuseau fixé, l'heure affichée dépend de
// qui la calcule et diffère entre les deux rendus — React abandonne
// l'hydratation (erreur #418), cassant l'interactivité de toute la page.
// Même piège, même correctif que `formatArticleDate` (lib/blog.ts).
export function formatDateHeure(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

// Horodatage court (§9, panneau admin) — précision à la seconde, contrairement
// à formatDate (date longue, orientée lecture par l'auteur).
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function stars(avg: number | null | undefined): string {
  const n = Math.round(avg || 0);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
