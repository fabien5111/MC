// Mode projet — proposition de structure à partir de l'intention (spec §4,
// étapes 2 et 3). Fonctions pures : construction du prompt et normalisation
// de la réponse, testables sans réseau, à l'image de lib/ai/idea-duplicates.ts.
//
// UN SEUL appel pour le format ET les composants, alors que la spec les
// présente en deux étapes : les deux se déduisent de la même phrase (« une
// tarte aux fruits rouges pour 8 personnes » donne le moule autant que la
// liste des préparations), et deux appels feraient payer deux fois la même
// lecture, avec le risque qu'ils se contredisent. L'utilisateur, lui, garde
// bien deux écrans : il confirme le format avant de voir la structure.
import { COMPONENT_ROLES, PROJECT_FORMAT_KEYS, isProjectFormat, type ProjectFormat } from '@/lib/projects';

export const INTENT_MAX = 500;

export type ProposedComponent = { name: string; role: string };

export type ProposedStructure = {
  title: string | null;
  format: ProjectFormat | null;
  dims: Record<string, number>;
  servings: number | null;
  components: ProposedComponent[];
};

export function buildStructureContenu(intent: string): string {
  const texte = intent.replace(/\s+/g, ' ').trim().slice(0, INTENT_MAX);
  return `Tu aides un pâtissier à composer un dessert à partir de son intention,
exprimée en une phrase. Tu ne rédiges AUCUNE recette : tu proposes seulement le
format visé et la liste ordonnée des préparations de base qui composent ce
dessert.

Intention du pâtissier : "${texte}"

Réponds UNIQUEMENT par un objet JSON valide, sans texte ni balises autour :
{
  "titre": "<nom court du dessert, en français, sans guillemets>",
  "format": "<${PROJECT_FORMAT_KEYS.join(' | ')}>",
  "dimensions": {"diametre": <nombre en cm>, "hauteur": <nombre en cm>, "longueur": <nombre en cm>, "largeur": <nombre en cm>},
  "parts": <nombre de parts>,
  "composants": [{"nom": "<nom de la préparation>", "role": "<${COMPONENT_ROLES.join(' | ')}>"}]
}

Règles :
- "format" : "round" pour un cercle ou moule rond, "rectangular" pour un cadre,
  "individual" pour des empreintes individuelles, "free" si l'intention ne
  permet pas de trancher.
- "dimensions" : ne garde que les clés qui ont un sens pour ce format
  (diamètre et hauteur pour un rond, longueur/largeur/hauteur pour un cadre),
  en centimètres, cohérentes avec le nombre de parts. Objet vide si le format
  est "free".
- "composants" : de 2 à 8 préparations, ordonnées du BAS vers le HAUT de
  l'assemblage (le fond d'abord, le décor en dernier). Une préparation par
  entrée, jamais une étape de fabrication (« Pâte sucrée » et non « Foncer le
  cercle »). Pas de doublon.
- "role" : choisis dans la liste proposée, celui qui décrit le mieux la
  fonction de la préparation dans l'assemblage.`;
}

function nombre(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Normalisation défensive : la réponse d'un modèle est une donnée, pas une
// promesse. Tout ce qui n'est pas exploitable est écarté silencieusement —
// l'écran reste utilisable à la main (spec §12, « Échec de l'IA »), et un
// champ manquant vaut mieux qu'un champ inventé.
export function normaliseStructure(obj: unknown, maxComponents: number): ProposedStructure {
  const o = (obj ?? {}) as Record<string, unknown>;

  const titreRaw = typeof o.titre === 'string' ? o.titre.replace(/\s+/g, ' ').trim() : '';
  const format = isProjectFormat(o.format) ? o.format : null;

  const dims: Record<string, number> = {};
  const dimsRaw = (o.dimensions ?? {}) as Record<string, unknown>;
  if (dimsRaw && typeof dimsRaw === 'object' && !Array.isArray(dimsRaw)) {
    for (const k of ['diametre', 'hauteur', 'longueur', 'largeur']) {
      const n = nombre(dimsRaw[k]);
      if (n !== null) dims[k] = n;
    }
  }

  const parts = nombre(o.parts);

  const seen = new Set<string>();
  const components: ProposedComponent[] = [];
  const rawList = Array.isArray(o.composants) ? o.composants : [];
  for (const item of rawList) {
    const c = (item ?? {}) as Record<string, unknown>;
    const name = typeof c.nom === 'string' ? c.nom.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const role = typeof c.role === 'string' ? c.role.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    components.push({ name, role });
    if (components.length >= maxComponents) break;
  }

  return {
    title: titreRaw ? titreRaw.slice(0, 120) : null,
    format,
    dims,
    servings: parts !== null ? Math.round(parts) : null,
    components,
  };
}
