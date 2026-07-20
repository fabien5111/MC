export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allergens: {
        Row: {
          created_at: string | null
          id: number
          name: string
          status: string | null
          tooltip: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
          status?: string | null
          tooltip?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
          status?: string | null
          tooltip?: string | null
          url?: string | null
        }
        Relationships: []
      }
      allowlist: {
        Row: {
          email: string
          id: number
          invited_at: string
          is_demo: boolean
          notes: string | null
          plan: string
          role: string
          status: string
        }
        Insert: {
          email: string
          id?: never
          invited_at?: string
          is_demo?: boolean
          notes?: string | null
          plan?: string
          role?: string
          status?: string
        }
        Update: {
          email?: string
          id?: never
          invited_at?: string
          is_demo?: boolean
          notes?: string | null
          plan?: string
          role?: string
          status?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string | null
          id: number
          rating: number | null
          recipe_id: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: number
          rating?: number | null
          recipe_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: number
          rating?: number | null
          recipe_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      difficulties: {
        Row: {
          id: number
          level: number
          name: string
          status: string | null
          tooltip: string | null
        }
        Insert: {
          id?: number
          level: number
          name: string
          status?: string | null
          tooltip?: string | null
        }
        Update: {
          id?: number
          level?: number
          name?: string
          status?: string | null
          tooltip?: string | null
        }
        Relationships: []
      }
      executions: {
        Row: {
          commentaire_global: string | null
          created_at: string
          date_debut: string
          date_fin: string | null
          degustation_at: string | null
          id: number
          planning_id: number
          snapshot: Json
          status: string
          user_id: string
        }
        Insert: {
          commentaire_global?: string | null
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          degustation_at?: string | null
          id?: number
          planning_id: number
          snapshot: Json
          status?: string
          user_id: string
        }
        Update: {
          commentaire_global?: string | null
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          degustation_at?: string | null
          id?: number
          planning_id?: number
          snapshot?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "executions_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "planning"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string | null
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          alertes: Json | null
          created_at: string
          fichier_original: string | null
          id: number
          recette: Json
          recipe_id: string | null
          source_type: string
          source_url: string | null
          statut: string
          user_id: string
        }
        Insert: {
          alertes?: Json | null
          created_at?: string
          fichier_original?: string | null
          id?: number
          recette: Json
          recipe_id?: string | null
          source_type: string
          source_url?: string | null
          statut?: string
          user_id: string
        }
        Update: {
          alertes?: Json | null
          created_at?: string
          fichier_original?: string | null
          id?: number
          recette?: Json
          recipe_id?: string | null
          source_type?: string
          source_url?: string | null
          statut?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_groups: {
        Row: {
          id: number
          name: string
          order_index: number | null
          recipe_id: string | null
          scaling_mode: string | null
        }
        Insert: {
          id?: number
          name: string
          order_index?: number | null
          recipe_id?: string | null
          scaling_mode?: string | null
        }
        Update: {
          id?: number
          name?: string
          order_index?: number | null
          recipe_id?: string | null
          scaling_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_groups_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_refs: {
        Row: {
          allergen_id: number | null
          created_at: string | null
          id: number
          name: string
          status: string | null
          tooltip: string | null
          url: string | null
        }
        Insert: {
          allergen_id?: number | null
          created_at?: string | null
          id?: number
          name: string
          status?: string | null
          tooltip?: string | null
          url?: string | null
        }
        Update: {
          allergen_id?: number | null
          created_at?: string | null
          id?: number
          name?: string
          status?: string | null
          tooltip?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_refs_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          comment: string | null
          group_id: number | null
          id: number
          name: string
          order_index: number | null
          quantity: string | null
          ref_id: number | null
          unit: string | null
          url: string | null
        }
        Insert: {
          comment?: string | null
          group_id?: number | null
          id?: number
          name: string
          order_index?: number | null
          quantity?: string | null
          ref_id?: number | null
          unit?: string | null
          url?: string | null
        }
        Update: {
          comment?: string | null
          group_id?: number | null
          id?: number
          name?: string
          order_index?: number | null
          quantity?: string | null
          ref_id?: number | null
          unit?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ingredient_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_ref_id_fkey"
            columns: ["ref_id"]
            isOneToOne: false
            referencedRelation: "ingredient_refs"
            referencedColumns: ["id"]
          },
        ]
      }
      mold_types: {
        Row: {
          created_at: string | null
          forme: string | null
          id: number
          name: string
          slug: string
          status: string | null
          tooltip: string | null
        }
        Insert: {
          created_at?: string | null
          forme?: string | null
          id?: number
          name: string
          slug: string
          status?: string | null
          tooltip?: string | null
        }
        Update: {
          created_at?: string | null
          forme?: string | null
          id?: number
          name?: string
          slug?: string
          status?: string | null
          tooltip?: string | null
        }
        Relationships: []
      }
      molds: {
        Row: {
          created_at: string
          id: number
          name: string
          status: string
          tooltip: string | null
          type_id: number | null
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          status?: string
          tooltip?: string | null
          type_id?: number | null
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          status?: string
          tooltip?: string | null
          type_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "molds_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "mold_types"
            referencedColumns: ["id"]
          },
        ]
      }
      planning: {
        Row: {
          adjust_label: string | null
          created_at: string | null
          factor: number
          id: number
          notes: string | null
          overrides: Json | null
          planned_date: string | null
          recipe_id: string | null
          user_id: string | null
        }
        Insert: {
          adjust_label?: string | null
          created_at?: string | null
          factor?: number
          id?: number
          notes?: string | null
          overrides?: Json | null
          planned_date?: string | null
          recipe_id?: string | null
          user_id?: string | null
        }
        Update: {
          adjust_label?: string | null
          created_at?: string | null
          factor?: number
          id?: number
          notes?: string | null
          overrides?: Json | null
          planned_date?: string | null
          recipe_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          cover_url: string | null
          created_at: string | null
          email: string | null
          facebook_url: string | null
          followers_count: number | null
          following_count: number | null
          full_name: string | null
          id: string
          instagram: string | null
          instagram_url: string | null
          is_admin: boolean | null
          is_demo: boolean
          notes: string | null
          pinterest_url: string | null
          plan: string
          provider: string | null
          role: string
          status: string
          tiktok_url: string | null
          username: string | null
          website: string | null
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string | null
          email?: string | null
          facebook_url?: string | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id: string
          instagram?: string | null
          instagram_url?: string | null
          is_admin?: boolean | null
          is_demo?: boolean
          notes?: string | null
          pinterest_url?: string | null
          plan?: string
          provider?: string | null
          role?: string
          status?: string
          tiktok_url?: string | null
          username?: string | null
          website?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string | null
          email?: string | null
          facebook_url?: string | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          instagram?: string | null
          instagram_url?: string | null
          is_admin?: boolean | null
          is_demo?: boolean
          notes?: string | null
          pinterest_url?: string | null
          plan?: string
          provider?: string | null
          role?: string
          status?: string
          tiktok_url?: string | null
          username?: string | null
          website?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      recipe_steps: {
        Row: {
          cook_temp: number | null
          cook_time: number | null
          day_offset: number | null
          description: string | null
          id: number
          order_index: number | null
          prep_time: number | null
          recipe_id: string | null
          sous_etapes: Json | null
          step_number: number
          tips: string | null
          title: string | null
          wait_time: number | null
        }
        Insert: {
          cook_temp?: number | null
          cook_time?: number | null
          day_offset?: number | null
          description?: string | null
          id?: number
          order_index?: number | null
          prep_time?: number | null
          recipe_id?: string | null
          sous_etapes?: Json | null
          step_number: number
          tips?: string | null
          title?: string | null
          wait_time?: number | null
        }
        Update: {
          cook_temp?: number | null
          cook_time?: number | null
          day_offset?: number | null
          description?: string | null
          id?: number
          order_index?: number | null
          prep_time?: number | null
          recipe_id?: string | null
          sous_etapes?: Json | null
          step_number?: number
          tips?: string | null
          title?: string | null
          wait_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_tags: {
        Row: {
          recipe_id: string
          tag_id: number
        }
        Insert: {
          recipe_id: string
          tag_id: number
        }
        Update: {
          recipe_id?: string
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_tags_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_types: {
        Row: {
          created_at: string | null
          icon: string | null
          id: number
          name: string
          slug: string
          status: string | null
          tooltip: string | null
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          id?: number
          name: string
          slug: string
          status?: string | null
          tooltip?: string | null
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          id?: number
          name?: string
          slug?: string
          status?: string | null
          tooltip?: string | null
        }
        Relationships: []
      }
      recipe_utensils: {
        Row: {
          comment: string | null
          id: number
          name: string
          order_index: number | null
          recipe_id: string | null
          ref_id: number | null
          url: string | null
        }
        Insert: {
          comment?: string | null
          id?: number
          name: string
          order_index?: number | null
          recipe_id?: string | null
          ref_id?: number | null
          url?: string | null
        }
        Update: {
          comment?: string | null
          id?: number
          name?: string
          order_index?: number | null
          recipe_id?: string | null
          ref_id?: number | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_utensils_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_utensils_ref_id_fkey"
            columns: ["ref_id"]
            isOneToOne: false
            referencedRelation: "utensils"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          author_id: string
          cook_time: number | null
          created_at: string | null
          description: string | null
          difficulty_id: number | null
          global_tips: string | null
          hero_image_url: string | null
          id: string
          is_public: boolean | null
          measure_type: string | null
          mold_description: string | null
          mold_dims: Json | null
          mold_type_id: number | null
          prep_time: number | null
          rating_avg: number | null
          rating_count: number | null
          servings: number | null
          status: string | null
          tips: string | null
          title: string
          total_time: number | null
          type_id: number | null
          updated_at: string | null
          view_count: number | null
          wait_time: number | null
          yield_desc: string | null
          yield_qty: string | null
          yield_unit: string | null
        }
        Insert: {
          author_id: string
          cook_time?: number | null
          created_at?: string | null
          description?: string | null
          difficulty_id?: number | null
          global_tips?: string | null
          hero_image_url?: string | null
          id?: string
          is_public?: boolean | null
          measure_type?: string | null
          mold_description?: string | null
          mold_dims?: Json | null
          mold_type_id?: number | null
          prep_time?: number | null
          rating_avg?: number | null
          rating_count?: number | null
          servings?: number | null
          status?: string | null
          tips?: string | null
          title: string
          total_time?: number | null
          type_id?: number | null
          updated_at?: string | null
          view_count?: number | null
          wait_time?: number | null
          yield_desc?: string | null
          yield_qty?: string | null
          yield_unit?: string | null
        }
        Update: {
          author_id?: string
          cook_time?: number | null
          created_at?: string | null
          description?: string | null
          difficulty_id?: number | null
          global_tips?: string | null
          hero_image_url?: string | null
          id?: string
          is_public?: boolean | null
          measure_type?: string | null
          mold_description?: string | null
          mold_dims?: Json | null
          mold_type_id?: number | null
          prep_time?: number | null
          rating_avg?: number | null
          rating_count?: number | null
          servings?: number | null
          status?: string | null
          tips?: string | null
          title?: string
          total_time?: number | null
          type_id?: number | null
          updated_at?: string | null
          view_count?: number | null
          wait_time?: number | null
          yield_desc?: string | null
          yield_qty?: string | null
          yield_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_difficulty_id_fkey"
            columns: ["difficulty_id"]
            isOneToOne: false
            referencedRelation: "difficulties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_mold_type_id_fkey"
            columns: ["mold_type_id"]
            isOneToOne: false
            referencedRelation: "mold_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "recipe_types"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_items: {
        Row: {
          created_at: string | null
          id: number
          is_checked: boolean | null
          name: string
          quantity: string | null
          recipe_id: string | null
          unit: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_checked?: boolean | null
          name: string
          quantity?: string | null
          recipe_id?: string | null
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          is_checked?: boolean | null
          name?: string
          quantity?: string | null
          recipe_id?: string | null
          unit?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          checked: boolean
          created_at: string
          id: number
          list_id: number
          name: string
          quantity: string | null
          unit: string | null
        }
        Insert: {
          checked?: boolean
          created_at?: string
          id?: number
          list_id: number
          name: string
          quantity?: string | null
          unit?: string | null
        }
        Update: {
          checked?: boolean
          created_at?: string
          id?: number
          list_id?: number
          name?: string
          quantity?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          id: number
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      step_photos: {
        Row: {
          caption: string | null
          id: number
          order_index: number | null
          step_id: number | null
          url: string
        }
        Insert: {
          caption?: string | null
          id?: number
          order_index?: number | null
          step_id?: number | null
          url: string
        }
        Update: {
          caption?: string | null
          id?: number
          order_index?: number | null
          step_id?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_photos_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "recipe_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string | null
          id: number
          name: string
          slug: string
          status: string | null
          tooltip: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
          slug: string
          status?: string | null
          tooltip?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
          slug?: string
          status?: string | null
          tooltip?: string | null
        }
        Relationships: []
      }
      units: {
        Row: {
          abbreviation: string | null
          id: number
          name: string
          status: string | null
          tooltip: string | null
        }
        Insert: {
          abbreviation?: string | null
          id?: number
          name: string
          status?: string | null
          tooltip?: string | null
        }
        Update: {
          abbreviation?: string | null
          id?: number
          name?: string
          status?: string | null
          tooltip?: string | null
        }
        Relationships: []
      }
      utensils: {
        Row: {
          comment: string | null
          created_at: string | null
          id: number
          name: string
          status: string | null
          tooltip: string | null
          url: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: number
          name: string
          status?: string | null
          tooltip?: string | null
          url?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: number
          name?: string
          status?: string | null
          tooltip?: string | null
          url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
