// Contenu des tutos vidéo du site (une tâche Jira par tuto, étiquette
// `tuto-video`, projet JEP). Le texte des tickets est produit par
// `generer.mjs` à partir de ce fichier : c'est ici qu'on corrige une
// séquence, une voix off ou un prérequis, jamais dans Jira directement.
//
// Les libellés cités entre « » sont ceux des écrans, relevés dans le code
// des composants : un libellé renommé dans l'interface doit l'être ici aussi.
//
// Une séquence = un segment de voix off. Sa durée (en secondes) fixe le
// minutage du pas-à-pas ET le nombre de mots maximum du segment
// (`MOTS_PAR_SECONDE`, `generer.mjs`) — vérifié par `tutos.test.mjs`.
//
// Le mode projet (tutos 42 à 47) est volontairement absent : l'écran évolue
// encore trop pour être filmé.

const B1 = 'Premiers pas';
const B2 = 'Trouver des recettes';
const B3 = 'Créer et organiser ses recettes';
const B4 = 'Importer une recette par IA';
const B5 = 'Ajuster les quantités';
const B6 = 'Fournées : planifier puis pâtisser';
const B7 = 'Liste de courses';
const B9 = 'Communauté et aide';
const FORMULE = 'Vérifier que la formule du compte de démonstration inclut les fonctions montrées (sinon elles apparaissent verrouillées, avec un lien vers les formules).';
const NOTE_FOURNEE = "L'ajustement des quantités se fait dans la fenêtre « Lancer une fournée » de la fiche recette : la fournée créée porte les quantités ajustées, la recette d'origine ne change pas.";
const PRE_FOURNEE = 'Une fournée en cours (statut planifiée) de la « Tarte au citron meringuée », date de dégustation dans 2 jours, avec une étape à J − 1.';
const PRE_TARTE = 'La recette « Tarte au citron meringuée » saisie au tuto 13, présente dans le carnet du compte de démonstration.';
const SUPPR_FOURNEE = 'Supprimer la fournée de démonstration après tournage (En cuisine → « Supprimer »), sauf si elle sert à un tuto suivant.';

export const TUTOS = [
  {
    num: 1,
    cle: 'JEP-304',
    titre: 'Découvrir Je pâtisse ! en 2 minutes',
    bloc: B1,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Donner une vue d'ensemble du site à un nouveau venu : accueil, recherche, fiche recette, carnet.",
    message: 'tout pour trouver, adapter et réussir vos recettes, au même endroit',
    prerequis: [
      "Être connecté avec le compte de démonstration, qui doit déjà contenir quelques recettes, des favoris et suivre au moins un pâtissier (sinon la rangée « Chez les pâtissiers que vous suivez » n'apparaît pas).",
      "Une recette publique illustrée (photo, plusieurs étapes) repérée à l'avance pour la séquence 3.",
    ],
    sequences: [
      {
        titre: "L'accueil",
        duree: 25,
        gestes: [
          "Ouvrir l'accueil (menu « Accueil »).",
          "Montrer la barre « Que souhaitez-vous préparer aujourd'hui ? ».",
          'Faire défiler : « Explorer par Catégorie », « Chez les pâtissiers que vous suivez », « Dernières Créations ».',
        ],
        voix: "Bienvenue sur Je pâtisse. Dès l'accueil, cherchez une idée, explorez les catégories ou découvrez les dernières créations de la communauté. Les recettes des pâtissiers que vous suivez apparaissent ici aussi.",
      },
      {
        titre: 'Chercher une recette',
        duree: 20,
        gestes: [
          'Taper « citron » dans le champ « Rechercher une recette, un ingrédient, un auteur… » et valider.',
          "Montrer la liste de résultats et le bouton « Filtres » (sans l'ouvrir : tuto 10).",
        ],
        voix: "Tapez un mot, un ingrédient ou le nom d'un pâtissier : les résultats s'affichent aussitôt, et des filtres permettent d'affiner.",
      },
      {
        titre: 'La fiche recette',
        duree: 35,
        gestes: [
          'Ouvrir la recette repérée.',
          'Survoler le sommaire « Aller à… », la « Liste complète des ingrédients », puis une étape.',
          'Cliquer sur le cœur « Ajouter aux favoris ».',
          'Montrer le bouton « Lancer une fournée » sans cliquer (tuto 29).',
        ],
        voix: "Chaque fiche réunit tout : les ingrédients, les étapes détaillées, le planning de préparation et les conseils. Ajoutez-la à vos favoris d'un clic sur le cœur. [pause 1 s] Et quand vous êtes prêt, lancez une fournée : la recette s'adapte à votre moule et vous guide jusqu'au jour J.",
      },
      {
        titre: 'Le carnet',
        duree: 30,
        gestes: [
          'Menu « Mon carnet ».',
          'Passer sur les onglets « Tout », « Mes recettes », « Favoris ».',
          'Montrer les boutons « Importer » et « + Créer ».',
        ],
        voix: "Votre carnet rassemble vos recettes, vos favoris et celles qu'on partage avec vous. C'est aussi d'ici que vous créez ou importez une recette.",
      },
      {
        titre: 'Conclusion',
        duree: 10,
        gestes: [
          "Revenir à l'accueil, plan large sur le logo.",
        ],
        voix: 'Prêt à vous lancer ? Créez votre première recette, ou suivez nos autres tutos pas à pas.',
      },
    ],
    attention: [
      "Ne pas montrer l'onglet « Projets » du carnet (mode projet, tutos ultérieurs).",
    ],
  },
  {
    num: 2,
    cle: 'JEP-305',
    titre: 'Créer son compte par e-mail',
    bloc: B1,
    plan: 'gratuit',
    compte: 'jetable',
    objectif: "Montrer l'inscription par e-mail, du bouton « Créer un compte » jusqu'au compte confirmé.",
    message: 'un pseudo, une adresse, un mot de passe : vous êtes membre',
    prerequis: [
      'Être déconnecté (ou fenêtre de navigation privée).',
      'Une adresse e-mail de test jetable, dont la boîte de réception est ouverte dans un second onglet.',
      'Un pseudo neutre préparé (3 à 20 caractères), par exemple « Tuto Pâtisserie ».',
    ],
    sequences: [
      {
        titre: "Ouvrir l'inscription",
        duree: 5,
        gestes: [
          "Dans l'en-tête, cliquer sur « Créer un compte ».",
        ],
        voix: 'Pour rejoindre Je pâtisse, cliquez sur Créer un compte.',
      },
      {
        titre: 'Choisir son pseudo',
        duree: 20,
        gestes: [
          'Écran « Rejoignez la communauté de gourmands ».',
          'Champ « Pseudo » : saisir le pseudo préparé ; laisser apparaître « Vérification du pseudo… ».',
          'Montrer la mention de longueur (3 à 20 caractères).',
        ],
        voix: "Choisissez votre pseudo : c'est le nom qui apparaîtra sur vos recettes, et l'adresse de votre profil public. Il doit être unique, entre trois et vingt caractères.",
      },
      {
        titre: 'Adresse et mot de passe',
        duree: 15,
        gestes: [
          'Champs « Adresse e-mail », « Mot de passe », « Confirmer le mot de passe ».',
          "Montrer la jauge de robustesse et l'œil « Afficher le mot de passe ».",
        ],
        voix: "Saisissez ensuite votre adresse e-mail et un mot de passe, deux fois. La jauge vous indique s'il est assez solide.",
      },
      {
        titre: 'Accepter et valider',
        duree: 15,
        gestes: [
          "Cocher « J'accepte les conditions d'utilisation et la politique de confidentialité ».",
          "Cocher « Je certifie avoir 15 ans ou plus, ou disposer de l'accord de mon représentant légal pour créer ce compte. »",
          "Montrer que le bouton s'active, cliquer sur « S'inscrire ».",
        ],
        voix: "Acceptez les conditions d'utilisation, confirmez votre âge, puis cliquez sur S'inscrire. Le bouton s'active dès que les deux cases sont cochées.",
      },
      {
        titre: "Confirmer l'adresse",
        duree: 15,
        gestes: [
          "Basculer sur la boîte de réception de test, ouvrir l'e-mail de confirmation.",
          'Cliquer sur le lien : arrivée connectée sur le site.',
        ],
        voix: "Dernière étape : ouvrez l'e-mail de confirmation et cliquez sur le lien. Votre compte est actif, bienvenue dans la communauté !",
      },
    ],
    attention: [
      "Cadrer uniquement l'e-mail reçu : ne pas montrer le reste de la boîte de réception ni l'adresse complète.",
      'Garder ce compte de test : il sert au tuto 4 (mot de passe oublié).',
    ],
  },
  {
    num: 3,
    cle: 'JEP-306',
    titre: 'Se connecter avec Google et choisir son pseudo',
    bloc: B1,
    plan: 'gratuit',
    compte: 'google',
    objectif: "Montrer la première connexion par Google et l'écran de choix du pseudo.",
    message: 'un clic sur Google, un pseudo choisi par vous, jamais votre nom complet imposé',
    prerequis: [
      'Être déconnecté (ou fenêtre de navigation privée).',
      "Compte Google de test dédié, jamais connecté au site : sans cela, l'écran « Choisissez votre pseudo » n'apparaît pas.",
    ],
    sequences: [
      {
        titre: 'Continuer avec Google',
        duree: 10,
        gestes: [
          'Page de connexion : cliquer sur « Continuer avec Google ».',
          'Choisir le compte Google de test.',
        ],
        voix: 'Vous avez un compte Google ? Cliquez sur Continuer avec Google et choisissez votre compte.',
      },
      {
        titre: 'Choisir son pseudo',
        duree: 20,
        gestes: [
          'Écran « Choisissez votre pseudo », pré-rempli avec le nom du compte Google.',
          'Modifier le pseudo ; montrer « Adresse de votre profil : jepatisse.com/u/… » qui suit la saisie.',
        ],
        voix: "À la première connexion, le site vous propose un pseudo tiré de votre compte Google. Gardez-le ou choisissez-en un autre : c'est lui qui sera affiché, pas votre nom complet.",
      },
      {
        titre: 'Accepter et continuer',
        duree: 15,
        gestes: [
          "Cocher les conditions d'utilisation et l'attestation d'âge.",
          'Cliquer sur « Continuer » : arrivée sur le site, connecté.',
        ],
        voix: 'Acceptez les conditions, confirmez votre âge, puis continuez. Les fois suivantes, un clic sur Google suffit pour vous connecter.',
      },
    ],
    attention: [
      "Flouter au montage l'adresse et la photo du compte Google dans la fenêtre de choix de compte.",
    ],
  },
  {
    num: 4,
    cle: 'JEP-307',
    titre: 'Mot de passe oublié : le réinitialiser',
    bloc: B1,
    plan: 'gratuit',
    compte: 'jetable',
    objectif: "Montrer comment retrouver l'accès à son compte en choisissant un nouveau mot de passe.",
    message: 'un e-mail, un lien, un nouveau mot de passe',
    prerequis: [
      'Compte de test jetable créé au tuto 2, boîte de réception ouverte dans un second onglet.',
      'Être déconnecté.',
    ],
    sequences: [
      {
        titre: 'Mot de passe oublié ?',
        duree: 10,
        gestes: [
          'Écran de connexion « Bon retour parmi nous ».',
          'Cliquer sur « Mot de passe oublié ? » sous le champ du mot de passe.',
        ],
        voix: "Mot de passe oublié ? Depuis l'écran de connexion, cliquez sur le lien prévu.",
      },
      {
        titre: 'Demander le lien',
        duree: 10,
        gestes: [
          "Écran « Mot de passe oublié » : saisir l'adresse dans « Adresse e-mail ».",
          'Cliquer sur « Envoyer le lien » ; montrer le message de confirmation.',
        ],
        voix: 'Saisissez votre adresse e-mail et demandez le lien de réinitialisation.',
      },
      {
        titre: 'Choisir un nouveau mot de passe',
        duree: 20,
        gestes: [
          "Ouvrir l'e-mail reçu, cliquer sur le lien.",
          'Écran « Nouveau mot de passe » : saisir puis confirmer le nouveau mot de passe.',
          'Cliquer sur « Mettre à jour le mot de passe ».',
        ],
        voix: "Ouvrez l'e-mail reçu et suivez le lien. Choisissez un nouveau mot de passe, confirmez-le, et c'est terminé : vous pouvez de nouveau vous connecter.",
      },
    ],
    attention: [
      'Ne JAMAIS faire ce tuto avec le compte de démonstration : son mot de passe ne correspondrait plus à DEMO_PASSWORD.',
    ],
  },
  {
    num: 5,
    cle: 'JEP-308',
    titre: "Installer l'application sur son téléphone",
    bloc: B1,
    plan: 'gratuit',
    compte: 'visiteur',
    mobile: true,
    objectif: "Montrer comment ajouter Je pâtisse ! à l'écran d'accueil sur Android (Chrome), Samsung Internet et iPhone (Safari).",
    message: "Je pâtisse ! s'ouvre en un geste, comme une application",
    prerequis: [
      'Trois navigateurs : Chrome sur Android, Samsung Internet, Safari sur iPhone (appareils réels ou émulateurs).',
      'Site jamais installé sur ces appareils. Une bannière fermée ne réapparaît pas avant 30 jours : vider les données du site si besoin.',
    ],
    sequences: [
      {
        titre: 'Android (Chrome)',
        duree: 15,
        gestes: [
          'Ouvrir dev.jepatisse.com dans Chrome.',
          "Bannière « Installer Je pâtisse ! » : toucher « Installer », puis valider l'invite du téléphone.",
        ],
        voix: "Installez Je pâtisse sur votre téléphone pour l'ouvrir en un geste, comme une application. Sur Android, touchez simplement Installer dans le bandeau.",
      },
      {
        titre: 'Samsung Internet',
        duree: 15,
        gestes: [
          'Ouvrir le site dans Samsung Internet : la bannière affiche des instructions.',
          "Ouvrir le menu ⋮, puis « Ajouter une page à » → « Écran d'accueil ».",
        ],
        voix: "Sur Samsung Internet, ouvrez le menu, puis Ajouter une page à, et choisissez l'écran d'accueil.",
      },
      {
        titre: 'iPhone (Safari)',
        duree: 15,
        gestes: [
          'Ouvrir le site dans Safari.',
          "Toucher l'icône Partager, puis « Sur l'écran d'accueil », puis « Ajouter ».",
        ],
        voix: "Sur iPhone, touchez l'icône de partage de Safari, puis Sur l'écran d'accueil.",
      },
      {
        titre: "Ouvrir l'application",
        duree: 10,
        gestes: [
          "Revenir à l'écran d'accueil du téléphone, toucher l'icône Je pâtisse !",
          "Le site s'ouvre en plein écran, sans barre d'adresse.",
        ],
        voix: "L'icône est sur votre écran d'accueil : le site s'ouvre en plein écran, sans barre d'adresse.",
      },
    ],
    attention: [
      "Masquer les autres applications et notifications de l'écran d'accueil des téléphones.",
    ],
  },
  {
    num: 6,
    cle: 'JEP-309',
    titre: 'Régler son compte : profil, pseudo, e-mail, mot de passe',
    bloc: B1,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Faire le tour de la page « Réglages du compte ».',
    message: 'tout ce qui vous concerne se règle au même endroit',
    prerequis: [
      'Être connecté avec le compte de démonstration.',
      "Une photo de profil et une bannière d'exemple prêtes sur le poste.",
    ],
    sequences: [
      {
        titre: 'Ouvrir les réglages',
        duree: 5,
        gestes: [
          'Menu « Mon compte » → « Réglages du compte ».',
        ],
        voix: 'Vos réglages sont dans le menu Mon compte.',
      },
      {
        titre: 'Modifier le profil',
        duree: 25,
        gestes: [
          'Cliquer sur « Modifier le profil ».',
          'Changer la photo et la bannière du profil, écrire une « Bio ».',
          'Montrer le champ « Pseudo » et la ligne « Adresse de votre profil : jepatisse.com/u/… » ; ne pas le modifier.',
          'Cliquer sur « Enregistrer » ; montrer le lien « Voir mon profil public → ».',
        ],
        voix: "Modifier le profil vous permet de changer votre photo, votre bannière et votre bio. Votre pseudo fait aussi l'adresse de votre profil public : il ne peut changer qu'une fois tous les soixante jours, et l'ancienne adresse cesse alors de fonctionner.",
      },
      {
        titre: 'E-mail et mot de passe',
        duree: 20,
        gestes: [
          "Blocs « Adresse e-mail » (« Changer d'adresse ») et « Mot de passe » (« Mettre à jour le mot de passe »).",
          'Montrer les champs sans valider.',
        ],
        voix: "Plus bas, changez votre adresse e-mail ou votre mot de passe. Une nouvelle adresse n'est prise en compte qu'après avoir cliqué sur le lien de confirmation.",
      },
      {
        titre: 'Les autres blocs',
        duree: 20,
        gestes: [
          'Montrer « Mon forfait », puis déplier un à un « Mes abonnements », « Partages de mon carnet », « Partages de mes recettes », « Mes demandes de contact ».',
        ],
        voix: "Enfin, retrouvez ici vos abonnements, les partages de votre carnet et de vos recettes, vos demandes de contact et votre formule. Chaque bloc se déplie d'un clic.",
      },
    ],
    attention: [
      "Sur le compte de démonstration, ne JAMAIS enregistrer un changement de pseudo (bloqué ensuite 60 jours), d'adresse e-mail ou de mot de passe (DEMO_EMAIL / DEMO_PASSWORD ne fonctionneraient plus) : montrer les champs, puis « Annuler ».",
      'Les blocs « Notifications » et « Mon forfait » ont leurs propres tutos (7 et 51).',
    ],
  },
  {
    num: 7,
    cle: 'JEP-310',
    titre: 'Choisir ses notifications',
    bloc: B1,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer comment choisir, pour chaque type d'information, le canal (site, e-mail) et le rythme des e-mails.",
    message: 'vous recevez ce que vous voulez, où vous voulez, au rythme que vous voulez',
    prerequis: [
      'Être connecté avec le compte de démonstration.',
      'Noter les réglages actuels pour les rétablir après tournage.',
    ],
    sequences: [
      {
        titre: 'Ouvrir le bloc',
        duree: 5,
        gestes: [
          '« Réglages du compte » → déplier le bloc « Notifications ».',
        ],
        voix: 'Vos notifications se règlent dans vos réglages.',
      },
      {
        titre: 'Site ou e-mail',
        duree: 25,
        gestes: [
          'Parcourir les catégories (« Mes recettes », « Communauté », « Fournées (rappels) », « Boîte à idées »…) et leurs rubriques.',
          'Sur « Rappel la veille du jour J », cocher « Sur le site » et « Par e-mail ».',
          'Sur « Favoris », décocher les deux cases.',
        ],
        voix: "Pour chaque type d'information, choisissez où la recevoir : sur le site, par e-mail, ou les deux. Décochez les deux pour ne plus rien recevoir. Par exemple, les rappels de fournée vous préviennent la veille du jour J.",
      },
      {
        titre: 'Le rythme',
        duree: 15,
        gestes: [
          'Sur une rubrique avec e-mail, ouvrir la liste « Rythme » : « Immédiat », « Quotidien », « Hebdomadaire ».',
        ],
        voix: 'Pour les e-mails, choisissez le rythme : immédiat, quotidien ou hebdomadaire. Certains messages importants, comme ceux liés à votre abonnement, partent toujours.',
      },
    ],
    attention: [
      'Les réglages sont enregistrés immédiatement : rétablir ceux du compte de démonstration après tournage.',
    ],
  },
  {
    num: 8,
    cle: 'JEP-311',
    titre: 'La cloche et la page Notifications',
    bloc: B1,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Montrer où arrivent les notifications et comment les consulter.',
    message: 'la cloche vous prévient, la page garde tout',
    prerequis: [
      'Le compte de démonstration doit avoir plusieurs notifications, dont au moins deux non lues (favori reçu, nouvel abonné… provoqués depuis un second compte de test).',
    ],
    sequences: [
      {
        titre: 'La cloche',
        duree: 15,
        gestes: [
          "Montrer la cloche de l'en-tête et son badge de non lues.",
          "L'ouvrir : les cinq dernières notifications, les nouvelles en gras.",
        ],
        voix: 'La cloche signale vos nouvelles notifications : un favori, un nouvel abonné, un rappel de fournée. Elle affiche les cinq dernières.',
      },
      {
        titre: 'La page Notifications',
        duree: 15,
        gestes: [
          'Cliquer sur « Voir toutes les notifications ».',
          'Montrer « Les nouveautés depuis votre dernière visite sont en gras. » et « Charger plus ».',
          "Cliquer sur une notification : arrivée sur l'élément concerné.",
        ],
        voix: "La page complète garde tout l'historique. Les nouveautés sont en gras, et chaque notification mène directement à ce qu'elle concerne.",
      },
    ],
  },
  {
    num: 9,
    cle: 'JEP-312',
    titre: 'Lire une fiche recette',
    bloc: B2,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Apprendre à lire une fiche recette et à s'y repérer.",
    message: 'chaque étape porte ses propres ingrédients : vous savez toujours quoi utiliser, et quand',
    prerequis: [
      "Une recette publique complète repérée à l'avance : photos, planning sur plusieurs jours, un ingrédient utilisé dans plusieurs étapes avec des commentaires différents, au moins un allergène, des sous-étapes et des astuces.",
    ],
    sequences: [
      {
        titre: "L'en-tête",
        duree: 15,
        gestes: [
          "Montrer le titre, la note en étoiles, l'auteur (« Par … », lien vers son profil).",
          'Montrer les boutons favori, « Partager » et « Imprimer ».',
        ],
        voix: "En haut de la fiche : le titre, la note donnée par la communauté et l'auteur, dont le profil est à un clic. Juste à côté, ajoutez aux favoris, partagez ou imprimez.",
      },
      {
        titre: 'Le sommaire',
        duree: 15,
        gestes: [
          'Ouvrir le sommaire « Aller à… » et cliquer sur « Planning de préparation ».',
        ],
        voix: 'Le sommaire vous emmène directement à la partie qui vous intéresse : ingrédients, étapes, planning ou conseils.',
      },
      {
        titre: 'Bloc technique et planning',
        duree: 20,
        gestes: [
          'Montrer le « Bloc technique » (difficulté, temps).',
          "Montrer le « Planning de préparation » (J moins n jusqu'au jour J).",
        ],
        voix: "Le bloc technique résume la difficulté et les temps. Le planning montre ce qui se prépare à l'avance : la veille, deux jours avant, jusqu'au jour de la dégustation.",
      },
      {
        titre: 'Liste complète des ingrédients',
        duree: 20,
        gestes: [
          'Section « Liste complète des ingrédients ».',
          "Montrer l'ingrédient répété : une ligne par commentaire et sa ligne « TOTAL ».",
          "Montrer un pictogramme d'allergène.",
        ],
        voix: "La liste complète additionne les ingrédients de toutes les étapes. Quand un ingrédient revient plusieurs fois, son total s'affiche en gras. Les allergènes sont signalés par un pictogramme.",
      },
      {
        titre: 'Les étapes',
        duree: 20,
        gestes: [
          "Dérouler une étape : « Ingrédients de l'étape », sous-étapes, photos, « Conseils & Astuces de l'étape ».",
        ],
        voix: 'Chaque étape détaille ses propres ingrédients, ses gestes, ses photos et ses astuces. Vous savez toujours exactement quoi utiliser, et à quel moment.',
      },
    ],
  },
  {
    num: 10,
    cle: 'JEP-313',
    titre: 'La recherche avancée',
    bloc: B2,
    plan: 'gratuit',
    compte: 'demo',
    adresseVisible: true,
    objectif: "Montrer les filtres de la recherche avancée et le partage d'une recherche par son lien.",
    message: 'dites ce que vous avez dans le placard, la recherche fait le reste',
    prerequis: [
      'Assez de recettes publiées sur dev pour que les filtres donnent des résultats visibles (chocolat avec et sans noisette, plusieurs difficultés et durées).',
    ],
    sequences: [
      {
        titre: 'Ouvrir la recherche avancée',
        duree: 10,
        gestes: [
          "Cliquer sur « Rechercher » dans l'en-tête, puis « Critères avancés ».",
        ],
        voix: 'Pour une recherche précise, ouvrez la recherche avancée.',
      },
      {
        titre: 'Inclure et exclure des ingrédients',
        duree: 25,
        gestes: [
          'Bloc « Ingrédients » : mode « Inclure », ajouter « chocolat ».',
          'Mode « Exclure », ajouter « noisette ».',
          'Montrer la mise à jour des résultats.',
        ],
        voix: 'Indiquez les ingrédients que vous avez sous la main, et ceux dont vous ne voulez pas. Les résultats se mettent à jour à chaque réglage.',
      },
      {
        titre: 'Les autres critères',
        duree: 25,
        gestes: [
          "Parcourir « Type de recette », « Difficulté », « Temps total maximum » (curseur de 30 min à « 8 h et + »), « Catégories », « Note de la recette », « Note de l'auteur ».",
          'Ouvrir « Allergènes à exclure » et montrer la mention « Aide au tri : tous les ingrédients ne sont pas rattachés au référentiel des allergènes. »',
        ],
        voix: "Affinez ensuite par type, difficulté, temps total, catégorie ou note. Vous pouvez aussi exclure des allergènes : c'est une aide au tri, pas une garantie, car tous les ingrédients ne sont pas renseignés.",
      },
      {
        titre: 'Trier et réinitialiser',
        duree: 15,
        gestes: [
          '« Trier par » : « Pertinence », « Plus récentes », « Mieux notées », « Les plus rapides ».',
          'Retirer un critère dans « Critères actifs », puis « Tout réinitialiser ».',
        ],
        voix: "Triez les résultats, retirez un critère d'un clic, ou repartez de zéro.",
      },
      {
        titre: 'Partager et utiliser sur téléphone',
        duree: 15,
        gestes: [
          "Copier l'adresse de la page et l'ouvrir dans un autre onglet : mêmes résultats.",
          'En vue téléphone, ouvrir le bouton « Filtres » (tiroir).',
        ],
        voix: "Votre recherche est enregistrée dans l'adresse de la page : partagez le lien, il ouvrira exactement les mêmes résultats. Sur téléphone, les critères s'ouvrent avec le bouton Filtres.",
      },
    ],
  },
  {
    num: 11,
    cle: 'JEP-314',
    titre: 'Ajouter aux favoris et retrouver ses favoris',
    bloc: B2,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Montrer comment mettre une recette de côté et la retrouver.',
    message: 'un cœur, et la recette vous attend dans votre carnet',
    prerequis: [
      "Une recette publique d'un compte de test (pas d'un vrai membre), non encore en favori.",
    ],
    sequences: [
      {
        titre: 'Ajouter un favori',
        duree: 15,
        gestes: [
          'Sur une carte de recette puis sur sa fiche, toucher le cœur « Ajouter aux favoris ».',
        ],
        voix: 'Une recette vous plaît ? Touchez le cœur, sur sa fiche ou directement sur sa carte : elle rejoint vos favoris.',
      },
      {
        titre: 'Retrouver ses favoris',
        duree: 15,
        gestes: [
          '« Mon carnet » → onglet « Favoris ».',
          'Toucher à nouveau le cœur (« Retirer des favoris »).',
        ],
        voix: 'Retrouvez tous vos favoris dans votre carnet, onglet Favoris. Touchez à nouveau le cœur pour en retirer une.',
      },
    ],
    attention: [
      "L'auteur de la recette est notifié avec le pseudo du compte de démonstration : n'utiliser que des recettes de comptes de test.",
    ],
  },
  {
    num: 12,
    cle: 'JEP-315',
    titre: 'Suivre un pâtissier',
    bloc: B2,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer le profil public d'un pâtissier, comment le suivre et gérer ses abonnements.",
    message: 'suivez les pâtissiers que vous aimez, leurs nouvelles recettes viennent à vous',
    prerequis: [
      'Un compte de test avec des recettes publiées, non encore suivi par le compte de démonstration.',
    ],
    sequences: [
      {
        titre: 'Ouvrir un profil',
        duree: 10,
        gestes: [
          "Depuis une fiche recette, cliquer sur le nom de l'auteur.",
        ],
        voix: "Cliquez sur le nom d'un auteur pour découvrir son profil.",
      },
      {
        titre: 'Le profil public',
        duree: 15,
        gestes: [
          'Montrer « Membre depuis », « Recettes », « Abonnés », « Note moyenne » et les filtres de catégorie (« Tout »…).',
        ],
        voix: "Son profil présente ses recettes publiées, son nombre d'abonnés et la note moyenne de ses créations.",
      },
      {
        titre: 'Suivre',
        duree: 10,
        gestes: [
          'Cliquer sur « Suivre » : le bouton devient « Abonné ».',
        ],
        voix: 'Cliquez sur Suivre : ses nouvelles recettes vous seront signalées.',
      },
      {
        titre: 'Retrouver et gérer ses abonnements',
        duree: 15,
        gestes: [
          'Accueil : rangée « Chez les pâtissiers que vous suivez ».',
          '« Réglages du compte » → « Mes abonnements » → montrer « Ne plus suivre ».',
        ],
        voix: 'Ses recettes apparaissent sur votre accueil et dans votre carnet. Pour arrêter, rendez-vous dans vos réglages, rubrique Mes abonnements.',
      },
    ],
  },
  {
    num: 13,
    cle: 'JEP-303',
    titre: 'Saisir sa première recette à la main',
    bloc: B3,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer à un nouveau membre comment saisir sa première recette à la main, de la page vide jusqu'au brouillon enregistré.",
    message: 'une étape = ses ingrédients + ses gestes ; le récapitulatif se construit tout seul',
    prerequis: [
      'Être connecté avec le compte de démonstration.',
      "Recette exemple à saisir, préparée à l'avance : « Tarte au citron meringuée », 3 étapes (Pâte sucrée / Crème au citron / Meringue italienne), ingrédients avec unités du référentiel (g, unité(s), cl).",
      "Les photos, ustensiles, tags et moule ne sont PAS traités ici (tuto 14) ; le mode d'ajustement des quantités non plus (tuto 15).",
    ],
    sequences: [
      {
        titre: "Ouvrir l'éditeur",
        duree: 5,
        gestes: [
          'Partir du carnet (menu « Mon carnet »).',
          'Cliquer sur le bouton « + Créer » en haut à droite du carnet.',
          "L'écran « Créer une nouvelle recette » s'ouvre.",
        ],
        voix: 'Pour saisir une recette, ouvrez votre carnet, puis cliquez sur Créer.',
      },
      {
        titre: 'Titre, visibilité, description',
        duree: 15,
        gestes: [
          'Champ « TITRE DE LA RECETTE » : taper « Tarte au citron meringuée ».',
          'Bloc « VISIBILITÉ DE LA RECETTE » : montrer les deux choix « Privée » / « Publique », laisser « Privée ».',
          'Champ « Description rapide » : une phrase (« Pâte sucrée croustillante, crème acidulée, meringue italienne dorée au chalumeau. »).',
        ],
        voix: "Donnez-lui un titre. Privée, elle reste dans votre carnet ; publique, elle sera proposée à la communauté après validation. [pause 0,5 s] Une phrase de description, et c'est parti.",
      },
      {
        titre: 'Taille / nombre de portions',
        duree: 10,
        gestes: [
          'Bloc « Taille / Nombre de portions » : choisir le mode nombre de personnes, saisir 8, unité « Pers. ».',
          "Mentionner sans détailler qu'on peut aussi indiquer un type de moule ou une description libre (renvoi au tuto 14).",
        ],
        voix: 'Indiquez pour combien de personnes. Ce rendement sert de base à tous les ajustements de quantités.',
      },
      {
        titre: 'Première étape',
        duree: 40,
        gestes: [
          "Descendre jusqu'à la section des étapes ; la première étape est déjà présente.",
          "Champ titre de l'étape : « Pâte sucrée ».",
          'Remplir TEMPS DE PRÉP (15 min), TEMPS DE CUISSON (20 min), T°C DE CUISSON (170).',
          "Bloc « INGRÉDIENTS » : cliquer « + Ajouter un ingrédient » ; saisir « Farine », montrer l'autocomplétion du référentiel, quantité 250, unité g.",
          "Ajouter « Beurre » 125 g, « Sucre glace » 90 g, « Oeuf » 1 unité(s) — montrer que « Oeuf » est réécrit « Œuf » à l'enregistrement.",
          'Montrer le champ « Commentaire (optionnel) » sur une ligne (« pommade » pour le beurre).',
          "Champ « DESCRIPTION » : coller le texte des gestes, puis cliquer « Éclater en sous-étapes » pour obtenir une liste de gestes ; montrer « + Ajouter une sous-étape » et le glisser-déposer d'une sous-étape.",
        ],
        voix: "Une recette se construit étape par étape. Donnez un titre à l'étape, puis ses temps de préparation et de cuisson. [pause 1 s] Ajoutez ses ingrédients : le site vous propose les noms connus, il ne reste qu'à saisir la quantité et l'unité. Un commentaire précise au besoin, comme « beurre pommade ». [pause 1 s] Décrivez les gestes, puis éclatez le texte en sous-étapes : chaque geste devient une ligne, que vous pouvez réordonner. Chaque étape porte ses propres ingrédients : vous savez toujours ce qui sert où.",
      },
      {
        titre: 'Étapes suivantes',
        duree: 25,
        gestes: [
          'Cliquer « + Ajouter une étape » ; saisir rapidement « Crème au citron » (ingrédients + description).',
          'Ajouter « Meringue italienne ».',
          "Montrer « Tout replier » / « Tout déplier », puis le glisser-déposer d'une étape (poignée) et l'icône « Insérer une étape avant celle-ci ».",
          "Montrer le champ « À PRÉPARER LE JOUR J − … jour(s) avant dégustation » sur la pâte sucrée (1 jour) : expliquer que c'est ce qui organisera le planning des fournées.",
        ],
        voix: "Ajoutez les étapes suivantes de la même façon. Vous pouvez les replier, les déplacer, ou en insérer une au milieu. [pause 1 s] Une étape se prépare la veille ? Indiquez-le ici : c'est ce qui organisera votre planning le jour où vous la réaliserez.",
      },
      {
        titre: 'Récapitulatif et temps',
        duree: 15,
        gestes: [
          "Descendre jusqu'à « Récapitulatif des ingrédients » : montrer qu'il est « Généré automatiquement depuis les étapes ».",
          "Bloc « Difficulté & temps » : choisir une difficulté ; montrer la « Somme des temps des étapes », et préciser que le « Temps saisi manuellement » prime s'il est rempli.",
          'Montrer brièvement « Conseils et astuces de la recette » et « Conseils de dégustation et de conservation ».',
        ],
        voix: 'En bas, le récapitulatif des ingrédients se construit tout seul. Choisissez la difficulté : le temps total est calculé à partir des étapes, sauf si vous le saisissez vous-même.',
      },
      {
        titre: 'Enregistrer',
        duree: 10,
        gestes: [
          "Cliquer « Enregistrer en brouillon » ; le spinner (fouet) s'affiche pendant l'enregistrement.",
          'Revenir au carnet : la recette apparaît sous « Mes recettes » → « Brouillons ».',
          "Mentionner que « Publier la recette » l'envoie en validation (renvoi au tuto 16).",
        ],
        voix: "Enregistrez en brouillon : votre recette vous attend dans votre carnet. Prochaine étape : l'illustrer et l'adapter à votre moule.",
      },
    ],
    attention: [
      'Ne pas cliquer « Publier la recette » avec le compte de démo (elle partirait en modération réelle).',
      'Garder la recette : elle sert de base aux tutos 14, 15, 17, 25, 28 et 29.',
    ],
  },
  {
    num: 14,
    cle: 'JEP-316',
    titre: 'Enrichir une recette : photos, tags, moule, ustensiles, source',
    bloc: B3,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Compléter une recette déjà saisie avec ce qui la rend utile et attrayante.',
    message: "une photo pour donner envie, un moule pour pouvoir l'adapter",
    prerequis: [
      PRE_TARTE,
      "Une photo de la tarte (paysage) et deux photos d'étape prêtes sur le poste.",
    ],
    sequences: [
      {
        titre: 'Rouvrir la recette',
        duree: 5,
        gestes: [
          'Ouvrir la recette, cliquer sur « Éditer la recette ».',
        ],
        voix: "Reprenons notre recette pour l'enrichir.",
      },
      {
        titre: 'Photos',
        duree: 25,
        gestes: [
          "Glisser la photo dans l'emplacement « Photo principale de la recette (format paysage 16:9) — taille idéale : 1200 × 675 px ».",
          'Cliquer sur « Ajuster la photo (zoom, rotation, position) » : « Zoomer », « Pivoter à droite », « Valider ».',
          "Dans une étape, ajouter une photo d'étape.",
        ],
        voix: "Ajoutez d'abord une belle photo : glissez-la ou cliquez pour la choisir. Elle est compressée automatiquement, et vous pouvez la recadrer, la pivoter ou zoomer. Chaque étape peut aussi recevoir ses propres photos.",
      },
      {
        titre: 'Catégories et tags',
        duree: 15,
        gestes: [
          'Bloc « Catégories et Tags » : « + Ajouter un tag », « Rechercher un tag… », choisir « Tartes ».',
        ],
        voix: 'Les catégories aident les autres membres à trouver votre recette, et alimentent la recherche avancée.',
      },
      {
        titre: 'Le moule',
        duree: 20,
        gestes: [
          'Bloc « Taille / Nombre de portions » : choisir « Par type de moule / cercle ».',
          '« Choisir le type de moule » (cercle), « Nombre » 1, diamètre 22 cm, hauteur 2 cm.',
        ],
        voix: "Indiquez le moule utilisé et ses dimensions. C'est grâce à lui que la recette pourra s'adapter automatiquement à un autre moule.",
      },
      {
        titre: 'Ustensiles',
        duree: 15,
        gestes: [
          'Bloc « Ustensiles nécessaires » : « + Ajouter un ustensile » → « Cercle à tarte », commentaire « 22 cm ».',
          'Ajouter « Chalumeau ».',
        ],
        voix: 'Listez les ustensiles nécessaires, avec une précision si besoin : taille du cercle, douille, thermomètre.',
      },
      {
        titre: 'Source et vidéo',
        duree: 10,
        gestes: [
          "Remplir « Source » et « URL de la recette d'origine » ; montrer « URL de la vidéo ».",
          'Cliquer sur « Enregistrer ».',
        ],
        voix: 'Citez enfin votre source, ajoutez une vidéo si vous en avez une, et enregistrez.',
      },
    ],
    attention: [
      'Ne pas cliquer « Publier la recette » (tuto 16).',
      "Passer en mesure « au moule » change les choix d'ajustement des étapes : c'est l'objet du tuto 15, à tourner juste après.",
    ],
  },
  {
    num: 15,
    cle: 'JEP-317',
    titre: "Comment les quantités d'une étape s'ajustent",
    bloc: B3,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Expliquer le réglage « Ajustement des quantités de cette étape » et son effet sur les changements de moule ou de portions.',
    message: 'une crème suit le volume, une pâte à foncer suit la surface',
    prerequis: [
      'La recette « Tarte au citron meringuée » saisie au tuto 13, présente dans le carnet du compte de démonstration. Elle doit être mesurée au moule (tuto 14).',
      'Une seconde recette mesurée en portions (« Pers. »), pour la séquence 3.',
    ],
    sequences: [
      {
        titre: 'Le réglage',
        duree: 10,
        gestes: [
          "Ouvrir la recette en édition ; dans l'étape « Pâte sucrée », montrer le bloc « Ajustement des quantités de cette étape ».",
        ],
        voix: 'Chaque étape indique comment ses quantités suivent un changement de taille.',
      },
      {
        titre: 'Recette au moule',
        duree: 30,
        gestes: [
          "Montrer les trois options : « Ajustement selon la taille du moule (volume) », « Recouvre une surface (pâte à tarte, glaçage…) », « Pas d'ajustement pour cette étape ».",
          'Pâte sucrée → « Recouvre une surface » ; Crème au citron → « volume » ; Meringue → « volume ».',
        ],
        voix: 'Pour une recette au moule, trois choix. Une crème, un appareil ou un biscuit suivent le volume du moule. Une pâte à foncer ou un glaçage recouvrent une surface : ils suivent la surface, pas le volume. Et une décoration peut rester en quantité fixe.',
      },
      {
        titre: 'Recette en portions',
        duree: 15,
        gestes: [
          "Ouvrir la seconde recette en édition : options « Proportionnel à la quantité à produire » et « Pas d'ajustement ».",
        ],
        voix: 'Pour une recette en portions, tout est proportionnel au nombre de parts, sauf ce que vous excluez.',
      },
      {
        titre: 'Enregistrer',
        duree: 10,
        gestes: [
          'Revenir à la tarte, cliquer sur « Enregistrer ».',
        ],
        voix: 'Ce réglage fait toute la justesse des ajustements de moule : prenez le temps de le choisir.',
      },
    ],
  },
  {
    num: 16,
    cle: 'JEP-318',
    titre: 'Publier une recette',
    bloc: B3,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Montrer le parcours de publication : soumission, validation ou refus avec motif, retour en brouillon.',
    message: "chaque recette publique est relue avant d'être proposée à la communauté",
    prerequis: [
      'Une recette de test terminée, privée, dans le carnet du compte de démonstration.',
      'Une seconde recette de test déjà refusée avec un motif (à préparer avec un administrateur), pour la séquence 3.',
    ],
    sequences: [
      {
        titre: 'Rendre publique et publier',
        duree: 15,
        gestes: [
          'Éditer la recette : « VISIBILITÉ DE LA RECETTE » → « Publique ».',
          'Cliquer sur « Publier la recette » ; lire le message de soumission à validation.',
        ],
        voix: 'Pour partager une recette avec la communauté, rendez-la publique puis cliquez sur Publier la recette.',
      },
      {
        titre: 'Suivre le statut',
        duree: 15,
        gestes: [
          '« Mon carnet » → « Mes recettes » → « Statut » : « En attente ».',
        ],
        voix: "Elle passe en attente : l'équipe vérifie chaque recette avant publication. Suivez son statut dans votre carnet.",
      },
      {
        titre: 'Publiée ou refusée',
        duree: 15,
        gestes: [
          'Montrer la notification de publication (cloche).',
          'Ouvrir la recette refusée : statut « Publication refusée » et encadré « Motif du refus ».',
        ],
        voix: "Vous êtes prévenu dès qu'elle est publiée. Si elle est refusée, le motif s'affiche sur la fiche : corrigez, puis publiez de nouveau.",
      },
      {
        titre: 'Repasser en brouillon',
        duree: 10,
        gestes: [
          'Sur une recette publiée, montrer « Repasser en brouillon ».',
        ],
        voix: 'Vous pouvez à tout moment la repasser en brouillon pour la retirer.',
      },
    ],
    attention: [
      "La publication part en modération réelle : prévenir l'administrateur avant le tournage, puis repasser la recette de test en brouillon.",
    ],
  },
  {
    num: 17,
    cle: 'JEP-319',
    titre: 'Dupliquer une recette pour en faire une variante',
    bloc: B3,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer comment créer une variante sans toucher à la recette d'origine.",
    message: "une copie complète, l'originale reste intacte",
    prerequis: [
      PRE_TARTE,
    ],
    sequences: [
      {
        titre: 'Dupliquer',
        duree: 10,
        gestes: [
          'Sur la fiche, cliquer sur « Dupliquer la recette » ; spinner « Duplication de la recette… ».',
        ],
        voix: "Envie d'une variante ? Depuis la fiche, cliquez sur Dupliquer la recette.",
      },
      {
        titre: 'Modifier la copie',
        duree: 20,
        gestes: [
          "La copie s'ouvre dans l'éditeur : renommer en « Tarte au citron vert ».",
          'Remplacer « citron » par « citron vert » dans un ingrédient, cliquer sur « Enregistrer ».',
          '« Mon carnet » : les deux recettes côte à côte.',
        ],
        voix: "Une copie complète s'ouvre dans l'éditeur. Renommez-la, modifiez ce que vous voulez : l'originale reste intacte.",
      },
    ],
    attention: [
      'Supprimer la copie après tournage.',
    ],
  },
  {
    num: 18,
    cle: 'JEP-320',
    titre: "Mon carnet : s'y retrouver",
    bloc: B3,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Montrer comment naviguer dans son carnet : portées, statuts, recherche, tri, actions.',
    message: 'toutes vos recettes, retrouvées en deux clics',
    prerequis: [
      'Carnet du compte de démonstration bien rempli : recettes publiées, brouillons, une en attente, des favoris, des recettes partagées par un compte de test.',
    ],
    sequences: [
      {
        titre: 'Ouvrir le carnet',
        duree: 5,
        gestes: [
          'Menu « Mon carnet ».',
        ],
        voix: 'Votre carnet rassemble toutes vos recettes.',
      },
      {
        titre: "Choisir ce qu'on regarde",
        duree: 20,
        gestes: [
          'Onglets « Tout », « Mes recettes », « Favoris », « Mes abonnements », « Partagées avec moi ».',
        ],
        voix: "En haut, choisissez ce que vous voulez voir : vos recettes, vos favoris, celles des pâtissiers que vous suivez, ou celles qu'on a partagées avec vous.",
      },
      {
        titre: 'Filtrer par statut',
        duree: 15,
        gestes: [
          '« Mes recettes » → « Statut » : « Publiées », « Brouillons », « En attente », « Refusées ».',
        ],
        voix: 'Sur vos recettes, filtrez par statut : publiées, brouillons, en attente ou refusées.',
      },
      {
        titre: 'Chercher et trier',
        duree: 15,
        gestes: [
          'Taper « creme » (sans accent) dans « Chercher dans mon carnet… » : la recette « Crème… » apparaît.',
          'Changer le tri : « Plus récentes », « Alphabétique », « Mieux notées ».',
        ],
        voix: 'Cherchez un titre, même sans les accents, et triez par date, par ordre alphabétique ou par note.',
      },
      {
        titre: "Les actions d'une carte",
        duree: 10,
        gestes: [
          'Sur une carte, montrer « Lancer une fournée », « Modifier », « Supprimer ».',
        ],
        voix: 'Chaque carte donne accès aux actions principales : lancer une fournée, modifier ou supprimer.',
      },
    ],
    attention: [
      "Ne pas montrer l'onglet « Projets » (mode projet, tutos ultérieurs).",
    ],
  },
  {
    num: 19,
    cle: 'JEP-321',
    titre: 'Partager une recette ou son carnet avec un membre',
    bloc: B3,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer le partage nominatif d'une recette privée et du carnet entier, puis sa révocation.",
    message: 'vos recettes privées, partagées avec qui vous voulez, retirées quand vous voulez',
    prerequis: [
      'Un second compte de test dont le pseudo est connu (jamais un vrai membre).',
      'Une recette privée dans le carnet du compte de démonstration.',
    ],
    sequences: [
      {
        titre: 'Partager une recette',
        duree: 25,
        gestes: [
          'Sur la fiche de la recette privée : « Partager » → fenêtre « Partager cette recette ».',
          '« Partager avec un membre » : chercher le pseudo du compte de test, le choisir.',
          'Montrer la liste « Partagée avec ».',
        ],
        voix: 'Pour partager une recette privée avec un proche, cliquez sur Partager, puis Partager avec un membre. Cherchez son pseudo : la recette apparaît aussitôt dans son carnet, onglet Partagées avec moi.',
      },
      {
        titre: 'Partager tout son carnet',
        duree: 25,
        gestes: [
          '« Mon carnet » → « Partager mon carnet ».',
          'Montrer « Toutes mes recettes privées » et « Inclure mes brouillons ».',
          '« Rechercher un membre » → choisir le compte de test.',
        ],
        voix: "Vous pouvez aussi partager tout votre carnet d'un coup, brouillons compris si vous le souhaitez. Le membre voit alors toutes vos recettes privées.",
      },
      {
        titre: 'Retirer un partage',
        duree: 15,
        gestes: [
          'Dans la fenêtre, « Retirer ce partage ».',
          'Montrer aussi « Réglages du compte » → « Partages de mon carnet » et « Partages de mes recettes ».',
        ],
        voix: 'Un partage se retire à tout moment, depuis la même fenêtre ou depuis vos réglages.',
      },
    ],
    attention: [
      'Retirer tous les partages de test après tournage.',
    ],
  },
  {
    num: 20,
    cle: 'JEP-322',
    titre: 'Partager son carnet par un lien',
    bloc: B3,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Montrer le partage du carnet par lien public, sur les réseaux sociaux, et ce que voit le destinataire.',
    message: 'un lien suffit pour ouvrir votre carnet à vos proches',
    prerequis: [
      'Le second compte de test (tuto 19) pour déverrouiller le carnet dans une fenêtre de navigation privée.',
    ],
    sequences: [
      {
        titre: 'Obtenir le lien',
        duree: 15,
        gestes: [
          '« Mon carnet » → « Partager mon carnet » → « Partager par lien ».',
          "Lire le texte d'explication, cliquer sur « Copier ».",
        ],
        voix: 'Pour partager votre carnet plus largement, utilisez le partage par lien. Seules vos recettes finalisées sont visibles, jamais vos brouillons.',
      },
      {
        titre: "L'envoyer",
        duree: 15,
        gestes: [
          'Ouvrir « Partager via… » : Facebook, Pinterest, WhatsApp, X, e-mail, Instagram.',
          'Toucher Instagram : message « Lien copié : collez-le dans une story Instagram (sticker « Lien ») ou dans votre bio. »',
        ],
        voix: 'Envoyez-le par message, par e-mail ou sur les réseaux sociaux. Pour Instagram, le lien est copié : collez-le dans une story ou dans votre bio.',
      },
      {
        titre: 'Côté destinataire',
        duree: 20,
        gestes: [
          "Fenêtre privée : coller le lien → page « Carnet partagé — Carnet de … » avec l'aperçu.",
          "Cliquer sur « Déverrouiller le carnet » → « J'ai déjà un compte », se connecter avec le compte de test.",
          'Arrivée dans « Mon carnet », onglet « Partagées avec moi ».',
        ],
        voix: 'Votre destinataire découvre un aperçu de votre carnet. Il lui suffit de se connecter, ou de créer un compte gratuit, pour le déverrouiller : il le retrouvera dans son propre carnet.',
      },
      {
        titre: 'Gérer les accès',
        duree: 10,
        gestes: [
          'Revenir sur le compte de démonstration : « Partager mon carnet » → « Déjà partagé avec » → « Retirer ce partage ».',
        ],
        voix: 'Le lien est permanent. Chaque personne ajoutée ainsi peut être retirée, comme pour un partage classique.',
      },
    ],
    attention: [
      "Ne pas publier réellement le lien sur un réseau social : s'arrêter à l'écran de partage.",
    ],
  },
  {
    num: 21,
    cle: 'JEP-323',
    titre: 'Importer une recette par copier-coller',
    bloc: B4,
    plan: 'payant',
    compte: 'payant',
    objectif: "Montrer l'import d'une recette à partir d'un texte collé.",
    message: "collez le texte, l'IA le range en étapes et ingrédients",
    prerequis: [
      "Un texte de recette libre de droits (ou écrit pour l'occasion), copié dans le presse-papiers.",
      "Quota d'import du compte non épuisé.",
    ],
    sequences: [
      {
        titre: "Ouvrir l'import",
        duree: 5,
        gestes: [
          '« Mon carnet » → « Importer ».',
        ],
        voix: 'Pour importer une recette, cliquez sur Importer.',
      },
      {
        titre: 'Coller le texte',
        duree: 20,
        gestes: [
          'Onglet « Texte collé » ; coller dans « Texte de la recette ».',
          'Cliquer sur « Importer ».',
        ],
        voix: "Copiez le texte complet d'une recette, depuis un livre numérique, un e-mail ou un document, et collez-le ici. Cliquez sur Importer : l'intelligence artificielle l'analyse.",
      },
      {
        titre: 'Le résultat',
        duree: 20,
        gestes: [
          "Résultat « Recette importée en brouillon privé » : nombre d'étapes et d'ingrédients.",
          'Montrer « À vérifier à la relecture ».',
        ],
        voix: 'En quelques secondes, la recette est découpée en étapes, avec leurs ingrédients. Elle arrive en brouillon privé, avec les points à vérifier.',
      },
      {
        titre: 'La suite',
        duree: 10,
        gestes: [
          'Montrer « Relire et créer la recette » et la liste « Mes imports ».',
        ],
        voix: "Il ne reste qu'à la relire avant de l'ajouter à votre carnet.",
      },
    ],
    attention: [
      "Couper au montage l'attente de l'analyse (jusqu'à une minute).",
    ],
  },
  {
    num: 22,
    cle: 'JEP-324',
    titre: 'Importer une recette depuis des photos de livre',
    bloc: B4,
    plan: 'payant',
    compte: 'payant',
    objectif: "Montrer l'import par photos des pages d'un livre, et les bons réflexes de prise de vue.",
    message: 'des photos nettes, dans le bon ordre, et la recette se lit toute seule',
    prerequis: [
      "Deux ou trois photos nettes des pages d'une recette (livre personnel, usage interne), transférées sur le poste.",
      "Quota d'import du compte non épuisé.",
    ],
    sequences: [
      {
        titre: 'Choisir Photo',
        duree: 5,
        gestes: [
          '« Importer » → onglet « Photo ».',
        ],
        voix: 'Vous avez la recette dans un livre ? Choisissez Photo.',
      },
      {
        titre: 'Bien photographier',
        duree: 20,
        gestes: [
          'Montrer les photos préparées : page entière, à plat, bonne lumière, sans reflet.',
        ],
        voix: "Photographiez chaque page bien à plat, en entier, avec une bonne lumière et sans reflet. Une photo nette, c'est une recette bien lue.",
      },
      {
        titre: 'Ajouter et ordonner',
        duree: 20,
        gestes: [
          '« Déposez vos photos ou cliquez pour les choisir » : ajouter les photos.',
          'Les réordonner : « Glissez pour réordonner », « Monter », « Descendre » ; montrer « Retirer cette photo ».',
        ],
        voix: "Ajoutez vos photos, puis vérifiez leur ordre : l'intelligence artificielle les lit dans l'ordre de la liste. Glissez-les pour les réordonner.",
      },
      {
        titre: 'Importer et relire',
        duree: 15,
        gestes: [
          "Lancer l'import ; montrer l'avertissement « relisez attentivement les quantités et les températures du brouillon obtenu ».",
        ],
        voix: "Lancez l'import. Relisez ensuite attentivement les quantités et les températures : sur une photo, un chiffre peut être mal lu.",
      },
    ],
    attention: [
      "Couper au montage l'attente de la lecture des photos.",
      "Ne pas montrer d'ouvrage protégé de façon lisible plus longtemps que nécessaire.",
    ],
  },
  {
    num: 23,
    cle: 'JEP-325',
    titre: 'Importer une recette depuis un PDF',
    bloc: B4,
    plan: 'payant',
    compte: 'payant',
    objectif: "Montrer l'import d'un fichier PDF et la récupération de ses photos.",
    message: 'votre PDF est lu dans votre navigateur, ses photos sont récupérées',
    prerequis: [
      "Un PDF de recette illustré (moins de 30 Mo), libre de droits ou créé pour l'occasion.",
      "Quota d'import du compte non épuisé.",
    ],
    sequences: [
      {
        titre: 'Choisir PDF',
        duree: 5,
        gestes: [
          '« Importer » → onglet « PDF ».',
        ],
        voix: "Pour un fichier PDF, choisissez l'onglet PDF.",
      },
      {
        titre: 'Déposer le fichier',
        duree: 20,
        gestes: [
          '« Déposez un PDF ou cliquez pour le choisir » ; montrer « 30 Mo maximum, 40 pages analysées au plus ».',
          "Lancer l'import.",
        ],
        voix: "Déposez votre fichier. Il est lu directement dans votre navigateur : seul son texte est analysé, et les photos qu'il contient sont récupérées.",
      },
      {
        titre: 'Le résultat',
        duree: 15,
        gestes: [
          "Résultat : nombre d'étapes, d'ingrédients et de photos.",
        ],
        voix: 'Les photos sont rattachées aux étapes. Celles qui restent vous attendent à la relecture, prêtes à être placées.',
      },
    ],
  },
  {
    num: 24,
    cle: 'JEP-326',
    titre: 'Relire et corriger un brouillon importé',
    bloc: B4,
    plan: 'payant',
    compte: 'payant',
    objectif: "Montrer l'écran de relecture d'un import, jusqu'à la création de la recette dans le carnet.",
    message: "l'IA propose, vous relisez, la recette entre dans votre carnet",
    prerequis: [
      'Un import récent (tuto 21 ou 23) comportant au moins un ingrédient ou une unité inconnus, et si possible des photos de PDF non rattachées.',
    ],
    sequences: [
      {
        titre: 'Ouvrir la relecture',
        duree: 10,
        gestes: [
          "« Relire et créer la recette », ou « Importer » → « Mes imports » → ouvrir l'import.",
        ],
        voix: "Chaque import passe par une relecture avant d'entrer dans votre carnet.",
      },
      {
        titre: 'Points à vérifier',
        duree: 20,
        gestes: [
          'Montrer « Points à vérifier ».',
          'Dans une étape, comparer « Contenu importé » (gauche) et « Version corrigée » (droite).',
        ],
        voix: "En haut, les points à vérifier signalés par l'intelligence artificielle. Pour chaque étape, le contenu importé reste visible à gauche, et vous corrigez à droite.",
      },
      {
        titre: 'Corriger',
        duree: 25,
        gestes: [
          "Repérer un ingrédient signalé « Ingrédient absent de la table de référence » ou « Unité manquante ou absente de la table de référence » ; choisir l'unité.",
          'Si import PDF : glisser une photo de « Photos extraites du PDF » sur une étape.',
        ],
        voix: "Les ingrédients ou unités inconnus sont signalés : choisissez la bonne unité, sans quoi les ajustements de quantités ne fonctionneront pas. Si l'import vient d'un PDF, glissez les photos restantes sur les bonnes étapes.",
      },
      {
        titre: 'Créer la recette',
        duree: 20,
        gestes: [
          '« Enregistrer les corrections », puis « Créer la recette dans mon carnet ».',
          'Cliquer sur « Voir la recette créée » : brouillon privé dans le carnet.',
        ],
        voix: 'Enregistrez vos corrections à tout moment. Une fois tout relu, créez la recette : elle arrive en brouillon privé dans votre carnet.',
      },
      {
        titre: 'Conservation des imports',
        duree: 10,
        gestes: [
          'Revenir à « Mes imports » : montrer la mention de conservation et « Supprimer cet import ».',
        ],
        voix: 'Un import non relu est conservé un temps limité, puis supprimé automatiquement.',
      },
    ],
  },
  {
    num: 25,
    cle: 'JEP-327',
    titre: 'Adapter une recette à un autre moule',
    bloc: B5,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer l'ajustement des quantités à un autre moule au lancement d'une fournée.",
    message: 'changez de moule, les proportions suivent',
    prerequis: [
      "La recette « Tarte au citron meringuée » saisie au tuto 13, présente dans le carnet du compte de démonstration. Mesurée au moule (cercle 22 cm) avec les modes d'ajustement réglés (tutos 14 et 15).",
      NOTE_FOURNEE,
    ],
    sequences: [
      {
        titre: 'Lancer une fournée',
        duree: 10,
        gestes: [
          "Fiche de la tarte → « Lancer une fournée » : le panneau « Lancer une fournée » s'ouvre.",
        ],
        voix: 'Votre recette est prévue pour un moule de vingt-deux centimètres, et le vôtre est différent ? Lancez une fournée.',
      },
      {
        titre: 'Choisir le moule visé',
        duree: 25,
        gestes: [
          '« Ajuster par moule » ; « Nombre » 1 ; garder « Moule de la recette — … » ou choisir un cadre.',
          'Saisir les dimensions visées (cercle 26 cm).',
        ],
        voix: 'Choisissez Ajuster par moule. Indiquez le nombre de moules, leur forme et leurs dimensions : un cercle plus grand, un cadre rectangulaire, ou plusieurs petits moules individuels.',
      },
      {
        titre: 'Valider et vérifier',
        duree: 20,
        gestes: [
          'Lire la mention « pâte et glaçage selon la surface, appareil selon le volume ».',
          "« Valider » → la fournée s'ouvre ; déplier « Ingrédients ajustés » : « Quantité ajustée » et « Quantité d'origine ».",
        ],
        voix: 'Les quantités sont recalculées étape par étape : la pâte et le glaçage suivent la surface, les crèmes suivent le volume. Validez, et retrouvez les quantités ajustées dans votre fournée.',
      },
      {
        titre: 'La date de dégustation',
        duree: 10,
        gestes: [
          'Revenir sur le champ « Date de dégustation » (vue au moment du lancement).',
        ],
        voix: 'La date de dégustation organise ensuite votre planning : on y revient dans le tuto sur les fournées.',
      },
    ],
    attention: [
      SUPPR_FOURNEE,
    ],
  },
  {
    num: 26,
    cle: 'JEP-328',
    titre: 'Adapter une recette à une quantité à produire',
    bloc: B5,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer l'ajustement d'une recette en portions à un autre nombre de parts.",
    message: 'huit parts prévues, douze invités : la recette suit',
    prerequis: [
      'Une recette mesurée en portions (8 « Pers. »).',
      NOTE_FOURNEE,
    ],
    sequences: [
      {
        titre: 'Le besoin',
        duree: 10,
        gestes: [
          'Fiche de la recette (8 personnes) → « Lancer une fournée ».',
        ],
        voix: 'Votre recette est prévue pour huit personnes, et vous en recevez douze ?',
      },
      {
        titre: 'Ajuster',
        duree: 20,
        gestes: [
          '« Ajuster par quantité produite » ; « Quantité à produire » = 12 ; « Valider ».',
        ],
        voix: "Choisissez Ajuster par quantité produite, et indiquez douze. Toutes les quantités sont recalculées, sauf celles que l'auteur a voulues fixes.",
      },
      {
        titre: 'Le résultat',
        duree: 10,
        gestes: [
          "Dans la fournée, « Ingrédients ajustés » : colonnes « Coef. », « Quantité ajustée », « Quantité d'origine ».",
        ],
        voix: "Chaque ingrédient affiche sa quantité ajustée, à côté de la quantité d'origine.",
      },
    ],
    attention: [
      SUPPR_FOURNEE,
    ],
  },
  {
    num: 27,
    cle: 'JEP-329',
    titre: "Ajuster selon la quantité disponible d'un ingrédient",
    bloc: B5,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer comment recalculer toute la recette à partir de la quantité restante d'un ingrédient.",
    message: "dites ce qu'il vous reste, la recette s'adapte",
    prerequis: [
      "Une recette mesurée en portions ou en quantité, qui utilise des œufs (l'option n'existe pas pour une recette mesurée au moule).",
      NOTE_FOURNEE,
    ],
    sequences: [
      {
        titre: 'Le besoin',
        duree: 10,
        gestes: [
          'Fiche de la recette → « Lancer une fournée ».',
        ],
        voix: "Il ne vous reste que trois œufs ? Pas besoin de calculer : la recette s'adapte à ce que vous avez.",
      },
      {
        titre: 'Ajuster',
        duree: 20,
        gestes: [
          "« Ajuster par quantité d'un ingrédient » ; « Ingrédient » = Œuf ; « Quantité disponible » = 3 ; « Valider ».",
        ],
        voix: "Choisissez Ajuster par quantité d'un ingrédient, sélectionnez l'œuf, et indiquez combien il vous en reste. Toute la recette est recalculée à partir de cette quantité.",
      },
      {
        titre: 'Le résultat',
        duree: 10,
        gestes: [
          'Montrer les quantités ajustées dans la fournée.',
        ],
        voix: 'Les autres ingrédients suivent, dans les bonnes proportions.',
      },
    ],
    attention: [
      SUPPR_FOURNEE,
    ],
  },
  {
    num: 28,
    cle: 'JEP-330',
    titre: 'Ajuster une recette par IA, en texte libre',
    bloc: B5,
    plan: 'payant',
    compte: 'payant',
    objectif: "Montrer l'ajustement des quantités décrit en langage courant, calculé par l'IA.",
    message: "décrivez votre besoin en une phrase, l'IA calcule le coefficient",
    prerequis: [
      PRE_TARTE,
      "Quota d'ajustements par IA du compte non épuisé.",
      NOTE_FOURNEE,
    ],
    sequences: [
      {
        titre: "Choisir l'IA",
        duree: 10,
        gestes: [
          '« Lancer une fournée » → « Ajuster les quantités par IA ».',
        ],
        voix: 'Pour un cas plus particulier, décrivez simplement ce que vous voulez.',
      },
      {
        titre: 'Décrire le besoin',
        duree: 20,
        gestes: [
          "« Décrivez l'ajustement souhaité » : « 3 tartelettes de 10 cm au lieu d'une tarte de 22 cm ».",
          "« Calculer le coefficient avec l'IA » : lire l'explication.",
        ],
        voix: "Écrivez par exemple : trois tartelettes de dix centimètres au lieu d'une grande tarte. L'intelligence artificielle calcule le coefficient à appliquer, et explique son raisonnement.",
      },
      {
        titre: 'Valider',
        duree: 15,
        gestes: [
          "« Coefficient proposé » : montrer qu'il est modifiable (« Vous pouvez l'ajuster avant de valider. ») ; « Valider ».",
        ],
        voix: "Vous pouvez corriger le coefficient avant de valider. Le nombre d'ajustements par intelligence artificielle dépend de votre formule.",
      },
    ],
    attention: [
      SUPPR_FOURNEE,
      "Couper au montage l'attente du calcul.",
    ],
  },
  {
    num: 29,
    cle: 'JEP-331',
    titre: "Qu'est-ce qu'une fournée ? Créer sa première fournée",
    bloc: B6,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Expliquer la notion de fournée et montrer sa création depuis une fiche recette.',
    message: "une fournée, c'est votre recette adaptée à une occasion, sans jamais toucher l'originale",
    prerequis: [
      'La recette « Tarte au citron meringuée » (tutos 13 à 15) avec une étape à préparer la veille.',
    ],
    sequences: [
      {
        titre: 'Le principe',
        duree: 15,
        gestes: [
          'Plan sur la fiche de la tarte.',
        ],
        voix: "Une fournée, c'est votre recette adaptée à une occasion précise : votre moule, votre date, vos ajustements. La recette d'origine, elle, ne change jamais.",
      },
      {
        titre: 'Lancer la fournée',
        duree: 20,
        gestes: [
          'Cliquer sur « Lancer une fournée ».',
          "« Date de dégustation » : dans 2 jours ; pas d'ajustement ; « Commentaire » : « Anniversaire de Léa ».",
          '« Valider » : spinner « Enregistrement de la fournée… ».',
        ],
        voix: 'Depuis la fiche, cliquez sur Lancer une fournée. Choisissez la date de dégustation, ajustez les quantités si besoin, ajoutez une note, puis validez.',
      },
      {
        titre: 'La page de la fournée',
        duree: 20,
        gestes: [
          "La fournée s'ouvre : boutons « Préparer » / « Pâtisser », « Planning de préparation » daté.",
          'Menu « En cuisine » : la fournée dans « Fournées en cours ».',
        ],
        voix: 'Votre fournée a sa propre page. Le planning est calé sur votre date : vous savez quoi faire, et quel jour. Retrouvez toutes vos fournées dans En cuisine.',
      },
    ],
    attention: [
      'Garder cette fournée : elle sert aux tutos 30 à 35.',
    ],
  },
  {
    num: 30,
    cle: 'JEP-332',
    titre: 'Mode Préparer : organiser sa fournée',
    bloc: B6,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Montrer comment répartir les étapes sur les jours, ajouter des notes et utiliser la vue par jour.',
    message: 'organisez votre fournée à votre rythme, sans perdre la recette de vue',
    prerequis: [
      PRE_FOURNEE,
      FORMULE,
    ],
    sequences: [
      {
        titre: 'Le mode Préparer',
        duree: 10,
        gestes: [
          'Ouvrir la fournée → « Préparer » ; montrer la légende « en vert / barré en rouge / barré en gris ».',
        ],
        voix: 'Le mode Préparer sert à organiser votre fournée avant de vous lancer.',
      },
      {
        titre: 'Déplacer une étape',
        duree: 25,
        gestes: [
          'Sur une étape : « Déplacer cette étape à un autre jour » → choisir J − 2.',
          "Montrer « recette : … » (jour d'origine) puis « Rétablir le jour de la recette ».",
        ],
        voix: "Une étape tombe un jour où vous n'êtes pas disponible ? Déplacez-la à un autre jour. Le jour prévu par la recette reste affiché, et vous pouvez le rétablir à tout moment.",
      },
      {
        titre: 'Notes personnelles',
        duree: 20,
        gestes: [
          '« Ma note » de la fournée → « Ajouter une note » → « Sortir le cercle de 22 » → « Enregistrer ».',
          'Sur une étape : « Ajouter une note à cette étape ».',
        ],
        voix: 'Ajoutez vos notes personnelles : sur la fournée entière, ou sur une étape précise. Matériel à sortir, invités, adaptation : tout ce que vous voulez retenir.',
      },
      {
        titre: 'La vue par jour',
        duree: 15,
        gestes: [
          'Menu « En cuisine » → « Par jour » : étapes de toutes les fournées, jour par jour ; montrer « Marquer comme faite ».',
        ],
        voix: 'Dans En cuisine, la vue par jour regroupe les étapes de toutes vos fournées, journée par journée.',
      },
    ],
  },
  {
    num: 31,
    cle: 'JEP-333',
    titre: "Modifier les ingrédients d'une fournée",
    bloc: B6,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Montrer comment modifier, retirer ou ajouter un ingrédient dans une fournée sans toucher à la recette.',
    message: 'dans une fournée, les ingrédients sont à vous',
    prerequis: [
      PRE_FOURNEE,
    ],
    sequences: [
      {
        titre: 'Ouvrir les ingrédients',
        duree: 10,
        gestes: [
          'Fournée, mode « Préparer » → déplier « Ingrédients ajustés ».',
        ],
        voix: "Dans une fournée, les ingrédients vous appartiennent : modifiez-les sans toucher à la recette d'origine.",
      },
      {
        titre: 'Changer une quantité',
        duree: 20,
        gestes: [
          'Sur le sucre : « Modifier la quantité ou le coefficient » → nouvelle quantité → « OK ».',
          "Montrer « Quantité d'origine » à côté.",
        ],
        voix: "Changez une quantité ou un coefficient, ingrédient par ingrédient. La quantité d'origine reste affichée pour comparaison.",
      },
      {
        titre: 'Retirer, ajouter',
        duree: 20,
        gestes: [
          "« Supprimer (barrer) l'ingrédient » sur le zeste : barré en rouge ; puis « Rétablir l'ingrédient ».",
          '« Ajouter un ingrédient » : « Basilic », 5 g → « Ajouter » : la ligne est en vert.',
        ],
        voix: "Retirez un ingrédient : il reste visible, barré, et se rétablit d'un clic. Ajoutez-en un autre : il apparaît en vert, pour distinguer ce qui vient de vous.",
      },
      {
        titre: 'Effet sur la suite',
        duree: 10,
        gestes: [
          'Montrer la « Liste totale des ingrédients » mise à jour.',
        ],
        voix: 'La liste de courses et le déroulé suivent automatiquement.',
      },
    ],
  },
  {
    num: 32,
    cle: 'JEP-334',
    titre: 'Marquer une étape déjà réalisée',
    bloc: B6,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer comment signaler une étape faite à l'avance, et garder une exception ligne par ligne.",
    message: 'ce qui est déjà fait sort des courses, ce qui sert encore reste',
    prerequis: [
      "Une fournée en cours (statut planifiée) de la « Tarte au citron meringuée », date de dégustation dans 2 jours, avec une étape à J − 1. L'étape « Pâte sucrée » doit avoir un œuf (dorure) et une sous-étape de cuisson.",
    ],
    sequences: [
      {
        titre: 'Le besoin',
        duree: 15,
        gestes: [
          "Plan sur l'étape « Pâte sucrée » en mode « Préparer ».",
        ],
        voix: 'Votre pâte sucrée est déjà au congélateur ? Signalez-le : ses ingrédients sortiront des courses et de la mise en place.',
      },
      {
        titre: "Cocher l'étape",
        duree: 20,
        gestes: [
          "Cocher « Réalisée partiellement ou complètement » : l'étape est barrée en gris, ses ingrédients aussi.",
        ],
        voix: "En mode Préparer, cochez Réalisée sur l'étape concernée. Elle reste dans le déroulé, barrée, pour garder une vue d'ensemble.",
      },
      {
        titre: 'Garder une exception',
        duree: 20,
        gestes: [
          "Décocher l'œuf : « Conservé malgré l'étape déjà réalisée ».",
          "Décocher la sous-étape de cuisson : « Conservée malgré l'étape déjà réalisée ».",
        ],
        voix: "Un élément sert encore plus tard, comme l'œuf de la dorure ou la cuisson ? Décochez-le : il reste dans vos courses et dans le déroulé.",
      },
      {
        titre: 'Annuler',
        duree: 5,
        gestes: [
          "Décocher l'étape : tout revient.",
        ],
        voix: "Une erreur ? Décochez simplement l'étape.",
      },
    ],
  },
  {
    num: 33,
    cle: 'JEP-335',
    titre: 'Remplacer un ingrédient par une recette',
    bloc: B6,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer comment fabriquer soi-même un ingrédient prévu acheté : ses étapes s'insèrent dans la fournée.",
    message: 'le praliné acheté devient du praliné maison, sans rien recalculer',
    prerequis: [
      "Une fournée d'une recette utilisant du « Praliné » dans deux étapes.",
      'Une recette de praliné publique (ou dans le carnet), avec un rendement chiffré.',
      FORMULE,
    ],
    sequences: [
      {
        titre: 'Le besoin',
        duree: 10,
        gestes: [
          'Plan sur la fournée, ligne « Praliné ».',
        ],
        voix: 'Votre recette demande du praliné acheté, mais vous préférez le faire vous-même ?',
      },
      {
        titre: 'Ouvrir le remplacement',
        duree: 20,
        gestes: [
          '« Liste totale des ingrédients » → picto « Remplacer cet ingrédient par une recette ».',
          'Fenêtre « Remplacer par une recette » : montrer « Utilisé dans 2 étapes ».',
        ],
        voix: "Dans la liste des ingrédients de la fournée, touchez le picto de remplacement à côté du praliné. Toutes les étapes qui l'utilisent sont prises en compte d'un coup.",
      },
      {
        titre: 'Choisir la recette',
        duree: 20,
        gestes: [
          '« Chercher une recette » : « praliné noisette », choisir la recette.',
          'Montrer « Quantité à produire » proposée et « Coefficient ».',
        ],
        voix: 'Cherchez une recette de praliné, dans votre carnet ou celles de la communauté. La quantité à produire est proposée automatiquement : ajustez-la si besoin.',
      },
      {
        titre: 'Placer les étapes',
        duree: 20,
        gestes: [
          '« Où insérer les étapes » : « Position » et « Jour » proposés.',
          'Cliquer sur « Insérer les étapes ».',
        ],
        voix: "Les étapes du praliné s'insèrent juste avant celle qui l'utilise, au bon jour : une nuit de repos les avance d'un jour. Vous pouvez choisir une autre position.",
      },
      {
        titre: 'Le résultat',
        duree: 15,
        gestes: [
          'Étapes en vert « Ajouté — sous-recette » ; ligne praliné barrée « Fabriqué à partir de … ».',
          'Montrer « Annuler le remplacement et retirer les étapes ajoutées ».',
        ],
        voix: "Les nouvelles étapes apparaissent en vert, leurs ingrédients rejoignent vos courses, et le praliné acheté en sort. Tout s'annule d'un clic.",
      },
      {
        titre: 'Et pour une étape',
        duree: 5,
        gestes: [
          'Survoler « Remplacer cette étape par une recette » sur une étape.',
        ],
        voix: 'Une étape entière se remplace de la même façon.',
      },
    ],
    attention: [
      'Annuler le remplacement après tournage si la fournée resservira.',
    ],
  },
  {
    num: 34,
    cle: 'JEP-336',
    titre: 'Mode Pâtisser : cuisiner pas à pas',
    bloc: B6,
    plan: 'gratuit',
    compte: 'demo',
    mobile: true,
    objectif: 'Montrer le guidage pas à pas le jour J et la saisie de ce qui a réellement été fait.',
    message: "cochez au fil de l'eau, notez ce qui s'est passé : la prochaine sera encore meilleure",
    prerequis: [
      PRE_FOURNEE,
      "Tournage sur téléphone posé en cuisine : c'est l'usage réel.",
    ],
    sequences: [
      {
        titre: 'Passer en mode Pâtisser',
        duree: 10,
        gestes: [
          'Fournée → « Pâtisser ».',
        ],
        voix: 'Le jour venu, passez en mode Pâtisser : la fournée vous guide pas à pas.',
      },
      {
        titre: 'Le déroulé du jour',
        duree: 20,
        gestes: [
          'Montrer les jours « Jour J − 1 », « Jour J », « À démarrer vers … », la barre « Progression », « Dans les temps ».',
        ],
        voix: "Les étapes sont regroupées par jour, avec l'heure à laquelle commencer. Une barre de progression vous indique si vous êtes dans les temps.",
      },
      {
        titre: 'Cocher et noter',
        duree: 25,
        gestes: [
          "Toucher l'en-tête d'une étape pour la déplier ; cocher les ingrédients.",
          'Champ « réel » du sucre : 95 g au lieu de 90.',
          'Champ « note (ex : trop sec, viser +10 g) » : « un peu liquide » → le champ passe en vert.',
        ],
        voix: "Dépliez une étape et cochez les ingrédients au fur et à mesure. Vous avez mis un peu plus de sucre ? Notez la quantité réelle. Une remarque ? Écrivez-la : elle s'affiche en vert.",
      },
      {
        titre: "Terminer l'étape",
        duree: 20,
        gestes: [
          "Cocher l'étape : elle se replie.",
          "Champ « Ce qui s'est passé sur cette étape (sauvegardé automatiquement)… ».",
        ],
        voix: "Cochez l'étape quand elle est terminée : elle se replie. Notez ce qui s'est passé, c'est enregistré automatiquement.",
      },
      {
        titre: 'Le résumé',
        duree: 15,
        gestes: [
          "« Résumé de la fournée » : « Durée totale », « Étapes réalisées », « Respect des jalons », « Ajustements d'ingrédients » ; « Commentaire global ».",
        ],
        voix: 'À la fin, le résumé compare ce qui était prévu à ce que vous avez réellement fait. Idéal pour réussir encore mieux la prochaine fois.',
      },
    ],
  },
  {
    num: 35,
    cle: 'JEP-337',
    titre: 'Terminer, abandonner ou reprendre une fournée',
    bloc: B6,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer la clôture d'une fournée, l'abandon, et la reprise d'une fournée close.",
    message: 'une fournée close est protégée, et se rouvre si besoin',
    prerequis: [
      PRE_FOURNEE,
      'Une seconde fournée de test à abandonner.',
    ],
    sequences: [
      {
        titre: 'Terminer',
        duree: 15,
        gestes: [
          'Mode « Préparer » → « Marquer comme terminé ».',
          '« En cuisine » : la fournée passe dans « Fournées terminées ».',
        ],
        voix: 'Quand tout est fini, marquez la fournée comme terminée. Elle rejoint vos fournées terminées, dans En cuisine.',
      },
      {
        titre: 'Abandonner',
        duree: 10,
        gestes: [
          'Seconde fournée, mode « Pâtisser » → « Annuler ma fournée ».',
        ],
        voix: 'Un imprévu ? Annulez la fournée : elle est conservée comme abandonnée.',
      },
      {
        titre: 'Reprendre',
        duree: 20,
        gestes: [
          'Ouvrir la fournée terminée : bandeau « Cette fournée est terminée : ses étapes, ses quantités et ses notes ne sont plus modifiables. »',
          'Cliquer sur « Reprendre cette fournée » et lire la confirmation.',
        ],
        voix: 'Une fournée close est verrouillée. Pour la corriger, cliquez sur Reprendre cette fournée. Attention : pour une fournée terminée, sa durée totale est alors effacée.',
      },
    ],
    attention: [
      'Reclore la fournée de démonstration après tournage (elle sert aux tutos 36 et 38).',
    ],
  },
  {
    num: 36,
    cle: 'JEP-338',
    titre: 'Refaire une fournée',
    bloc: B6,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Montrer comment relancer une fournée réussie en reprenant tous ses ajustements.',
    message: 'une fournée réussie se refait en un clic, ajustements compris',
    prerequis: [
      'Une fournée terminée avec des ajustements visibles (ingrédient ajouté, étape déplacée, note).',
    ],
    sequences: [
      {
        titre: 'Refaire',
        duree: 15,
        gestes: [
          '« En cuisine » → sur la fournée, « Refaire cette fournée ».',
          'Saisir la nouvelle « Date de dégustation » demandée (AAAA-MM-JJ).',
        ],
        voix: 'Votre fournée était réussie ? Refaites-la : tous vos ajustements, ingrédients et notes sont repris.',
      },
      {
        titre: 'La nouvelle fournée',
        duree: 15,
        gestes: [
          "La nouvelle fournée s'ouvre : ajustements et notes présents, aucune case cochée.",
        ],
        voix: "Seul l'avancement repart de zéro. Et cela fonctionne même si la recette d'origine a disparu depuis.",
      },
    ],
    attention: [
      'Supprimer la fournée recréée après tournage.',
    ],
  },
  {
    num: 37,
    cle: 'JEP-339',
    titre: 'En cuisine : retrouver ses fournées',
    bloc: B6,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Faire le tour de l'écran « En cuisine ».",
    message: 'toutes vos fournées et vos listes de courses au même endroit',
    prerequis: [
      'Au moins deux fournées en cours, une terminée et une liste de courses active.',
    ],
    sequences: [
      {
        titre: 'Ouvrir En cuisine',
        duree: 5,
        gestes: [
          'Menu « En cuisine ».',
        ],
        voix: 'Toutes vos fournées sont dans En cuisine.',
      },
      {
        titre: 'Fournées en cours',
        duree: 20,
        gestes: [
          '« Fournées en cours » : basculer « Par fournée » / « Par jour ».',
          "Montrer les boutons « Préparer » et « Pâtisser » d'une fournée.",
        ],
        voix: 'Retrouvez vos fournées en cours, par fournée ou jour par jour. Un clic vous emmène en mode Préparer ou Pâtisser.',
      },
      {
        titre: 'Terminées et courses',
        duree: 10,
        gestes: [
          'Descendre : « Fournées terminées », « Listes de courses ».',
        ],
        voix: 'Plus bas, vos fournées terminées et vos listes de courses.',
      },
      {
        titre: "Sur l'accueil",
        duree: 5,
        gestes: [
          'Accueil : carrousel « Fournées en cours ».',
        ],
        voix: "Elles s'affichent aussi sur votre accueil.",
      },
    ],
  },
  {
    num: 38,
    cle: 'JEP-340',
    titre: 'Donner son avis sur une recette',
    bloc: B6,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Montrer comment noter et commenter une recette après une fournée terminée.',
    message: "votre avis aide l'auteur et les futurs pâtissiers",
    prerequis: [
      "Une fournée terminée d'une recette publique d'un compte de test, sans avis déjà déposé par le compte de démonstration.",
    ],
    sequences: [
      {
        titre: "La carte d'avis",
        duree: 10,
        gestes: [
          'Ouvrir la fournée terminée : carte « Votre avis sur cette recette ».',
        ],
        voix: 'Une fois votre fournée terminée, donnez votre avis sur la recette.',
      },
      {
        titre: 'Noter et commenter',
        duree: 20,
        gestes: [
          "Choisir 2 étoiles : le champ devient « Dites-nous ce qui n'a pas fonctionné… » (obligatoire).",
          'Repasser à 4 étoiles : « Un commentaire à ajouter ? (facultatif) » ; ajouter une photo.',
        ],
        voix: "Choisissez une note. En dessous de trois étoiles, expliquez ce qui n'a pas fonctionné : c'est précieux pour l'auteur. Vous pouvez ajouter des photos.",
      },
      {
        titre: 'Envoyer',
        duree: 15,
        gestes: [
          'Envoyer : « Merci ! Votre avis a été transmis à la modération… ».',
          'Montrer « Ne plus afficher pour cette fournée » sur une autre fournée.',
        ],
        voix: 'Votre avis est relu avant publication, puis apparaît sur la fiche. Un seul avis par recette : il vaut pour toutes vos fournées.',
      },
    ],
    attention: [
      "L'avis part en modération réelle : prévenir l'administrateur, puis le faire supprimer après tournage.",
    ],
  },
  {
    num: 39,
    cle: 'JEP-341',
    titre: 'Générer une liste de courses',
    bloc: B7,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer la création d'une liste de courses depuis une recette et depuis une fournée.",
    message: 'la liste de courses se fait toute seule',
    prerequis: [
      PRE_FOURNEE,
    ],
    sequences: [
      {
        titre: 'Depuis une recette',
        duree: 15,
        gestes: [
          'Fiche recette → déplier « Ajouter à une liste de courses ».',
          '« Liste de courses » → « ➕ Nouvelle liste… » → « Nom de la nouvelle liste » : « Week-end » → « Valider ».',
        ],
        voix: 'Depuis une recette, ouvrez Ajouter à une liste de courses. Créez une nouvelle liste ou complétez une liste existante.',
      },
      {
        titre: 'Depuis une fournée',
        duree: 15,
        gestes: [
          'Fournée → section « Liste de courses » : ajouter à la liste « Week-end ».',
        ],
        voix: "Depuis une fournée, c'est encore mieux : la liste tient compte de vos ajustements, et des étapes déjà réalisées.",
      },
      {
        titre: 'Retrouver ses listes',
        duree: 10,
        gestes: [
          '« En cuisine » → « Listes de courses » → ouvrir « Week-end ».',
        ],
        voix: 'Vos listes vous attendent dans En cuisine.',
      },
    ],
  },
  {
    num: 40,
    cle: 'JEP-342',
    titre: 'Gérer sa liste de courses',
    bloc: B7,
    plan: 'gratuit',
    compte: 'demo',
    mobile: true,
    objectif: "Montrer l'usage de la liste en magasin : cocher, masquer, ajouter et modifier un article.",
    message: 'cochez en magasin, ajoutez ce qui manque',
    prerequis: [
      'La liste « Week-end » (tuto 39).',
    ],
    sequences: [
      {
        titre: 'Cocher',
        duree: 15,
        gestes: [
          'Cocher trois articles ; « Masquer les cochés ».',
        ],
        voix: 'En magasin, cochez les articles au fur et à mesure. Masquez les articles cochés pour ne voir que ce qui reste.',
      },
      {
        titre: 'Ajouter à la main',
        duree: 20,
        gestes: [
          '« Ajouter » : Ingrédient « ex : Beurre », Quantité, « Unité * », Commentaire.',
          'Cliquer sans unité : la liste des unités est cerclée de rouge ; choisir « g » et valider.',
        ],
        voix: "Ajoutez un article à la main : nom, quantité et unité. L'unité est obligatoire : c'est elle qui permet de regrouper les articles identiques.",
      },
      {
        titre: 'Modifier',
        duree: 10,
        gestes: [
          '« Modifier cet article » → changer la quantité → « OK ».',
        ],
        voix: "Chaque article se modifie d'un clic.",
      },
    ],
  },
  {
    num: 41,
    cle: 'JEP-343',
    titre: 'Fusion des articles de la liste de courses',
    bloc: B7,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer la fusion automatique avec conversion d'unités, la fusion manuelle et la fusion de deux listes.",
    message: 'un même ingrédient, une seule ligne, même dans deux unités différentes',
    prerequis: [
      "Une liste contenant « Jaune d'œuf 200 g », et une seconde liste quelconque.",
      FORMULE,
    ],
    sequences: [
      {
        titre: 'Fusion automatique',
        duree: 20,
        gestes: [
          "« Ajouter » : « Jaune d'œuf », 5, « unité(s) » → la ligne existante passe à 300 g.",
        ],
        voix: "Ajoutez un ingrédient déjà présent dans votre liste : il le rejoint automatiquement, même dans une autre unité. Cinq jaunes d'œuf s'ajoutent ainsi aux deux cents grammes.",
      },
      {
        titre: 'Un commentaire différent',
        duree: 15,
        gestes: [
          "Ajouter « Jaune d'œuf », 2 unité(s), commentaire « température ambiante » : nouvelle ligne.",
        ],
        voix: 'Seule exception : un commentaire différent, comme à température ambiante, garde sa propre ligne.',
      },
      {
        titre: 'Fusion manuelle',
        duree: 15,
        gestes: [
          "« Fusionner avec un autre article » → « Fusionner avec » : choisir la ligne, lire l'aperçu.",
          '« Commentaire de la ligne fusionnée » : garder les deux → « Fusionner ».',
        ],
        voix: 'Pour réunir deux lignes vous-même, utilisez Fusionner : un aperçu montre le total avant de valider, et vous choisissez quel commentaire garder.',
      },
      {
        titre: 'Fusionner deux listes',
        duree: 10,
        gestes: [
          '« En cuisine » → « Fusionner avec une autre liste ».',
        ],
        voix: 'Deux listes entières peuvent aussi être fusionnées, depuis En cuisine.',
      },
    ],
  },
  {
    num: 48,
    cle: 'JEP-344',
    titre: 'La boîte à idées',
    bloc: B9,
    plan: 'gratuit',
    compte: 'demo',
    objectif: 'Montrer comment voter pour une idée et en proposer une nouvelle sans créer de doublon.',
    message: 'vos idées et vos votes guident les prochains développements',
    prerequis: [
      'Plusieurs idées existantes sur dev, dont une proche de celle qui sera saisie.',
    ],
    sequences: [
      {
        titre: 'Ouvrir la boîte à idées',
        duree: 5,
        gestes: [
          'Menu « Mon compte » → « Boîte à idées ».',
        ],
        voix: 'Une idée pour améliorer le site ?',
      },
      {
        titre: 'Voter',
        duree: 15,
        gestes: [
          "« Trier par » : « Plus votées » / « Plus récentes » ; montrer les statuts (« Nouveau », « À l'étude », « En développement », « Terminé »).",
          '« Voter pour cette idée ».',
        ],
        voix: 'Parcourez les idées des membres et votez pour celles qui comptent pour vous : ce sont elles qui guident les prochains développements.',
      },
      {
        titre: 'Proposer une idée',
        duree: 25,
        gestes: [
          "« Proposer une idée » → « Titre » : saisir une idée proche d'une existante → « Des idées proches existent déjà — un vote suffit peut-être : ».",
          "« Description » (facultatif) → « Publier l'idée » ; montrer « L'IA a repéré des idées au sens proche… » et « Publier quand même ».",
        ],
        voix: "Pour proposer la vôtre, donnez-lui un titre court. Pendant la saisie, les idées proches s'affichent : si elle existe déjà, un vote suffit. À la publication, une dernière vérification repère les idées formulées autrement.",
      },
      {
        titre: 'Suivre son idée',
        duree: 10,
        gestes: [
          'Montrer une idée avec son statut.',
        ],
        voix: 'Vous êtes prévenu à chaque évolution de son statut.',
      },
    ],
    attention: [
      "Ne publier qu'une idée réelle et utile, ou demander à l'administrateur de la supprimer ensuite (limite de 5 idées par 24 h).",
    ],
  },
  {
    num: 49,
    cle: 'JEP-345',
    titre: 'Nous contacter et suivre sa demande',
    bloc: B9,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Montrer le formulaire de contact et le suivi d'une demande depuis les réglages.",
    message: 'une question, un problème : écrivez-nous, et suivez la réponse',
    prerequis: [
      'Une demande de contact déjà traitée (avec une réponse) sur le compte de démonstration, pour la séquence 4.',
    ],
    sequences: [
      {
        titre: 'Ouvrir Contact',
        duree: 5,
        gestes: [
          'Pied de page → « Contact ».',
        ],
        voix: "Besoin d'aide ? Écrivez-nous depuis la page Contact.",
      },
      {
        titre: 'Remplir la demande',
        duree: 25,
        gestes: [
          "« Quel est l'objet de votre demande ? » : montrer « Signaler un problème », « Suggestion », « Question », « Mes données personnelles » ; choisir « Question ».",
          '« Objet », « Votre message », « Ajouter une photo » → « Envoyer ma demande ».',
        ],
        voix: "Choisissez l'objet de votre demande : un problème, une suggestion, une question, ou vos données personnelles. Décrivez-la, ajoutez une capture d'écran si besoin, et envoyez.",
      },
      {
        titre: 'La confirmation',
        duree: 10,
        gestes: [
          '« Votre demande a bien été envoyée », « Référence : … », lien « Suivre son avancement dans mes réglages → ».',
        ],
        voix: 'Une référence vous est donnée, et vous pouvez suivre son avancement.',
      },
      {
        titre: 'Le suivi',
        duree: 15,
        gestes: [
          '« Réglages du compte » → « Mes demandes de contact » → ouvrir la demande traitée : « Échanges », « Avancement », « Ajouter un message à cette demande ».',
        ],
        voix: "Dans vos réglages, retrouvez chaque demande, les réponses de l'équipe, et ajoutez un message si besoin.",
      },
    ],
    attention: [
      "Choisir le type « Question », objet « Test tuto vidéo » : un « Signaler un problème » créerait un vrai ticket Jira. Prévenir l'administrateur.",
    ],
  },
  {
    num: 50,
    cle: 'JEP-346',
    titre: 'Le blog',
    bloc: B9,
    plan: 'gratuit',
    compte: 'visiteur',
    objectif: 'Présenter le blog et ses articles.',
    message: 'des articles pour progresser en pâtisserie et maîtriser le site',
    prerequis: [
      'Au moins trois articles publiés sur dev, dont un avec sommaire.',
    ],
    sequences: [
      {
        titre: 'La liste des articles',
        duree: 15,
        gestes: [
          'Menu « Le blog » : « À LA UNE », filtres de catégorie (« Tous »…), « Chercher un article… ».',
        ],
        voix: "Le blog réunit des articles sur la technique, les ingrédients, et des modes d'emploi du site.",
      },
      {
        titre: 'Lire et partager',
        duree: 15,
        gestes: [
          'Ouvrir un article : « Sommaire », « min de lecture », « À lire ensuite », bouton de partage.',
        ],
        voix: 'Chaque article a son sommaire et des suggestions de lecture. Partagez-le en un clic avec vos amis pâtissiers.',
      },
    ],
  },
  {
    num: 51,
    cle: 'JEP-347',
    titre: "Les formules d'abonnement",
    bloc: B9,
    plan: 'gratuit',
    compte: 'demo',
    objectif: "Présenter les formules, l'essai gratuit, la souscription et la gestion de l'abonnement.",
    message: 'choisissez la formule qui vous ressemble, changez quand vous voulez',
    prerequis: [
      "Compte de démonstration en formule gratuite au début du tournage (pour voir « Essayer gratuitement » et « S'abonner »).",
    ],
    sequences: [
      {
        titre: 'Ouvrir les formules',
        duree: 5,
        gestes: [
          'Menu « Mon compte » → « Formules ».',
        ],
        voix: 'Découvrez les formules du site.',
      },
      {
        titre: 'Comparer',
        duree: 20,
        gestes: [
          '« Nos formules » : bascule « Mensuel » / « Annuel », colonne « Gratuit ».',
          "Montrer « Essayer gratuitement » et la mention d'essai sans moyen de paiement.",
        ],
        voix: "Comparez les formules, au mois ou à l'année. Certaines proposent un essai gratuit, sans moyen de paiement : un seul essai par membre.",
      },
      {
        titre: "S'abonner",
        duree: 15,
        gestes: [
          "« S'abonner » → fenêtre « Souscrire à … » : case des conditions générales de vente, case d'accès immédiat.",
          'Montrer « Continuer vers le paiement » sans cliquer.',
        ],
        voix: 'Pour vous abonner, acceptez les conditions de vente : le paiement se fait ensuite sur une page sécurisée.',
      },
      {
        titre: 'Gérer son abonnement',
        duree: 15,
        gestes: [
          "« Réglages du compte » → « Mon forfait » : jauges d'usage, « Factures et moyen de paiement », « Passer à une formule supérieure », « Résilier mon abonnement ».",
        ],
        voix: 'Dans vos réglages, suivez votre consommation, retrouvez vos factures, changez de formule ou résiliez en quelques clics.',
      },
    ],
    attention: [
      "Ne jamais aller jusqu'au paiement ni saisir une carte bancaire.",
      "Ne pas démarrer l'essai gratuit sur le compte de démonstration (un seul essai par membre).",
    ],
  },
  {
    num: 52,
    cle: 'JEP-348',
    titre: 'Gérer ses cookies',
    bloc: B9,
    plan: 'gratuit',
    compte: 'visiteur',
    objectif: "Montrer le choix du consentement à la mesure d'audience et comment le modifier.",
    message: "refuser est aussi simple qu'accepter",
    prerequis: [
      'Fenêtre de navigation privée (aucun choix enregistré).',
      "Mesure d'audience configurée sur dev (sans elle, le bandeau n'apparaît pas).",
    ],
    sequences: [
      {
        titre: 'Le bandeau',
        duree: 15,
        gestes: [
          "Ouvrir dev.jepatisse.com : bandeau « Gestion des cookies » / « Mesure d'audience ».",
          'Montrer « Refuser » et « Accepter » côte à côte ; cliquer « Refuser ».',
        ],
        voix: "À votre première visite, le site vous demande votre accord pour mesurer sa fréquentation. Refuser est aussi simple qu'accepter, et aucun cookie publicitaire n'est utilisé.",
      },
      {
        titre: "Changer d'avis",
        duree: 10,
        gestes: [
          'Pied de page → « Gérer mes cookies » : le bandeau revient.',
        ],
        voix: "Vous changez d'avis ? Le lien Gérer mes cookies, en bas de page, vous le permet à tout moment.",
      },
    ],
  },
];
