// Maryse Club — Client Supabase partagé
const SUPABASE_URL = 'https://acbabqolghhyxksouaye.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lWH25Aszggrc6ZttxyMTig_XwXs_IAG';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── AUTH ──────────────────────────────────────────────────────
async function authSignUp(email, password, fullName) {
  return db.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
}

async function authSignIn(email, password) {
  return db.auth.signInWithPassword({ email, password });
}

async function signInWithGoogle() {
  return db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/index.html' }
  });
}

async function signInWithFacebook() {
  return db.auth.signInWithOAuth({
    provider: 'facebook',
    options: { redirectTo: window.location.origin + '/index.html' }
  });
}

async function authSignOut() {
  localStorage.removeItem('mc-avatar');
  localStorage.removeItem('mc-admin');
  await db.auth.signOut();
  window.location.href = 'connexion.html';
}

async function getUser() {
  // getSession reads from localStorage (no network) — faster and works offline
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) return session.user;
  // Fallback: server verification
  const { data: { user } } = await db.auth.getUser();
  return user;
}

async function getProfile(userId) {
  const { data } = await db.from('profiles').select('*').eq('id', userId).single();
  return data;
}

async function updateProfile(userId, updates) {
  const { data, error } = await db.from('profiles').update(updates).eq('id', userId).select().single();
  if (error) throw error;
  return data;
}

// Redirige vers connexion.html si non connecté
async function requireAuth() {
  const user = await getUser();
  if (!user) { window.location.href = 'connexion.html'; return null; }
  return user;
}

// Pages admin : connecté ET administrateur (profiles.role = 'admin'),
// sinon redirection. La vraie protection des données reste les policies RLS.
async function requireAdmin() {
  const user = await getUser();
  if (!user) { window.location.href = 'connexion.html'; return null; }
  const { data: p, error } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (error) {
    // Erreur technique (ex : cache de schéma pas rafraîchi) — on l'affiche
    // au lieu de rediriger silencieusement comme un simple non-admin.
    console.error('requireAdmin:', error);
    alert('Vérification du statut admin impossible : ' + error.message);
    window.location.href = 'index.html';
    return null;
  }
  if (p?.role !== 'admin') { window.location.href = 'index.html'; return null; }
  return user;
}

// Photo de l'utilisateur : priorité à la photo du site (profiles.avatar_url),
// sinon photo Google (métadonnées de session).
function _applyUserAvatar(url) {
  if (!url) return;
  document.querySelectorAll('[data-user-avatar]').forEach(el => el.src = url);
  const navSlot = document.getElementById('nav-avatar');
  if (navSlot) navSlot.setAttribute('src', url);
}

// Affiche/masque éléments selon l'état de connexion
function _applyAuthUI(user) {
  // Lève le pré-masquage CSS (html:not(.auth-ready) [data-auth="logged-in"])
  document.documentElement.classList.add('auth-ready');
  document.querySelectorAll('[data-auth="logged-in"]').forEach(el => el.style.display = user ? '' : 'none');
  document.querySelectorAll('[data-auth="logged-out"]').forEach(el => el.style.display = user ? 'none' : '');
  if (user) {
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || user.email;
    document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = name);
    // Photo du site en cache local si connue, sinon photo Google en attendant
    _applyUserAvatar(localStorage.getItem('mc-avatar') || meta.avatar_url || meta.picture);
    // Statut admin connu du dernier chargement (confirmé ensuite par _syncProfileAvatar)
    if (localStorage.getItem('mc-admin')) _applyAdminUI(true);
  } else {
    _applyAdminUI(false);
  }
}

// Une photo "site" est une photo choisie par l'utilisateur (upload = data-URL).
// L'ancien code copiait l'URL Google dans profiles.avatar_url : on l'ignore
// pour que la photo Google reste un simple repli.
function isSiteAvatar(url) {
  return !!url && !url.includes('googleusercontent.com');
}

// Liens réservés aux admins (data-auth="admin", masqués par style inline dans le HTML)
function _applyAdminUI(isAdmin) {
  document.querySelectorAll('[data-auth="admin"]').forEach(el => el.style.display = isAdmin ? '' : 'none');
}

// Récupère photo du site + rôle admin en base et les applique (async, non bloquant)
async function _syncProfileAvatar(user) {
  try {
    const { data: p } = await db.from('profiles').select('avatar_url, role').eq('id', user.id).maybeSingle();
    if (isSiteAvatar(p?.avatar_url)) {
      localStorage.setItem('mc-avatar', p.avatar_url);
      _applyUserAvatar(p.avatar_url);
    } else {
      localStorage.removeItem('mc-avatar');
      const meta = user.user_metadata || {};
      _applyUserAvatar(meta.avatar_url || meta.picture);
    }
    const isAdmin = p?.role === 'admin';
    if (isAdmin) localStorage.setItem('mc-admin', '1'); else localStorage.removeItem('mc-admin');
    _applyAdminUI(isAdmin);
  } catch (_) { /* réseau indisponible : on garde le fallback affiché */ }
}

async function initAuthUI() {
  // onAuthStateChange always fires INITIAL_SESSION immediately with the current state.
  // This is more reliable than getSession() for OAuth redirects (PKCE exchange is async).
  return new Promise(resolve => {
    let done = false;
    db.auth.onAuthStateChange((event, session) => {
      _applyAuthUI(session?.user || null);
      if (!done && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT')) {
        done = true;
        if (session?.user) _syncProfileAvatar(session.user);
        resolve(session?.user || null);
      }
    });
    setTimeout(() => { if (!done) { done = true; resolve(null); } }, 3000);
  });
}

// ── RECETTES ─────────────────────────────────────────────────
async function getRecipes({ limit = 12, status = 'published', authorId = null, typeId = null } = {}) {
  let q = db.from('recipes')
    .select('id, title, description, hero_image_url, prep_time, total_time, rating_avg, rating_count, created_at, profiles!recipes_author_id_fkey(full_name, avatar_url), recipe_types(name), difficulties(name, level)')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (authorId) q = q.eq('author_id', authorId);
  if (typeId)   q = q.eq('type_id', typeId);
  const { data, error } = await q;
  if (error) console.error(error);
  return data || [];
}

async function getRecipe(id) {
  const { data, error } = await db.from('recipes')
    .select(`
      *,
      profiles!recipes_author_id_fkey(full_name, avatar_url, username),
      recipe_types(name),
      difficulties(name, level),
      mold_types(name),
      recipe_tags(tags(id, name, slug)),
      recipe_utensils(*),
      ingredient_groups(*, ingredients(*)),
      recipe_steps(*, step_photos(*))
    `)
    .eq('id', id)
    .single();
  if (error) console.error(error);
  return data;
}

async function createRecipe(recipeData) {
  const user = await getUser();
  if (!user) throw new Error('Non connecté');
  const { data, error } = await db.from('recipes')
    .insert({ status: 'pending', ...recipeData, author_id: user.id })
    .select().single();
  if (error) throw error;
  return data;
}

async function getUserRecipes(userId) {
  const { data } = await db.from('recipes')
    .select('id, title, hero_image_url, status, is_public, rating_avg, created_at')
    .eq('author_id', userId)
    .order('created_at', { ascending: false });
  return data || [];
}

// ── FAVORIS ───────────────────────────────────────────────────
async function getFavorites(userId) {
  const { data, error } = await db.from('favorites')
    .select('recipe_id, created_at, recipes(id, title, hero_image_url, rating_avg, profiles!recipes_author_id_fkey(full_name))')
    .eq('user_id', userId);
  if (error) console.error('getFavorites:', error);
  return data || [];
}

async function isFavorite(recipeId) {
  const user = await getUser();
  if (!user) return false;
  const { data } = await db.from('favorites')
    .select('recipe_id').eq('user_id', user.id).eq('recipe_id', recipeId).maybeSingle();
  return !!data;
}

async function toggleFavorite(recipeId) {
  const user = await getUser();
  if (!user) { window.location.href = 'connexion.html'; return false; }
  const already = await isFavorite(recipeId);
  if (already) {
    const { error } = await db.from('favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId);
    if (error) { alert('Favori non retiré : ' + error.message); return true; }
    return false;
  } else {
    const { error } = await db.from('favorites').insert({ user_id: user.id, recipe_id: recipeId });
    if (error) { alert('Favori non enregistré : ' + error.message); return false; }
    return true;
  }
}

// ── PLANNING ─────────────────────────────────────────────────
async function getPlanning(userId) {
  const { data } = await db.from('planning')
    .select('*, recipes(id, title, hero_image_url, prep_time)')
    .eq('user_id', userId)
    .order('planned_date', { ascending: true });
  return data || [];
}

async function addToPlanning(recipeId, plannedDate, notes = '') {
  const user = await getUser();
  if (!user) return;
  return db.from('planning').insert({ user_id: user.id, recipe_id: recipeId, planned_date: plannedDate, notes });
}

async function removePlanning(id) {
  return db.from('planning').delete().eq('id', id);
}

// ── LISTE DE COURSES ─────────────────────────────────────────
async function getShoppingItems(userId) {
  const { data } = await db.from('shopping_items')
    .select('*').eq('user_id', userId).order('created_at');
  return data || [];
}

async function toggleShoppingItem(itemId, isChecked) {
  return db.from('shopping_items').update({ is_checked: isChecked }).eq('id', itemId);
}

async function addShoppingItem(name, quantity, unit, recipeId = null) {
  const user = await getUser();
  if (!user) return;
  return db.from('shopping_items').insert({ user_id: user.id, name, quantity, unit, recipe_id: recipeId });
}

// ── COMMENTAIRES ─────────────────────────────────────────────
async function getComments(recipeId) {
  const { data } = await db.from('comments')
    .select('*, profiles(full_name, avatar_url)')
    .eq('recipe_id', recipeId).eq('status', 'approved')
    .order('created_at', { ascending: false });
  return data || [];
}

async function addComment(recipeId, content, rating = null) {
  const user = await getUser();
  if (!user) throw new Error('Non connecté');
  return db.from('comments').insert({ recipe_id: recipeId, user_id: user.id, content, rating });
}

// ── CRUD GÉNÉRIQUE POUR LES LISTES ───────────────────────────
async function getListEntries(tableName, orderBy = 'name') {
  const { data } = await db.from(tableName).select('*').order(orderBy);
  return data || [];
}

async function addListEntry(tableName, fields) {
  const { data, error } = await db.from(tableName).insert(fields).select().single();
  if (error) throw error;
  return data;
}

async function updateListEntry(tableName, id, fields) {
  const { data, error } = await db.from(tableName).update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteListEntry(tableName, id) {
  const { error } = await db.from(tableName).delete().eq('id', id);
  if (error) throw error;
}

// ── LISTES TAXONOMY ──────────────────────────────────────────
async function getRecipeTypes() {
  const { data } = await db.from('recipe_types').select('*').eq('status', 'published').order('id');
  return data || [];
}

async function getTags() {
  const { data } = await db.from('tags').select('*').eq('status', 'published').order('name');
  return data || [];
}

async function getDifficulties() {
  const { data } = await db.from('difficulties').select('*').order('level');
  return data || [];
}

async function getMoldTypes() {
  const { data } = await db.from('mold_types').select('*').eq('status', 'published').order('name');
  return data || [];
}

async function getMolds(typeId = null) {
  let q = db.from('molds').select('*, mold_types(name)').order('name');
  if (typeId) q = q.eq('type_id', typeId);
  const { data } = await q;
  return data || [];
}

async function addMold(name, typeId) {
  const { data, error } = await db.from('molds').insert({ name, type_id: typeId || null }).select().single();
  if (error) throw error;
  return data;
}

async function updateMold(id, name, typeId) {
  const { data, error } = await db.from('molds').update({ name, type_id: typeId || null }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteMold(id) {
  const { error } = await db.from('molds').delete().eq('id', id);
  if (error) throw error;
}

async function getUnits() {
  const { data } = await db.from('units').select('*').order('name');
  return data || [];
}

// ── MEMBRES / ALLOWLIST ──────────────────────────────────────
async function getAllowlistMembers() {
  const [{ data: profiles }, { data: allowlist }, { data: recipes }] = await Promise.all([
    db.from('profiles').select('id, email, full_name, avatar_url, provider, status, role, plan, is_demo, notes, created_at').order('created_at', { ascending: false }),
    db.from('allowlist').select('*'),
    db.from('recipes').select('author_id'),
  ]);

  const recipeMap = {};
  (recipes || []).forEach(r => { recipeMap[r.author_id] = (recipeMap[r.author_id] || 0) + 1; });

  // Index allowlist par email
  const allowlistByEmail = {};
  (allowlist || []).forEach(a => { allowlistByEmail[a.email.toLowerCase()] = a; });

  const usedEmails = new Set();

  // Membres inscrits (depuis profiles)
  const registered = (profiles || []).map(p => {
    const emailKey = (p.email || '').toLowerCase();
    const al = emailKey ? allowlistByEmail[emailKey] : null;
    if (emailKey) usedEmails.add(emailKey);
    return {
      _source: 'profile',
      _profileId: p.id,
      _allowlistId: al?.id || null,
      id: `p-${p.id}`,
      email: p.email || '',
      status: al?.status || p.status || 'active',
      role: al?.role || p.role || 'member',
      plan: al?.plan || p.plan || 'free',
      is_demo: al?.is_demo ?? p.is_demo ?? false,
      notes: al?.notes || p.notes || null,
      invited_at: al?.invited_at || p.created_at,
      profile: { ...p, recipeCount: recipeMap[p.id] || 0 },
    };
  });

  // Invités en attente (dans allowlist mais jamais inscrits)
  const pending = (allowlist || [])
    .filter(a => !usedEmails.has(a.email.toLowerCase()))
    .map(a => ({
      _source: 'allowlist',
      _profileId: null,
      _allowlistId: a.id,
      id: `a-${a.id}`,
      email: a.email,
      status: a.status,
      role: a.role,
      plan: a.plan,
      is_demo: a.is_demo,
      notes: a.notes,
      invited_at: a.invited_at,
      profile: null,
    }));

  return [...registered, ...pending];
}

async function inviteMember(email, options = {}) {
  const { data, error } = await db.from('allowlist')
    .insert({ email: email.toLowerCase().trim(), ...options })
    .select().single();
  if (error) throw error;
  return data;
}

// Met à jour allowlist si entrée existe, sinon met à jour profiles directement
async function updateMember(member, fields) {
  if (member._allowlistId) {
    const { data, error } = await db.from('allowlist').update(fields).eq('id', member._allowlistId).select().single();
    if (error) throw error;
    return data;
  } else if (member._profileId) {
    const { data, error } = await db.from('profiles').update(fields).eq('id', member._profileId).select().single();
    if (error) throw error;
    return data;
  }
  throw new Error('Membre introuvable');
}

async function deleteMember(member) {
  if (member._allowlistId) {
    const { error } = await db.from('allowlist').delete().eq('id', member._allowlistId);
    if (error) throw error;
  }
  if (member._profileId) {
    const { error } = await db.from('profiles').delete().eq('id', member._profileId);
    if (error) throw error;
  }
}

// ── ADMIN ─────────────────────────────────────────────────────
async function getPendingRecipes() {
  const { data } = await db.from('recipes')
    .select('*, profiles!recipes_author_id_fkey(full_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return data || [];
}

async function approveRecipe(id) {
  return db.from('recipes').update({ status: 'published' }).eq('id', id);
}

async function deleteRecipe(id) {
  return db.from('recipes').delete().eq('id', id);
}

async function getPendingComments() {
  const { data } = await db.from('comments')
    .select('*, profiles(full_name), recipes(title)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return data || [];
}

async function approveComment(id) {
  return db.from('comments').update({ status: 'approved' }).eq('id', id);
}

async function spamComment(id) {
  return db.from('comments').update({ status: 'spam' }).eq('id', id);
}

async function deleteComment(id) {
  return db.from('comments').delete().eq('id', id);
}

async function getAdminStats() {
  const [r, p, c] = await Promise.all([
    db.from('recipes').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    db.from('recipes').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('comments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  return { totalRecipes: r.count || 0, pendingRecipes: p.count || 0, pendingComments: c.count || 0 };
}

// ── COMPRESSION D'IMAGES ─────────────────────────────────────
// Redimensionne (côté le plus long ≤ maxDim) et encode en WebP.
// Accepte une dataURL ou une URL ; retourne une dataURL compressée.
function compressImageUrl(url, maxDim = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/webp', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Lit la photo affichée dans un <image-slot> (dataURL si déposée par l'utilisateur)
function getSlotImage(slotId) {
  const el = document.getElementById(slotId);
  if (!el) return null;
  const src = el.shadowRoot?.querySelector('img')?.src || el.getAttribute('src');
  return src && src.startsWith('data:') ? src : null;
}

// ── PHOTOS PROFIL ────────────────────────────────────────────
function resizeImage(file, maxWidth) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function uploadPhoto(userId, file, type) {
  const maxWidth = type === 'avatar' ? 400 : 1400;
  const dataUrl = await resizeImage(file, maxWidth);
  const field = type === 'avatar' ? 'avatar_url' : 'banner_url';
  const { error } = await db.from('profiles').upsert({ id: userId, [field]: dataUrl });
  if (error) throw error;
  if (type === 'avatar') {
    localStorage.setItem('mc-avatar', dataUrl);
    _applyUserAvatar(dataUrl);
  }
  return dataUrl;
}

// Nettoie un HTML issu de l'éditeur enrichi : ne conserve que
// gras/italique/retours à la ligne, sans aucun attribut.
function sanitizeRich(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html ?? '');
  const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'BR', 'P', 'DIV']);
  (function walk(node) {
    [...node.children].forEach(child => {
      walk(child);
      if (!ALLOWED.has(child.tagName)) {
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        child.remove();
      } else {
        [...child.attributes].forEach(a => child.removeAttribute(a.name));
      }
    });
  })(tpl.content);
  return tpl.innerHTML;
}

// ── UTILITAIRES ──────────────────────────────────────────────
function formatTime(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function stars(avg) {
  const n = Math.round(avg || 0);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function recipeCardHTML(r) {
  return `
    <article class="group relative bg-surface-container-lowest border border-outline-variant hover:shadow-lg transition-all duration-500 hover:-translate-y-1">
      <a href="recette.html?id=${r.id}" class="block">
        <div class="aspect-[4/3] bg-surface-container overflow-hidden relative">
          ${r.hero_image_url
            ? `<img src="${r.hero_image_url}" alt="${r.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">`
            : `<div class="w-full h-full flex items-center justify-center text-on-surface-variant"><span class="material-symbols-outlined text-5xl">cake</span></div>`
          }
        </div>
        <div class="p-6">
          <div class="flex items-center justify-between mb-2">
            <span class="font-label-md text-label-md text-secondary uppercase tracking-widest text-xs">${r.recipe_types?.name || ''}</span>
            <span class="text-xs text-on-surface-variant">${formatTime(r.total_time || r.prep_time)}</span>
          </div>
          <h3 class="font-headline-md text-xl text-on-surface mb-2 group-hover:text-primary transition-colors">${r.title}</h3>
          <p class="text-sm text-on-surface-variant line-clamp-2 mb-4">${r.description || ''}</p>
          <div class="flex items-center justify-between">
            <span class="text-xs text-secondary">${r.profiles?.full_name || r.author_name || ''}</span>
            <span class="text-xs text-secondary">${r.rating_avg ? `${parseFloat(r.rating_avg).toFixed(1)} ★` : ''}</span>
          </div>
        </div>
      </a>
    </article>`;
}
