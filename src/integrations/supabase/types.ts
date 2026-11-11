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
      action_receipts: {
        Row: {
          account_name: string
          action: string
          activity_id: string | null
          approval_id: string | null
          approval_required: boolean
          approved_at: string | null
          completed_at: string
          details: string
          id: string
          object_url: string | null
          platform: string
          user_id: string
        }
        Insert: {
          account_name: string
          action: string
          activity_id?: string | null
          approval_id?: string | null
          approval_required?: boolean
          approved_at?: string | null
          completed_at?: string
          details?: string
          id?: string
          object_url?: string | null
          platform: string
          user_id: string
        }
        Update: {
          account_name?: string
          action?: string
          activity_id?: string | null
          approval_id?: string | null
          approval_required?: boolean
          approved_at?: string | null
          completed_at?: string
          details?: string
          id?: string
          object_url?: string | null
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_receipts_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_receipts_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: true
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          approved_plan: Json | null
          attendance: number
          audience: string
          budget: number
          community_input: string
          constraints: string
          created_at: string
          currency: string
          description: string
          follow_up: string
          goal: string
          id: string
          lessons: Json
          location: string
          plan_approved_at: string | null
          proposed_date: string
          registration_url: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_plan?: Json | null
          attendance?: number
          audience?: string
          budget?: number
          community_input?: string
          constraints?: string
          created_at?: string
          currency?: string
          description?: string
          follow_up?: string
          goal?: string
          id?: string
          lessons?: Json
          location?: string
          plan_approved_at?: string | null
          proposed_date?: string
          registration_url?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_plan?: Json | null
          attendance?: number
          audience?: string
          budget?: number
          community_input?: string
          constraints?: string
          created_at?: string
          currency?: string
          description?: string
          follow_up?: string
          goal?: string
          id?: string
          lessons?: Json
          location?: string
          plan_approved_at?: string | null
          proposed_date?: string
          registration_url?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_job_locks: {
        Row: {
          last_completed_at: string | null
          lease_until: string | null
          name: string
          token: string | null
        }
        Insert: {
          last_completed_at?: string | null
          lease_until?: string | null
          name: string
          token?: string | null
        }
        Update: {
          last_completed_at?: string | null
          lease_until?: string | null
          name?: string
          token?: string | null
        }
        Relationships: []
      }
      agent_task_runs: {
        Row: {
          attempt: number
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          lease_until: string | null
          occurrence_key: string
          phase: string
          started_at: string | null
          status: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          lease_until?: string | null
          occurrence_key: string
          phase?: string
          started_at?: string | null
          status?: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          lease_until?: string | null
          occurrence_key?: string
          phase?: string
          started_at?: string | null
          status?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_task_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
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
      approval_preferences: {
        Row: {
          created_at: string
          id: string
          label: string
          scope_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          scope_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          scope_key?: string
          user_id?: string
        }
        Relationships: []
      }
      approvals: {
        Row: {
          action_type: string
          activity_id: string | null
          approval_mode: string | null
          browser_session_id: string | null
          created_at: string
          details: string
          execution_status: string
          id: string
          payload: Json | null
          resolved_at: string | null
          run_error: string | null
          run_finished_at: string | null
          run_state: string | null
          status: string
          thread_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_type: string
          activity_id?: string | null
          approval_mode?: string | null
          browser_session_id?: string | null
          created_at?: string
          details?: string
          execution_status?: string
          id?: string
          payload?: Json | null
          resolved_at?: string | null
          run_error?: string | null
          run_finished_at?: string | null
          run_state?: string | null
          status?: string
          thread_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_type?: string
          activity_id?: string | null
          approval_mode?: string | null
          browser_session_id?: string | null
          created_at?: string
          details?: string
          execution_status?: string
          id?: string
          payload?: Json | null
          resolved_at?: string | null
          run_error?: string | null
          run_finished_at?: string | null
          run_state?: string | null
          status?: string
          thread_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_state: {
        Row: {
          last_learn_at: string | null
          last_notif_check: string | null
          last_review_at: string | null
          last_top: string | null
          lease_until: string | null
          paused_reason: string | null
          user_id: string
        }
        Insert: {
          last_learn_at?: string | null
          last_notif_check?: string | null
          last_review_at?: string | null
          last_top?: string | null
          lease_until?: string | null
          paused_reason?: string | null
          user_id: string
        }
        Update: {
          last_learn_at?: string | null
          last_notif_check?: string | null
          last_review_at?: string | null
          last_top?: string | null
          lease_until?: string | null
          paused_reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      browser_sessions: {
        Row: {
          active_approval_id: string | null
          agent_status: string
          connect_url: string | null
          created_at: string
          driver_lease: string | null
          ended_at: string | null
          expires_at: string | null
          goal: string | null
          handoff_reason: string | null
          id: string
          last_step_at: string | null
          live_url: string
          queue: Json
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
          active_approval_id?: string | null
          agent_status?: string
          connect_url?: string | null
          created_at?: string
          driver_lease?: string | null
          ended_at?: string | null
          expires_at?: string | null
          goal?: string | null
          handoff_reason?: string | null
          id?: string
          last_step_at?: string | null
          live_url: string
          queue?: Json
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
          active_approval_id?: string | null
          agent_status?: string
          connect_url?: string | null
          created_at?: string
          driver_lease?: string | null
          ended_at?: string | null
          expires_at?: string | null
          goal?: string | null
          handoff_reason?: string | null
          id?: string
          last_step_at?: string | null
          live_url?: string
          queue?: Json
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
      documents: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          thread_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind?: string
          thread_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          thread_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      event_profiles: {
        Row: {
          budget: number | null
          budget_notes: string
          contacts: Json
          goal_id: string
          spent: number | null
          staff: Json
          suggestions: Json
          suggestions_at: string | null
          updated_at: string
          user_id: string
          vendors: Json
          venue: string
          venue_details: string
          venue_status: string
        }
        Insert: {
          budget?: number | null
          budget_notes?: string
          contacts?: Json
          goal_id: string
          spent?: number | null
          staff?: Json
          suggestions?: Json
          suggestions_at?: string | null
          updated_at?: string
          user_id: string
          vendors?: Json
          venue?: string
          venue_details?: string
          venue_status?: string
        }
        Update: {
          budget?: number | null
          budget_notes?: string
          contacts?: Json
          goal_id?: string
          spent?: number | null
          staff?: Json
          suggestions?: Json
          suggestions_at?: string | null
          updated_at?: string
          user_id?: string
          vendors?: Json
          venue?: string
          venue_details?: string
          venue_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_profiles_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
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
      info_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string | null
          organization: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message?: string | null
          organization: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          organization?: string
          phone?: string | null
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
      linkedin_oauth_states: {
        Row: {
          account_name: string | null
          created_at: string
          expires_at: string
          id: string
          opener_origin: string
          redirect_uri: string
          state_hash: string
          status: string
          token_ciphertext: string | null
          user_id: string
        }
        Insert: {
          account_name?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          opener_origin: string
          redirect_uri: string
          state_hash: string
          status?: string
          token_ciphertext?: string | null
          user_id: string
        }
        Update: {
          account_name?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          opener_origin?: string
          redirect_uri?: string
          state_hash?: string
          status?: string
          token_ciphertext?: string | null
          user_id?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
          content: string
          created_at: string
          id: string
          source: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          source?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          source?: string
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
      org_usage_daily: {
        Row: {
          ai_calls: number
          browser_minutes: number
          browser_sessions: number
          usage_date: string
          user_id: string
        }
        Insert: {
          ai_calls?: number
          browser_minutes?: number
          browser_sessions?: number
          usage_date?: string
          user_id: string
        }
        Update: {
          ai_calls?: number
          browser_minutes?: number
          browser_sessions?: number
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          address: string | null
          apps_used: string[]
          automation_paused: boolean
          autonomy: string
          browser_reservation_until: string | null
          browser_session_minutes: number
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          daily_ai_limit: number
          daily_browser_minutes: number
          daily_browser_sessions: number
          facebook_setup_location: string | null
          letterhead_skipped: string[]
          linkedin_org_id: string | null
          logo_url: string | null
          mission: string | null
          name: string | null
          notif_checks: boolean
          onboarded: boolean
          profile: string | null
          public_pages: Json
          referral_source: string | null
          usage_pause_reason: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          apps_used?: string[]
          automation_paused?: boolean
          autonomy?: string
          browser_reservation_until?: string | null
          browser_session_minutes?: number
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          daily_ai_limit?: number
          daily_browser_minutes?: number
          daily_browser_sessions?: number
          facebook_setup_location?: string | null
          letterhead_skipped?: string[]
          linkedin_org_id?: string | null
          logo_url?: string | null
          mission?: string | null
          name?: string | null
          notif_checks?: boolean
          onboarded?: boolean
          profile?: string | null
          public_pages?: Json
          referral_source?: string | null
          usage_pause_reason?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          apps_used?: string[]
          automation_paused?: boolean
          autonomy?: string
          browser_reservation_until?: string | null
          browser_session_minutes?: number
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          daily_ai_limit?: number
          daily_browser_minutes?: number
          daily_browser_sessions?: number
          facebook_setup_location?: string | null
          letterhead_skipped?: string[]
          linkedin_org_id?: string | null
          logo_url?: string | null
          mission?: string | null
          name?: string | null
          notif_checks?: boolean
          onboarded?: boolean
          profile?: string | null
          public_pages?: Json
          referral_source?: string | null
          usage_pause_reason?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      poll_responses: {
        Row: {
          answers: Json
          created_at: string
          id: string
          poll_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          poll_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          created_at: string
          description: string | null
          event: Json | null
          id: string
          kind: string
          questions: Json
          status: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event?: Json | null
          id?: string
          kind?: string
          questions?: Json
          status?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event?: Json | null
          id?: string
          kind?: string
          questions?: Json
          status?: string
          title?: string
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
          ideas: Json
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          focus_area_id?: string | null
          id?: string
          ideas?: Json
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string
          focus_area_id?: string | null
          id?: string
          ideas?: Json
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
      sticky_notes: {
        Row: {
          color: string
          created_at: string
          goal_id: string | null
          id: string
          text: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          goal_id?: string | null
          id?: string
          text: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          goal_id?: string | null
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticky_notes_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          based_on_count: number
          created_at: string
          id: string
          items: Json
          thread_id: string
          user_id: string
        }
        Insert: {
          based_on_count?: number
          created_at?: string
          id?: string
          items?: Json
          thread_id: string
          user_id: string
        }
        Update: {
          based_on_count?: number
          created_at?: string
          id?: string
          items?: Json
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          activity_id: string | null
          assignee: string
          created_at: string
          created_by: string
          done: boolean
          done_at: string | null
          due_date: string | null
          goal_id: string | null
          id: string
          job_kind: string
          kind: string
          last_error: string | null
          last_run_at: string | null
          repeat: string | null
          run_prompt: string | null
          schedule_key: string | null
          scheduled_for: string | null
          thread_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          assignee?: string
          created_at?: string
          created_by?: string
          done?: boolean
          done_at?: string | null
          due_date?: string | null
          goal_id?: string | null
          id?: string
          job_kind?: string
          kind?: string
          last_error?: string | null
          last_run_at?: string | null
          repeat?: string | null
          run_prompt?: string | null
          schedule_key?: string | null
          scheduled_for?: string | null
          thread_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          activity_id?: string | null
          assignee?: string
          created_at?: string
          created_by?: string
          done?: boolean
          done_at?: string | null
          due_date?: string | null
          goal_id?: string | null
          id?: string
          job_kind?: string
          kind?: string
          last_error?: string | null
          last_run_at?: string | null
          repeat?: string | null
          run_prompt?: string | null
          schedule_key?: string | null
          scheduled_for?: string | null
          thread_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          activity_id: string | null
          created_at: string
          event_date: string | null
          id: string
          kind: string
          last_read_at: string | null
          latest_assistant_at: string | null
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          kind?: string
          last_read_at?: string | null
          latest_assistant_at?: string | null
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          kind?: string
          last_read_at?: string | null
          latest_assistant_at?: string | null
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_agent_job: {
        Args: { p_name: string; p_token: string }
        Returns: boolean
      }
      claim_agent_task: {
        Args: { p_id: string }
        Returns: {
          attempt: number
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          lease_until: string | null
          occurrence_key: string
          phase: string
          started_at: string | null
          status: string
          task_id: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_task_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      enqueue_due_agent_tasks: { Args: never; Returns: number }
      finish_agent_task: {
        Args: { p_next: string; p_run: string }
        Returns: undefined
      }
      reserve_org_usage: {
        Args: { p_kind: string; p_units?: number; p_user: string }
        Returns: boolean
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
