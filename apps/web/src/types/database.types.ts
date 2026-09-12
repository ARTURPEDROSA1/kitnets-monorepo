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
      agencies: {
        Row: {
          additional_phone: string | null
          additional_phone_whatsapp: boolean | null
          address_complement: string | null
          city: string
          cnpj: string | null
          country: string
          created_at: string
          creci_number: string | null
          creci_state: string | null
          creci_type: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          main_phone: string
          main_phone_whatsapp: boolean | null
          name: string
          neighborhood: string
          owner_name: string | null
          postal_code: string
          state: string
          status: string
          street: string
          street_number: string
          trade_name: string | null
          updated_at: string
          verified_at: string | null
          website: string | null
        }
        Insert: {
          additional_phone?: string | null
          additional_phone_whatsapp?: boolean | null
          address_complement?: string | null
          city: string
          cnpj?: string | null
          country?: string
          created_at?: string
          creci_number?: string | null
          creci_state?: string | null
          creci_type?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          main_phone: string
          main_phone_whatsapp?: boolean | null
          name: string
          neighborhood: string
          owner_name?: string | null
          postal_code: string
          state: string
          status?: string
          street: string
          street_number: string
          trade_name?: string | null
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Update: {
          additional_phone?: string | null
          additional_phone_whatsapp?: boolean | null
          address_complement?: string | null
          city?: string
          cnpj?: string | null
          country?: string
          created_at?: string
          creci_number?: string | null
          creci_state?: string | null
          creci_type?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          main_phone?: string
          main_phone_whatsapp?: boolean | null
          name?: string
          neighborhood?: string
          owner_name?: string | null
          postal_code?: string
          state?: string
          status?: string
          street?: string
          street_number?: string
          trade_name?: string | null
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agencies_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_members: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_members_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          additional_phone: string | null
          additional_phone_whatsapp: boolean
          agency_id: string | null
          agent_type: string
          cpf: string | null
          created_at: string
          creci_number: string
          creci_state: string
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          full_name: string
          id: string
          main_phone: string
          main_phone_whatsapp: boolean
          notes: string | null
          photo_url: string | null
          status: string
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          additional_phone?: string | null
          additional_phone_whatsapp?: boolean
          agency_id?: string | null
          agent_type?: string
          cpf?: string | null
          created_at?: string
          creci_number: string
          creci_state: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          main_phone: string
          main_phone_whatsapp?: boolean
          notes?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          additional_phone?: string | null
          additional_phone_whatsapp?: boolean
          agency_id?: string | null
          agent_type?: string
          cpf?: string | null
          created_at?: string
          creci_number?: string
          creci_state?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          main_phone?: string
          main_phone_whatsapp?: boolean
          notes?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_categories: {
        Row: {
          article_id: string
          category_id: string
        }
        Insert: {
          article_id: string
          category_id: string
        }
        Update: {
          article_id?: string
          category_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_categories_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      article_revisions: {
        Row: {
          article_id: string
          content_mdx: string
          created_at: string
          created_by: string | null
          excerpt: string | null
          id: string
          lang: string
          metadata: Json
          reason: string | null
          title: string
        }
        Insert: {
          article_id: string
          content_mdx: string
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          lang: string
          metadata?: Json
          reason?: string | null
          title: string
        }
        Update: {
          article_id?: string
          content_mdx?: string
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          lang?: string
          metadata?: Json
          reason?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_revisions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_tags: {
        Row: {
          article_id: string
          tag_id: string
        }
        Insert: {
          article_id: string
          tag_id: string
        }
        Update: {
          article_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_tags_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      article_translations: {
        Row: {
          article_id: string
          content_compiled: Json | null
          content_mdx: string
          created_at: string
          excerpt: string | null
          id: string
          lang: string
          metadata: Json
          reading_time_minutes: number | null
          slug: string
          title: string
          updated_at: string
          word_count: number | null
        }
        Insert: {
          article_id: string
          content_compiled?: Json | null
          content_mdx: string
          created_at?: string
          excerpt?: string | null
          id?: string
          lang: string
          metadata?: Json
          reading_time_minutes?: number | null
          slug: string
          title: string
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          article_id?: string
          content_compiled?: Json | null
          content_mdx?: string
          created_at?: string
          excerpt?: string | null
          id?: string
          lang?: string
          metadata?: Json
          reading_time_minutes?: number | null
          slug?: string
          title?: string
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "article_translations_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author_id: string
          created_at: string
          id: string
          primary_category_id: string
          published_at: string | null
          status: Database["public"]["Enums"]["article_status"]
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          primary_category_id: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["article_status"]
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          primary_category_id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["article_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_primary_category_id_fkey"
            columns: ["primary_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      authors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          name: string
          slug: string
          social_links: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          social_links?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          social_links?: Json
          updated_at?: string
        }
        Relationships: []
      }
      calculator_suggestions: {
        Row: {
          created_at: string
          email: string | null
          id: string
          location: string | null
          suggestion: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          location?: string | null
          suggestion: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          location?: string | null
          suggestion?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          subject?: string | null
        }
        Relationships: []
      }
      economic_index_revisions: {
        Row: {
          created_at: string | null
          id: string
          index_value_id: string
          previous_value: number | null
          reason: string | null
          revised_value: number | null
          revision_date: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          index_value_id: string
          previous_value?: number | null
          reason?: string | null
          revised_value?: number | null
          revision_date?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          index_value_id?: string
          previous_value?: number | null
          reason?: string | null
          revised_value?: number | null
          revision_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "economic_index_revisions_index_value_id_fkey"
            columns: ["index_value_id"]
            isOneToOne: false
            referencedRelation: "economic_index_values"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_index_values: {
        Row: {
          accumulated_12m: number | null
          created_at: string | null
          id: string
          index_id: string
          is_projection: boolean | null
          month: number
          published_at: string | null
          reference_date: string
          source_url: string | null
          updated_at: string | null
          value_percent: number
          year: number
        }
        Insert: {
          accumulated_12m?: number | null
          created_at?: string | null
          id?: string
          index_id: string
          is_projection?: boolean | null
          month: number
          published_at?: string | null
          reference_date: string
          source_url?: string | null
          updated_at?: string | null
          value_percent: number
          year: number
        }
        Update: {
          accumulated_12m?: number | null
          created_at?: string | null
          id?: string
          index_id?: string
          is_projection?: boolean | null
          month?: number
          published_at?: string | null
          reference_date?: string
          source_url?: string | null
          updated_at?: string | null
          value_percent?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "economic_index_values_index_id_fkey"
            columns: ["index_id"]
            isOneToOne: false
            referencedRelation: "economic_indexes"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_indexes: {
        Row: {
          category: string
          code: string
          created_at: string | null
          frequency: string | null
          id: string
          is_official: boolean | null
          name: string
          source: string
          updated_at: string | null
        }
        Insert: {
          category: string
          code: string
          created_at?: string | null
          frequency?: string | null
          id?: string
          is_official?: boolean | null
          name: string
          source: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          code?: string
          created_at?: string | null
          frequency?: string | null
          id?: string
          is_official?: boolean | null
          name?: string
          source?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      energy_bills: {
        Row: {
          availability_adjustment_amount: number | null
          availability_cost_amount: number | null
          availability_cost_kwh: number | null
          billing_days: number | null
          bonus_discounts_amount: number | null
          consumer_unit: string
          created_at: string | null
          daily_avg_kwh: number | null
          due_date: string | null
          energy_compensated_amount: number | null
          energy_scee_exempt_amount: number | null
          estimated_savings_amount: number | null
          extraction_confidence: number | null
          flag_amount: number | null
          flag_type: string | null
          generation_balance_kwh: number | null
          grid_consumption_kwh: number
          grid_reading_current: number | null
          grid_reading_previous: number | null
          historical_consumption_raw: Json | null
          id: string
          injected_reading_current: number | null
          injected_reading_previous: number | null
          installation_class: string | null
          is_historical_only: boolean | null
          items_breakdown: Json | null
          meter_number: string | null
          monthly_avg_kwh: number | null
          notes: string | null
          property_id: string | null
          reading_date_current: string | null
          reading_date_next: string | null
          reading_date_previous: string | null
          reference_month: string
          reference_month_label: string | null
          solar_compensated_kwh: number | null
          solar_coverage_ratio: number | null
          solar_injected_kwh: number | null
          tariff_modality: string | null
          taxes_icms: number | null
          taxes_pis_cofins: number | null
          total_amount: number
          unit_price: number | null
          updated_at: string | null
          utility_company: string | null
        }
        Insert: {
          availability_adjustment_amount?: number | null
          availability_cost_amount?: number | null
          availability_cost_kwh?: number | null
          billing_days?: number | null
          bonus_discounts_amount?: number | null
          consumer_unit: string
          created_at?: string | null
          daily_avg_kwh?: number | null
          due_date?: string | null
          energy_compensated_amount?: number | null
          energy_scee_exempt_amount?: number | null
          estimated_savings_amount?: number | null
          extraction_confidence?: number | null
          flag_amount?: number | null
          flag_type?: string | null
          generation_balance_kwh?: number | null
          grid_consumption_kwh: number
          grid_reading_current?: number | null
          grid_reading_previous?: number | null
          historical_consumption_raw?: Json | null
          id?: string
          injected_reading_current?: number | null
          injected_reading_previous?: number | null
          installation_class?: string | null
          is_historical_only?: boolean | null
          items_breakdown?: Json | null
          meter_number?: string | null
          monthly_avg_kwh?: number | null
          notes?: string | null
          property_id?: string | null
          reading_date_current?: string | null
          reading_date_next?: string | null
          reading_date_previous?: string | null
          reference_month: string
          reference_month_label?: string | null
          solar_compensated_kwh?: number | null
          solar_coverage_ratio?: number | null
          solar_injected_kwh?: number | null
          tariff_modality?: string | null
          taxes_icms?: number | null
          taxes_pis_cofins?: number | null
          total_amount?: number
          unit_price?: number | null
          updated_at?: string | null
          utility_company?: string | null
        }
        Update: {
          availability_adjustment_amount?: number | null
          availability_cost_amount?: number | null
          availability_cost_kwh?: number | null
          billing_days?: number | null
          bonus_discounts_amount?: number | null
          consumer_unit?: string
          created_at?: string | null
          daily_avg_kwh?: number | null
          due_date?: string | null
          energy_compensated_amount?: number | null
          energy_scee_exempt_amount?: number | null
          estimated_savings_amount?: number | null
          extraction_confidence?: number | null
          flag_amount?: number | null
          flag_type?: string | null
          generation_balance_kwh?: number | null
          grid_consumption_kwh?: number
          grid_reading_current?: number | null
          grid_reading_previous?: number | null
          historical_consumption_raw?: Json | null
          id?: string
          injected_reading_current?: number | null
          injected_reading_previous?: number | null
          installation_class?: string | null
          is_historical_only?: boolean | null
          items_breakdown?: Json | null
          meter_number?: string | null
          monthly_avg_kwh?: number | null
          notes?: string | null
          property_id?: string | null
          reading_date_current?: string | null
          reading_date_next?: string | null
          reading_date_previous?: string | null
          reference_month?: string
          reference_month_label?: string | null
          solar_compensated_kwh?: number | null
          solar_coverage_ratio?: number | null
          solar_injected_kwh?: number | null
          tariff_modality?: string | null
          taxes_icms?: number | null
          taxes_pis_cofins?: number | null
          total_amount?: number
          unit_price?: number | null
          updated_at?: string | null
          utility_company?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_bills_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      faq_questions: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          question: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          question: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          question?: string
        }
        Relationships: []
      }
      fipezap_series: {
        Row: {
          created_at: string | null
          dormitorios: string
          id: number
          index_type: string
          metric: string
          reference_date: string
          source: string | null
          value: number | null
        }
        Insert: {
          created_at?: string | null
          dormitorios: string
          id?: number
          index_type: string
          metric: string
          reference_date: string
          source?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string | null
          dormitorios?: string
          id?: number
          index_type?: string
          metric?: string
          reference_date?: string
          source?: string | null
          value?: number | null
        }
        Relationships: []
      }
      gateways: {
        Row: {
          config: Json | null
          created_at: string
          description: string | null
          id: string
          label: string | null
          last_seen_at: string | null
          owner_id: string | null
          panel_photo_url: string | null
          photo_url: string | null
          property_id: string | null
          serial_number: string
          status: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          label?: string | null
          last_seen_at?: string | null
          owner_id?: string | null
          panel_photo_url?: string | null
          photo_url?: string | null
          property_id?: string | null
          serial_number: string
          status?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          label?: string | null
          last_seen_at?: string | null
          owner_id?: string | null
          panel_photo_url?: string | null
          photo_url?: string | null
          property_id?: string | null
          serial_number?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gateways_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateways_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          consent_newsletter: boolean | null
          created_at: string
          email: string
          engaged_seconds: number | null
          export_type: string | null
          first_seen_at: string | null
          id: string
          interaction_count: number | null
          last_seen_at: string | null
          lead_type: string | null
          location: Json | null
          location_source: string | null
          name: string | null
          page_url: string | null
          referrer: string | null
          source: string | null
          trigger_type: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          consent_newsletter?: boolean | null
          created_at?: string
          email: string
          engaged_seconds?: number | null
          export_type?: string | null
          first_seen_at?: string | null
          id?: string
          interaction_count?: number | null
          last_seen_at?: string | null
          lead_type?: string | null
          location?: Json | null
          location_source?: string | null
          name?: string | null
          page_url?: string | null
          referrer?: string | null
          source?: string | null
          trigger_type?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          consent_newsletter?: boolean | null
          created_at?: string
          email?: string
          engaged_seconds?: number | null
          export_type?: string | null
          first_seen_at?: string | null
          id?: string
          interaction_count?: number | null
          last_seen_at?: string | null
          lead_type?: string | null
          location?: Json | null
          location_source?: string | null
          name?: string | null
          page_url?: string | null
          referrer?: string | null
          source?: string | null
          trigger_type?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      lease_charges: {
        Row: {
          amount: number | null
          charge_type: string
          id: string
          label: string | null
          lease_id: string
          responsibility: string
        }
        Insert: {
          amount?: number | null
          charge_type: string
          id?: string
          label?: string | null
          lease_id: string
          responsibility?: string
        }
        Update: {
          amount?: number | null
          charge_type?: string
          id?: string
          label?: string | null
          lease_id?: string
          responsibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_charges_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_documents: {
        Row: {
          document_type: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          lease_id: string
          mime_type: string | null
          uploaded_at: string
        }
        Insert: {
          document_type?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          lease_id: string
          mime_type?: string | null
          uploaded_at?: string
        }
        Update: {
          document_type?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          lease_id?: string
          mime_type?: string | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_documents_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_tenants: {
        Row: {
          id: string
          lease_id: string
          role: string
          tenant_id: string
        }
        Insert: {
          id?: string
          lease_id: string
          role?: string
          tenant_id: string
        }
        Update: {
          id?: string
          lease_id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_tenants_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leases: {
        Row: {
          adjustment_frequency: number | null
          adjustment_index: string | null
          agency_id: string | null
          agent_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deposit_months: number | null
          end_date: string | null
          id: string
          management_type: string
          monthly_rent: number
          next_adjustment_date: string | null
          notes: string | null
          primary_tenant_id: string
          property_id: string
          reference_name: string | null
          rent_due_day: number
          security_deposit: number | null
          start_date: string
          status: string
          termination_date: string | null
          termination_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          adjustment_frequency?: number | null
          adjustment_index?: string | null
          agency_id?: string | null
          agent_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deposit_months?: number | null
          end_date?: string | null
          id?: string
          management_type: string
          monthly_rent: number
          next_adjustment_date?: string | null
          notes?: string | null
          primary_tenant_id: string
          property_id: string
          reference_name?: string | null
          rent_due_day: number
          security_deposit?: number | null
          start_date: string
          status?: string
          termination_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          adjustment_frequency?: number | null
          adjustment_index?: string | null
          agency_id?: string | null
          agent_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deposit_months?: number | null
          end_date?: string | null
          id?: string
          management_type?: string
          monthly_rent?: number
          next_adjustment_date?: string | null
          notes?: string | null
          primary_tenant_id?: string
          property_id?: string
          reference_name?: string | null
          rent_due_day?: number
          security_deposit?: number | null
          start_date?: string
          status?: string
          termination_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_primary_tenant_id_fkey"
            columns: ["primary_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          area: number | null
          bathrooms: number | null
          bedrooms: number | null
          created_at: string
          description: string | null
          id: string
          intent: string | null
          location: Json | null
          parking: number | null
          photos: string[] | null
          price: number | null
          profile_id: string | null
          title: string | null
          type: string | null
        }
        Insert: {
          area?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string
          description?: string | null
          id?: string
          intent?: string | null
          location?: Json | null
          parking?: number | null
          photos?: string[] | null
          price?: number | null
          profile_id?: string | null
          title?: string | null
          type?: string | null
        }
        Update: {
          area?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string
          description?: string | null
          id?: string
          intent?: string | null
          location?: Json | null
          parking?: number | null
          photos?: string[] | null
          price?: number | null
          profile_id?: string | null
          title?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_anomalies: {
        Row: {
          description: string | null
          detected_at: string | null
          id: string
          meter_id: string | null
          resolved: boolean | null
          severity: string | null
          type: string | null
        }
        Insert: {
          description?: string | null
          detected_at?: string | null
          id?: string
          meter_id?: string | null
          resolved?: boolean | null
          severity?: string | null
          type?: string | null
        }
        Update: {
          description?: string | null
          detected_at?: string | null
          id?: string
          meter_id?: string | null
          resolved?: boolean | null
          severity?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_anomalies_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          created_at: string | null
          id: string
          meter_id: string
          read_at: string
          synced_at: string | null
          value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          meter_id: string
          read_at: string
          synced_at?: string | null
          value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          meter_id?: string
          read_at?: string
          synced_at?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings_hourly: {
        Row: {
          end_time: string
          id: string
          meter_id: string | null
          start_time: string
          synced_at: string | null
          value: number
        }
        Insert: {
          end_time: string
          id?: string
          meter_id?: string | null
          start_time: string
          synced_at?: string | null
          value: number
        }
        Update: {
          end_time?: string
          id?: string
          meter_id?: string | null
          start_time?: string
          synced_at?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_hourly_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      meters: {
        Row: {
          created_at: string | null
          display_name: string | null
          gateway_id: string | null
          id: string
          is_main_meter: boolean | null
          property_id: string | null
          pulse_factor: number | null
          type: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          gateway_id?: string | null
          id: string
          is_main_meter?: boolean | null
          property_id?: string | null
          pulse_factor?: number | null
          type?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          gateway_id?: string | null
          id?: string
          is_main_meter?: boolean | null
          property_id?: string | null
          pulse_factor?: number | null
          type?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meters_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      minimum_wage_history: {
        Row: {
          amount_brl: number
          created_at: string | null
          id: number
          is_projection: boolean | null
          legislation: string | null
          month: number | null
          reference_date: string
          remarks: string | null
          variation_percent: number | null
          year: number | null
        }
        Insert: {
          amount_brl: number
          created_at?: string | null
          id?: number
          is_projection?: boolean | null
          legislation?: string | null
          month?: number | null
          reference_date: string
          remarks?: string | null
          variation_percent?: number | null
          year?: number | null
        }
        Update: {
          amount_brl?: number
          created_at?: string | null
          id?: number
          is_projection?: boolean | null
          legislation?: string | null
          month?: number | null
          reference_date?: string
          remarks?: string | null
          variation_percent?: number | null
          year?: number | null
        }
        Relationships: []
      }
      ownership_proofs: {
        Row: {
          created_at: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          original_name: string | null
          profile_id: string
          property_index: number
          status: string | null
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          original_name?: string | null
          profile_id: string
          property_index?: number
          status?: string | null
        }
        Update: {
          created_at?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          original_name?: string | null
          profile_id?: string
          property_index?: number
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ownership_proofs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          additional_properties: Json | null
          address: Json | null
          admin_data: Json | null
          birth_date: string | null
          business_name: string | null
          clerk_id: string
          cnpj: string | null
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          person_type: string | null
          phone: string | null
          profile_photo_url: string | null
          property_address: Json | null
          property_details: Json | null
          property_photos: string[] | null
          property_type: string | null
          property_videos: Json | null
          registration_status_date: string | null
          role: string | null
          sub_units: Json | null
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          additional_properties?: Json | null
          address?: Json | null
          admin_data?: Json | null
          birth_date?: string | null
          business_name?: string | null
          clerk_id: string
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          person_type?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          property_address?: Json | null
          property_details?: Json | null
          property_photos?: string[] | null
          property_type?: string | null
          property_videos?: Json | null
          registration_status_date?: string | null
          role?: string | null
          sub_units?: Json | null
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          additional_properties?: Json | null
          address?: Json | null
          admin_data?: Json | null
          birth_date?: string | null
          business_name?: string | null
          clerk_id?: string
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          person_type?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          property_address?: Json | null
          property_details?: Json | null
          property_photos?: string[] | null
          property_type?: string | null
          property_videos?: Json | null
          registration_status_date?: string | null
          role?: string | null
          sub_units?: Json | null
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          allocation_model: string | null
          cadastral_map: string | null
          city: string | null
          connection_code: string | null
          created_at: string | null
          electronic_id: string | null
          id: string
          name: string
          owner_id: string | null
          state: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          allocation_model?: string | null
          cadastral_map?: string | null
          city?: string | null
          connection_code?: string | null
          created_at?: string | null
          electronic_id?: string | null
          id?: string
          name: string
          owner_id?: string | null
          state?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          allocation_model?: string | null
          cadastral_map?: string | null
          city?: string | null
          connection_code?: string | null
          created_at?: string | null
          electronic_id?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          state?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_income_months: {
        Row: {
          agency_fee_pct: number
          bank_reference: string | null
          created_at: string
          energy_portion: number
          id: string
          month: string
          notes: string | null
          other_income: number
          owner_id: string
          property_id: string
          received_amount: number
          received_on: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          agency_fee_pct?: number
          bank_reference?: string | null
          created_at?: string
          energy_portion?: number
          id?: string
          month: string
          notes?: string | null
          other_income?: number
          owner_id: string
          property_id: string
          received_amount?: number
          received_on?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agency_fee_pct?: number
          bank_reference?: string | null
          created_at?: string
          energy_portion?: number
          id?: string
          month?: string
          notes?: string | null
          other_income?: number
          owner_id?: string
          property_id?: string
          received_amount?: number
          received_on?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_income_months_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_income_months_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      readings: {
        Row: {
          delta: number | null
          id: string
          meter_id: string
          timestamp: string
          value: number
        }
        Insert: {
          delta?: number | null
          id?: string
          meter_id: string
          timestamp?: string
          value: number
        }
        Update: {
          delta?: number | null
          id?: string
          meter_id?: string
          timestamp?: string
          value?: number
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          additional_phone: string | null
          address_complement: string | null
          agency_id: string | null
          agent_id: string | null
          city: string | null
          cpf: string
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          id: string
          main_phone: string
          management_type: string
          move_in_date: string | null
          move_out_date: string | null
          neighborhood: string | null
          notes: string | null
          postal_code: string | null
          property_id: string
          rg: string | null
          state: string | null
          status: string
          street: string | null
          street_number: string | null
          updated_at: string
          use_property_address: boolean
          user_id: string
        }
        Insert: {
          additional_phone?: string | null
          address_complement?: string | null
          agency_id?: string | null
          agent_id?: string | null
          city?: string | null
          cpf: string
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          id?: string
          main_phone: string
          management_type: string
          move_in_date?: string | null
          move_out_date?: string | null
          neighborhood?: string | null
          notes?: string | null
          postal_code?: string | null
          property_id: string
          rg?: string | null
          state?: string | null
          status?: string
          street?: string | null
          street_number?: string | null
          updated_at?: string
          use_property_address?: boolean
          user_id: string
        }
        Update: {
          additional_phone?: string | null
          address_complement?: string | null
          agency_id?: string | null
          agent_id?: string | null
          city?: string | null
          cpf?: string
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          id?: string
          main_phone?: string
          management_type?: string
          move_in_date?: string | null
          move_out_date?: string | null
          neighborhood?: string | null
          notes?: string | null
          postal_code?: string | null
          property_id?: string
          rg?: string | null
          state?: string | null
          status?: string
          street?: string | null
          street_number?: string | null
          updated_at?: string
          use_property_address?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      useful_link_suggestions: {
        Row: {
          created_at: string
          description: string | null
          email: string
          id: string
          name: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          email: string
          id?: string
          name: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          name?: string
          url?: string
        }
        Relationships: []
      }
      waitlist_leads: {
        Row: {
          business_name: string | null
          city: string | null
          cnpj: string | null
          complement: string | null
          cpf: string | null
          created_at: string
          creci: string | null
          email: string
          id: string
          name: string
          neighborhood: string | null
          number: string | null
          partners_json: string | null
          portfolio_size: string | null
          profile_type: string
          source: string | null
          state: string | null
          status: string | null
          street: string | null
          trade_name: string | null
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          business_name?: string | null
          city?: string | null
          cnpj?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          creci?: string | null
          email: string
          id?: string
          name: string
          neighborhood?: string | null
          number?: string | null
          partners_json?: string | null
          portfolio_size?: string | null
          profile_type: string
          source?: string | null
          state?: string | null
          status?: string | null
          street?: string | null
          trade_name?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          business_name?: string | null
          city?: string | null
          cnpj?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          creci?: string | null
          email?: string
          id?: string
          name?: string
          neighborhood?: string | null
          number?: string | null
          partners_json?: string | null
          portfolio_size?: string | null
          profile_type?: string
          source?: string | null
          state?: string | null
          status?: string | null
          street?: string | null
          trade_name?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      water_bills: {
        Row: {
          average_consumption_m3: number | null
          bill_pdf_url: string | null
          billed_consumption_m3: number | null
          consumption_m3: number
          created_at: string | null
          current_reading: number | null
          due_date: string | null
          effective_rate_per_m3: number | null
          id: string
          meter_number: string | null
          notes: string | null
          occurrence_code: string | null
          previous_reading: number | null
          property_id: string | null
          reading_date: string | null
          reading_date_orig: string | null
          reference_month: string
          sewage_basic_fee: number | null
          sewage_tariff: number | null
          total_amount: number
          updated_at: string | null
          water_basic_fee: number | null
          water_tariff: number | null
        }
        Insert: {
          average_consumption_m3?: number | null
          bill_pdf_url?: string | null
          billed_consumption_m3?: number | null
          consumption_m3: number
          created_at?: string | null
          current_reading?: number | null
          due_date?: string | null
          effective_rate_per_m3?: number | null
          id?: string
          meter_number?: string | null
          notes?: string | null
          occurrence_code?: string | null
          previous_reading?: number | null
          property_id?: string | null
          reading_date?: string | null
          reading_date_orig?: string | null
          reference_month: string
          sewage_basic_fee?: number | null
          sewage_tariff?: number | null
          total_amount: number
          updated_at?: string | null
          water_basic_fee?: number | null
          water_tariff?: number | null
        }
        Update: {
          average_consumption_m3?: number | null
          bill_pdf_url?: string | null
          billed_consumption_m3?: number | null
          consumption_m3?: number
          created_at?: string | null
          current_reading?: number | null
          due_date?: string | null
          effective_rate_per_m3?: number | null
          id?: string
          meter_number?: string | null
          notes?: string | null
          occurrence_code?: string | null
          previous_reading?: number | null
          property_id?: string | null
          reading_date?: string | null
          reading_date_orig?: string | null
          reference_month?: string
          sewage_basic_fee?: number | null
          sewage_tariff?: number | null
          total_amount?: number
          updated_at?: string | null
          water_basic_fee?: number | null
          water_tariff?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "water_bills_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_latest_indices: {
        Row: {
          accumulated_12m: number | null
          code: string | null
          is_projection: boolean | null
          name: string | null
          reference_date: string | null
          value_percent: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_latest_billing_rate: {
        Args: { p_property_id: string }
        Returns: {
          consumption_m3: number
          effective_rate_per_m3: number
          reference_month: string
          total_amount: number
        }[]
      }
      get_property_bills: {
        Args: { p_property_id: string }
        Returns: {
          billed_consumption_m3: number
          consumption_m3: number
          current_reading: number
          due_date: string
          effective_rate_per_m3: number
          id: string
          meter_number: string
          occurrence_code: string
          previous_reading: number
          reading_date: string
          reading_date_orig: string
          reference_month: string
          sewage_basic_fee: number
          sewage_tariff: number
          total_amount: number
          water_basic_fee: number
          water_tariff: number
        }[]
      }
      get_property_details: {
        Args: { p_property_id: string }
        Returns: {
          address: string
          city: string
          connection_code: string
          id: string
          name: string
          state: string
          zip: string
        }[]
      }
      get_property_energy_bills: {
        Args: { p_property_id: string }
        Returns: {
          availability_adjustment_amount: number | null
          availability_cost_amount: number | null
          availability_cost_kwh: number | null
          billing_days: number | null
          bonus_discounts_amount: number | null
          consumer_unit: string
          created_at: string | null
          daily_avg_kwh: number | null
          due_date: string | null
          energy_compensated_amount: number | null
          energy_scee_exempt_amount: number | null
          estimated_savings_amount: number | null
          extraction_confidence: number | null
          flag_amount: number | null
          flag_type: string | null
          generation_balance_kwh: number | null
          grid_consumption_kwh: number
          grid_reading_current: number | null
          grid_reading_previous: number | null
          historical_consumption_raw: Json | null
          id: string
          injected_reading_current: number | null
          injected_reading_previous: number | null
          installation_class: string | null
          is_historical_only: boolean | null
          items_breakdown: Json | null
          meter_number: string | null
          monthly_avg_kwh: number | null
          notes: string | null
          property_id: string | null
          reading_date_current: string | null
          reading_date_next: string | null
          reading_date_previous: string | null
          reference_month: string
          reference_month_label: string | null
          solar_compensated_kwh: number | null
          solar_coverage_ratio: number | null
          solar_injected_kwh: number | null
          tariff_modality: string | null
          taxes_icms: number | null
          taxes_pis_cofins: number | null
          total_amount: number
          unit_price: number | null
          updated_at: string | null
          utility_company: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "energy_bills"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      upsert_water_bill: {
        Args: {
          p_average_consumption_m3?: number
          p_billed_consumption_m3: number
          p_consumption_m3: number
          p_current_reading: number
          p_due_date: string
          p_meter_number: string
          p_notes?: string
          p_occurrence_code?: string
          p_previous_reading: number
          p_property_id: string
          p_reading_date: string
          p_reading_date_orig: string
          p_reference_month: string
          p_sewage_basic_fee?: number
          p_sewage_tariff?: number
          p_total_amount: number
          p_water_basic_fee?: number
          p_water_tariff?: number
        }
        Returns: string
      }
    }
    Enums: {
      article_status: "draft" | "published" | "archived"
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
      article_status: ["draft", "published", "archived"],
    },
  },
} as const
