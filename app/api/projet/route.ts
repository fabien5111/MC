// Route Handler — création d'un projet (mode projet, étape 1).
//
// Un projet EST une recette dès sa création (cf. CLAUDE.md « Mode projet ») :
// cette route écrit donc une ligne `recipes` marquée `kind = 'project'` /
// `project_stage = 'wizard'`, plus sa ligne satellite `recipe_projects`.
// Rien n'est copié ni migré à la validation — seul l'état changera.
//
// Côté serveur et non depuis le navigateur, pour une raison simple : deux
// écritures liées, dont la seconde n'a aucun sens sans la première. En cas
// d'échec de la seconde, la recette orpheline est effacée ici plutôt que
// laissée dans le carnet de l'utilisateur.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { INTENT_MAX } from '@/lib/ai/project-structure';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  // Même garde que /creer, /importer et /relecture : une session « en tant
  // que » en lecture seule n'écrit pas.
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule).' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const intent = typeof body?.intent === 'string' ? body.intent.replace(/\s+/g, ' ').trim().slice(0, INTENT_MAX) : '';

  const supabase = await createClient();

  // Titre provisoire : `recipes.title` est obligatoire, et l'intention n'est
  // pas un titre. Il sera remplacé par celui que l'IA propose (étape 2) ou
  // par celui que l'utilisateur saisit.
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      author_id: user.id,
      title: 'Nouveau projet',
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
    .insert({ recipe_id: data.id, intent: intent || null, wizard_step: 1 } as never);

  if (projErr) {
    console.error('projet (satellite):', projErr.message);
    await supabase.from('recipes').delete().eq('id', data.id);
    return NextResponse.json({ erreur: "La création du projet a échoué." }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
