// Statut d'activation de l'aide d'un membre, page par page (JEP-373) — logique
// pure, sans accès base : la page Aide lit les masquages (`help_dismissals`) et
// en tire ce qu'elle affiche et les gestes qu'elle propose.
//
// Une page d'aide est :
//  - `inactive`  : « toute l'aide de cette page » a été masquée (kind = 'page') ;
//  - `partielle` : la page n'est pas masquée, mais au moins un de ses blocs ou
//                  une de ses vidéos l'est ;
//  - `active`    : rien n'est masqué.
export type StatutPage = 'active' | 'partielle' | 'inactive';
export type MasquageAide = { kind: string; target: string };
export type PageAide = { slug: string; keys: string[] };

export function statutsAide(pages: PageAide[], masquages: MasquageAide[]): Record<string, StatutPage> {
  const out: Record<string, StatutPage> = {};
  for (const page of pages) {
    if (masquages.some((m) => m.kind === 'page' && m.target === page.slug)) {
      out[page.slug] = 'inactive';
    } else if (masquages.some((m) => (m.kind === 'block' || m.kind === 'video') && page.keys.includes(m.target))) {
      out[page.slug] = 'partielle';
    } else {
      out[page.slug] = 'active';
    }
  }
  return out;
}

export type ResumeAide = {
  total: number;
  actives: number;
  partielles: number;
  inactives: number;
  // `active` : toute l'aide est active ; `inactive` : toute l'aide est coupée ;
  // `mixte` : tout le reste, y compris des blocs masqués un à un.
  global: 'active' | 'inactive' | 'mixte';
};

export function resumeAide(statuts: Record<string, StatutPage>): ResumeAide {
  const valeurs = Object.values(statuts);
  const total = valeurs.length;
  const actives = valeurs.filter((s) => s === 'active').length;
  const partielles = valeurs.filter((s) => s === 'partielle').length;
  const inactives = valeurs.filter((s) => s === 'inactive').length;
  const global = actives === total ? 'active' : inactives === total ? 'inactive' : 'mixte';
  return { total, actives, partielles, inactives, global };
}
