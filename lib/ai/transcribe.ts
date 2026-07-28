// Passe 1 de l'import par photo : transcription des pages.
//
// Pourquoi une passe dédiée. Demander à un seul appel de déchiffrer une page ET
// de la structurer fait porter deux tâches difficiles à la fois : sur une page
// de livre composée en deux colonnes, la lecture traverse la page et fusionne
// des blocs qui n'ont aucun rapport (constaté sur un entremets dont le crémeux
// s'était vu attribuer les ingrédients de la ganache imprimée à sa droite).
//
// La transcription rend au modèle de structuration exactement ce que l'import
// par texte collé lui donne depuis toujours : du texte déjà linéarisé. C'est le
// chemin éprouvé du produit, la photo n'en devient qu'une source de plus.
//
// Une photo par REQUÊTE HTTP, toutes lancées en parallèle par le navigateur
// (cf. app/api/transcribe-photo). Regrouper les photos dans un seul appel les
// obligeait à tenir ensemble sous la limite de corps de requête de
// l'hébergeur, ce qui bridait leur définition : sur une page de livre
// photographiée en entier, le corps du texte tombait à quelques pixels de haut
// et « 150 °C » se lisait « 160 °C ». Une photo par requête rend à chacune la
// limite entière.
import { TRANSCRIBE_MODEL, callClaude, type BlocContenu, type ClaudeUsage } from '@/lib/ai/claude';

export const PROMPT_TRANSCRIPTION = `Tu transcris la photo d'une page de livre de cuisine ou de fiche de recette.
Ta seule tâche est de LIRE. Tu ne structures pas, tu n'interprètes pas, tu ne résumes pas.

MISE EN PAGE — le point le plus important :
Une page de livre est très souvent composée en PLUSIEURS COLONNES. Lis chaque colonne ENTIÈREMENT, de haut en bas, puis passe à la suivante. Ne lis JAMAIS en travers de la page : deux blocs côte à côte sont indépendants, leurs lignes ne doivent pas être mélangées.
Annonce chaque colonne par une ligne « [colonne N] ». S'il n'y a qu'une colonne, écris « [colonne 1] » une seule fois, au début.
Le corps du texte (les étapes rédigées) forme lui aussi une colonne : traite-le comme telle.

FIDÉLITÉ :
- Transcris mot pour mot. N'ajoute rien, ne complète rien, ne corrige aucune faute.
- Ne convertis JAMAIS une unité. En pâtisserie les liquides se pèsent : « 24 g d'eau » se transcrit « 24 g d'eau », jamais « 24 ml » ni « 240 g ».
- Garde les titres de section (ex. « CRÉMEUX COMBAVA », « ÉTAPE 1 ») sur leur propre ligne, et les listes d'ingrédients une ligne par ingrédient.
- Si un caractère est illisible, écris [illisible] à sa place plutôt que de deviner.

LES NOMBRES sont ce qui se lit le plus mal, et une erreur y passe inaperçue jusqu'au four :
- Recopie chaque nombre chiffre par chiffre, exactement tel qu'il est imprimé.
- Avant d'écrire une température, une durée ou une quantité, regarde-la une seconde fois.
- N'arrondis jamais, ne complète jamais un nombre, ne le rends jamais « plus vraisemblable ».
- Si un chiffre reste douteux, écris [illisible] à sa place. Un trou signalé vaut mieux qu'un chiffre inventé.

À IGNORER : numéro de page, titre courant, nom de l'ouvrage, mentions d'éditeur, légendes de photo décoratives.

Réponds UNIQUEMENT par la transcription, sans commentaire, sans introduction, sans balise de code.`;

export type ImagePhoto = { mediaType: string; data: string };

export async function transcrireUne(
  apiKey: string,
  image: ImagePhoto,
  numero: number,
  timeoutMs: number,
): Promise<{ texte: string; usage: ClaudeUsage }> {
  // Image d'abord, consigne ensuite : c'est l'ordre recommandé pour une entrée
  // visuelle accompagnée d'une instruction.
  const contenu: BlocContenu[] = [
    { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
    { type: 'text', text: PROMPT_TRANSCRIPTION },
  ];
  const { text, usage } = await callClaude(apiKey, contenu, 3000, timeoutMs, TRANSCRIBE_MODEL);
  return { texte: `--- page ${numero} ---\n${String(text || '').trim()}`, usage };
}
