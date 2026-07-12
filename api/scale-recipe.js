// Maryse Club — Ajustement d'une recette par IA (planification)
// Fonction serverless Vercel : à partir du rendement/des ingrédients d'une
// recette et d'une demande en langage naturel, l'API Claude déduit un
// coefficient multiplicateur unique à appliquer à toutes les quantités.
// La clé ANTHROPIC_API_KEY vit uniquement dans les variables d'environnement Vercel.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://acbabqolghhyxksouaye.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_lWH25Aszggrc6ZttxyMTig_XwXs_IAG';
const MODEL = process.env.IMPORT_MODEL || 'claude-sonnet-5';

const PROMPT = `Tu es un assistant de pâtisserie. On te donne le rendement actuel d'une
recette, ses ingrédients, et la demande d'adaptation d'un utilisateur.
Déduis le COEFFICIENT MULTIPLICATEUR unique à appliquer à TOUTES les quantités
pour satisfaire la demande.

Règles :
- Changement de nombre de portions/pièces : coefficient = cible / actuel.
- Changement de moule ou de dimensions : coefficient = rapport des VOLUMES.
  Rond : π·(diamètre/2)²·hauteur. Carré/rectangle/cadre : L·l·h.
  Si une hauteur manque, suppose la même hauteur qu'à l'origine.
- « J'ai seulement X d'un ingrédient » : coefficient = X / quantité actuelle de cet ingrédient.
- Arrondis le coefficient à 2 décimales. Il doit être strictement positif.
- Si la demande est ambiguë, impossible ou sans rapport avec un redimensionnement,
  renvoie coefficient null et explique brièvement pourquoi.

Réponds UNIQUEMENT par un objet JSON valide, sans texte ni balises autour :
{"coefficient": <nombre ou null>, "explication": "<une phrase en français>"}`;

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
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: 'user', content: userContent }] }),
  });
  if (!r.ok) throw new Error(`API Claude : HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function supabaseUser(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

// Construit le contenu envoyé au modèle à partir du contexte recette + demande
function buildContenu(recette, prompt) {
  const r = recette || {};
  const ings = Array.isArray(r.ingredients) ? r.ingredients : [];
  const liste = ings.slice(0, 60)
    .map(i => `- ${i.nom || i.name}: ${i.quantite ?? i.quantity ?? ''} ${i.unite || i.unit || ''}`.trim())
    .join('\n');
  return `${PROMPT}

Recette : ${r.titre || r.title || 'Sans titre'}
Rendement actuel : ${r.rendement || '(non précisé)'}
Ingrédients :
${liste || '(non fournis)'}

Demande de l'utilisateur : "${String(prompt).slice(0, 1000)}"`;
}

// Valide/normalise la réponse du modèle
function normaliseResultat(obj) {
  const explication = typeof obj?.explication === 'string' ? obj.explication.slice(0, 400) : '';
  let coefficient = obj?.coefficient;
  if (coefficient === null || coefficient === undefined) return { coefficient: null, explication: explication || "Demande trop imprécise pour en déduire un coefficient." };
  coefficient = parseFloat(String(coefficient).replace(',', '.'));
  if (!isFinite(coefficient) || coefficient <= 0) return { coefficient: null, explication: explication || "Coefficient non calculable pour cette demande." };
  return { coefficient: Math.round(coefficient * 100) / 100, explication };
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ erreur: "Ajustement IA indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée sur le serveur." });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = token ? await supabaseUser(token) : null;
  if (!user) return res.status(401).json({ erreur: 'Connexion requise.' });

  const prompt = req.body && typeof req.body.prompt === 'string' ? req.body.prompt.trim() : '';
  if (prompt.length < 3) return res.status(400).json({ erreur: "Décrivez l'ajustement souhaité." });

  let resultat;
  try {
    const raw = await callClaude(apiKey, buildContenu(req.body.recette, prompt));
    resultat = normaliseResultat(parseStrictJson(raw));
  } catch (e) {
    return res.status(502).json({ erreur: "L'ajustement a échoué, réessayez ou saisissez le coefficient manuellement." });
  }

  return res.status(200).json(resultat);
}

module.exports = handler;
module.exports._test = { parseStrictJson, buildContenu, normaliseResultat };
