// Types de la base Supabase « Maryse Club ».
// Écrits à la main depuis schema.sql. À terme, régénérer avec :
//   npm run gen:types   (supabase gen types typescript ...)

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
          instagram: string | null;
          website: string | null;
          followers_count: number;
          following_count: number;
          is_admin: boolean;
          // La base live utilise profiles.role = 'admin' (drift vs schema.sql).
          role: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          full_name?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          cover_url?: string | null;
          instagram?: string | null;
          website?: string | null;
          followers_count?: number;
          following_count?: number;
          is_admin?: boolean;
          role?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      recipe_types: {
        Row: { id: number; name: string; slug: string; icon: string; status: string; created_at: string };
        Insert: { id?: number; name: string; slug: string; icon?: string; status?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['recipe_types']['Insert']>;
        Relationships: [];
      };
      tags: {
        Row: { id: number; name: string; slug: string; status: string; created_at: string };
        Insert: { id?: number; name: string; slug: string; status?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['tags']['Insert']>;
        Relationships: [];
      };
      mold_types: {
        Row: { id: number; name: string; slug: string; status: string; created_at: string };
        Insert: { id?: number; name: string; slug: string; status?: string; created_at?: string };
        Update: Partial<Database['public']['Tables']['mold_types']['Insert']>;
        Relationships: [];
      };
      difficulties: {
        Row: { id: number; name: string; level: number; status: string };
        Insert: { id?: number; name: string; level: number; status?: string };
        Update: Partial<Database['public']['Tables']['difficulties']['Insert']>;
        Relationships: [];
      };
      units: {
        Row: { id: number; name: string; abbreviation: string | null; status: string };
        Insert: { id?: number; name: string; abbreviation?: string | null; status?: string };
        Update: Partial<Database['public']['Tables']['units']['Insert']>;
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
      // Brouillons d'import IA (utilisée par /api/import-url ; hors schema.sql).
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
