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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_user_connections: {
        Row: {
          account_name: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      approvals: {
        Row: {
          action_type: string
          browser_session_id: string | null
          created_at: string
          details: string
          id: string
          payload: Json | null
          resolved_at: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          action_type: string
          browser_session_id?: string | null
          created_at?: string
          details?: string
          id?: string
          payload?: Json | null
          resolved_at?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          action_type?: string
          browser_session_id?: string | null
          created_at?: string
          details?: string
          id?: string
          payload?: Json | null
          resolved_at?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      browser_sessions: {
        Row: {
          agent_status: string
          connect_url: string | null
          created_at: string
          ended_at: string | null
          goal: string | null
          handoff_reason: string | null
          id: string
          live_url: string
          session_id: string
          signed_in: boolean
          site: string | null
          status: string
          steps: Json
          submit_approved: boolean
          task: string
          thread_id: string
          user_id: string
        }
        Insert: {
          agent_status?: string
          connect_url?: string | null
          created_at?: string
          ended_at?: string | null
          goal?: string | null
          handoff_reason?: string | null
          id?: string
          live_url: string
          session_id: string
          signed_in?: boolean
          site?: string | null
          status?: string
          steps?: Json
          submit_approved?: boolean
          task: string
          thread_id: string
          user_id: string
        }
        Update: {
          agent_status?: string
          connect_url?: string | null
          created_at?: string
          ended_at?: string | null
          goal?: string | null
          handoff_reason?: string | null
          id?: string
          live_url?: string
          session_id?: string
          signed_in?: boolean
          site?: string | null
          status?: string
          steps?: Json
          submit_approved?: boolean
          task?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      connector_connections: {
        Row: {
          access_token_ciphertext: string
          account_name: string | null
          connector: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_ciphertext: string
          account_name?: string | null
          connector: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_ciphertext?: string
          account_name?: string | null
          connector?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      focus_areas: {
        Row: {
          city: string
          created_at: string
          id: string
          interests: string | null
          neighborhoods: string | null
          partner_types: string | null
          priorities: string | null
          state: string
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          interests?: string | null
          neighborhoods?: string | null
          partner_types?: string | null
          priorities?: string | null
          state: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          interests?: string | null
          neighborhoods?: string | null
          partner_types?: string | null
          priorities?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      linkedin_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          location: string | null
          name: string
          post_urn: string | null
          starts_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          location?: string | null
          name: string
          post_urn?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          location?: string | null
          name?: string
          post_urn?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          facebook_setup_location: string | null
          linkedin_org_id: string | null
          mission: string | null
          name: string | null
          onboarded: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          facebook_setup_location?: string | null
          linkedin_org_id?: string | null
          mission?: string | null
          name?: string | null
          onboarded?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          facebook_setup_location?: string | null
          linkedin_org_id?: string | null
          mission?: string | null
          name?: string | null
          onboarded?: boolean
          user_id?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          created_at: string
          details: string | null
          id: string
          name: string
          source: string | null
          status: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          name: string
          source?: string | null
          status?: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          name?: string
          source?: string | null
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      scout_findings: {
        Row: {
          created_at: string
          focus_area_id: string | null
          id: string
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          focus_area_id?: string | null
          id?: string
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string
          focus_area_id?: string | null
          id?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_findings_focus_area_id_fkey"
            columns: ["focus_area_id"]
            isOneToOne: false
            referencedRelation: "focus_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_state: {
        Row: {
          last_run_at: string | null
          lease_until: string | null
          pause_reason: string | null
          paused: boolean
          user_id: string
        }
        Insert: {
          last_run_at?: string | null
          lease_until?: string | null
          pause_reason?: string | null
          paused?: boolean
          user_id: string
        }
        Update: {
          last_run_at?: string | null
          lease_until?: string | null
          pause_reason?: string | null
          paused?: boolean
          user_id?: string
        }
        Relationships: []
      }
      site_credentials: {
        Row: {
          created_at: string
          domain: string
          id: string
          label: string
          secret_ciphertext: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          label: string
          secret_ciphertext: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          label?: string
          secret_ciphertext?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      threads: {
        Row: {
          created_at: string
          id: string
          kind: string
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
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
    Enums: {},
  },
} as const
