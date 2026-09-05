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
      ad_events: {
        Row: {
          ad_id: number
          created_at: string
          event_type: string
          id: number
          user_id: string | null
        }
        Insert: {
          ad_id: number
          created_at?: string
          event_type: string
          id?: number
          user_id?: string | null
        }
        Update: {
          ad_id?: number
          created_at?: string
          event_type?: string
          id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_events_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_events: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: number
          reason: string | null
          state_after: Json | null
          state_before: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: never
          reason?: string | null
          state_after?: Json | null
          state_before?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: never
          reason?: string | null
          state_after?: Json | null
          state_before?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_events_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_ignored_refs: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          kind: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_ignored_refs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ads: {
        Row: {
          active: boolean
          created_at: string | null
          cta_label: string | null
          end_date: string | null
          id: number
          image_url: string | null
          link_url: string | null
          name: string
          priority: number
          slot: string
          start_date: string
          subtitle: string | null
          title: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          cta_label?: string | null
          end_date?: string | null
          id?: number
          image_url?: string | null
          link_url?: string | null
          name: string
          priority?: number
          slot: string
          start_date: string
          subtitle?: string | null
          title?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          cta_label?: string | null
          end_date?: string | null
          id?: number
          image_url?: string | null
          link_url?: string | null
          name?: string
          priority?: number
          slot?: string
          start_date?: string
          subtitle?: string | null
          title?: string | null
        }
        Relationships: []
      }
      ai_features: {
        Row: {
          code: string
          imputation: string
          label: string
          position: number
        }
        Insert: {
          code: string
          imputation: string
          label: string
          position?: number
        }
        Update: {
          code?: string
          imputation?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      ai_pricing: {
        Row: {
          cache_read_per_mtok: number
          cache_write_per_mtok: number
          created_at: string
          currency: string
          effective_from: string
          id: number
          input_per_mtok: number
          model: string
          output_per_mtok: number
          web_search_per_1k: number
        }
        Insert: {
          cache_read_per_mtok: number
          cache_write_per_mtok: number
          created_at?: string
          currency?: string
          effective_from?: string
          id?: never
          input_per_mtok: number
          model: string
          output_per_mtok: number
          web_search_per_1k?: number
        }
        Update: {
          cache_read_per_mtok?: number
          cache_write_per_mtok?: number
          created_at?: string
          currency?: string
          effective_from?: string
          id?: never
          input_per_mtok?: number
          model?: string
          output_per_mtok?: number
          web_search_per_1k?: number
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          cache_creation_tokens: number
          cache_read_tokens: number
          cost_usd: number | null
          created_at: string
          error_code: string | null
          feature: string
          id: number
          input_tokens: number
          latency_ms: number | null
          model: string
          output_tokens: number
          ref_id: string | null
          ref_table: string | null
          request_id: string | null
          status: string
          user_id: string | null
          web_searches: number
        }
        Insert: {
          cache_creation_tokens?: number
          cache_read_tokens?: number
          cost_usd?: number | null
          created_at?: string
          error_code?: string | null
          feature: string
          id?: never
          input_tokens?: number
          latency_ms?: number | null
          model: string
          output_tokens?: number
          ref_id?: string | null
          ref_table?: string | null
          request_id?: string | null
          status: string
          user_id?: string | null
          web_searches?: number
        }
        Update: {
          cache_creation_tokens?: number
          cache_read_tokens?: number
          cost_usd?: number | null
          created_at?: string
          error_code?: string | null
          feature?: string
          id?: never
          input_tokens?: number
          latency_ms?: number | null
          model?: string
          output_tokens?: number
          ref_id?: string | null
          ref_table?: string | null
          request_id?: string | null
          status?: string
          user_id?: string | null
          web_searches?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_feature_fkey"
            columns: ["feature"]
            isOneToOne: false
            referencedRelation: "ai_features"
            referencedColumns: ["code"]
          },
        ]
      }
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
      article_categories: {
        Row: {
          created_at: string | null
          name: string
          order_index: number
          slug: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          name: string
          order_index?: number
          slug: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          name?: string
          order_index?: number
          slug?: string
          status?: string | null
        }
        Relationships: []
      }
      articles: {
        Row: {
          author_id: string | null
          author_name: string | null
          category: string | null
          content: Json
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          category?: string | null
          content?: Json
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          category?: string | null
          content?: Json
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "article_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      batch_ingredients: {
        Row: {
          added: boolean
          allergen: string | null
          base_quantity: number | null
          batch_id: number
          batch_step_id: number | null
          comment: string | null
          commentaire: string | null
          created_at: string
          done: boolean
          excluded_when_done: boolean
          expanded_into_recipe_id: string | null
          id: number
          mep_done: boolean
          name: string
          order_index: number
          quantity: number | null
          quantity_text: string | null
          real_quantity: number | null
          ref_id: number | null
          removed: boolean
          scaling_mode: string | null
          source_ingredient_id: number | null
          source_recipe_id: string | null
          unit: string | null
          url: string | null
        }
        Insert: {
          added?: boolean
          allergen?: string | null
          base_quantity?: number | null
          batch_id: number
          batch_step_id?: number | null
          comment?: string | null
          commentaire?: string | null
          created_at?: string
          done?: boolean
          excluded_when_done?: boolean
          expanded_into_recipe_id?: string | null
          id?: number
          mep_done?: boolean
          name: string
          order_index: number
          quantity?: number | null
          quantity_text?: string | null
          real_quantity?: number | null
          ref_id?: number | null
          removed?: boolean
          scaling_mode?: string | null
          source_ingredient_id?: number | null
          source_recipe_id?: string | null
          unit?: string | null
          url?: string | null
        }
        Update: {
          added?: boolean
          allergen?: string | null
          base_quantity?: number | null
          batch_id?: number
          batch_step_id?: number | null
          comment?: string | null
          commentaire?: string | null
          created_at?: string
          done?: boolean
          excluded_when_done?: boolean
          expanded_into_recipe_id?: string | null
          id?: number
          mep_done?: boolean
          name?: string
          order_index?: number
          quantity?: number | null
          quantity_text?: string | null
          real_quantity?: number | null
          ref_id?: number | null
          removed?: boolean
          scaling_mode?: string | null
          source_ingredient_id?: number | null
          source_recipe_id?: string | null
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
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
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
            columns: ["batch_step_id"]
            isOneToOne: false
            referencedRelation: "batch_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_steps: {
        Row: {
          base_day_offset: number | null
          batch_id: number
          commentaire: string | null
          cook_temp: number | null
          cook_time: number | null
          created_at: string
          day_offset: number
          day_order_index: number | null
          description: string | null
          done: boolean
          done_at: string | null
          id: number
          note_position: string
          order_index: number
          prep_time: number | null
          replaced_by_recipe_id: string | null
          scaling_mode: string | null
          source_ingredient_id: number | null
          source_recipe_id: string | null
          source_replaced_step_id: number | null
          source_step_id: number | null
          tips: string | null
          title: string | null
          user_note: string | null
          video_url: string | null
          wait_time: number | null
        }
        Insert: {
          base_day_offset?: number | null
          batch_id: number
          commentaire?: string | null
          cook_temp?: number | null
          cook_time?: number | null
          created_at?: string
          day_offset?: number
          day_order_index?: number | null
          description?: string | null
          done?: boolean
          done_at?: string | null
          id?: number
          note_position?: string
          order_index: number
          prep_time?: number | null
          replaced_by_recipe_id?: string | null
          scaling_mode?: string | null
          source_ingredient_id?: number | null
          source_recipe_id?: string | null
          source_replaced_step_id?: number | null
          source_step_id?: number | null
          tips?: string | null
          title?: string | null
          user_note?: string | null
          video_url?: string | null
          wait_time?: number | null
        }
        Update: {
          base_day_offset?: number | null
          batch_id?: number
          commentaire?: string | null
          cook_temp?: number | null
          cook_time?: number | null
          created_at?: string
          day_offset?: number
          day_order_index?: number | null
          description?: string | null
          done?: boolean
          done_at?: string | null
          id?: number
          note_position?: string
          order_index?: number
          prep_time?: number | null
          replaced_by_recipe_id?: string | null
          scaling_mode?: string | null
          source_ingredient_id?: number | null
          source_recipe_id?: string | null
          source_replaced_step_id?: number | null
          source_step_id?: number | null
          tips?: string | null
          title?: string | null
          user_note?: string | null
          video_url?: string | null
          wait_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_steps_replaced_by_recipe_id_fkey"
            columns: ["replaced_by_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_steps_source_replaced_step_id_fkey"
            columns: ["source_replaced_step_id"]
            isOneToOne: false
            referencedRelation: "batch_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_steps_planning_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_steps_source_ingredient_fkey"
            columns: ["source_ingredient_id"]
            isOneToOne: false
            referencedRelation: "batch_ingredients"
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
      batch_substeps: {
        Row: {
          added: boolean
          batch_step_id: number
          commentaire: string | null
          done: boolean
          excluded_when_done: boolean
          id: number
          order_index: number
          texte: string
        }
        Insert: {
          added?: boolean
          batch_step_id: number
          commentaire?: string | null
          done?: boolean
          excluded_when_done?: boolean
          id?: number
          order_index: number
          texte: string
        }
        Update: {
          added?: boolean
          batch_step_id?: number
          commentaire?: string | null
          done?: boolean
          excluded_when_done?: boolean
          id?: number
          order_index?: number
          texte?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_substeps_step_id_fkey"
            columns: ["batch_step_id"]
            isOneToOne: false
            referencedRelation: "batch_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_utensils: {
        Row: {
          batch_id: number
          comment: string | null
          id: number
          mep_done: boolean
          name: string
          order_index: number
          source_recipe_id: string | null
          url: string | null
        }
        Insert: {
          batch_id: number
          comment?: string | null
          id?: number
          mep_done?: boolean
          name: string
          order_index: number
          source_recipe_id?: string | null
          url?: string | null
        }
        Update: {
          batch_id?: number
          comment?: string | null
          id?: number
          mep_done?: boolean
          name?: string
          order_index?: number
          source_recipe_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_utensils_planning_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
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
      batches: {
        Row: {
          adjust_label: string | null
          commentaire_global: string | null
          created_at: string | null
          date_debut: string | null
          date_fin: string | null
          degustation_at: string | null
          difficulty_level: number | null
          difficulty_name: string | null
          factor: number
          id: number
          measure_type: string | null
          mep_done: boolean
          mold_dims: Json | null
          mold_forme: string | null
          mold_type_name: string | null
          notes: string | null
          planned_date: string | null
          recipe_description: string | null
          recipe_id: string | null
          recipe_serving_advice: string | null
          recipe_source: string | null
          recipe_source_url: string | null
          recipe_tips: string | null
          recipe_title: string | null
          recipe_video_url: string | null
          review_dismissed: boolean
          review_rejection_reason: string | null
          review_status: string
          source_plan_id: number | null
          status: string
          tags_text: string[] | null
          trial_verdict: string | null
          updated_at: string
          user_id: string | null
          user_note: string | null
          yield_desc: string | null
          yield_notes: string | null
          yield_qty: string | null
          yield_unit: string | null
        }
        Insert: {
          adjust_label?: string | null
          commentaire_global?: string | null
          created_at?: string | null
          date_debut?: string | null
          date_fin?: string | null
          degustation_at?: string | null
          difficulty_level?: number | null
          difficulty_name?: string | null
          factor?: number
          id?: number
          measure_type?: string | null
          mep_done?: boolean
          mold_dims?: Json | null
          mold_forme?: string | null
          mold_type_name?: string | null
          notes?: string | null
          planned_date?: string | null
          recipe_description?: string | null
          recipe_id?: string | null
          recipe_serving_advice?: string | null
          recipe_source?: string | null
          recipe_source_url?: string | null
          recipe_tips?: string | null
          recipe_title?: string | null
          recipe_video_url?: string | null
          review_dismissed?: boolean
          review_rejection_reason?: string | null
          review_status?: string
          source_plan_id?: number | null
          status?: string
          tags_text?: string[] | null
          trial_verdict?: string | null
          updated_at?: string
          user_id?: string | null
          user_note?: string | null
          yield_desc?: string | null
          yield_notes?: string | null
          yield_qty?: string | null
          yield_unit?: string | null
        }
        Update: {
          adjust_label?: string | null
          commentaire_global?: string | null
          created_at?: string | null
          date_debut?: string | null
          date_fin?: string | null
          degustation_at?: string | null
          difficulty_level?: number | null
          difficulty_name?: string | null
          factor?: number
          id?: number
          measure_type?: string | null
          mep_done?: boolean
          mold_dims?: Json | null
          mold_forme?: string | null
          mold_type_name?: string | null
          notes?: string | null
          planned_date?: string | null
          recipe_description?: string | null
          recipe_id?: string | null
          recipe_serving_advice?: string | null
          recipe_source?: string | null
          recipe_source_url?: string | null
          recipe_tips?: string | null
          recipe_title?: string | null
          recipe_video_url?: string | null
          review_dismissed?: boolean
          review_rejection_reason?: string | null
          review_status?: string
          source_plan_id?: number | null
          status?: string
          tags_text?: string[] | null
          trial_verdict?: string | null
          updated_at?: string
          user_id?: string | null
          user_note?: string | null
          yield_desc?: string | null
          yield_notes?: string | null
          yield_qty?: string | null
          yield_unit?: string | null
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
            referencedRelation: "batches"
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
      book_shares: {
        Row: {
          created_at: string
          owner_id: string
          scope: string
          shared_with_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          scope?: string
          shared_with_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          scope?: string
          shared_with_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_shares_shared_with_id_fkey"
            columns: ["shared_with_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          ai_reason: string | null
          ai_score: number | null
          batch_id: number | null
          content: string
          created_at: string | null
          id: number
          photo_urls: Json
          rating: number | null
          recipe_id: string | null
          rejection_reason: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          ai_reason?: string | null
          ai_score?: number | null
          batch_id?: number | null
          content: string
          created_at?: string | null
          id?: number
          photo_urls?: Json
          rating?: number | null
          recipe_id?: string | null
          rejection_reason?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          ai_reason?: string | null
          ai_score?: number | null
          batch_id?: number | null
          content?: string
          created_at?: string | null
          id?: number
          photo_urls?: Json
          rating?: number | null
          recipe_id?: string | null
          rejection_reason?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
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
      contact_message_photos: {
        Row: {
          created_at: string
          id: string
          message_id: string
          order_index: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          order_index?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          order_index?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_message_photos_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "contact_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          admin_notes: string | null
          admin_notified_at: string | null
          admin_notify_error: string | null
          app_version: string | null
          browser_context: string | null
          closed_at: string | null
          created_at: string
          deploy_email_error: string | null
          deploy_email_sent_at: string | null
          deploy_email_status: Database["public"]["Enums"]["contact_email_status"]
          deploy_notify: boolean
          email: string | null
          id: string
          ip_hash: string | null
          jira_error: string | null
          jira_issue_key: string | null
          jira_status: string | null
          jira_status_id: string | null
          jira_sync_status: Database["public"]["Enums"]["contact_jira_sync_status"]
          jira_synced_at: string | null
          message: string
          page_url: string | null
          reference: string
          status: Database["public"]["Enums"]["contact_status"]
          status_source: string | null
          status_updated_at: string
          subject: string
          type: Database["public"]["Enums"]["contact_type"]
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          admin_notified_at?: string | null
          admin_notify_error?: string | null
          app_version?: string | null
          browser_context?: string | null
          closed_at?: string | null
          created_at?: string
          deploy_email_error?: string | null
          deploy_email_sent_at?: string | null
          deploy_email_status?: Database["public"]["Enums"]["contact_email_status"]
          deploy_notify?: boolean
          email?: string | null
          id?: string
          ip_hash?: string | null
          jira_error?: string | null
          jira_issue_key?: string | null
          jira_status?: string | null
          jira_status_id?: string | null
          jira_sync_status?: Database["public"]["Enums"]["contact_jira_sync_status"]
          jira_synced_at?: string | null
          message: string
          page_url?: string | null
          reference: string
          status?: Database["public"]["Enums"]["contact_status"]
          status_source?: string | null
          status_updated_at?: string
          subject: string
          type: Database["public"]["Enums"]["contact_type"]
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          admin_notified_at?: string | null
          admin_notify_error?: string | null
          app_version?: string | null
          browser_context?: string | null
          closed_at?: string | null
          created_at?: string
          deploy_email_error?: string | null
          deploy_email_sent_at?: string | null
          deploy_email_status?: Database["public"]["Enums"]["contact_email_status"]
          deploy_notify?: boolean
          email?: string | null
          id?: string
          ip_hash?: string | null
          jira_error?: string | null
          jira_issue_key?: string | null
          jira_status?: string | null
          jira_status_id?: string | null
          jira_sync_status?: Database["public"]["Enums"]["contact_jira_sync_status"]
          jira_synced_at?: string | null
          message?: string
          page_url?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["contact_status"]
          status_source?: string | null
          status_updated_at?: string
          subject?: string
          type?: Database["public"]["Enums"]["contact_type"]
          user_id?: string | null
        }
        Relationships: []
      }
      contact_replies: {
        Row: {
          author_id: string | null
          author_kind: string
          body: string
          created_at: string
          email_status: Database["public"]["Enums"]["contact_email_status"]
          error: string | null
          id: string
          jira_comment_error: string | null
          jira_comment_status: string
          message_id: string
          provider_id: string | null
          sent_at: string | null
        }
        Insert: {
          author_id?: string | null
          author_kind?: string
          body: string
          created_at?: string
          email_status?: Database["public"]["Enums"]["contact_email_status"]
          error?: string | null
          id?: string
          jira_comment_error?: string | null
          jira_comment_status?: string
          message_id: string
          provider_id?: string | null
          sent_at?: string | null
        }
        Update: {
          author_id?: string | null
          author_kind?: string
          body?: string
          created_at?: string
          email_status?: Database["public"]["Enums"]["contact_email_status"]
          error?: string | null
          id?: string
          jira_comment_error?: string | null
          jira_comment_status?: string
          message_id?: string
          provider_id?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_replies_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "contact_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_reply_photos: {
        Row: {
          created_at: string
          id: string
          order_index: number
          reply_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index?: number
          reply_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          reply_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_reply_photos_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "contact_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_status_history: {
        Row: {
          author_id: string | null
          changed_at: string
          from_status: Database["public"]["Enums"]["contact_status"] | null
          id: string
          jira_status: string | null
          message_id: string
          source: string
          to_status: Database["public"]["Enums"]["contact_status"]
        }
        Insert: {
          author_id?: string | null
          changed_at?: string
          from_status?: Database["public"]["Enums"]["contact_status"] | null
          id?: string
          jira_status?: string | null
          message_id: string
          source: string
          to_status: Database["public"]["Enums"]["contact_status"]
        }
        Update: {
          author_id?: string | null
          changed_at?: string
          from_status?: Database["public"]["Enums"]["contact_status"] | null
          id?: string
          jira_status?: string | null
          message_id?: string
          source?: string
          to_status?: Database["public"]["Enums"]["contact_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contact_status_history_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "contact_messages"
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
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          last_event_at: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          last_event_at?: string
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          last_event_at?: string
          reason?: string
        }
        Relationships: []
      }
      execution_ingredients_legacy: {
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
            referencedRelation: "executions_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_ingredients_execution_step_id_fkey"
            columns: ["execution_step_id"]
            isOneToOne: false
            referencedRelation: "execution_steps_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_ingredients_plan_ingredient_id_fkey"
            columns: ["plan_ingredient_id"]
            isOneToOne: false
            referencedRelation: "batch_ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_steps_legacy: {
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
            referencedRelation: "executions_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_steps_plan_step_id_fkey"
            columns: ["plan_step_id"]
            isOneToOne: false
            referencedRelation: "batch_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_substeps_legacy: {
        Row: {
          commentaire: string | null
          done: boolean
          execution_id: number
          execution_step_id: number | null
          id: number
          order_index: number | null
          plan_substep_id: number | null
          texte: string | null
        }
        Insert: {
          commentaire?: string | null
          done?: boolean
          execution_id: number
          execution_step_id?: number | null
          id?: number
          order_index?: number | null
          plan_substep_id?: number | null
          texte?: string | null
        }
        Update: {
          commentaire?: string | null
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
            referencedRelation: "executions_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_substeps_execution_step_id_fkey"
            columns: ["execution_step_id"]
            isOneToOne: false
            referencedRelation: "execution_steps_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_substeps_plan_substep_id_fkey"
            columns: ["plan_substep_id"]
            isOneToOne: false
            referencedRelation: "batch_substeps"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_utensils_legacy: {
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
            referencedRelation: "executions_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_utensils_plan_utensil_id_fkey"
            columns: ["plan_utensil_id"]
            isOneToOne: false
            referencedRelation: "batch_utensils"
            referencedColumns: ["id"]
          },
        ]
      }
      executions_legacy: {
        Row: {
          commentaire_global: string | null
          created_at: string
          date_debut: string
          date_fin: string | null
          degustation_at: string | null
          id: number
          mep_done: boolean
          planning_id: number | null
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
          planning_id?: number | null
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
          planning_id?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "executions_legacy_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "batches"
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
      featured_recipes: {
        Row: {
          created_at: string | null
          end_date: string
          id: number
          recipe_id: string
          start_date: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: number
          recipe_id: string
          start_date: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: number
          recipe_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          created_at: string
          description: string | null
          id: number
          key: string
          label: string
          limit_type: string
          order_index: number
          section: string
          section_order: number
          unit: string | null
          visible: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: never
          key: string
          label: string
          limit_type?: string
          order_index?: number
          section: string
          section_order?: number
          unit?: string | null
          visible?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: never
          key?: string
          label?: string
          limit_type?: string
          order_index?: number
          section?: string
          section_order?: number
          unit?: string | null
          visible?: boolean
        }
        Relationships: []
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
      help_blocks: {
        Row: {
          key: string
          text: string | null
          updated_at: string
          updated_by: string | null
          video_url: string | null
        }
        Insert: {
          key: string
          text?: string | null
          updated_at?: string
          updated_by?: string | null
          video_url?: string | null
        }
        Update: {
          key?: string
          text?: string | null
          updated_at?: string
          updated_by?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      help_dismissals: {
        Row: {
          created_at: string
          kind: string
          target: string
          user_id: string
        }
        Insert: {
          created_at?: string
          kind: string
          target: string
          user_id: string
        }
        Update: {
          created_at?: string
          kind?: string
          target?: string
          user_id?: string
        }
        Relationships: []
      }
      idea_votes: {
        Row: {
          created_at: string
          idea_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          idea_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          idea_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_votes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          admin_note: string | null
          author_id: string | null
          created_at: string
          description: string | null
          fts: unknown
          id: string
          merged_into_id: string | null
          status: string
          title: string
        }
        Insert: {
          admin_note?: string | null
          author_id?: string | null
          created_at?: string
          description?: string | null
          fts?: unknown
          id?: string
          merged_into_id?: string | null
          status?: string
          title: string
        }
        Update: {
          admin_note?: string | null
          author_id?: string | null
          created_at?: string
          description?: string | null
          fts?: unknown
          id?: string
          merged_into_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "ideas"
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
          density_g_per_ml: number | null
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
          density_g_per_ml?: number | null
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
          density_g_per_ml?: number | null
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
          base_quantity: number | null
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
          base_quantity?: number | null
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
          base_quantity?: number | null
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
      notifications: {
        Row: {
          body: string
          created_at: string
          id: number
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          kind: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_sent: {
        Row: {
          id: number
          notification_type: string
          sent_at: string
          subscription_id: number
          user_id: string
        }
        Insert: {
          id?: never
          notification_type: string
          sent_at?: string
          subscription_id: number
          user_id: string
        }
        Update: {
          id?: never
          notification_type?: string
          sent_at?: string
          subscription_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_sent_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          feature_id: number
          id: number
          limit_value: number | null
          plan_version_id: number
          unlimited: boolean
          value: string
        }
        Insert: {
          feature_id: number
          id?: never
          limit_value?: number | null
          plan_version_id: number
          unlimited?: boolean
          value: string
        }
        Update: {
          feature_id?: number
          id?: never
          limit_value?: number | null
          plan_version_id?: number
          unlimited?: boolean
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_features_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_versions: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: number
          is_current: boolean
          number: number
          plan_id: number
          price_monthly: number | null
          price_yearly: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: never
          is_current?: boolean
          number: number
          plan_id: number
          price_monthly?: number | null
          price_yearly?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: never
          is_current?: boolean
          number?: number
          plan_id?: number
          price_monthly?: number | null
          price_yearly?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: number
          is_default: boolean
          label: string
          order_index: number
          tagline: string | null
          trial_allowed: boolean
          trial_grant_plan_id: number | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: never
          is_default?: boolean
          label: string
          order_index?: number
          tagline?: string | null
          trial_allowed?: boolean
          trial_grant_plan_id?: number | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: never
          is_default?: boolean
          label?: string
          order_index?: number
          tagline?: string | null
          trial_allowed?: boolean
          trial_grant_plan_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_trial_grant_plan_id_fkey"
            columns: ["trial_grant_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
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
          notify_email: boolean
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
          notify_email?: boolean
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
          notify_email?: boolean
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
      recipe_analysis: {
        Row: {
          completed_at: string | null
          cost_searches: number
          cost_tokens: number
          cost_usd: number | null
          created_at: string
          editorial_similarity_max: number | null
          error_message: string | null
          id: number
          moderation_details: Json | null
          moderation_prompt_version: string | null
          moderation_verdict: string | null
          overall_flag: string | null
          recipe_content_hash: string
          recipe_id: string
          status: string
          structural_similarity_max: number | null
        }
        Insert: {
          completed_at?: string | null
          cost_searches?: number
          cost_tokens?: number
          cost_usd?: number | null
          created_at?: string
          editorial_similarity_max?: number | null
          error_message?: string | null
          id?: never
          moderation_details?: Json | null
          moderation_prompt_version?: string | null
          moderation_verdict?: string | null
          overall_flag?: string | null
          recipe_content_hash: string
          recipe_id: string
          status?: string
          structural_similarity_max?: number | null
        }
        Update: {
          completed_at?: string | null
          cost_searches?: number
          cost_tokens?: number
          cost_usd?: number | null
          created_at?: string
          editorial_similarity_max?: number | null
          error_message?: string | null
          id?: never
          moderation_details?: Json | null
          moderation_prompt_version?: string | null
          moderation_verdict?: string | null
          overall_flag?: string | null
          recipe_content_hash?: string
          recipe_id?: string
          status?: string
          structural_similarity_max?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_analysis_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_analysis_feedback: {
        Row: {
          admin_id: string
          analysis_id: number
          comment: string | null
          created_at: string
          id: number
          match_id: number | null
          verdict: string
        }
        Insert: {
          admin_id: string
          analysis_id: number
          comment?: string | null
          created_at?: string
          id?: never
          match_id?: number | null
          verdict: string
        }
        Update: {
          admin_id?: string
          analysis_id?: number
          comment?: string | null
          created_at?: string
          id?: never
          match_id?: number | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_analysis_feedback_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "recipe_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_analysis_feedback_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "recipe_similarity_match"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_project_components: {
        Row: {
          created_at: string
          id: number
          manually_adjusted: boolean
          name: string
          position: number
          recipe_id: string
          resolved: boolean
          role: string | null
          scale_factor: number | null
          scale_reason: string | null
          source_author_id: string | null
          source_author_name: string | null
          source_kind: string
          source_recipe_id: string | null
          source_title: string | null
          target_quantity: number | null
          target_unit: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          manually_adjusted?: boolean
          name: string
          position: number
          recipe_id: string
          resolved?: boolean
          role?: string | null
          scale_factor?: number | null
          scale_reason?: string | null
          source_author_id?: string | null
          source_author_name?: string | null
          source_kind?: string
          source_recipe_id?: string | null
          source_title?: string | null
          target_quantity?: number | null
          target_unit?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          manually_adjusted?: boolean
          name?: string
          position?: number
          recipe_id?: string
          resolved?: boolean
          role?: string | null
          scale_factor?: number | null
          scale_reason?: string | null
          source_author_id?: string | null
          source_author_name?: string | null
          source_kind?: string
          source_recipe_id?: string | null
          source_title?: string | null
          target_quantity?: number | null
          target_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_project_components_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_project_components_source_author_id_fkey"
            columns: ["source_author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_project_components_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_projects: {
        Row: {
          created_at: string
          intent: string | null
          recipe_id: string
          updated_at: string
          wizard_step: number
        }
        Insert: {
          created_at?: string
          intent?: string | null
          recipe_id: string
          updated_at?: string
          wizard_step?: number
        }
        Update: {
          created_at?: string
          intent?: string | null
          recipe_id?: string
          updated_at?: string
          wizard_step?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_projects_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_rejection_history: {
        Row: {
          analysis_id: number | null
          created_at: string
          id: number
          motif: string
          recipe_id: string
          rejected_at: string
        }
        Insert: {
          analysis_id?: number | null
          created_at?: string
          id?: never
          motif: string
          recipe_id: string
          rejected_at: string
        }
        Update: {
          analysis_id?: number | null
          created_at?: string
          id?: never
          motif?: string
          recipe_id?: string
          rejected_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_rejection_history_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "recipe_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_rejection_history_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_scale_costs: {
        Row: {
          cost_usd: number | null
          created_at: string
          id: number
          input_tokens: number
          model: string
          output_tokens: number
          user_id: string
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          id?: never
          input_tokens?: number
          model: string
          output_tokens?: number
          user_id: string
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          id?: never
          input_tokens?: number
          model?: string
          output_tokens?: number
          user_id?: string
        }
        Relationships: []
      }
      recipe_shares: {
        Row: {
          created_at: string
          owner_id: string
          recipe_id: string
          shared_with_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          recipe_id: string
          shared_with_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          recipe_id?: string
          shared_with_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_shares_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_shares_shared_with_id_fkey"
            columns: ["shared_with_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_shingle_index: {
        Row: {
          editorial_text: string
          recipe_id: string
          shingles: string[]
          structural_keys: string[]
          updated_at: string
        }
        Insert: {
          editorial_text: string
          recipe_id: string
          shingles: string[]
          structural_keys: string[]
          updated_at?: string
        }
        Update: {
          editorial_text?: string
          recipe_id?: string
          shingles?: string[]
          structural_keys?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_shingle_index_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_similarity_match: {
        Row: {
          analysis_id: number
          detection_method: string | null
          editorial_score: number
          id: number
          longest_common_sequence: number | null
          matched_excerpts: Json | null
          source_recipe_id: string | null
          source_title: string | null
          source_type: string
          source_url: string | null
          structural_score: number
        }
        Insert: {
          analysis_id: number
          detection_method?: string | null
          editorial_score: number
          id?: never
          longest_common_sequence?: number | null
          matched_excerpts?: Json | null
          source_recipe_id?: string | null
          source_title?: string | null
          source_type: string
          source_url?: string | null
          structural_score: number
        }
        Update: {
          analysis_id?: number
          detection_method?: string | null
          editorial_score?: number
          id?: never
          longest_common_sequence?: number | null
          matched_excerpts?: Json | null
          source_recipe_id?: string | null
          source_title?: string | null
          source_type?: string
          source_url?: string | null
          structural_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_similarity_match_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "recipe_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_similarity_match_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          component_id: number | null
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
          component_id?: number | null
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
          component_id?: number | null
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
            foreignKeyName: "recipe_steps_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "recipe_project_components"
            referencedColumns: ["id"]
          },
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
          has_hero_image: boolean
          hero_card_url: string | null
          hero_image_ai_retouched: boolean
          hero_image_original_url: string | null
          hero_image_url: string | null
          hero_thumb_url: string | null
          id: string
          is_public: boolean | null
          kind: string
          measure_type: string | null
          moderation_note: string | null
          moderation_note_at: string | null
          mold_dims: Json | null
          mold_type_id: number | null
          prep_time: number | null
          project_stage: string | null
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
          has_hero_image?: boolean
          hero_card_url?: string | null
          hero_image_ai_retouched?: boolean
          hero_image_original_url?: string | null
          hero_image_url?: string | null
          hero_thumb_url?: string | null
          id?: string
          is_public?: boolean | null
          kind?: string
          measure_type?: string | null
          moderation_note?: string | null
          moderation_note_at?: string | null
          mold_dims?: Json | null
          mold_type_id?: number | null
          prep_time?: number | null
          project_stage?: string | null
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
          has_hero_image?: boolean
          hero_card_url?: string | null
          hero_image_ai_retouched?: boolean
          hero_image_original_url?: string | null
          hero_image_url?: string | null
          hero_thumb_url?: string | null
          id?: string
          is_public?: boolean | null
          kind?: string
          measure_type?: string | null
          moderation_note?: string | null
          moderation_note_at?: string | null
          mold_dims?: Json | null
          mold_type_id?: number | null
          prep_time?: number | null
          project_stage?: string | null
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
          comment: string | null
          created_at: string
          id: number
          list_id: number
          name: string
          quantity: string | null
          ref_id: number | null
          unit: string | null
        }
        Insert: {
          checked?: boolean
          comment?: string | null
          created_at?: string
          id?: number
          list_id: number
          name: string
          quantity?: string | null
          ref_id?: number | null
          unit?: string | null
        }
        Update: {
          checked?: boolean
          comment?: string | null
          created_at?: string
          id?: number
          list_id?: number
          name?: string
          quantity?: string | null
          ref_id?: number | null
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
          {
            foreignKeyName: "shopping_list_items_ref_id_fkey"
            columns: ["ref_id"]
            isOneToOne: false
            referencedRelation: "ingredient_refs"
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
          ai_retouched: boolean
          caption: string | null
          id: number
          order_index: number | null
          original_url: string | null
          step_id: number | null
          url: string
        }
        Insert: {
          ai_retouched?: boolean
          caption?: string | null
          id?: number
          order_index?: number | null
          original_url?: string | null
          step_id?: number | null
          url: string
        }
        Update: {
          ai_retouched?: boolean
          caption?: string | null
          id?: number
          order_index?: number | null
          original_url?: string | null
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
      subscription_requests: {
        Row: {
          created_at: string
          id: number
          periodicity: string
          plan_id: number
          processed_at: string | null
          processed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          periodicity?: string
          plan_id: number
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          periodicity?: string
          plan_id?: number
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_requested_at: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          external_customer_id: string | null
          external_subscription_id: string | null
          id: number
          periodicity: string
          plan_version_id: number
          promo_code: string | null
          provider: string
          reason: string | null
          renewal_anchor: number
          starts_at: string
          status: string
          type: string
          user_id: string
        }
        Insert: {
          cancel_requested_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: never
          periodicity?: string
          plan_version_id: number
          promo_code?: string | null
          provider?: string
          reason?: string | null
          renewal_anchor?: number
          starts_at?: string
          status?: string
          type: string
          user_id: string
        }
        Update: {
          cancel_requested_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: never
          periodicity?: string
          plan_version_id?: number
          promo_code?: string | null
          provider?: string
          reason?: string | null
          renewal_anchor?: number
          starts_at?: string
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      trials: {
        Row: {
          consumed_at: string
          email_hash: string
          id: number
          subscription_id: number | null
          user_id: string | null
        }
        Insert: {
          consumed_at?: string
          email_hash: string
          id?: never
          subscription_id?: number | null
          user_id?: string | null
        }
        Update: {
          consumed_at?: string
          email_hash?: string
          id?: never
          subscription_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trials_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      usage_counters: {
        Row: {
          consumed: number
          feature_id: number
          id: number
          period_end: string
          period_start: string
          user_id: string
        }
        Insert: {
          consumed?: number
          feature_id: number
          id?: never
          period_end: string
          period_start: string
          user_id: string
        }
        Update: {
          consumed?: number
          feature_id?: number
          id?: never
          period_end?: string
          period_start?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      visit_sessions: {
        Row: {
          id: string
          last_seen_at: string
          page_count: number
          started_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_seen_at?: string
          page_count?: number
          started_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_seen_at?: string
          page_count?: number
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_usage_mensuel: {
        Row: {
          appels: number | null
          appels_cout_inconnu: number | null
          appels_ko: number | null
          appels_ok: number | null
          cout_usd: number | null
          dernier_appel: string | null
          feature: string | null
          feature_label: string | null
          imputation: string | null
          mois: string | null
          recherches_web: number | null
          tokens: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_feature_fkey"
            columns: ["feature"]
            isOneToOne: false
            referencedRelation: "ai_features"
            referencedColumns: ["code"]
          },
        ]
      }
      ai_usage_par_membre: {
        Row: {
          appels_cout_inconnu: number | null
          appels_mois: number | null
          appels_total: number | null
          cout_mois: number | null
          cout_total: number | null
          dernier_appel: string | null
          tokens_mois: number | null
          user_id: string | null
        }
        Relationships: []
      }
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
      admin_ignore_ref: {
        Args: { p_kind: string; p_name: string }
        Returns: undefined
      }
      admin_link_ingredient_ref: {
        Args: { p_allergen?: string; p_name: string }
        Returns: number
      }
      admin_link_utensil_ref: {
        Args: { p_comment?: string; p_name: string; p_url?: string }
        Returns: number
      }
      admin_list_ignored_refs: {
        Args: never
        Returns: {
          created_at: string
          created_by_name: string
          id: number
          kind: string
          name: string
        }[]
      }
      admin_member_login_history: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          action: string
          created_at: string
          ip_address: string
        }[]
      }
      admin_unignore_ref: { Args: { p_id: number }; Returns: undefined }
      admin_unknown_ingredients: {
        Args: never
        Returns: {
          author_id: string
          author_name: string
          ingredient_id: number
          is_public: boolean
          name: string
          recipe_id: string
          recipe_status: string
          recipe_title: string
          step_name: string
          step_order: number
        }[]
      }
      admin_unknown_utensils: {
        Args: never
        Returns: {
          author_id: string
          author_name: string
          is_public: boolean
          name: string
          recipe_id: string
          recipe_status: string
          recipe_title: string
          utensil_id: number
        }[]
      }
      admin_volume_ingredients_missing_density: {
        Args: never
        Returns: {
          author_id: string
          author_name: string
          is_public: boolean
          name: string
          recipe_id: string
          recipe_status: string
          recipe_title: string
          step_name: string
          step_order: number
        }[]
      }
      can_view_shared_recipe: {
        Args: { p_recipe_id: string }
        Returns: boolean
      }
      can_write_articles: { Args: never; Returns: boolean }
      contact_purge: { Args: never; Returns: undefined }
      duplicate_recipe: { Args: { p_recipe_id: string }; Returns: string }
      gone_article_slugs: {
        Args: never
        Returns: {
          slug: string
        }[]
      }
      ideas_summaries: {
        Args: { idea_ids: string[] }
        Returns: {
          has_voted: boolean
          id: string
          status: string
          title: string
          votes_count: number
        }[]
      }
      is_admin_user: { Args: never; Returns: boolean }
      is_read_only_session: { Args: never; Returns: boolean }
      is_site_admin: { Args: never; Returns: boolean }
      list_ideas: {
        Args: {
          count_only?: boolean
          limit_val?: number
          offset_val?: number
          search_term?: string
          sort_by?: string
        }
        Returns: Json
      }
      mc_admin_cancel_subscription: {
        Args: {
          p_immediate: boolean
          p_reason: string
          p_subscription_id: number
        }
        Returns: undefined
      }
      mc_admin_extend_subscription: {
        Args: {
          p_new_ends_at: string
          p_reason: string
          p_subscription_id: number
        }
        Returns: undefined
      }
      mc_admin_grant_subscription: {
        Args: {
          p_ends_at: string
          p_periodicity: string
          p_plan_code: string
          p_reason: string
          p_starts_at: string
          p_type: string
          p_user_id: string
        }
        Returns: number
      }
      mc_admin_reset_trial: {
        Args: { p_reason: string; p_user_id: string }
        Returns: undefined
      }
      mc_anchor_date: {
        Args: { p_anchor: number; p_at: string }
        Returns: string
      }
      mc_cancel_own_subscription: { Args: never; Returns: string }
      mc_check_quota: {
        Args: { p_key: string; p_user_id: string }
        Returns: Json
      }
      mc_consume: { Args: { p_key: string; p_n?: number }; Returns: number }
      mc_effective_rights: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          feature_key: string
          limit_type: string
          limit_value: number
          unlimited: boolean
        }[]
      }
      mc_norm: { Args: { txt: string }; Returns: string }
      mc_period_bounds: {
        Args: { p_anchor: number; p_at: string }
        Returns: Record<string, unknown>
      }
      mc_pseudo_slug: { Args: { p: string }; Returns: string }
      mc_publish_plan_version: {
        Args: {
          p_active: boolean
          p_currency: string
          p_label: string
          p_order_index: number
          p_plan_id: number
          p_price_monthly: number
          p_price_yearly: number
          p_reason: string
          p_rights: Json
          p_tagline: string
          p_trial_allowed: boolean
        }
        Returns: number
      }
      mc_redirect_trial_plan_version: {
        Args: { p_source_plan_code: string }
        Returns: undefined
      }
      mc_refund: { Args: { p_key: string; p_n?: number }; Returns: undefined }
      mc_renewal_anchor: { Args: { p_user_id: string }; Returns: number }
      mc_simulate_subscribe: {
        Args: { p_plan_code: string; p_promo_code: string }
        Returns: number
      }
      mc_start_trial: {
        Args: { p_email_hash: string; p_plan_code: string }
        Returns: number
      }
      mc_usage: { Args: { p_key: string; p_user_id: string }; Returns: number }
      mc_usage_report: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          feature_key: string
          limit_type: string
          limit_value: number
          period_end: string
          unlimited: boolean
          usage: number
        }[]
      }
      merge_ideas: {
        Args: { source_id: string; target_id: string }
        Returns: undefined
      }
      owns_execution: { Args: { p_execution_id: number }; Returns: boolean }
      owns_plan: { Args: { p_planning_id: number }; Returns: boolean }
      owns_recipe: { Args: { p_recipe_id: string }; Returns: boolean }
      search_advanced_recipes:
        | {
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
        | {
            Args: {
              count_only?: boolean
              difficulty_levels?: number[]
              exc_allergens?: string[]
              exc_ingredients?: string[]
              inc_ingredients?: string[]
              include_authors?: boolean
              include_recipes?: boolean
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
      suggest_similar_ideas: {
        Args: { max_results?: number; term: string }
        Returns: {
          has_voted: boolean
          id: string
          rank: number
          status: string
          title: string
          votes_count: number
        }[]
      }
    }
    Enums: {
      contact_email_status: "pending" | "sent" | "failed" | "skipped"
      contact_jira_sync_status: "not_applicable" | "pending" | "sent" | "failed"
      contact_status: "recu" | "en_cours" | "a_deployer" | "termine"
      contact_type: "bug" | "suggestion" | "question" | "donnees-personnelles"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      contact_email_status: ["pending", "sent", "failed", "skipped"],
      contact_jira_sync_status: ["not_applicable", "pending", "sent", "failed"],
      contact_status: ["recu", "en_cours", "a_deployer", "termine"],
      contact_type: ["bug", "suggestion", "question", "donnees-personnelles"],
    },
  },
} as const
