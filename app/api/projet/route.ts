// Route Handler — création d'un projet (mode projet).
//
// Un projet EST une recette dès sa création (cf. CLAUDE.md « Mode projet ») :
// cette route écrit donc une ligne `recipes` marquée `kind = 'project'` /
// `project_stage = 'wizard'`, plus sa ligne satellite `recipe_projects`.
// Rien n'est copié ni migré à la validation — seul l'état changera.
//
// **Appelée au passage à l'étape 2, jamais au clic sur « Projet »**
// (JEP-254, point 1) : l'étape 1 (`/projets/nouveau`) ne crée rien, un
// visiteur qui ouvre le mode projet puis s'en va ne laisse plus de projet
// vide dans son carnet. D'où le corps de la requête : l'intention, et la
// proposition de l'IA quand elle a été demandée — titre, format visé et
// composants sont posés dès la création, et l'étape 2 s'ouvre pré-remplie.
//
// Côté serveur et non depuis le navigateur, pour une raison simple : deux
// écritures liées, dont la seconde n'a aucun sens sans la première. En cas
// d'échec de la seconde, la recette orpheline est effacée ici plutôt que
// laissée dans le carnet de l'utilisateur.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { INTENT_MAX, normaliseStructure, type ProposedStructure } from '@/lib/ai/project-structure';
import { MAX_COMPONENTS, projectFormatPayload } from '@/lib/projects';
import { verifierAcces } from '@/lib/quota-route';

// La proposition revient du navigateur : c'est une donnée à revalider, pas
// une promesse. On la repasse dans la normalisation de la réponse de l'IA
// (clés françaises), qui écarte tout ce qui n'est pas exploitable.
function propositionRevalidee(p: unknown): ProposedStructure | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Partial<ProposedStructure>;
  return normaliseStructure(
    {
      titre: o.title,
      format: o.format,
      dimensions: o.dims,
      parts: o.servings,
      nombre: o.count,
      composants: Array.isArray(o.components) ? o.components.map((c) => ({ nom: c?.name, role: c?.role })) : [],
    },
    MAX_COMPONENTS,
  );
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  // Même garde que /creer, /importer et /relecture : une session « en tant
  // que » en lecture seule n'écrit pas.
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule).' }, { status: 403 });
  }

  // Droit d'accès au mode projet, jusqu'ici jamais vérifié : n'importe quel
  // membre connecté pouvait ouvrir un projet. Le lot 5b avait câblé les
  // quotas de générations IA du mode projet sans jamais contrôler l'ACCÈS au
  // mode projet lui-même.
  const refus = await verifierAcces(user.id, 'mode_projet');
  if (refus) return refus;

  const body = await req.json().catch(() => ({}));
  const intent = typeof body?.intent === 'string' ? body.intent.replace(/\s+/g, ' ').trim().slice(0, INTENT_MAX) : '';
  const proposition = propositionRevalidee(body?.proposal);

  const supabase = await createClient();

  // Titre provisoire : `recipes.title` est obligatoire, et l'intention n'est
  // pas un titre. Il est remplacé par celui que l'IA propose, ou par celui
  // que l'utilisateur saisit à l'étape 2.
  const format =
    proposition?.format && proposition.servings
      ? projectFormatPayload({
          format: proposition.format,
          title: proposition.title ?? 'Nouveau projet',
          servings: proposition.servings,
          dims: proposition.dims,
          count: proposition.count,
          moldTypeId: null,
        })
      : { title: proposition?.title ?? 'Nouveau projet', servings: proposition?.servings ?? null };

  const { data, error } = await supabase
    .from('recipes')
    .insert({
      ...format,
      author_id: user.id,
      status: 'draft',
      is_public: false,
      kind: 'project',
      project_stage: 'wizard',
    } as never)
    .select('id')
    .single();

  if (error || !data) {
    console.error('projet (création):', error?.message);
    return NextResponse.json({ erreur: "La création du projet a échoué." }, { status: 500 });
  }

  const { error: projErr } = await supabase
    .from('recipe_projects')
    .insert({ recipe_id: data.id, intent: intent || null, wizard_step: 2 } as never);

  if (projErr) {
    console.error('projet (satellite):', projErr.message);
    await supabase.from('recipes').delete().eq('id', data.id);
    return NextResponse.json({ erreur: "La création du projet a échoué." }, { status: 500 });
  }

  // Composants proposés : écrits avec le projet. Un échec ici n'annule pas
  // la création — la structure se recompose à la main à l'étape 3.
  if (proposition?.components.length) {
    const { error: compErr } = await supabase.from('recipe_project_components').insert(
      proposition.components.map((c, i) => ({
        recipe_id: data.id,
        position: i + 1,
        name: c.name,
        role: c.role || null,
        source_kind: 'manual',
        resolved: false,
      })) as never,
    );
    if (compErr) console.error('projet (composants proposés):', compErr.message);
  }

  return NextResponse.json({ id: data.id });
}
