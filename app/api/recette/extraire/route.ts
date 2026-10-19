// Route Handler — extraire des étapes d'une recette pour en faire une
// recette à part entière (JEP-258, plan Pro, droit `extraction_etapes`).
//
// Côté serveur et non depuis le navigateur, pour trois raisons :
//  - le droit d'abonnement est vérifié ici, pas seulement par le masquage du
//    bouton ;
//  - le contenu copié est RELU sous la session du membre (RLS) : le
//    navigateur n'envoie que des identifiants d'étapes, jamais le texte à
//    écrire — impossible de « créditer » une recette pour un contenu qu'elle
//    ne porte pas ;
//  - plusieurs écritures liées (recette, étapes, groupes, ingrédients,
//    photos) : en cas d'échec, la recette à moitié écrite est effacée ici
//    plutôt que laissée dans le carnet.
//
// Toutes les écritures passent par la session du membre (RLS, plafond
// `recettes_max` porté par le trigger de `recipes`), jamais par la clé
// service_role. La recette d'origine n'est jamais touchée.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getRecipeFull } from '@/lib/recipes';
import { isProjectDraft } from '@/lib/projects';
import { isReadOnlySession } from '@/lib/impersonation';
import { refusSiCompteBloque } from '@/lib/moderation-route';
import { messageQuota, verifierAcces } from '@/lib/quota-route';
import { quotaFailure } from '@/lib/entitlements';
import {
  DROIT_EXTRACTION,
  EXTRACTION_TITRE_MAX,
  creditExtraction,
  lirePoidsSaisi,
  planExtraction,
  rendementExtraction,
} from '@/lib/extraction-etapes';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  const compteBloque = await refusSiCompteBloque(user.id);
  if (compteBloque) return compteBloque;
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule).' }, { status: 403 });
  }
  const refus = await verifierAcces(user.id, DROIT_EXTRACTION);
  if (refus) return refus;

  const body = await req.json().catch(() => ({}));
  const recipeId = typeof body?.recipeId === 'string' ? body.recipeId : '';
  const stepIds: number[] = Array.isArray(body?.stepIds)
    ? body.stepIds.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n))
    : [];
  const titre = typeof body?.title === 'string' ? body.title.replace(/\s+/g, ' ').trim().slice(0, EXTRACTION_TITRE_MAX) : '';
  const poids = lirePoidsSaisi(body?.yieldGrams);
  if (!recipeId || !stepIds.length) return NextResponse.json({ erreur: 'Choisissez au moins une étape.' }, { status: 400 });
  if (!titre) return NextResponse.json({ erreur: 'Donnez un nom à la nouvelle recette.' }, { status: 400 });

  // Lecture sous la session : une recette hors de portée (brouillon d'un
  // autre, compte désactivé…) est absente, comme sur la fiche.
  const source = await getRecipeFull(recipeId, 'edition');
  if (!source || isProjectDraft(source)) {
    return NextResponse.json({ erreur: 'Recette introuvable ou inaccessible.' }, { status: 404 });
  }
  const etapes = planExtraction(source.recipe_steps || [], source.ingredient_groups || [], stepIds);
  if (!etapes.length) return NextResponse.json({ erreur: 'Aucune des étapes choisies n’appartient à cette recette.' }, { status: 400 });

  const supabase = await createClient();
  // Sa propre recette : aucun crédit, ni texte ni lien (arbitrage du 19/10/2026).
  const credit = creditExtraction(source.title, source.profiles?.full_name ?? null, source.author_id === user.id);
  const { data: cree, error: recErr } = await supabase
    .from('recipes')
    .insert({
      title: titre,
      author_id: user.id,
      // Brouillon privé : la copie se relit et se complète avant d'être
      // montrée à qui que ce soit.
      status: 'draft',
      is_public: false,
      source: credit,
      // Lien relatif : il mène à la fiche d'origine quel que soit le domaine
      // (dev, www, aperçu de PR), et reste affiché en texte si elle devient
      // inaccessible.
      source_url: credit ? `/recette/${source.id}` : null,
      ...(rendementExtraction(poids) ?? {}),
    } as never)
    .select('id')
    .single();
  if (recErr || !cree) {
    const echec = recErr ? quotaFailure(recErr) : null;
    if (echec) {
      return NextResponse.json({ erreur: await messageQuota(user.id, 'recettes_max', echec), code: 'QUOTA_EPUISE' }, { status: 429 });
    }
    console.error('extraction (recette):', recErr?.message);
    return NextResponse.json({ erreur: 'La création de la recette a échoué.' }, { status: 500 });
  }
  const nouvelleId = (cree as { id: string }).id;

  try {
    for (let i = 0; i < etapes.length; i++) {
      const st = etapes[i];
      const titreEtape = (st.title || '').trim() || null;
      const { data: stepRow, error: stepErr } = await supabase
        .from('recipe_steps')
        .insert({
          recipe_id: nouvelleId,
          step_number: i + 1,
          order_index: i,
          title: titreEtape,
          description: st.description,
          sous_etapes: st.sous_etapes,
          prep_time: st.prep_time,
          cook_time: st.cook_time,
          wait_time: st.wait_time,
          cook_temp: st.cook_temp,
          tips: st.tips,
          video_url: st.video_url,
          day_offset: st.day_offset,
        } as never)
        .select('id')
        .single();
      if (stepErr || !stepRow) throw stepErr ?? new Error('Étape refusée');
      const stepId = (stepRow as { id: number }).id;

      if (st.photos.length) {
        const { error } = await supabase
          .from('step_photos')
          .insert(st.photos.map((p, pi) => ({ step_id: stepId, url: p.url, original_url: p.original_url, order_index: pi, ai_retouched: p.ai_retouched })) as never);
        if (error) throw error;
      }

      if (!st.ingredients.length) continue;
      // Une étape ↔ un groupe d'ingrédients, appariés par `order_index` et
      // portant le titre de l'étape — l'invariant que l'éditeur et la
      // fournée relisent (cf. lib/projects-write.ts).
      const { data: groupRow, error: groupErr } = await supabase
        .from('ingredient_groups')
        .insert({ recipe_id: nouvelleId, name: titreEtape || `Étape ${i + 1}`, order_index: i, scaling_mode: st.scaling_mode } as never)
        .select('id')
        .single();
      if (groupErr || !groupRow) throw groupErr ?? new Error('Groupe refusé');
      const { error: ingErr } = await supabase
        .from('ingredients')
        .insert(st.ingredients.map((it, ii) => ({ ...it, group_id: (groupRow as { id: number }).id, order_index: ii })) as never);
      if (ingErr) throw ingErr;
    }
  } catch (e) {
    console.error('extraction (contenu):', (e as Error).message);
    // Étapes, groupes, ingrédients et photos partent en cascade avec la recette.
    await supabase.from('recipes').delete().eq('id', nouvelleId);
    return NextResponse.json({ erreur: 'La copie des étapes a échoué.' }, { status: 500 });
  }

  return NextResponse.json({ id: nouvelleId });
}
