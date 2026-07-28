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
// Une photo par appel, tous en parallèle : huit transcriptions en série
// dépasseraient le `maxDuration` de la route, alors qu'en parallèle l'ensemble
// coûte à peu près le temps de la plus lente.
import { EMPTY_USAGE, addUsage, callClaude, type BlocContenu, type ClaudeUsage } from '@/lib/ai/claude';

export const PROMPT_TRANSCRIPTION = `Tu transcris la photo d'une page de livre de cuisine ou de fiche de recette.
Ta seule tâche est de LIRE. Tu ne structures pas, tu n'interprètes pas, tu ne résumes pas.

MISE EN PAGE — le point le plus important :
Une page de livre est très souvent composée en PLUSIEURS COLONNES. Lis chaque colonne ENTIÈREMENT, de haut en bas, puis passe à la suivante. Ne lis JAMAIS en travers de la page : deux blocs côte à côte sont indépendants, leurs lignes ne doivent pas être mélangées.
Annonce chaque colonne par une ligne « [colonne N] ». S'il n'y a qu'une colonne, écris « [colonne 1] » une seule fois, au début.
Le corps du texte (les étapes rédigées) forme lui aussi une colonne : traite-le comme telle.

FIDÉLITÉ :
- Transcris mot pour mot. N'ajoute rien, ne complète rien, ne corrige aucune faute.
- Recopie les nombres chiffre par chiffre, exactement tels qu'ils sont imprimés.
- Ne convertis JAMAIS une unité. En pâtisserie les liquides se pèsent : « 24 g d'eau » se transcrit « 24 g d'eau », jamais « 24 ml » ni « 240 g ».
- Garde les titres de section (ex. « CRÉMEUX COMBAVA », « ÉTAPE 1 ») sur leur propre ligne, et les listes d'ingrédients une ligne par ingrédient.
- Si un caractère est illisible, écris [illisible] à sa place plutôt que de deviner.

À IGNORER : numéro de page, titre courant, nom de l'ouvrage, mentions d'éditeur, légendes de photo décoratives.

Réponds UNIQUEMENT par la transcription, sans commentaire, sans introduction, sans balise de code.`;

export type ImagePhoto = { mediaType: string; data: string };

async function transcrireUne(
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
  const { text, usage } = await callClaude(apiKey, contenu, 3000, timeoutMs);
  return { texte: `--- page ${numero} ---\n${String(text || '').trim()}`, usage };
}

/**
 * Transcrit toutes les photos en parallèle et renvoie un texte unique, pages
 * dans l'ordre reçu.
 *
 * Une page manquante retirerait silencieusement des ingrédients de la recette :
 * l'échec d'une seule transcription fait donc échouer l'import, avec la
 * consommation déjà facturée rattachée à l'erreur pour rester comptabilisable.
 */
export async function transcrirePhotos(
  apiKey: string,
  images: ImagePhoto[],
  timeoutMs: number,
): Promise<{ texte: string; usage: ClaudeUsage }> {
  const resultats = await Promise.allSettled(
    images.map((img, i) => transcrireUne(apiKey, img, i + 1, timeoutMs)),
  );

  let usage = EMPTY_USAGE;
  const textes: string[] = [];
  const echecs: number[] = [];
  resultats.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      usage = addUsage(usage, r.value.usage);
      textes.push(r.value.texte);
    } else {
      echecs.push(i + 1);
    }
  });

  if (echecs.length) {
    throw Object.assign(new Error(`Photo(s) ${echecs.join(', ')} : lecture impossible.`), {
      usage,
      code: 'TRANSCRIPTION',
      photos: echecs,
    });
  }
  return { texte: textes.join('\n\n'), usage };
}
