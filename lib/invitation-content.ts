// Copie de l'écran d'invitation (README « Écran 4 »), par destination.
// Fonctions pures — pas d'accès Supabase, utilisable aussi bien dans
// `/carnet` que `/en-cuisine`.
export type InvitationDestination = 'carnet' | 'cuisine';

export type InvitationPoint = { icon: string; title: string; text: string };

export type InvitationContent = {
  kicker: string;
  title: string;
  lead: string;
  peekLabel: string;
  points: InvitationPoint[];
};

export const INVITATION_CONTENT: Record<InvitationDestination, InvitationContent> = {
  carnet: {
    kicker: 'Mon carnet',
    title: 'Votre carnet vous attend',
    lead: 'Vos recettes, vos brouillons, vos favoris et les pâtissiers que vous suivez — rassemblés au même endroit, sur tous vos écrans.',
    peekLabel: 'Un aperçu de votre carnet',
    points: [
      {
        icon: 'edit_note',
        title: 'Écrire vos recettes',
        text: 'Étape par étape, avec vos photos, vos temps et vos tours de main. Publiez-les ou gardez-les pour vous.',
      },
      {
        icon: 'bookmark',
        title: 'Garder ce qui vous plaît',
        text: 'Mettez de côté les recettes des autres et suivez les pâtissiers dont vous aimez le travail.',
      },
      {
        icon: 'file_upload',
        title: "Importer l'existant",
        text: 'Un PDF, une page web, une photo de carnet : vos recettes rejoignent le vôtre.',
      },
    ],
  },
  cuisine: {
    kicker: 'En cuisine',
    title: 'Organisez vos préparations',
    lead: "Planifiez sur plusieurs jours, suivez vos préparations en cours et emportez votre liste de courses. C'est là que vos recettes deviennent des gâteaux.",
    peekLabel: 'Un aperçu de votre espace de travail',
    points: [
      {
        icon: 'event_note',
        title: 'Planifier',
        text: 'Une pâte la veille, le montage le jour J. Le planning se déroule en dates réelles, avec vos quantités ajustées.',
      },
      {
        icon: 'timer',
        title: 'Suivre en direct',
        text: 'Plusieurs préparations en même temps ? Chacune indique son étape en cours.',
      },
      {
        icon: 'shopping_bag',
        title: 'Faire les courses',
        text: 'La liste se génère depuis ce que vous avez planifié, sans les ingrédients déjà en votre possession.',
      },
    ],
  },
};
