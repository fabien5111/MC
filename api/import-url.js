// Maryse Club — Import de recette par URL (schéma pivot v1.0)
// Fonction serverless Vercel : extraction (ld+json ou texte) → normalisation
// par l'API Claude → validation → enregistrement en brouillon dans `imports`.
// La clé ANTHROPIC_API_KEY vit uniquement dans les variables d'environnement Vercel.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://acbabqolghhyxksouaye.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_lWH25Aszggrc6ZttxyMTig_XwXs_IAG';
const QUOTA = parseInt(process.env.IMPORT_DAILY_QUOTA || '20', 10);
const MODEL = process.env.IMPORT_MODEL || 'claude-sonnet-5';

const SCHEMA_EXEMPLE = {
  schema_version: '1.0',
  titre: 'Entremets vanille-caramel',
  description: 'Un entremets léger sur biscuit madeleine.',
  categorie: 'entremets',
  tags: ['vanille', 'caramel'],
  difficulte: 3,
  temps: { preparation_min: 90, cuisson_min: 25, repos_min: 120, congelation_min: 720 },
  rendement: {
    type: 'moule', portions: 8, pieces: null,
    moule: { forme: 'rond', diametre_cm: 20, longueur_cm: null, largeur_cm: null, hauteur_cm: 4.5, volume_cm3: null, libelle: 'Cercle à entremets 20 cm' },
  },
  sous_preparations: [{
    ordre: 1,
    nom: 'Biscuit madeleine',
    ingredients: [
      { nom: 'beurre', quantite: 100, unite: 'g', texte_original: '100 g de beurre pommade', note: 'pommade', scaling: 'lineaire' },
      { nom: 'gélatine', quantite: 4, unite: 'g', texte_original: '2 feuilles de gélatine', note: 'feuilles de 2 g', scaling: 'lineaire_arrondi' },
    ],
    etapes: [
      { ordre: 1, texte: 'Crémer le beurre avec le sucre.', duree_min: null, temperature_c: null },
      { ordre: 2, texte: 'Cuire 25 min.', duree_min: 25, temperature_c: 170 },
    ],
    materiel: ['robot pâtissier', 'cercle 20 cm'],
  }],
  notes: null,
  photos: [],
};

const PROMPT = `Tu es un extracteur de recettes de pâtisserie. Analyse le contenu fourni
et renvoie UNIQUEMENT un objet JSON valide conforme au schéma ci-dessous,
sans texte avant ni après, sans balises markdown.

Règles :
- Découpe la recette en sous_preparations (biscuit, crémeux, glaçage…).
  S'il n'y en a qu'une, crée une seule sous-préparation nommée "Préparation".
- Normalise chaque quantité en g, ml ou piece. Conversions usuelles :
  1 c. à s. ≈ 15 ml, 1 c. à c. ≈ 5 ml, 1 feuille de gélatine = 2 g,
  1 œuf entier ≈ 50 g, 1 jaune ≈ 20 g, 1 blanc ≈ 30 g.
  Conserve toujours la formulation d'origine dans texte_original.
- Si une information est absente (temps, moule…), mets null. N'invente rien.
- Attribue scaling = "lineaire_arrondi" aux œufs et à la gélatine,
  "fixe" aux pincées et aux éléments de parfum, "lineaire" sinon.
- Si le moule est mentionné, remplis rendement.moule ; sinon rendement.type
  = "portions" avec le nombre indiqué, ou null.

Schéma (exemple) : ${JSON.stringify(SCHEMA_EXEMPLE)}`;

const UNITES = new Set(['g', 'ml', 'piece']);

// ── Extraction depuis la page ────────────────────────────────

// Bloc schema.org "Recipe" dans les <script type="application/ld+json">
function extractLdRecipe(html) {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const findRecipe = node => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const n of node) { const r = findRecipe(n); if (r) return r; } return null; }
    const t = node['@type'];
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return node;
    if (node['@graph']) return findRecipe(node['@graph']);
    return null;
  };
  while ((m = re.exec(html))) {
    try {
      const r = findRecipe(JSON.parse(m[1].trim()));
      if (r) return r;
    } catch (e) { /* bloc invalide : on passe au suivant */ }
  }
  return null;
}

// Texte principal de la page (repli quand pas de ld+json Recipe)
function extractMainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, 30000);
}

// ── Volume du moule (clé de voûte du scaling) ────────────────
function computeVolume(moule) {
  if (!moule || typeof moule !== 'object') return null;
  const { forme, diametre_cm: d, longueur_cm: L, largeur_cm: l, hauteur_cm: h } = moule;
  if (forme === 'rond' && d > 0 && h > 0) return Math.round(Math.PI * (d / 2) ** 2 * h);
  if (['carre', 'rectangle', 'cadre'].includes(forme) && L > 0 && l > 0 && h > 0) return Math.round(L * l * h);
  if (forme === 'buche' && l > 0 && L > 0) return Math.round(Math.PI * (l / 2) ** 2 * L / 2);
  return moule.volume_cm3 > 0 ? Math.round(moule.volume_cm3) : null; // silicone : saisie manuelle
}

// ── Validation (§4) ──────────────────────────────────────────
function validatePivot(p) {
  const erreurs = [], alertes = [];
  if (!p || typeof p !== 'object') return { erreurs: ['Objet JSON manquant.'], alertes };
  if (!p.titre || !String(p.titre).trim()) erreurs.push('Champ obligatoire manquant : titre.');
  if (!p.rendement || typeof p.rendement !== 'object') erreurs.push('Champ obligatoire manquant : rendement.');
  const sps = Array.isArray(p.sous_preparations) ? p.sous_preparations : [];
  if (!sps.length) erreurs.push('Au moins une sous-préparation est requise.');
  let cuissonOuRepos = (p.temps && (p.temps.cuisson_min > 0 || p.temps.repos_min > 0 || p.temps.congelation_min > 0)) || false;
  sps.forEach((sp, i) => {
    const nom = sp.nom || `sous-préparation ${i + 1}`;
    if (!Array.isArray(sp.ingredients) || !sp.ingredients.length) erreurs.push(`« ${nom} » : aucun ingrédient.`);
    if (!Array.isArray(sp.etapes) || !sp.etapes.length) erreurs.push(`« ${nom} » : aucune étape.`);
    (sp.ingredients || []).forEach(ing => {
      if (ing.unite != null && !UNITES.has(ing.unite)) erreurs.push(`« ${nom} » / ${ing.nom} : unité « ${ing.unite} » hors {g, ml, piece}.`);
      if (ing.quantite != null && !(ing.quantite > 0)) erreurs.push(`« ${nom} » / ${ing.nom} : quantité invalide (${ing.quantite}).`);
      if (ing.quantite > 2000 && (ing.unite === 'g' || ing.unite === 'ml')) alertes.push(`Quantité inhabituelle : ${ing.nom} — ${ing.quantite} ${ing.unite}.`);
    });
    const ordres = (sp.etapes || []).map(e => e.ordre).filter(o => o != null);
    const croissant = ordres.every((o, k) => k === 0 || o > ordres[k - 1]);
    if (ordres.length && !croissant) erreurs.push(`« ${nom} » : ordre des étapes incohérent.`);
    (sp.etapes || []).forEach(e => {
      if (e.temperature_c > 250) alertes.push(`Température élevée : ${e.temperature_c} °C (« ${nom} », étape ${e.ordre}).`);
      if (e.temperature_c != null || e.duree_min != null) cuissonOuRepos = true;
    });
  });
  if (!cuissonOuRepos) alertes.push('Aucune cuisson ni repos détecté : vérifiez la recette.');
  return { erreurs, alertes };
}

// ── Appel Claude + parsing strict avec une relance (§4.1) ────
function parseStrictJson(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start > 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

async function callClaude(apiKey, userContent) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!r.ok) throw new Error(`API Claude : HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function normalizeWithRetry(apiKey, contenu) {
  const base = `${PROMPT}\n\nContenu à analyser :\n${contenu}`;
  let raw = await callClaude(apiKey, base);
  try {
    return parseStrictJson(raw);
  } catch (err) {
    // Relance automatique unique avec le message d'erreur (§4.1)
    raw = await callClaude(apiKey, `${base}\n\nTa réponse précédente n'était pas un JSON valide (erreur : ${err.message}). Renvoie UNIQUEMENT l'objet JSON corrigé.`);
    return parseStrictJson(raw); // si ça échoue encore, l'erreur remonte au handler
  }
}

// ── Accès Supabase avec le jeton de l'utilisateur (RLS) ──────
async function supabaseUser(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

async function quotaAtteint(token) {
  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/imports?select=id&created_at=gte.${debutJour.toISOString()}`, {
    method: 'HEAD',
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, prefer: 'count=exact', range: '0-0' },
  });
  const range = r.headers.get('content-range') || '';
  const total = parseInt(range.split('/')[1], 10);
  return { atteint: !isNaN(total) && total >= QUOTA, compte: isNaN(total) ? 0 : total };
}

async function insertBrouillon(token, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/imports`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, authorization: `Bearer ${token}`,
      'content-type': 'application/json', prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`Enregistrement impossible : ${(await r.text()).slice(0, 300)}`);
  return (await r.json())[0];
}

// ── Handler ──────────────────────────────────────────────────
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ erreur: "Import indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée sur le serveur." });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = token ? await supabaseUser(token) : null;
  if (!user) return res.status(401).json({ erreur: 'Connexion requise.' });

  const url = req.body && req.body.url;
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ erreur: 'URL invalide : elle doit commencer par http(s)://.' });

  const quota = await quotaAtteint(token);
  if (quota.atteint) return res.status(429).json({ erreur: `Quota d'imports atteint (${QUOTA} par jour). Réessayez demain.` });

  // 1. Récupération de la page
  let html;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const page = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (MaryseClub Import)' }, redirect: 'follow' });
    clearTimeout(timer);
    if (!page.ok) throw new Error(`HTTP ${page.status}`);
    html = await page.text();
  } catch (e) {
    return res.status(422).json({ erreur: `Page inaccessible (${e.message}). Vérifiez l'URL, ou saisissez la recette manuellement.` });
  }

  // 2. ld+json Recipe si présent (plus fiable et moins coûteux), sinon texte principal (§5)
  const ld = extractLdRecipe(html);
  const contenu = ld ? `Données schema.org "Recipe" extraites de ${url} :\n${JSON.stringify(ld)}` : `Texte de la page ${url} :\n${extractMainText(html)}`;

  // 3. Normalisation par l'IA (avec une relance) puis validation — jamais de brouillon corrompu
  let pivot;
  try {
    pivot = await normalizeWithRetry(apiKey, contenu);
  } catch (e) {
    return res.status(502).json({ erreur: "L'import a échoué, réessayez ou saisissez la recette manuellement." });
  }

  pivot.schema_version = '1.0';
  pivot.statut = 'brouillon';
  pivot.visibilite = 'privee'; // règle §5 : import URL → privée tant que l'utilisateur ne déclare pas en être l'auteur
  pivot.source = {
    type: 'url', url, fichier_original: null,
    auteur_origine: (pivot.source && pivot.source.auteur_origine) || (ld && (ld.author?.name || ld.author)) || null,
    importee_le: new Date().toISOString(),
  };
  if (typeof pivot.source.auteur_origine === 'object') pivot.source.auteur_origine = pivot.source.auteur_origine?.name || null;

  const { erreurs, alertes } = validatePivot(pivot);
  if (erreurs.length) return res.status(422).json({ erreur: 'Extraction incomplète : ' + erreurs.join(' '), erreurs });

  // 4. Volume du moule
  if (pivot.rendement && pivot.rendement.moule) {
    pivot.rendement.moule.volume_cm3 = computeVolume(pivot.rendement.moule);
  }

  // 5. Enregistrement en brouillon
  try {
    const row = await insertBrouillon(token, {
      user_id: user.id,
      source_type: 'url',
      source_url: url,
      statut: 'brouillon',
      recette: pivot,
      alertes,
    });
    return res.status(200).json({ import: row, alertes, quota_restant: Math.max(0, QUOTA - quota.compte - 1) });
  } catch (e) {
    return res.status(500).json({ erreur: e.message });
  }
}

module.exports = handler;
// Exposé pour les tests unitaires uniquement
module.exports._test = { extractLdRecipe, extractMainText, computeVolume, validatePivot, parseStrictJson, normalizeWithRetry };
