// Teasers de 15 s maximum : une fonctionnalité différenciante par vidéo,
// pour donner envie à des prospects de venir tester (format vertical 9:16,
// réseaux sociaux, lecture sans le son). Une tâche Jira par teaser,
// étiquette `teaser-video`, produite par `generer.mjs` comme les tutos.
//
// Découpage fixe en trois temps : accroche (2 s), démonstration (10 s),
// carton final (3 s). Le texte à l'écran porte le message — la voix off
// n'est qu'un bonus, la plupart des vidéos étant lues sans le son.

const PRE_TARTE =
  'La recette « Tarte au citron meringuée » (tutos 13 à 15) dans le carnet du compte de démonstration, mesurée au moule (cercle 22 cm), pâte sucrée réglée sur « Recouvre une surface », crème et meringue sur « volume ».';

export const TEASERS = [
  {
    num: 1,
    cle: 'JEP-349',
    titre: 'Pas le bon moule ? (ajustement surface / volume)',
    plan: 'gratuit',
    compte: 'demo',
    argument:
      "Le changement de moule ne se fait pas par une simple règle de trois : la pâte qui fonce le moule suit la surface, la crème suit le volume. C'est l'argument le plus fort du site.",
    prerequis: [PRE_TARTE],
    accroche: { ecran: 'Pas le bon moule ?', voix: 'Pas le bon moule ?' },
    demo: {
      gestes: [
        'Fiche de la tarte → « Lancer une fournée » → « Ajuster par moule ».',
        'Choisir un cadre, saisir 30 × 20 cm → « Valider ».',
        'Dans la fournée, « Ingrédients ajustés » : zoomer sur la pâte puis sur la crème, coefficients différents.',
      ],
      ecran: ['Cercle 22 cm → cadre 30 × 20', 'Pâte : selon la surface', 'Crème : selon le volume'],
      voix: 'Changez de moule : la pâte suit la surface, la crème suit le volume. Les quantités sont justes.',
    },
  },
  {
    num: 2,
    cle: 'JEP-350',
    titre: 'Plus que 3 œufs ? (ajustement selon un ingrédient disponible)',
    plan: 'gratuit',
    compte: 'demo',
    argument: "On ajuste la recette à partir de ce qu'on a dans le placard, pas seulement d'un nombre de parts.",
    prerequis: ['Une recette mesurée en portions qui utilise des œufs (l\'option n\'existe pas pour une recette mesurée au moule).'],
    accroche: { ecran: 'Plus que 3 œufs ?', voix: 'Plus que trois œufs ?' },
    demo: {
      gestes: [
        '« Lancer une fournée » → « Ajuster par quantité d\'un ingrédient ».',
        '« Ingrédient » = Œuf, « Quantité disponible » = 3 → « Valider ».',
        'Zoom sur les quantités recalculées.',
      ],
      ecran: ['Œufs disponibles : 3', 'Toute la recette suit'],
      voix: "Indiquez ce qu'il vous reste : toute la recette se recalcule, dans les bonnes proportions.",
    },
  },
  {
    num: 3,
    cle: 'JEP-351',
    titre: 'Praliné fait maison ? (remplacer un ingrédient par une recette)',
    plan: 'gratuit',
    compte: 'demo',
    argument:
      'Un ingrédient acheté devient une préparation maison : les étapes de sa recette s\'insèrent dans le déroulé, au bon jour, et les courses suivent. Effet « waouh » pour un passionné.',
    prerequis: [
      'Une fournée d\'une recette utilisant du « Praliné ».',
      'Une recette de praliné publique, avec un rendement chiffré.',
      'Vérifier que la formule du compte de démonstration inclut le remplacement d\'un ingrédient par une recette.',
    ],
    accroche: { ecran: 'Praliné fait maison ?', voix: 'Praliné fait maison ?' },
    demo: {
      gestes: [
        'Fournée → « Liste totale des ingrédients » → picto « Remplacer cet ingrédient par une recette » sur le praliné.',
        'Choisir la recette de praliné → « Insérer les étapes » (recherche et réglages coupés au montage).',
        'Montrer les étapes ajoutées en vert dans le déroulé, puis le praliné barré « Fabriqué à partir de … ».',
      ],
      ecran: ['1 clic', 'Les étapes s\'insèrent au bon jour', 'Les courses suivent'],
      voix: "Un clic : ses étapes s'insèrent au bon jour, et vos courses se mettent à jour.",
    },
  },
  {
    num: 4,
    cle: 'JEP-352',
    titre: '3 jours de préparation ? (planning calé sur la dégustation)',
    plan: 'gratuit',
    compte: 'demo',
    argument: "Le planning sur plusieurs jours se construit tout seul à partir de la date de dégustation : l'organisation dans le temps, propre à la pâtisserie.",
    prerequis: ['Un entremets dont les étapes s\'étalent sur trois jours (J − 2, J − 1, jour J).'],
    accroche: { ecran: '3 jours de préparation ?', voix: 'Trois jours de préparation ?' },
    demo: {
      gestes: [
        '« Lancer une fournée » → « Date de dégustation » : samedi → « Valider ».',
        'Fournée : « Planning de préparation » daté.',
        'Mode « Pâtisser » : défilement des jours « Jour J − 2 », « Jour J − 1 », « Jour J ».',
      ],
      ecran: ['Dégustation samedi', 'J − 2 · J − 1 · Jour J'],
      voix: 'Choisissez le jour de la dégustation : le planning se construit tout seul, jour par jour.',
    },
  },
  {
    num: 5,
    cle: 'JEP-353',
    titre: 'Déjà au congélateur ? (étape réalisée à l\'avance)',
    plan: 'gratuit',
    compte: 'demo',
    argument: 'Une préparation faite à l\'avance sort des courses et de la mise en place en un geste : un vrai problème du pâtissier amateur, réglé.',
    prerequis: [PRE_TARTE, 'Une fournée de la tarte en cours.'],
    accroche: { ecran: 'Déjà au congélateur ?', voix: 'Déjà au congélateur ?' },
    demo: {
      gestes: [
        'Fournée, mode « Préparer » : étape « Pâte sucrée ».',
        'Cocher « Réalisée partiellement ou complètement » : l\'étape et ses ingrédients se barrent.',
        'Montrer la « Liste totale des ingrédients » sans la farine ni le beurre de la pâte (avant / après en écran partagé au montage).',
      ],
      ecran: ['Pâte sucrée : déjà faite ✓', 'Retirée des courses'],
      voix: "Cochez l'étape déjà réalisée : ses ingrédients disparaissent de votre liste de courses.",
    },
  },
  {
    num: 6,
    cle: 'JEP-354',
    titre: 'Notez chaque essai (mode Pâtisser, prévu / réalisé)',
    plan: 'gratuit',
    compte: 'demo',
    mobile: true,
    argument: "Le site garde la trace de ce qui a réellement été fait, essai après essai : un carnet d'essais, pas seulement un livre de recettes.",
    prerequis: ['Une fournée en cours, tournée sur téléphone posé en cuisine (vraie situation).'],
    accroche: { ecran: 'Notez chaque essai', voix: 'Notez chaque essai.' },
    demo: {
      gestes: [
        'Mode « Pâtisser » : cocher les ingrédients d\'une étape.',
        'Champ « réel » du sucre : 95 g au lieu de 90 ; une note qui passe en vert.',
        '« Résumé de la fournée » : « Ajustements d\'ingrédients » prévu → utilisé.',
      ],
      ecran: ['Prévu 90 g → réel 95 g', 'Prévu / réalisé, essai après essai'],
      voix: 'En cuisine, notez ce que vous avez vraiment mis. Le résumé compare le prévu et le réalisé.',
    },
  },
  {
    num: 7,
    cle: 'JEP-355',
    titre: 'Vos livres de pâtisserie dans votre poche (import par photo)',
    plan: 'payant',
    compte: 'payant',
    argument: "L'IA lit la page photographiée d'un livre et en fait une recette structurée, étape par étape. Fonction payante, présentée comme telle.",
    prerequis: ['Une photo nette d\'une page de recette (livre personnel, usage interne).', "Quota d'import du compte non épuisé."],
    accroche: { ecran: 'Vos livres de pâtisserie ?', voix: 'Vos livres de pâtisserie ?' },
    demo: {
      gestes: [
        'Photographier la page avec le téléphone (plan réel), puis « Importer » → « Photo » → ajouter la photo → importer.',
        'Attente coupée au montage : résultat « Recette importée en brouillon privé ».',
        'Faire défiler la recette obtenue, étapes et ingrédients.',
      ],
      ecran: ['Une photo', 'Une recette prête à cuisiner', 'Formule payante'],
      voix: "Photographiez la page : l'intelligence artificielle la transforme en recette, étape par étape.",
    },
  },
];
