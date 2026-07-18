// Types de la base Supabase « Maryse Club ».
//
// Reconstruits hors-ligne depuis les migrations du repo (schema.sql,
// setup-molds.sql, setup-membres.sql, setup-storage.sql) et l'usage réel dans
// le code (db.js, admin-*.html). La génération automatique
// (`supabase gen types`) est indisponible dans cet environnement : le réseau
// bloque l'accès au projet Supabase.
//
// SOURCE DE VÉRITÉ DÉFINITIVE : lancer `npm run gen:types` en local (accès
// réseau + access token) et committer le fichier régénéré. Les tables marquées
// « INFÉRÉ » ci-dessous n'ont aucune migration dans le repo (créées via le
// dashboard) : leurs colonnes sont déduites de l'usage et à confirmer.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          full_name: string | null;
          bio: string | null;
          avatar_url: string | null;
          cover_url: string | null;
          banner_url: string | null; // setup-storage.sql
          instagram: string | null;
          website: string | null;
          followers_count: number;
          following_count: number;
          is_admin: boolean;
          // Extensions setup-membres.sql (NOT NULL DEFAULT côté base).
          email: string | null;
          status: string; // active | disabled
          role: string; // member | admin
          plan: string; // free | paid
          is_demo: boolean;
          notes: string | null;
          provider: string | null; // google | email
          created_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          full_name?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          cover_url?: string | null;
          banner_url?: string | null;
          instagram?: string | null;
          website?: string | null;
          followers_count?: number;
          following_count?: number;
          is_admin?: boolean;
          email?: string | null;
          status?: string;
          role?: string;
          plan?: string;
          is_demo?: boolean;
          notes?: string | null;
          provider?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      recipe_types: {
        Row: { id: number; name: string; slug: string; icon: string; status: string; tooltip: string | null; created_at: string };
        Insert: { id?: number; name: string; slug: string; icon?: string; status?: string; tooltip?: string | null; created_at?: string };
        Update: Partial<Database['public']['Tables']['recipe_types']['Insert']>;
        Relationships: [];
      };
      tags: {
        Row: { id: number; name: string; slug: string; status: string; tooltip: string | null; created_at: string };
        Insert: { id?: number; name: string; slug: string; status?: string; tooltip?: string | null; created_at?: string };
        Update: Partial<Database['public']['Tables']['tags']['Insert']>;
        Relationships: [];
      };
      mold_types: {
        // forme : ajoutée via l'admin (cylindre | rectangulaire | demi-cylindre | oblong).
        Row: { id: number; name: string; slug: string; status: string; forme: string | null; tooltip: string | null; created_at: string };
        Insert: { id?: number; name: string; slug: string; status?: string; forme?: string | null; tooltip?: string | null; created_at?: string };
        Update: Partial<Database['public']['Tables']['mold_types']['Insert']>;
        Relationships: [];
      };
      difficulties: {
        Row: { id: number; name: string; level: number; status: string; tooltip: string | null };
        Insert: { id?: number; name: string; level: number; status?: string; tooltip?: string | null };
        Update: Partial<Database['public']['Tables']['difficulties']['Insert']>;
        Relationships: [];
      };
      units: {
        Row: { id: number; name: string; abbreviation: string | null; status: string; tooltip: string | null };
        Insert: { id?: number; name: string; abbreviation?: string | null; status?: string; tooltip?: string | null };
        Update: Partial<Database['public']['Tables']['units']['Insert']>;
        Relationships: [];
      };
      // Moules concrets (setup-molds.sql). id bigint identity.
      molds: {
        Row: { id: number; name: string; type_id: number | null; status: string; tooltip: string | null; created_at: string };
        Insert: { id?: number; name: string; type_id?: number | null; status?: string; tooltip?: string | null; created_at?: string };
        Update: Partial<Database['public']['Tables']['molds']['Insert']>;
        Relationships: [];
      };
      recipes: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          description: string | null;
          type_id: number | null;
          mold_type_id: number | null;
          mold_description: string | null;
          difficulty_id: number | null;
          prep_time: number | null;
          cook_time: number | null;
          total_time: number | null;
          servings: number;
          hero_image_url: string | null;
          is_public: boolean;
          status: string;
          rating_avg: number;
          rating_count: number;
          view_count: number;
          global_tips: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          title: string;
          description?: string | null;
          type_id?: number | null;
          mold_type_id?: number | null;
          mold_description?: string | null;
          difficulty_id?: number | null;
          prep_time?: number | null;
          cook_time?: number | null;
          total_time?: number | null;
          servings?: number;
          hero_image_url?: string | null;
          is_public?: boolean;
          status?: string;
          rating_avg?: number;
          rating_count?: number;
          view_count?: number;
          global_tips?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['recipes']['Insert']>;
        Relationships: [];
      };
      recipe_tags: {
        Row: { recipe_id: string; tag_id: number };
        Insert: { recipe_id: string; tag_id: number };
        Update: Partial<Database['public']['Tables']['recipe_tags']['Insert']>;
        Relationships: [];
      };
      recipe_utensils: {
        Row: { id: number; recipe_id: string; name: string; order_index: number };
        Insert: { id?: number; recipe_id: string; name: string; order_index?: number };
        Update: Partial<Database['public']['Tables']['recipe_utensils']['Insert']>;
        Relationships: [];
      };
      ingredient_groups: {
        Row: { id: number; recipe_id: string; name: string; order_index: number };
        Insert: { id?: number; recipe_id: string; name: string; order_index?: number };
        Update: Partial<Database['public']['Tables']['ingredient_groups']['Insert']>;
        Relationships: [];
      };
      ingredients: {
        Row: { id: number; group_id: number; name: string; quantity: string | null; unit: string | null; order_index: number };
        Insert: { id?: number; group_id: number; name: string; quantity?: string | null; unit?: string | null; order_index?: number };
        Update: Partial<Database['public']['Tables']['ingredients']['Insert']>;
        Relationships: [];
      };
      recipe_steps: {
        Row: {
          id: number;
          recipe_id: string;
          step_number: number;
          title: string | null;
          description: string | null;
          prep_time: number | null;
          wait_time: number | null;
          order_index: number;
        };
        Insert: {
          id?: number;
          recipe_id: string;
          step_number: number;
          title?: string | null;
          description?: string | null;
          prep_time?: number | null;
          wait_time?: number | null;
          order_index?: number;
        };
        Update: Partial<Database['public']['Tables']['recipe_steps']['Insert']>;
        Relationships: [];
      };
      step_photos: {
        Row: { id: number; step_id: number; url: string; caption: string | null; order_index: number };
        Insert: { id?: number; step_id: number; url: string; caption?: string | null; order_index?: number };
        Update: Partial<Database['public']['Tables']['step_photos']['Insert']>;
        Relationships: [];
      };
      // Catalogues de référence pour l'admin (INFÉRÉ — pas de migration dans le repo).
      ingredient_refs: {
        Row: { id: number; name: string; url: string | null; tooltip: string | null; status: string | null; created_at: string };
        Insert: { id?: number; name: string; url?: string | null; tooltip?: string | null; status?: string | null; created_at?: string };
        Update: Partial<Database['public']['Tables']['ingredient_refs']['Insert']>;
        Relationships: [];
      };
      utensils: {
        Row: { id: number; name: string; comment: string | null; url: string | null; tooltip: string | null; status: string | null; created_at: string };
        Insert: { id?: number; name: string; comment?: string | null; url?: string | null; tooltip?: string | null; status?: string | null; created_at?: string };
        Update: Partial<Database['public']['Tables']['utensils']['Insert']>;
        Relationships: [];
      };
      favorites: {
        Row: { user_id: string; recipe_id: string; created_at: string };
        Insert: { user_id: string; recipe_id: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['favorites']['Insert']>;
        Relationships: [];
      };
      planning: {
        Row: { id: number; user_id: string; recipe_id: string; planned_date: string | null; notes: string | null; created_at: string };
        Insert: { id?: number; user_id: string; recipe_id: string; planned_date?: string | null; notes?: string | null; created_at?: string };
        Update: Partial<Database['public']['Tables']['planning']['Insert']>;
        Relationships: [];
      };
      shopping_items: {
        Row: {
          id: number;
          user_id: string;
          name: string;
          quantity: string | null;
          unit: string | null;
          is_checked: boolean;
          recipe_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          name: string;
          quantity?: string | null;
          unit?: string | null;
          is_checked?: boolean;
          recipe_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['shopping_items']['Insert']>;
        Relationships: [];
      };
      // Listes de courses nommées (INFÉRÉ — pas de migration dans le repo).
      shopping_lists: {
        Row: { id: number; user_id: string; name: string; created_at: string };
        Insert: { id?: number; user_id: string; name: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['shopping_lists']['Insert']>;
        Relationships: [];
      };
      shopping_list_items: {
        Row: { id: number; list_id: number; name: string; quantity: string | null; unit: string | null; checked: boolean; created_at: string };
        Insert: { id?: number; list_id: number; name: string; quantity?: string | null; unit?: string | null; checked?: boolean; created_at?: string };
        Update: Partial<Database['public']['Tables']['shopping_list_items']['Insert']>;
        Relationships: [];
      };
      comments: {
        Row: {
          id: number;
          recipe_id: string;
          user_id: string;
          content: string;
          rating: number | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          recipe_id: string;
          user_id: string;
          content: string;
          rating?: number | null;
          status?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['comments']['Insert']>;
        Relationships: [];
      };
      follows: {
        Row: { follower_id: string; following_id: string; created_at: string };
        Insert: { follower_id: string; following_id: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['follows']['Insert']>;
        Relationships: [];
      };
      // Allowlist d'inscription (setup-membres.sql). id bigint identity.
      allowlist: {
        Row: {
          id: number;
          email: string;
          status: string;
          role: string;
          plan: string;
          is_demo: boolean;
          notes: string | null;
          invited_at: string;
        };
        Insert: {
          id?: number;
          email: string;
          status?: string;
          role?: string;
          plan?: string;
          is_demo?: boolean;
          notes?: string | null;
          invited_at?: string;
        };
        Update: Partial<Database['public']['Tables']['allowlist']['Insert']>;
        Relationships: [];
      };
      // Exécutions d'une recette planifiée (INFÉRÉ — pas de migration dans le repo).
      // snapshot fige jalons > étapes > ingrédients ajustés au démarrage.
      executions: {
        Row: {
          id: number;
          planning_id: number;
          user_id: string;
          status: string; // en_cours | terminee | …
          date_debut: string | null;
          date_fin: string | null;
          degustation_at: string | null;
          commentaire_global: string | null;
          snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          planning_id: number;
          user_id: string;
          status?: string;
          date_debut?: string | null;
          date_fin?: string | null;
          degustation_at?: string | null;
          commentaire_global?: string | null;
          snapshot?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['executions']['Insert']>;
        Relationships: [];
      };
      // Réglages clé/valeur du site, ex. bannières par appareil (INFÉRÉ).
      site_settings: {
        Row: { key: string; value: Json };
        Insert: { key: string; value: Json };
        Update: Partial<Database['public']['Tables']['site_settings']['Insert']>;
        Relationships: [];
      };
      // Brouillons d'import IA (utilisée par /api/import-url ; INFÉRÉ).
      imports: {
        Row: {
          id: string;
          user_id: string;
          source_type: string;
          source_url: string | null;
          statut: string;
          recette: Json;
          alertes: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_type: string;
          source_url?: string | null;
          statut?: string;
          recette: Json;
          alertes?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['imports']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
