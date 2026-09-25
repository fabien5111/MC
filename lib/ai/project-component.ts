// Mode projet — génération d'une recette de base pour un composant
// (spec §5.4). Fonctions pures, même doctrine que project-structure.ts.
//
// Cette proposition n'est qu'un point de départ : elle est copiée dans le
// projet comme le serait n'importe quelle recette existante, et s'édite
// ensuite exactement pareil. Elle n'entre jamais au carnet toute seule.
import type { ComponentStepDraft } from '@/lib/projects';

export type GeneratedComponent = { title: string | null; steps: ComponentStepDraft[] };

export function buildComponentContenu(
  name: string,
  role: string | null,
  contexte: { titre: string | null; format: string | null; parts: number | null },
  // Nouvelle proposition demandée (JEP-254, point 8) : la précédente, en
  // texte, et ce que le pâtissier veut y corriger. Sans la précédente, l'IA
  // repartirait de zéro et pourrait perdre ce qui convenait déjà.
  revision: { precedente: string; consignes: string } | null = null,
): string {
  const clip = (s: string | null | undefined, max: number) => (s || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const lignes = [
    `Préparation demandée : "${clip(name, 80)}"`,
    role ? `Rôle dans l'assemblage : ${clip(role, 40)}` : null,
    contexte.titre ? `Dessert dans lequel elle entre : ${clip(contexte.titre, 120)}` : null,
    contexte.format ? `Format du dessert : ${clip(contexte.format, 120)}` : null,
    contexte.parts ? `Nombre de parts visé : ${contexte.parts}` : null,
  ].filter(Boolean);

  const blocRevision = revision
    ? `

Une première proposition a déjà été faite :
${revision.precedente.slice(0, 4000)}

Le pâtissier demande de la corriger ainsi : "${clip(revision.consignes, 1000)}"
Produis une NOUVELLE version complète qui applique ces corrections, en gardant
ce qu'elles ne remettent pas en cause.`
    : '';

  return `Tu écris UNE préparation de base du répertoire classique de la
pâtisserie française, telle qu'elle entre dans la composition d'un dessert.

${lignes.join('\n')}${blocRevision}

Réponds UNIQUEMENT par un objet JSON valide, sans texte ni balises autour :
{
  "titre": "<nom de la préparation>",
  "etapes": [
    {
      "titre": "<titre court de la sous-préparation, ex. \\"Ganache montée au praliné\\">",
      "description": "<un court résumé, une phrase, ou vide si les sous-étapes suffisent>",
      "sous_etapes": ["<premier geste>", "<deuxième geste>", "..."],
      "prep_min": <minutes de travail, ou null>,
      "cuisson_min": <minutes de cuisson, ou null>,
      "repos_min": <minutes de repos ou de prise au froid, ou null>,
      "temperature": <température du four en °C, ou null>,
      "ingredients": [{"nom": "<ingrédient>", "quantite": "<nombre>", "unite": "<g | kg | ml | l | unite | cs | cc | pincée>"}]
    }
  ]
}

Règles :
- Une étape par SOUS-PRÉPARATION homogène, jamais une étape par geste. Une
  ganache montée (hydrater la gélatine, fondre le praliné, chauffer la crème,
  émulsionner, refroidir, monter) est UNE seule étape ; ses gestes vont dans
  "sous_etapes", pas dans des étapes séparées. Une étape ne se justifie que si
  elle correspond à une sous-préparation distincte de l'ensemble (ex. un
  croustillant à part d'une ganache, un sirop à part d'un biscuit).
- De 1 à 4 étapes, dans l'ordre de réalisation.
- Chaque ingrédient est rattaché à l'ÉTAPE (la sous-préparation) OÙ IL EST
  UTILISÉ, jamais à une liste globale. Un ingrédient utilisé dans deux étapes
  est réparti entre elles, avec la quantité propre à chacune.
- Quantités chiffrées et réalistes pour la quantité visée, unités du système
  métrique. Pas de fourchette (« 10 à 15 g »), une seule valeur.
- Aucun commentaire, aucune note, aucun texte hors du JSON.`;
}

function minutes(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function texte(v: unknown, max: number): string | null {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return t ? t.slice(0, max) : null;
}

// Même défiance que pour la structure : ce qui n'est pas exploitable est
// écarté. Une étape sans description ni titre ne serait qu'une ligne vide
// dans le déroulé.
export function normaliseComponentRecipe(obj: unknown, maxSteps = 6): GeneratedComponent {
  const o = (obj ?? {}) as Record<string, unknown>;
  const steps: ComponentStepDraft[] = [];
  const rawSteps = Array.isArray(o.etapes) ? o.etapes : [];

  for (const raw of rawSteps) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const title = texte(s.titre, 120);
    const description = texte(s.description, 2000);
    const sousEtapes = (Array.isArray(s.sous_etapes) ? s.sous_etapes : [])
      .map((t) => texte(t, 300))
      .filter((t): t is string => !!t);
    if (!title && !description && !sousEtapes.length) continue;

    const ingredients = (Array.isArray(s.ingredients) ? s.ingredients : [])
      .map((raw2) => {
        const it = (raw2 ?? {}) as Record<string, unknown>;
        const name = texte(it.nom, 120);
        if (!name) return null;
        return {
          name,
          quantity: texte(it.quantite, 40),
          unit: texte(it.unite, 40),
          comment: null,
          allergen: null,
          ref_id: null,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    steps.push({
      title,
      // Aucun mode d'échelle : une préparation proposée par l'IA n'a pas de
      // recette source d'où le tenir. Le comportement par défaut
      // (proportionnel) s'applique.
      scaling_mode: null,
      description,
      sous_etapes: sousEtapes.length ? sousEtapes : null,
      prep_time: minutes(s.prep_min),
      cook_time: minutes(s.cuisson_min),
      wait_time: minutes(s.repos_min),
      cook_temp: minutes(s.temperature),
      tips: null,
      day_offset: null,
      ingredients,
    });
    if (steps.length >= maxSteps) break;
  }

  return { title: texte(o.titre, 120), steps };
}

// Brouillon d'un composant rendu en texte, pour le soumettre de nouveau à
// l'IA avec des corrections (JEP-254, point 8) : c'est ce que le pâtissier a
// sous les yeux — relu, éventuellement déjà retouché — qui sert de base, pas
// la réponse brute de l'appel précédent.
export function draftToText(steps: ComponentStepDraft[]): string {
  return steps
    .map((st, i) => {
      const sous = (st.sous_etapes || []).map((t) => `  - ${t}`).join('\n');
      const ings = st.ingredients
        .filter((it) => (it.name || '').trim())
        .map((it) => `  - ${[it.quantity, it.unit, it.name].filter(Boolean).join(' ')}`)
        .join('\n');
      return [`${i + 1}. ${st.title || 'Étape'}${st.description ? ` : ${st.description}` : ''}`, sous, ings]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}
