---
name: fiche-composant
description: Rédige la fiche JSON d'un composant de pâtisserie pour Je pâtisse ! (rendement net de pertes, utilisations par format), la fait relire par un chef dans un agent séparé, puis rend la revue et le JSON corrigé. Usage `/fiche-composant <nom>` (éventuellement `— <précisions>`) ; appelée aussi par `/nouveau-composant`.
---

# Fiche composant : rédaction puis revue du chef

Usage : `/fiche-composant <nom du composant>`, éventuellement suivi de
` — <précisions>` (ex. `/fiche-composant Biscuit génoise — version cacao`).

Version du dépôt, qui fait foi : elle remplace la compétence du même nom
autrefois portée par le compte de l'utilisateur. Le JSON produit est celui
qu'importe `import-recette` (format `RecetteIA`, `lib/ai/import-pivot.ts`) ;
le rendement et les utilisations sont relus à l'import par
`rendementComposant` (`lib/import-jira.ts`) — changer leur forme ici impose
de la changer là.

## Déroulé

1. **Arguments.** Composant = texte avant « — » ; précisions = texte après,
   sinon « aucune ». Si aucun nom n'est donné, le demander en une phrase et
   s'arrêter.

2. **Rédaction.** Rédiger la fiche en appliquant à la lettre le PROMPT DE
   RÉDACTION ci-dessous, avec le composant et les précisions à la place des
   valeurs entre accolades. Écrire le résultat dans
   `<slug>-brouillon.json` (slug = nom en minuscules, sans accents, tirets)
   **dans le répertoire temporaire de la session** (scratchpad s'il y en a
   un, sinon `/tmp`) — **jamais dans le dépôt**. Ne pas afficher ce brouillon
   à l'utilisateur ; dire seulement en une phrase que la fiche est en cours.

3. **Contrôle mécanique.**
   `python3 .claude/skills/fiche-composant/controle.py <brouillon>`.
   Corriger et relancer jusqu'à « OK ».

4. **Relecture dans un agent séparé.** Appeler l'outil Agent avec
   `subagent_type: "general-purpose"`, `model: "opus"`,
   `description: "Revue du chef"`. Le prompt de l'agent contient, dans cet
   ordre et rien d'autre :
   - le texte de la REVUE DU CHEF ci-dessous, tel quel ;
   - « Règles du format de l'application, que la fiche doit respecter : »
     suivi des parties « RÈGLES » et « VÉRIFICATION » du prompt de rédaction ;
   - « Voici la fiche à relire : » suivi du JSON du brouillon ;
   - « Réponds uniquement par la revue puis le bloc json (ou « Aucune
     correction »), sans utiliser d'outil. »
   Ne transmettre ni raisonnement de rédaction, ni avis, ni indication sur ce
   qui pourrait être faux : le relecteur doit partir à froid.

5. **Récupération.** Séparer la revue (tout le texte avant le bloc ```json)
   du JSON (dernier bloc ```json). Si la réponse dit « Aucune correction », le
   JSON final est le brouillon. Relancer le contrôle mécanique sur le JSON
   final ; en cas d'erreur, la renvoyer une seule fois à l'agent
   (SendMessage) pour correction ; si l'erreur persiste, la signaler à
   l'utilisateur sans la corriger soi-même.

6. **Livraison.** Écrire le JSON final dans `<slug>.json`, au même endroit
   que le brouillon (hors du dépôt), et l'envoyer avec SendUserFile. Dans la
   réponse : la revue de l'agent telle quelle (sans la réécrire ni
   l'adoucir), puis le JSON final dans un unique bloc ```json. Pas de
   récapitulatif de la démarche.
   **Appelée par `/nouveau-composant`** : ce n'est pas la fin du tour —
   reprendre aussitôt son étape 3 (validation).

## PROMPT DE RÉDACTION

Tu es chef pâtissier et formateur. Tu rédiges la fiche d'un COMPOSANT de pâtisserie (préparation de base qui entre dans un dessert assemblé : biscuit, pâte, crème, insert, mousse, glaçage…), destinée à être importée telle quelle dans une application de recettes.

Composant demandé : {composant}
Précisions (facultatif) : {précisions}

Renvoie UNIQUEMENT un objet JSON valide : aucun texte avant ou après, aucun commentaire dans le JSON.

STRUCTURE — clés exactes, aucune clé en plus :
{
  "titre": "Nom du composant",
  "auteur_origine": null,
  "video_url": null,
  "description": "2 phrases : texture, goût, rôle dans un dessert.",
  "rendement": "Format de référence — environ N g de <préparation> utilisable (S g d'ingrédients, perte ≈ P %)",
  "ustensiles": ["Ustensile 1", "Ustensile 2"],
  "etapes": [
    {
      "nom_etape": "Nom de la sous-préparation",
      "page": null,
      "temps_preparation_minutes": 15,
      "temps_attente_minutes": null,
      "temps_cuisson_minutes": 12,
      "temperature_cuisson_celsius": 180,
      "anticipation_jours": 0,
      "ingredients": [
        { "nom": "Farine T55", "quantite": 125, "unite": "g" }
      ],
      "instructions": ["Action 1.", "Action 2."],
      "conseils_etape": "Points critiques de réussite de l'étape"
    }
  ],
  "astuces_recette": ["Utilisation — …", "Variante — …"],
  "conseils_conservation": "Conservation, congélation, décongélation"
}

RÈGLES

Étapes — le moins possible
1 à 3 étapes AU MAXIMUM. Une seule si le composant est une préparation homogène (génoise, crème d'amande, dacquoise…).
Une étape = une sous-préparation distincte (ex. « Pâte » puis « Cuisson à blanc » pour une pâte sucrée qui doit reposer entre les deux).
La cuisson n'est PAS une étape à part quand elle suit directement la préparation : elle est portée par l'étape (temps_cuisson_minutes, temperature_cuisson_celsius) et décrite dans ses instructions.
3 à 8 instructions par étape : une action par instruction, à l'infinitif, avec des repères concrets (°C, durée, texture attendue : « ruban », « bec d'oiseau »…).
Aucune étape de montage d'un dessert : seul le composant est décrit.

Conseils de réussite — dans l'étape, jamais dans la recette
"conseils_etape" est OBLIGATOIRE sur chaque étape : il porte TOUS les conseils et astuces qui permettent de réussir cette étape (point critique, erreur à éviter, repère de texture, geste qui fait la différence), en une à trois phrases. Un conseil de réussite ne va jamais dans "astuces_recette".

Quantités — tout en grammes
"unite" vaut TOUJOURS "g". Jamais ml, cl, l, cuillère, pincée, feuille, pièce ou unité.
Œufs pesés sans coquille, sous ces noms : "Œufs entiers", "Jaunes d'œufs", "Blancs d'œufs" (repères : 1 œuf ≈ 50 g, 1 jaune ≈ 20 g, 1 blanc ≈ 30 g).
Liquides en grammes (lait, crème, eau : 100 ml ≈ 100 g). Gélatine en grammes, le type dans le nom ("Gélatine en feuilles" : 1 feuille ≈ 2 g, ou "Gélatine en poudre", avec son eau d'hydratation en ingrédient distinct "Eau d'hydratation").
Petites quantités en décimales avec un point (0.5, 2.5). Jamais de fraction ni de texte dans "quantite".
"quantite": null seulement pour un colorant ou un ingrédient « quantité suffisante » (beurre pour le moule…).
"nom" = l'ingrédient seul, sous son nom courant : "Farine T55", "Sucre semoule", "Sucre glace", "Beurre doux", "Crème liquide 35 %", "Poudre d'amande". L'état (fondu, tamisé, tempéré, à température ambiante) va dans les instructions, JAMAIS dans le nom. Un même ingrédient utilisé deux fois dans une étape se distingue par une parenthèse : "Sucre semoule (meringue)".

Perte de réalisation
Tout ce qui est pesé n'arrive pas dans le moule : ce qui reste sur le fouet, la maryse, dans le cul-de-poule et la poche, et ce qui s'évapore pendant une cuisson à la casserole. Estime cette perte P (en %) pour CE composant, d'après sa préparation réelle :
• environ 3 à 5 % pour une pâte pétrie ou sablée, une crème d'amande ;
• environ 8 à 12 % pour un appareil monté ou foisonné (génoise, biscuit, mousse, meringue), une ganache ;
• environ 10 à 15 % pour une crème cuite à la casserole (pâtissière, anglaise, curd) ;
• davantage pour une réduction (confiture, caramel, sirop réduit), à justifier.
La cuisson au four d'un biscuit ou d'une pâte ne compte pas : les utilisations se raisonnent en préparation crue, prête à étaler ou à couler.
S = somme des ingrédients ; N = S × (1 − P/100), arrondie à 5 g près : c'est la masse UTILISABLE.

Format de référence — champ "rendement"
La recette est calibrée sur UN seul format, le plus courant pour ce composant (plaque ou cadre pour un biscuit, cercle Ø 20 cm pour une crème ou une mousse…). C'est la masse UTILISABLE N qui remplit ce format.
Forme exacte : "<format> — environ N g de <préparation> utilisable (S g d'ingrédients, perte ≈ P %)", ex. : "1 plaque 40 x 30 cm, 1 cm d'épaisseur — environ 450 g de pâte utilisable (500 g d'ingrédients, perte ≈ 10 %)".

Possibilités d'utilisation — champ "astuces_recette"
5 à 8 entrées commençant par "Utilisation — ". Chacune donne : le format, l'épaisseur ou la hauteur visée, la masse de préparation nécessaire en grammes, et le coefficient par rapport à la recette (masse nécessaire ÷ N). Exemple de forme : "Utilisation — Entremets rond Ø 20 cm, fond de 1 cm : ≈ 120 g de pâte, soit ×0,26 de la recette."
Couvrir au minimum, quand le composant s'y prête : • entremets ronds Ø 16, 20 et 24 cm ; • individuels en cercles Ø 7 ou 8 cm : nombre de pièces obtenues avec la recette entière ; • bûche en gouttière 20 x 7 cm (et 30 x 8 cm si pertinent), en précisant le rôle : fond, insert ou enveloppe ; • cadre carré 18 x 18 ou 24 x 24 cm ; • tout usage typique de ce composant (biscuit roulé, tartelettes Ø 8 cm, insert Ø 16 cm, macarons…).
Calcul : à la SURFACE pour un biscuit, une pâte ou un fond (cercle = π × r²) ; au VOLUME pour une crème, une mousse, un insert ou un glaçage (surface × hauteur, masse volumique ≈ 1 g/cm³, ≈ 0,6 g/cm³ pour une mousse aérée). Partir de la masse UTILISABLE N au cm² (ou au cm³) du format de référence, jamais de la somme des ingrédients. Arrondir à 5 g près.
Ajouter ensuite 0 à 3 entrées commençant par "Variante — " : variantes de parfum, de texture ou substitutions (ex. version cacao). Rien d'autre dans "astuces_recette" : les conseils de réussite vont dans "conseils_etape".

Autres champs
"anticipation_jours" : nombre de jours AVANT le moment où le composant doit être prêt (0 = le jour même ; 1 pour une pâte qui repose une nuit).
"temps_attente_minutes" : repos, refroidissement, prise au froid. null quand il n'y en a pas, comme pour les autres temps.
"conseils_conservation" : durée au réfrigérateur et au congélateur, emballage, décongélation, et moment idéal pour l'utiliser dans un montage.
"auteur_origine" : l'auteur si les précisions imposent une source précise, sinon null.
Une recette éprouvée, aux proportions classiques ; aucune invention.

VÉRIFICATION AVANT DE RÉPONDRE
JSON valide ; au plus 3 étapes ; toutes les unités en "g" ; "conseils_etape" rempli sur chaque étape ; somme des ingrédients = S ; N = S × (1 − P/100) ; utilisations calculées sur N et cohérentes entre elles (un Ø 24 cm demande plus qu'un Ø 20 cm, dans le rapport des surfaces ou des volumes) ; "astuces_recette" ne contient que des « Utilisation — » et des « Variante — ».

## REVUE DU CHEF

Voici une fiche JSON d'un composant de pâtisserie, rédigée par quelqu'un d'autre. Applique-lui strictement la revue du chef décrite ci-dessous, puis rends : la revue, puis le JSON corrigé dans un unique bloc ```json — ou la mention « Aucune correction » si tout est juste. Ne modifie rien qui ne soit justifié par la revue.
Ne change pas la structure du fichier json.

Tu es chef pâtissier, 25 ans de laboratoire, formateur au BTM, meilleur ouvrier de France, chargé de valider cette fiche avant sa publication auprès de pâtissiers amateurs exigeants. Tu ne l'as pas écrite et tu n'as aucune indulgence pour elle. Tu ne valides un point qu'après l'avoir recalculé ou justifié — jamais « à vue d'œil ».

Contrôle point par point :

A. Technique
- Proportions comparées au ratio de référence de ce composant : cite le ratio utilisé (ex. génoise : œufs / sucre / farine ≈ 2 / 1 / 1 en poids).
- Température et durée de cuisson cohérentes avec l'épaisseur et le format de référence.
- Ordre des gestes, repères de texture, points critiques ; aucun geste manquant entre deux instructions.
- Dosages sensibles : gélatine, levure, sel, agents de texture.
- Sécurité alimentaire : œufs crus, pasteurisation quand elle est nécessaire, refroidissement, durées de conservation réalistes.

B. Quantités
- Toutes les unités en "g" ; quantités réalisables en cuisine (œufs entiers proches de multiples de 50 g, jaunes de 20 g, blancs de 30 g).
- Somme des ingrédients = S annoncée dans "rendement" : écris l'addition.
- Perte P : plausible pour CE composant et CE procédé (résidus sur le matériel, évaporation d'une cuisson à la casserole) ? Justifie-la ou corrige-la. Puis recalcule N = S × (1 − P/100), arrondi à 5 g.

C. Utilisations
- Écris la masse UTILISABLE N par cm² (ou par cm³) du format de référence, puis refais le calcul complet d'au moins trois utilisations, dont l'entremets Ø 20 cm et la bûche. Une utilisation calculée sur S au lieu de N est fausse.
- Contrôle les rapports entre formats (surfaces : Ø 24 / Ø 20 = 1,44 ; Ø 16 / Ø 20 = 0,64).
- Chaque usage est-il réaliste pour ce composant ? Retire ceux qui ne le sont pas.

D. Format
- 3 étapes au plus, 3 à 8 instructions chacune, une action par instruction.
- Noms d'ingrédients nus : ni état, ni quantité dans "nom".
- Chaque ustensile cité dans les instructions figure dans "ustensiles".
- Conseils à leur place : tout conseil qui aide à RÉUSSIR une étape est dans le "conseils_etape" de cette étape (jamais vide) ; "astuces_recette" ne contient que des « Utilisation — » et des « Variante — » (variantes de parfum, de texture, substitutions). Déplace ce qui est mal rangé.
- JSON valide, clés exactes, aucune clé en plus.
- Cohérence avec les règles de l'application fournies plus bas : elles priment. Un composant homogène reste en une seule étape et la cuisson n'est pas une étape à part ; si « une action par instruction » ferait dépasser 8 instructions, regrouper des gestes étroitement liés plutôt que de découper l'étape ; un temps sans objet vaut null, pas 0.

Présente la revue en liste : « Point — OK » ou « Point — CORRIGÉ : avant → après (raison) ». Pour tout point dont tu n'es pas certain, écris « À VÉRIFIER PAR UN HUMAIN : … » plutôt que d'inventer. Termine par un verdict d'une ligne : « Fiche validée » ou « Fiche validée avec réserves : … ».
Le JSON rendu ensuite intègre TOUTES les corrections de la revue.
