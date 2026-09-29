// Informations légales du site — source unique (JEP-17).
//
// Lues par les mentions légales et la politique de confidentialité (la CGV
// déjà en place, elle, ne redit pas ces informations), et destinées aux CGU
// (JEP-129) : une seule copie de l'identité de l'éditeur, sinon les pages
// finissent par se contredire au premier changement (déménagement…).
//
// SIREN 788 550 077 : repris de la politique de confidentialité (§1, PR
// #298 fusionnée sur main pendant le développement de ce ticket), à vérifier
// au registre public.
//
// Pas de téléphone de l'éditeur pour l'instant (décision du 28/09/2026) : la
// LCEN (art. 6-III) le demande à un éditeur professionnel — à ajouter ici dès
// qu'il existe, les pages l'afficheront sans autre changement.

export const EDITEUR = {
  nom: 'Fabien CHENU',
  statut: 'Entrepreneur individuel',
  siren: '788 550 077',
  adresse: '20b, rue Marie-Clémence Fouriaux — 51100 Reims',
  email: 'contact@jepatisse.com',
  telephone: null as string | null,
  directeurPublication: 'Fabien CHENU',
} as const;

export const HEBERGEUR = {
  nom: 'Infomaniak Network SA',
  adresse: 'Rue Eugène-Marziano 25, 1227 Les Acacias, Genève, Suisse',
  telephone: '+41 22 820 35 44',
  ide: 'CHE-103.167.648',
} as const;

export const SITE_URL_CANONIQUE = 'https://www.jepatisse.com';

// Pages légales publiques. Elles restent accessibles pendant `COMING_SOON`
// (cf. `middleware.ts`) : l'obligation d'identifier l'éditeur vaut dès que
// le domaine sert une page au public, page d'attente comprise. Ajouter ici
// `/cgu` et `/cgv` quand JEP-129 / JEP-16 les créeront.
export const PAGES_LEGALES = ['/mentions-legales', '/confidentialite'] as const;
