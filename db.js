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

// Affiche/masque éléments selon l'état de connexion
async function initAuthUI() {
  const user = await getUser();
  document.querySelectorAll('[data-auth="logged-in"]').forEach(el => el.style.display = user ? '' : 'none');
  document.querySelectorAll('[data-auth="logged-out"]').forEach(el => el.style.display = user ? 'none' : '');
  if (user) {
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || user.email;
    const avatar = meta.avatar_url || meta.picture;
    document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = name);
    document.querySelectorAll('[data-user-avatar]').forEach(el => { if (avatar) el.src = avatar; });
    // Mettre à jour l'avatar de nav
    if (avatar) {
      const navSlot = document.getElementById('nav-avatar');
      if (navSlot) navSlot.setAttribute('src', avatar);
    }
  }
  return user;
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
      recipe_tags(tags(name, slug)),
      recipe_utensils(name, order_index),
      ingredient_groups(*, ingredients(name, quantity, unit, order_index)),
      recipe_steps(*, step_photos(url, caption, order_index))
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
    .insert({ ...recipeData, author_id: user.id, status: 'pending' })
    .select().single();
  if (error) throw error;
  return data;
}

async function getUserRecipes(userId) {
  const { data } = await db.from('recipes')
    .select('id, title, hero_image_url, status, rating_avg, created_at')
    .eq('author_id', userId)
    .order('created_at', { ascending: false });
  return data || [];
}

// ── FAVORIS ───────────────────────────────────────────────────
async function getFavorites(userId) {
  const { data } = await db.from('favorites')
    .select('recipe_id, created_at, recipes(id, title, hero_image_url, rating_avg, profiles(full_name))')
    .eq('user_id', userId);
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
    await db.from('favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId);
    return false;
  } else {
    await db.from('favorites').insert({ user_id: user.id, recipe_id: recipeId });
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
  const [{ data: allowlist }, { data: profiles }, { data: recipes }] = await Promise.all([
    db.from('allowlist').select('*').order('invited_at', { ascending: false }),
    db.from('profiles').select('id, email, full_name, avatar_url, provider, created_at'),
    db.from('recipes').select('author_id'),
  ]);
  const recipeMap = {};
  (recipes || []).forEach(r => { recipeMap[r.author_id] = (recipeMap[r.author_id] || 0) + 1; });
  const profileMap = {};
  (profiles || []).forEach(p => { if (p.email) profileMap[p.email.toLowerCase()] = { ...p, recipeCount: recipeMap[p.id] || 0 }; });
  return (allowlist || []).map(m => ({ ...m, profile: profileMap[m.email.toLowerCase()] || null }));
}

async function inviteMember(email, options = {}) {
  const { data, error } = await db.from('allowlist')
    .insert({ email: email.toLowerCase().trim(), ...options })
    .select().single();
  if (error) throw error;
  return data;
}

async function updateMember(id, fields) {
  const { data, error } = await db.from('allowlist').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteMember(id) {
  const { error } = await db.from('allowlist').delete().eq('id', id);
  if (error) throw error;
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
  return dataUrl;
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
