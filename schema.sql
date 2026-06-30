-- ============================================================
-- MARYSE CLUB — Schéma Supabase
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- PROFILES (extension de auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  full_name text,
  bio text,
  avatar_url text,
  cover_url text,
  instagram text,
  website text,
  followers_count integer default 0,
  following_count integer default 0,
  is_admin boolean default false,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Profiles lisibles par tous" on public.profiles for select using (true);
create policy "Insertion par le propriétaire" on public.profiles for insert with check (auth.uid() = id);
create policy "Mise à jour par le propriétaire" on public.profiles for update using (auth.uid() = id);

-- Créer le profil automatiquement à l'inscription
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- TYPES DE RECETTES
create table if not exists public.recipe_types (
  id serial primary key,
  name text not null,
  slug text unique not null,
  icon text default 'cake',
  status text default 'published',
  created_at timestamptz default now()
);
alter table public.recipe_types enable row level security;
create policy "Types lisibles par tous" on public.recipe_types for select using (true);
create policy "Admins gèrent les types" on public.recipe_types for all using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- TAGS
create table if not exists public.tags (
  id serial primary key,
  name text not null,
  slug text unique not null,
  status text default 'published',
  created_at timestamptz default now()
);
alter table public.tags enable row level security;
create policy "Tags lisibles par tous" on public.tags for select using (true);
create policy "Admins gèrent les tags" on public.tags for all using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- TYPES DE MOULES
create table if not exists public.mold_types (
  id serial primary key,
  name text not null,
  slug text unique not null,
  status text default 'published',
  created_at timestamptz default now()
);
alter table public.mold_types enable row level security;
create policy "Moules lisibles par tous" on public.mold_types for select using (true);
create policy "Admins gèrent les moules" on public.mold_types for all using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- DIFFICULTÉS
create table if not exists public.difficulties (
  id serial primary key,
  name text not null,
  level integer not null unique,
  status text default 'published'
);
alter table public.difficulties enable row level security;
create policy "Difficultés lisibles par tous" on public.difficulties for select using (true);

-- UNITÉS DE MESURE
create table if not exists public.units (
  id serial primary key,
  name text not null,
  abbreviation text,
  status text default 'published'
);
alter table public.units enable row level security;
create policy "Unités lisibles par tous" on public.units for select using (true);

-- RECETTES
create table if not exists public.recipes (
  id uuid default gen_random_uuid() primary key,
  author_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  type_id integer references public.recipe_types(id),
  mold_type_id integer references public.mold_types(id),
  mold_description text,
  difficulty_id integer references public.difficulties(id),
  prep_time integer,
  cook_time integer,
  total_time integer,
  servings integer default 8,
  hero_image_url text,
  is_public boolean default true,
  status text default 'draft',
  rating_avg numeric(3,2) default 0,
  rating_count integer default 0,
  view_count integer default 0,
  global_tips text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.recipes enable row level security;
create policy "Recettes publiées lisibles par tous" on public.recipes
  for select using (status = 'published' or auth.uid() = author_id);
create policy "Auteurs insèrent leurs recettes" on public.recipes
  for insert with check (auth.uid() = author_id);
create policy "Auteurs modifient leurs recettes" on public.recipes
  for update using (auth.uid() = author_id);
create policy "Auteurs suppriment leurs recettes" on public.recipes
  for delete using (auth.uid() = author_id);

-- TAGS PAR RECETTE
create table if not exists public.recipe_tags (
  recipe_id uuid references public.recipes(id) on delete cascade,
  tag_id integer references public.tags(id) on delete cascade,
  primary key (recipe_id, tag_id)
);
alter table public.recipe_tags enable row level security;
create policy "Recipe tags lisibles par tous" on public.recipe_tags for select using (true);
create policy "Auteurs gèrent leurs tags" on public.recipe_tags for all using (
  exists (select 1 from public.recipes where id = recipe_id and author_id = auth.uid())
);

-- USTENSILES
create table if not exists public.recipe_utensils (
  id serial primary key,
  recipe_id uuid references public.recipes(id) on delete cascade,
  name text not null,
  order_index integer default 0
);
alter table public.recipe_utensils enable row level security;
create policy "Ustensiles lisibles par tous" on public.recipe_utensils for select using (true);
create policy "Auteurs gèrent leurs ustensiles" on public.recipe_utensils for all using (
  exists (select 1 from public.recipes where id = recipe_id and author_id = auth.uid())
);

-- GROUPES D'INGRÉDIENTS
create table if not exists public.ingredient_groups (
  id serial primary key,
  recipe_id uuid references public.recipes(id) on delete cascade,
  name text not null,
  order_index integer default 0
);
alter table public.ingredient_groups enable row level security;
create policy "Groupes lisibles par tous" on public.ingredient_groups for select using (true);
create policy "Auteurs gèrent leurs groupes" on public.ingredient_groups for all using (
  exists (select 1 from public.recipes where id = recipe_id and author_id = auth.uid())
);

-- INGRÉDIENTS
create table if not exists public.ingredients (
  id serial primary key,
  group_id integer references public.ingredient_groups(id) on delete cascade,
  name text not null,
  quantity text,
  unit text,
  order_index integer default 0
);
alter table public.ingredients enable row level security;
create policy "Ingrédients lisibles par tous" on public.ingredients for select using (true);
create policy "Auteurs gèrent leurs ingrédients" on public.ingredients for all using (
  exists (
    select 1 from public.ingredient_groups ig
    join public.recipes r on r.id = ig.recipe_id
    where ig.id = group_id and r.author_id = auth.uid()
  )
);

-- ÉTAPES
create table if not exists public.recipe_steps (
  id serial primary key,
  recipe_id uuid references public.recipes(id) on delete cascade,
  step_number integer not null,
  title text,
  description text,
  prep_time integer,
  wait_time integer,
  order_index integer default 0
);
alter table public.recipe_steps enable row level security;
create policy "Étapes lisibles par tous" on public.recipe_steps for select using (true);
create policy "Auteurs gèrent leurs étapes" on public.recipe_steps for all using (
  exists (select 1 from public.recipes where id = recipe_id and author_id = auth.uid())
);

-- PHOTOS D'ÉTAPES
create table if not exists public.step_photos (
  id serial primary key,
  step_id integer references public.recipe_steps(id) on delete cascade,
  url text not null,
  caption text,
  order_index integer default 0
);
alter table public.step_photos enable row level security;
create policy "Photos lisibles par tous" on public.step_photos for select using (true);
create policy "Auteurs gèrent leurs photos" on public.step_photos for all using (
  exists (
    select 1 from public.recipe_steps rs
    join public.recipes r on r.id = rs.recipe_id
    where rs.id = step_id and r.author_id = auth.uid()
  )
);

-- FAVORIS
create table if not exists public.favorites (
  user_id uuid references public.profiles(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, recipe_id)
);
alter table public.favorites enable row level security;
create policy "Favoris gérés par le propriétaire" on public.favorites for all using (auth.uid() = user_id);

-- PLANNING
create table if not exists public.planning (
  id serial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete cascade,
  planned_date date,
  notes text,
  created_at timestamptz default now()
);
alter table public.planning enable row level security;
create policy "Planning géré par le propriétaire" on public.planning for all using (auth.uid() = user_id);

-- LISTE DE COURSES
create table if not exists public.shopping_items (
  id serial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  quantity text,
  unit text,
  is_checked boolean default false,
  recipe_id uuid references public.recipes(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.shopping_items enable row level security;
create policy "Courses gérées par le propriétaire" on public.shopping_items for all using (auth.uid() = user_id);

-- COMMENTAIRES
create table if not exists public.comments (
  id serial primary key,
  recipe_id uuid references public.recipes(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  content text not null,
  rating integer check (rating >= 1 and rating <= 5),
  status text default 'pending',
  created_at timestamptz default now()
);
alter table public.comments enable row level security;
create policy "Commentaires approuvés lisibles par tous" on public.comments
  for select using (status = 'approved' or auth.uid() = user_id);
create policy "Utilisateurs connectés commentent" on public.comments
  for insert with check (auth.uid() = user_id);
create policy "Admins modèrent les commentaires" on public.comments
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
create policy "Admins suppriment les commentaires" on public.comments
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ABONNEMENTS
create table if not exists public.follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);
alter table public.follows enable row level security;
create policy "Abonnements lisibles par tous" on public.follows for select using (true);
create policy "Utilisateurs gèrent leurs abonnements" on public.follows for all using (auth.uid() = follower_id);

-- ============================================================
-- DONNÉES INITIALES
-- ============================================================

insert into public.recipe_types (name, slug, icon) values
  ('Tartes & Pâtisseries', 'tartes', 'pie_chart'),
  ('Entremets & Gâteaux', 'entremets', 'cake'),
  ('Biscuits & Petits Fours', 'biscuits', 'cookie'),
  ('Viennoiseries', 'viennoiseries', 'breakfast_dining'),
  ('Chocolats & Confiseries', 'chocolats', 'favorite'),
  ('Crèmes & Mousses', 'cremes', 'local_cafe'),
  ('Glaces & Sorbets', 'glaces', 'icecream'),
  ('Pain & Brioches', 'pains', 'bakery_dining')
on conflict (slug) do nothing;

insert into public.tags (name, slug) values
  ('Végétalien', 'vegan'),
  ('Sans gluten', 'sans-gluten'),
  ('Sans lactose', 'sans-lactose'),
  ('Fruité', 'fruite'),
  ('Chocolat', 'chocolat'),
  ('Vanille', 'vanille'),
  ('Rapide', 'rapide'),
  ('Festif', 'festif'),
  ('Classique', 'classique'),
  ('Moderne', 'moderne'),
  ('Croquant', 'croquant'),
  ('Fondant', 'fondant')
on conflict (slug) do nothing;

insert into public.mold_types (name, slug) values
  ('Moule rond', 'rond'),
  ('Moule carré', 'carre'),
  ('Moule rectangulaire', 'rectangulaire'),
  ('Moule à bûche', 'buche'),
  ('Cercle à entremets', 'cercle'),
  ('Moule à tarte', 'tarte'),
  ('Moule à madeleine', 'madeleine'),
  ('Moule à financiers', 'financiers'),
  ('Plaque de cuisson', 'plaque')
on conflict (slug) do nothing;

insert into public.difficulties (name, level) values
  ('Accessible', 1),
  ('Intermédiaire', 2),
  ('Avancé', 3),
  ('Expert', 4),
  ('Maître Pâtissier', 5)
on conflict (level) do nothing;

insert into public.units (name, abbreviation) values
  ('grammes', 'g'),
  ('kilogrammes', 'kg'),
  ('millilitres', 'ml'),
  ('centilitres', 'cl'),
  ('litres', 'L'),
  ('cuillère à café', 'c. à c.'),
  ('cuillère à soupe', 'c. à s.'),
  ('pincée', 'pincée'),
  ('unité(s)', 'u.')
on conflict do nothing;
