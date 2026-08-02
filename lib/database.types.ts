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
          picto: string | null
          status: string | null
          tooltip: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
          picto?: string | null
          status?: string | null
          tooltip?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
          picto?: string | null
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
      execution_ingredients: {
        Row: {
          added_during_run: boolean
          commentaire: string | null
          done: boolean
          execution_id: number
          execution_step_id: number | null
          id: number
          mep_done: boolean
          name: string
          plan_ingredient_id: number | null
          planned_quantity: number | null
          planned_text: string | null
          real_quantity: number | null
          unit: string | null
        }
        Insert: {
          added_during_run?: boolean
          commentaire?: string | null
          done?: boolean
          execution_id: number
          execution_step_id?: number | null
          id?: number
          mep_done?: boolean
          name: string
          plan_ingredient_id?: number | null
          planned_quantity?: number | null
          planned_text?: string | null
          real_quantity?: number | null
          unit?: string | null
        }
        Update: {
          added_during_run?: boolean
          commentaire?: string | null
          done?: boolean
          execution_id?: number
          execution_step_id?: number | null
          id?: number
          mep_done?: boolean
          name?: string
          plan_ingredient_id?: number | null
          planned_quantity?: number | null
          planned_text?: string | null
          real_quantity?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_ingredients_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_ingredients_execution_step_id_fkey"
            columns: ["execution_step_id"]
            isOneToOne: false
            referencedRelation: "execution_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_ingredients_plan_ingredient_id_fkey"
            columns: ["plan_ingredient_id"]
            isOneToOne: false
            referencedRelation: "plan_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_steps: {
        Row: {
          commentaire: string | null
          day_offset: number | null
          done: boolean
          done_at: string | null
          execution_id: number
          id: number
          order_index: number | null
          plan_step_id: number | null
          titre: string | null
        }
        Insert: {
          commentaire?: string | null
          day_offset?: number | null
          done?: boolean
          done_at?: string | null
          execution_id: number
          id?: number
          order_index?: number | null
          plan_step_id?: number | null
          titre?: string | null
        }
        Update: {
          commentaire?: string | null
          day_offset?: number | null
          done?: boolean
          done_at?: string | null
          execution_id?: number
          id?: number
          order_index?: number | null
          plan_step_id?: number | null
          titre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_steps_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_steps_plan_step_id_fkey"
            columns: ["plan_step_id"]
            isOneToOne: false
            referencedRelation: "plan_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_substeps: {
        Row: {
          done: boolean
          execution_id: number
          execution_step_id: number | null
          id: number
          order_index: number | null
          plan_substep_id: number | null
          texte: string | null
        }
        Insert: {
          done?: boolean
          execution_id: number
          execution_step_id?: number | null
          id?: number
          order_index?: number | null
          plan_substep_id?: number | null
          texte?: string | null
        }
        Update: {
          done?: boolean
          execution_id?: number
          execution_step_id?: number | null
          id?: number
          order_index?: number | null
          plan_substep_id?: number | null
          texte?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_substeps_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_substeps_execution_step_id_fkey"
            columns: ["execution_step_id"]
            isOneToOne: false
            referencedRelation: "execution_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_substeps_plan_substep_id_fkey"
            columns: ["plan_substep_id"]
            isOneToOne: false
            referencedRelation: "plan_substeps"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_utensils: {
        Row: {
          execution_id: number
          id: number
          mep_done: boolean
          name: string
          plan_utensil_id: number | null
        }
        Insert: {
          execution_id: number
          id?: number
          mep_done?: boolean
          name: string
          plan_utensil_id?: number | null
        }
        Update: {
          execution_id?: number
          id?: number
          mep_done?: boolean
          name?: string
          plan_utensil_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_utensils_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_utensils_plan_utensil_id_fkey"
            columns: ["plan_utensil_id"]
            isOneToOne: false
            referencedRelation: "plan_utensils"
            referencedColumns: ["id"]
          },
        ]
      }
      executions: {
        Row: {
          commentaire_global: string | null
          created_at: string
          date_debut: string
          date_fin: string | null
          degustation_at: string | null
          id: number
          mep_done: boolean
          planning_id: number
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
          mep_done?: boolean
          planning_id: number
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
          mep_done?: boolean
          planning_id?: number
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
          {
            foreignKeyName: "executions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      impersonation_events: {
        Row: {
          action: string
          created_at: string
          id: number
          label: string | null
          path: string | null
          session_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          label?: string | null
          path?: string | null
          session_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          label?: string | null
          path?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "impersonation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          admin_email: string | null
          admin_id: string
          created_at: string
          ended_at: string | null
          ended_reason: string | null
          expires_at: string
          id: string
          mode: string
          started_at: string | null
          target_email: string | null
          target_name: string | null
          target_user_id: string
        }
        Insert: {
          admin_email?: string | null
          admin_id: string
          created_at?: string
          ended_at?: string | null
          ended_reason?: string | null
          expires_at: string
          id?: string
          mode: string
          started_at?: string | null
          target_email?: string | null
          target_name?: string | null
          target_user_id: string
        }
        Update: {
          admin_email?: string | null
          admin_id?: string
          created_at?: string
          ended_at?: string | null
          ended_reason?: string | null
          expires_at?: string
          id?: string
          mode?: string
          started_at?: string | null
          target_email?: string | null
          target_name?: string | null
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          alertes: Json | null
          cost_usd: number | null
          created_at: string
          fichier_original: string | null
          id: number
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          recette: Json
          recipe_id: string | null
          source_type: string
          source_url: string | null
          statut: string
          user_id: string
        }
        Insert: {
          alertes?: Json | null
          cost_usd?: number | null
          created_at?: string
          fichier_original?: string | null
          id?: number
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          recette: Json
          recipe_id?: string | null
          source_type: string
          source_url?: string | null
          statut?: string
          user_id: string
        }
        Update: {
          alertes?: Json | null
          cost_usd?: number | null
          created_at?: string
          fichier_original?: string | null
          id?: number
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
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
      ingredient_conversions: {
        Row: {
          created_at: string
          from_quantity: number
          from_unit_id: number
          id: number
          ingredient_ref_id: number
          to_quantity: number
          to_unit_id: number
        }
        Insert: {
          created_at?: string
          from_quantity: number
          from_unit_id: number
          id?: number
          ingredient_ref_id: number
          to_quantity: number
          to_unit_id: number
        }
        Update: {
          created_at?: string
          from_quantity?: number
          from_unit_id?: number
          id?: number
          ingredient_ref_id?: number
          to_quantity?: number
          to_unit_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_conversions_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_conversions_ingredient_ref_id_fkey"
            columns: ["ingredient_ref_id"]
            isOneToOne: false
            referencedRelation: "ingredient_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_conversions_to_unit_id_fkey"
            columns: ["to_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          allergen: string | null
          allergen_id: number | null
          created_at: string | null
          id: number
          name: string
          status: string | null
          tooltip: string | null
          url: string | null
        }
        Insert: {
          allergen?: string | null
          allergen_id?: number | null
          created_at?: string | null
          id?: number
          name: string
          status?: string | null
          tooltip?: string | null
          url?: string | null
        }
        Update: {
          allergen?: string | null
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
          allergen: string | null
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
          allergen?: string | null
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
          allergen?: string | null
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
      plan_ingredients: {
        Row: {
          added: boolean
          allergen: string | null
          base_quantity: number | null
          comment: string | null
          created_at: string
          excluded_when_done: boolean
          expanded_into_recipe_id: string | null
          id: number
          name: string
          order_index: number
          planning_id: number
          quantity: number | null
          quantity_text: string | null
          ref_id: number | null
          removed: boolean
          scaling_mode: string | null
          source_ingredient_id: number | null
          source_recipe_id: string | null
          step_id: number | null
          unit: string | null
          url: string | null
        }
        Insert: {
          added?: boolean
          allergen?: string | null
          base_quantity?: number | null
          comment?: string | null
          created_at?: string
          excluded_when_done?: boolean
          expanded_into_recipe_id?: string | null
          id?: number
          name: string
          order_index: number
          planning_id: number
          quantity?: number | null
          quantity_text?: string | null
          ref_id?: number | null
          removed?: boolean
          scaling_mode?: string | null
          source_ingredient_id?: number | null
          source_recipe_id?: string | null
          step_id?: number | null
          unit?: string | null
          url?: string | null
        }
        Update: {
          added?: boolean
          allergen?: string | null
          base_quantity?: number | null
          comment?: string | null
          created_at?: string
          excluded_when_done?: boolean
          expanded_into_recipe_id?: string | null
          id?: number
          name?: string
          order_index?: number
          planning_id?: number
          quantity?: number | null
          quantity_text?: string | null
          ref_id?: number | null
          removed?: boolean
          scaling_mode?: string | null
          source_ingredient_id?: number | null
          source_recipe_id?: string | null
          step_id?: number | null
          unit?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_ingredients_expanded_into_recipe_id_fkey"
            columns: ["expanded_into_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_ingredients_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "planning"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_ingredients_ref_id_fkey"
            columns: ["ref_id"]
            isOneToOne: false
            referencedRelation: "ingredient_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_ingredients_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_ingredients_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "plan_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_steps: {
        Row: {
          already_done: boolean
          cook_temp: number | null
          cook_time: number | null
          created_at: string
          day_offset: number
          description: string | null
          id: number
          order_index: number
          planning_id: number
          prep_time: number | null
          scaling_mode: string | null
          source_ingredient_id: number | null
          source_recipe_id: string | null
          source_step_id: number | null
          tips: string | null
          title: string | null
          video_url: string | null
          wait_time: number | null
        }
        Insert: {
          already_done?: boolean
          cook_temp?: number | null
          cook_time?: number | null
          created_at?: string
          day_offset?: number
          description?: string | null
          id?: number
          order_index: number
          planning_id: number
          prep_time?: number | null
          scaling_mode?: string | null
          source_ingredient_id?: number | null
          source_recipe_id?: string | null
          source_step_id?: number | null
          tips?: string | null
          title?: string | null
          video_url?: string | null
          wait_time?: number | null
        }
        Update: {
          already_done?: boolean
          cook_temp?: number | null
          cook_time?: number | null
          created_at?: string
          day_offset?: number
          description?: string | null
          id?: number
          order_index?: number
          planning_id?: number
          prep_time?: number | null
          scaling_mode?: string | null
          source_ingredient_id?: number | null
          source_recipe_id?: string | null
          source_step_id?: number | null
          tips?: string | null
          title?: string | null
          video_url?: string | null
          wait_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_steps_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "planning"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_steps_source_ingredient_fkey"
            columns: ["source_ingredient_id"]
            isOneToOne: false
            referencedRelation: "plan_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_steps_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_substeps: {
        Row: {
          excluded_when_done: boolean
          id: number
          order_index: number
          step_id: number
          texte: string
        }
        Insert: {
          excluded_when_done?: boolean
          id?: number
          order_index: number
          step_id: number
          texte: string
        }
        Update: {
          excluded_when_done?: boolean
          id?: number
          order_index?: number
          step_id?: number
          texte?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_substeps_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "plan_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_utensils: {
        Row: {
          comment: string | null
          id: number
          name: string
          order_index: number
          planning_id: number
          source_recipe_id: string | null
          url: string | null
        }
        Insert: {
          comment?: string | null
          id?: number
          name: string
          order_index: number
          planning_id: number
          source_recipe_id?: string | null
          url?: string | null
        }
        Update: {
          comment?: string | null
          id?: number
          name?: string
          order_index?: number
          planning_id?: number
          source_recipe_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_utensils_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "planning"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_utensils_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
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
          planned_date: string | null
          recipe_id: string | null
          recipe_title: string | null
          source_plan_id: number | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          adjust_label?: string | null
          created_at?: string | null
          factor?: number
          id?: number
          notes?: string | null
          planned_date?: string | null
          recipe_id?: string | null
          recipe_title?: string | null
          source_plan_id?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          adjust_label?: string | null
          created_at?: string | null
          factor?: number
          id?: number
          notes?: string | null
          planned_date?: string | null
          recipe_id?: string | null
          recipe_title?: string | null
          source_plan_id?: number | null
          status?: string
          updated_at?: string
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
            foreignKeyName: "planning_source_plan_id_fkey"
            columns: ["source_plan_id"]
            isOneToOne: false
            referencedRelation: "planning"
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
          impersonation_access: string
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
          impersonation_access?: string
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
          impersonation_access?: string
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
          video_url: string | null
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
          video_url?: string | null
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
          video_url?: string | null
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
          fts: unknown
          global_tips: string | null
          hero_image_url: string | null
          id: string
          is_public: boolean | null
          measure_type: string | null
          mold_dims: Json | null
          mold_type_id: number | null
          prep_time: number | null
          rating_avg: number | null
          rating_count: number | null
          serving_advice: string | null
          servings: number | null
          source: string | null
          source_url: string | null
          status: string | null
          tips: string | null
          title: string
          total_time: number | null
          type_id: number | null
          updated_at: string | null
          video_url: string | null
          view_count: number | null
          wait_time: number | null
          yield_desc: string | null
          yield_notes: string | null
          yield_qty: string | null
          yield_unit: string | null
        }
        Insert: {
          author_id: string
          cook_time?: number | null
          created_at?: string | null
          description?: string | null
          difficulty_id?: number | null
          fts?: unknown
          global_tips?: string | null
          hero_image_url?: string | null
          id?: string
          is_public?: boolean | null
          measure_type?: string | null
          mold_dims?: Json | null
          mold_type_id?: number | null
          prep_time?: number | null
          rating_avg?: number | null
          rating_count?: number | null
          serving_advice?: string | null
          servings?: number | null
          source?: string | null
          source_url?: string | null
          status?: string | null
          tips?: string | null
          title: string
          total_time?: number | null
          type_id?: number | null
          updated_at?: string | null
          video_url?: string | null
          view_count?: number | null
          wait_time?: number | null
          yield_desc?: string | null
          yield_notes?: string | null
          yield_qty?: string | null
          yield_unit?: string | null
        }
        Update: {
          author_id?: string
          cook_time?: number | null
          created_at?: string | null
          description?: string | null
          difficulty_id?: number | null
          fts?: unknown
          global_tips?: string | null
          hero_image_url?: string | null
          id?: string
          is_public?: boolean | null
          measure_type?: string | null
          mold_dims?: Json | null
          mold_type_id?: number | null
          prep_time?: number | null
          rating_avg?: number | null
          rating_count?: number | null
          serving_advice?: string | null
          servings?: number | null
          source?: string | null
          source_url?: string | null
          status?: string | null
          tips?: string | null
          title?: string
          total_time?: number | null
          type_id?: number | null
          updated_at?: string | null
          video_url?: string | null
          view_count?: number | null
          wait_time?: number | null
          yield_desc?: string | null
          yield_notes?: string | null
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
          category_picto: string | null
          created_at: string | null
          id: number
          name: string
          show_on_home: boolean
          slug: string
          status: string | null
          tooltip: string | null
        }
        Insert: {
          category_picto?: string | null
          created_at?: string | null
          id?: number
          name: string
          show_on_home?: boolean
          slug: string
          status?: string | null
          tooltip?: string | null
        }
        Update: {
          category_picto?: string | null
          created_at?: string | null
          id?: number
          name?: string
          show_on_home?: boolean
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
      author_ratings: {
        Row: {
          author_id: string | null
          rated_recipes: number | null
          rating_avg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      duplicate_recipe: { Args: { p_recipe_id: string }; Returns: string }
      is_admin_user: { Args: never; Returns: boolean }
      is_read_only_session: { Args: never; Returns: boolean }
      mc_norm: { Args: { txt: string }; Returns: string }
      owns_execution: { Args: { p_execution_id: number }; Returns: boolean }
      owns_plan: { Args: { p_planning_id: number }; Returns: boolean }
      search_advanced_recipes: {
        Args: {
          count_only?: boolean
          difficulty_levels?: number[]
          exc_allergens?: string[]
          exc_ingredients?: string[]
          inc_ingredients?: string[]
          limit_val?: number
          max_total_time?: number
          min_author_rating?: number
          min_recipe_rating?: number
          offset_val?: number
          search_term?: string
          sort_by?: string
          tag_slugs?: string[]
          type_slug?: string
        }
        Returns: Json
      }
      suggest_ingredients: {
        Args: { max_results?: number; term: string }
        Returns: {
          id: number
          name: string
        }[]
      }
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
