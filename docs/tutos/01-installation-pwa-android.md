# Script tuto — Installer l'application sur un téléphone Android

> Rédigé d'après le gabarit `TEMPLATE_tuto.md` (situé à la racine du dépôt).

---

## Fiche technique

| Champ | Valeur |
|---|---|
| Fonctionnalité | Installation de l'application sur l'écran d'accueil (Android / Chrome) |
| Durée cible maximum | **30 s** (format court, hors cible 90 s de la série) |
| Nombre de mots visé | **~70** (≈150 mots/min, marge laissée aux animations système) |
| Public | Nouvel utilisateur |
| Statut | Brouillon |
| Dernière mise à jour | 2026-08-31 |

## Objectif

> À la fin de cette vidéo, l'utilisateur sait **ajouter Je pâtisse ! à l'écran
> d'accueil de son téléphone Android et l'ouvrir comme une application.**

## Prérequis de tournage

Format vertical (téléphone), pas de fenêtre navigateur : le point 5 du gabarit
(1920×1080) ne s'applique pas ici.

### Appareil

- [ ] Téléphone **Android**, **Chrome à jour**, capture d'écran en **1080×2400** ou équivalent
- [ ] **L'application n'est PAS déjà installée** — sinon Chrome affiche « Ouvrir l'application » au lieu de « Installer », et la démonstration n'a plus d'objet
- [ ] **Données du site vidées** avant l'enregistrement (Chrome → Paramètres du site → Effacer). Le site embarque un service worker auto-destructeur (`public/sw.js`) qui **recharge la page une fois** s'il en trouve un ancien : un rechargement surprise en pleine prise
- [ ] Écran d'accueil **nettoyé**, avec une **page vide** prête à recevoir la nouvelle icône (sans quoi on ne la verra pas apparaître)
- [ ] Mode Ne pas déranger, batterie > 80 %, Wi-Fi, heure neutre
- [ ] Barre d'onglets Chrome ramenée à **un seul onglet**

### Adresse

- [ ] Filmer sur **`dev.jepatisse.com`** — `www.jepatisse.com` sert la page d'attente `COMING_SOON`

### Données de démo (compte connecté avant la première image)

L'accueil est le `start_url` du manifeste : c'est **lui** qu'on voit au
lancement de l'application installée. Il doit être plein, sinon le plan final
montre une page creuse.

- [ ] **Connecté avec le compte démo** — un visiteur déconnecté déclenche
      `GuestIntro` / `GuestCta`, un écran d'accroche commerciale qui n'est pas
      le sujet du tuto
- [ ] **Pseudo neutre** (ex. « Camille P. »), jamais un nom réel — l'auteur est
      affiché sur chaque carte de recette
- [ ] **6 recettes publiées minimum, toutes avec photo**, pour que les rails de
      l'accueil soient garnis jusqu'au bas de l'écran
- [ ] **2 ou 3 favoris** posés (cœurs remplis dans les cartes)
- [ ] *Optionnel — recommandé* : **une fournée en cours**, pour que le carrousel
      « En cuisine » s'affiche en haut et que l'accueil paraisse vivant
- [ ] **Aucune bannière partenaire active** (`/admin/partenaires`) : une
      publicité datée périmerait la vidéo
- [ ] Aucun bandeau d'impersonation (ne pas filmer depuis une session
      « en tant que »)

---

## Script

### Accroche (0:00 – 0:06)

| Voix off | À l'écran |
|---|---|
| Vos recettes à portée de pouce, comme une vraie application. | Écran d'accueil du téléphone, immobile 1 s, puis ouverture de Chrome sur le site |

### Étapes

| # | Voix off | À l'écran | Note de montage |
|---|---|---|---|
| 1 | Ouvrez le site dans Chrome. Touchez le menu, en haut à droite. | Accueil de `dev.jepatisse.com` chargé (rails de recettes visibles) ; le doigt touche les **trois points** en haut à droite | Zoom léger sur le coin haut droit, entrée/sortie 0,3 s |
| 2 | Choisissez « Ajouter à l'écran d'accueil ». Puis « Installer ». | Le menu Chrome se déroule ; surbrillance de **« Ajouter à l'écran d'accueil »** ; la feuille de confirmation monte, montrant l'icône bordeaux et le nom **« Je pâtisse »** ; appui sur **« Installer »** | **Pause 1 s** sur la feuille de confirmation : c'est là que l'utilisateur reconnaît l'icône |
| 3 | L'icône rejoint votre écran d'accueil. | Retour automatique à l'écran d'accueil du téléphone ; l'icône **« Je pâtisse »** apparaît sur la page vide préparée | Ralenti ×0,5 sur l'apparition de l'icône |
| 4 | Ouvrez-la : plus de barre d'adresse, tout l'écran est à vous. | Appui sur l'icône → écran de lancement crème, puis l'accueil du site **plein écran**, sans barre d'adresse, barre de statut bordeaux | Couper le temps de chargement au-delà d'une seconde |
| 5 | Et un appui long vous mène directement à une nouvelle recette. | **Appui long** sur l'icône → les raccourcis **« Créer »** et **« Réglages »** s'ouvrent ; appui sur **« Créer »** → l'éditeur de recette s'affiche | Zoom sur le menu de raccourcis |

### Conclusion (0:27 – 0:30)

| Voix off | À l'écran |
|---|---|
| C'est prêt. Bonne pâtisserie. | L'éditeur de recette vierge à l'écran, puis fondu vers l'outro |

**Décompte** : 59 mots ≈ 24 s de parole sur 30 s de vidéo. La marge est
volontaire — les animations système (feuille d'installation, retour à l'écran
d'accueil) doivent respirer sans que la voix les couvre.

---

## Notes de montage

- **Format vertical 9:16**, capture d'écran native du téléphone (pas de
  simulateur : la feuille d'installation de Chrome ne s'y comporte pas pareil).
- **Zooms** : sur chaque appui important, entrée/sortie 0,3 s.
- **Coupes** : supprimer tous les temps de chargement de plus d'une seconde.
- **Indicateur de contact** : activer « Afficher les appuis » dans les options
  pour développeurs — sans lui, les gestes sont invisibles à l'écran.
- **Sous-titres** : générés automatiquement, puis relus.
- **Musique** : optionnelle, à -25 dB sous la voix.
- **Intro/outro** : gabarit commun à toute la série.

### Point de vigilance sur le contenu de la voix off

Le libellé du menu Chrome **varie selon la version et le constructeur**
(« Ajouter à l'écran d'accueil » ou « Installer l'application »). L'étape 2 dit
les deux dans cet ordre : ne pas la réduire à un seul libellé au montage.

Ne **jamais** affirmer que l'application fonctionne hors connexion : le service
worker du site n'intercepte aucune requête, il n'y a pas de mode hors-ligne.

## Termes à prononcer correctement

| Mot | Écrire dans l'outil TTS |
|---|---|
| Je pâtisse ! | Je pâtisse (retirer le point d'exclamation, lu comme une pause) |
| Chrome | Krome |
| dev.jepatisse.com | *jamais prononcé — visible à l'écran uniquement* |

---

## Checklist avant publication

- [ ] Script relu à voix haute
- [ ] Durée réelle ≤ 30 s
- [ ] Aucune donnée personnelle visible (pseudo démo, aucune adresse e-mail)
- [ ] Aucune bannière partenaire à l'image
- [ ] Sous-titres corrigés
- [ ] Titre, description et miniature préparés
- [ ] Vidéo intégrée à la page d'aide du site
