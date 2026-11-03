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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_sessions: {
        Row: {
          accumulated_ms: number
          active_since: string | null
          eligible_ms: number
          id: string
          pause_reason: string | null
          policy_version: string
          revision: number
          started_at: string
          state: string
          task_id: string
          task_snapshot: Json
          user_id: string
        }
        Insert: {
          accumulated_ms?: number
          active_since?: string | null
          eligible_ms?: number
          id?: string
          pause_reason?: string | null
          policy_version?: string
          revision?: number
          started_at?: string
          state?: string
          task_id: string
          task_snapshot: Json
          user_id: string
        }
        Update: {
          accumulated_ms?: number
          active_since?: string | null
          eligible_ms?: number
          id?: string
          pause_reason?: string | null
          policy_version?: string
          revision?: number
          started_at?: string
          state?: string
          task_id?: string
          task_snapshot?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "activity_sessions_user_id_task_id_fkey"
            columns: ["user_id", "task_id"]
            isOneToOne: false
            referencedRelation: "task_definitions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      completions: {
        Row: {
          completed_at: string
          description: string
          distance_m: number | null
          eligible_ms: number
          id: string
          reflection: string | null
          session_id: string
          task_snapshot: Json
          timezone: string
          token_award: number
          user_id: string
        }
        Insert: {
          completed_at?: string
          description?: string
          distance_m?: number | null
          eligible_ms: number
          id?: string
          reflection?: string | null
          session_id: string
          task_snapshot: Json
          timezone?: string
          token_award: number
          user_id: string
        }
        Update: {
          completed_at?: string
          description?: string
          distance_m?: number | null
          eligible_ms?: number
          id?: string
          reflection?: string | null
          session_id?: string
          task_snapshot?: Json
          timezone?: string
          token_award?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completions_user_id_session_id_fkey"
            columns: ["user_id", "session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      goal_occurrences: {
        Row: {
          completed_at: string | null
          local_date: string
          progress_ms: number
          schedule_id: string
          target_snapshot: number
          timezone: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          local_date: string
          progress_ms?: number
          schedule_id: string
          target_snapshot: number
          timezone: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          local_date?: string
          progress_ms?: number
          schedule_id?: string
          target_snapshot?: number
          timezone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_occurrences_user_id_schedule_id_fkey"
            columns: ["user_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "goal_schedules"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      goal_schedules: {
        Row: {
          archived_at: string | null
          created_at: string
          date_once: string | null
          effective_from: string
          id: string
          repeat_kind: string
          target_ms: number
          task_id: string
          timezone: string
          user_id: string
          weekdays: number[] | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          date_once?: string | null
          effective_from: string
          id?: string
          repeat_kind: string
          target_ms: number
          task_id: string
          timezone: string
          user_id: string
          weekdays?: number[] | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          date_once?: string | null
          effective_from?: string
          id?: string
          repeat_kind?: string
          target_ms?: number
          task_id?: string
          timezone?: string
          user_id?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "goal_schedules_user_id_task_id_fkey"
            columns: ["user_id", "task_id"]
            isOneToOne: false
            referencedRelation: "task_definitions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      idempotency_records: {
        Row: {
          created_at: string
          key: string
          operation: string
          request_hash: string
          resource_id: string
          response_snapshot: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          key: string
          operation: string
          request_hash: string
          resource_id: string
          response_snapshot: Json
          user_id: string
        }
        Update: {
          created_at?: string
          key?: string
          operation?: string
          request_hash?: string
          resource_id?: string
          response_snapshot?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          timezone: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          timezone?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          timezone?: string
          user_id?: string
        }
        Relationships: []
      }
      session_intervals: {
        Row: {
          eligibility: boolean
          end_at: string | null
          id: string
          kind: string
          sequence: number
          session_id: string
          start_at: string
          user_id: string
        }
        Insert: {
          eligibility?: boolean
          end_at?: string | null
          id?: string
          kind: string
          sequence: number
          session_id: string
          start_at: string
          user_id: string
        }
        Update: {
          eligibility?: boolean
          end_at?: string | null
          id?: string
          kind?: string
          sequence?: number
          session_id?: string
          start_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_intervals_user_id_session_id_fkey"
            columns: ["user_id", "session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      task_definitions: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string
          id: string
          kind: string
          minimum_ms: number | null
          name: string
          reflection_question: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string
          id?: string
          kind: string
          minimum_ms?: number | null
          name: string
          reflection_question?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string
          id?: string
          kind?: string
          minimum_ms?: number | null
          name?: string
          reflection_question?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_definitions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      token_entries: {
        Row: {
          completion_id: string
          created_at: string
          delta: number
          id: string
          resulting_balance: number
          user_id: string
        }
        Insert: {
          completion_id: string
          created_at?: string
          delta: number
          id?: string
          resulting_balance: number
          user_id: string
        }
        Update: {
          completion_id?: string
          created_at?: string
          delta?: number
          id?: string
          resulting_balance?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_entries_user_id_completion_id_fkey"
            columns: ["user_id", "completion_id"]
            isOneToOne: false
            referencedRelation: "completions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      tokenBalance: {
        Row: {
          balance: number
          user_id: string
          version: number
        }
        Insert: {
          balance?: number
          user_id: string
          version?: number
        }
        Update: {
          balance?: number
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tokenBalance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
