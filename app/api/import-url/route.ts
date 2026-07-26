// Route Handler — Import de recette par URL ou texte collé (schéma pivot v1.0).
// Extraction (ld+json ou texte) → normalisation Claude → validation → brouillon.
// Auth & RLS via la session Supabase (cookies), plus besoin de jeton en en-tête.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { IMPORT_MODEL, type ClaudeUsage } from '@/lib/ai/claude';
import { computeCost } from '@/lib/ai/cost';
import {
  buildContenu,
  cleanPivotRecette,
  computeVolume,
  extractLdRecipe,
  normalizeRecette,
} from '@/lib/ai/import-pivot';

export const maxDuration = 60;

const QUOTA = parseInt(process.env.IMPORT_DAILY_QUOTA || '20', 10);

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { erreur: "Import indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée sur le serveur." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const url: string | undefined = body?.url;
  const texte = typeof body?.texte === 'string' ? body.texte.trim() : '';
  if (!texte && (!url || !/^https?:\/\//i.test(url))) {
    return NextResponse.json({ erreur: 'URL invalide : elle doit commencer par http(s)://.' }, { status: 400 });
  }
  if (texte && texte.length < 80) {
    return NextResponse.json(
      { erreur: 'Texte trop court pour être une recette : collez la recette complète (ingrédients et étapes).' },
      { status: 400 },
    );
  }

  // Quota journalier (RLS : ne compte que les imports de l'utilisateur).
  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('imports')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', debutJour.toISOString());
  const compte = count ?? 0;
  if (compte >= QUOTA) {
    return NextResponse.json(
      { erreur: `Quota d'imports atteint (${QUOTA} par jour). Réessayez demain.` },
      { status: 429 },
    );
  }

  // 1+2. Contenu à analyser : texte collé, ou page récupérée (ld+json si complet, sinon texte).
  let ld = null;
  let contenu: string;
  if (texte) {
    contenu = `Texte de recette collé par l'utilisateur :\n${texte.slice(0, 60000)}`;
  } else {
    let html: string;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      const page = await fetch(url!, {
        signal: ctl.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (MaryseClub Import)' },
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (!page.ok) throw new Error(`HTTP ${page.status}`);
      html = await page.text();
    } catch (e) {
      return NextResponse.json(
        { erreur: `Page inaccessible (${(e as Error).message}). Vérifiez l'URL, ou saisissez la recette manuellement.` },
        { status: 422 },
      );
    }
    ld = extractLdRecipe(html);
    contenu = buildContenu(ld, html, url!);
  }

  // 3. Normalisation IA + validation, avec au plus une relance au total (voir
  // le commentaire de normalizeRecette : au-delà, le risque de dépasser le
  // temps limite de la fonction devient trop élevé sur une recette complexe).
  let usageTotal: ClaudeUsage;
  let pivot: Record<string, any>;
  let erreurs: string[];
  let alertes: string[];
  try {
    const normalise = await normalizeRecette(apiKey, contenu);
    pivot = normalise.pivot;
    usageTotal = normalise.usage;
    erreurs = normalise.erreurs;
    alertes = normalise.alertes;
  } catch (e) {
    // Les appels déjà effectués ont été facturés même si l'import échoue : on
    // les trace en logs, faute de ligne `imports` où les rattacher.
    const partiel = (e as { usage?: ClaudeUsage }).usage;
    if (partiel) {
      const c = computeCost(partiel, IMPORT_MODEL);
      console.error(
        `[import-url] normalisation IA échouée après ${partiel.inputTokens + partiel.outputTokens} tokens facturés` +
          (c ? ` (~${c.usd.toFixed(4)} $)` : ''),
      );
    }
    console.error('[import-url] normalisation IA échouée :', e);
    return NextResponse.json(
      { erreur: "L'import a échoué, réessayez ou saisissez la recette manuellement." },
      { status: 502 },
    );
  }
  if (erreurs.length) {
    return NextResponse.json({ erreur: 'Extraction incomplète : ' + erreurs.join(' '), erreurs }, { status: 422 });
  }

  // J−n par sous-préparation : entier ≥ 0 (défaut 0).
  (pivot.sous_preparations || []).forEach((sp: Record<string, any>) => {
    const d = parseInt(sp.day_offset, 10);
    sp.day_offset = isNaN(d) || d < 0 ? 0 : d;
  });

  // Ingrédients/ustensiles : majuscule initiale + suppression des notes qui répètent le nom.
  cleanPivotRecette(pivot);

  pivot.schema_version = '1.0';
  pivot.statut = 'brouillon';
  pivot.visibilite = 'privee';
  // Champs de provenance : on conserve ce que l'IA a extrait (auteur, URL
  // d'origine, vidéo), avec repli sur les données schema.org / l'URL importée.
  const iaSource = pivot.source && typeof pivot.source === 'object' ? pivot.source : {};
  const ldVideo = ((v: any) => {
    const o = Array.isArray(v) ? v[0] : v;
    return (o && typeof o === 'object' ? o.contentUrl || o.embedUrl || o.url : o) || null;
  })(ld?.video);
  pivot.source = {
    type: texte ? 'texte' : 'url',
    url: url || iaSource.url_origine || iaSource.url || null,
    url_origine: url || iaSource.url_origine || null,
    video_url: iaSource.video_url || ldVideo || null,
    fichier_original: null,
    auteur_origine:
      iaSource.auteur_origine ||
      (ld && ((ld.author as any)?.name || ld.author)) ||
      null,
    importee_le: new Date().toISOString(),
  };
  if (typeof pivot.source.auteur_origine === 'object') {
    pivot.source.auteur_origine = pivot.source.auteur_origine?.name || null;
  }
  // Conseils de dégustation/conservation (texte libre), extraits par l'IA.
  pivot.conseils_degustation =
    typeof pivot.conseils_degustation === 'string' && pivot.conseils_degustation.trim()
      ? pivot.conseils_degustation.trim()
      : null;

  // 4. Volume du moule.
  if (pivot.rendement && pivot.rendement.moule) {
    pivot.rendement.moule.volume_cm3 = computeVolume(pivot.rendement.moule);
  }

  // 5. Enregistrement en brouillon (RLS via la session), avec le coût réel de
  // l'import (somme de tous les appels IA facturés ci-dessus).
  const cout = computeCost(usageTotal, IMPORT_MODEL);
  // Colonnes de coût hors typage généré tant que `npm run gen:types` n'a pas été
  // rejoué après la migration → client non typé pour cette écriture.
  const table = supabase.from('imports' as never) as ReturnType<typeof supabase.from>;
  const { data: row, error } = await table
    .insert({
      user_id: user.id,
      source_type: texte ? 'texte' : 'url',
      statut: 'brouillon',
      source_url: url || null,
      recette: pivot,
      alertes,
      model: IMPORT_MODEL,
      input_tokens: usageTotal.inputTokens,
      output_tokens: usageTotal.outputTokens,
      // null si le modèle est absent de la table de tarifs : mieux vaut un coût
      // inconnu qu'un coût faux.
      cost_usd: cout ? cout.usd : null,
    } as never)
    .select()
    .single();
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ import: row, alertes, quota_restant: Math.max(0, QUOTA - compte - 1) });
}
