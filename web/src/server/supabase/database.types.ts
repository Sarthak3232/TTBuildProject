// Public schema generated from the migrated PostgreSQL catalog by scripts/generate-public-types.py.
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
      "activity_sessions": {
        Row: {
          "id": string
          "user_id": string
          "task_id": string
          "task_snapshot": Json
          "state": string
          "pause_reason": string | null
          "started_at": string
          "active_since": string | null
          "accumulated_ms": number
          "eligible_ms": number
          "revision": number
          "policy_version": string
        }
        Insert: {
          "id"?: string
          "user_id": string
          "task_id": string
          "task_snapshot": Json
          "state"?: string
          "pause_reason"?: string | null
          "started_at"?: string
          "active_since"?: string | null
          "accumulated_ms"?: number
          "eligible_ms"?: number
          "revision"?: number
          "policy_version"?: string
        }
        Update: {
          "id"?: string
          "user_id"?: string
          "task_id"?: string
          "task_snapshot"?: Json
          "state"?: string
          "pause_reason"?: string | null
          "started_at"?: string
          "active_since"?: string | null
          "accumulated_ms"?: number
          "eligible_ms"?: number
          "revision"?: number
          "policy_version"?: string
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
      "completions": {
        Row: {
          "id": string
          "user_id": string
          "session_id": string
          "task_snapshot": Json
          "description": string
          "reflection": string | null
          "completed_at": string
          "timezone": string
          "eligible_ms": number
          "distance_m": number | null
          "token_award": number
        }
        Insert: {
          "id"?: string
          "user_id": string
          "session_id": string
          "task_snapshot": Json
          "description"?: string
          "reflection"?: string | null
          "completed_at"?: string
          "timezone"?: string
          "eligible_ms": number
          "distance_m"?: number | null
          "token_award": number
        }
        Update: {
          "id"?: string
          "user_id"?: string
          "session_id"?: string
          "task_snapshot"?: Json
          "description"?: string
          "reflection"?: string | null
          "completed_at"?: string
          "timezone"?: string
          "eligible_ms"?: number
          "distance_m"?: number | null
          "token_award"?: number
        }
        Relationships: [
          {
            foreignKeyName: "completions_user_id_session_id_fkey"
            columns: ["user_id", "session_id"]
            isOneToOne: true
            referencedRelation: "activity_sessions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      "goal_occurrences": {
        Row: {
          "user_id": string
          "schedule_id": string
          "local_date": string
          "target_snapshot": number
          "progress_ms": number
          "completed_at": string | null
          "timezone": string
        }
        Insert: {
          "user_id": string
          "schedule_id": string
          "local_date": string
          "target_snapshot": number
          "progress_ms"?: number
          "completed_at"?: string | null
          "timezone": string
        }
        Update: {
          "user_id"?: string
          "schedule_id"?: string
          "local_date"?: string
          "target_snapshot"?: number
          "progress_ms"?: number
          "completed_at"?: string | null
          "timezone"?: string
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
      "goal_schedules": {
        Row: {
          "id": string
          "user_id": string
          "task_id": string
          "target_ms": number
          "repeat_kind": string
          "date_once": string | null
          "weekdays": number[] | null
          "timezone": string
          "effective_from": string
          "archived_at": string | null
          "created_at": string
        }
        Insert: {
          "id"?: string
          "user_id": string
          "task_id": string
          "target_ms": number
          "repeat_kind": string
          "date_once"?: string | null
          "weekdays"?: number[] | null
          "timezone": string
          "effective_from": string
          "archived_at"?: string | null
          "created_at"?: string
        }
        Update: {
          "id"?: string
          "user_id"?: string
          "task_id"?: string
          "target_ms"?: number
          "repeat_kind"?: string
          "date_once"?: string | null
          "weekdays"?: number[] | null
          "timezone"?: string
          "effective_from"?: string
          "archived_at"?: string | null
          "created_at"?: string
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
      "idempotency_records": {
        Row: {
          "user_id": string
          "operation": string
          "key": string
          "request_hash": string
          "resource_id": string
          "response_snapshot": Json
          "created_at": string
        }
        Insert: {
          "user_id": string
          "operation": string
          "key": string
          "request_hash": string
          "resource_id": string
          "response_snapshot": Json
          "created_at"?: string
        }
        Update: {
          "user_id"?: string
          "operation"?: string
          "key"?: string
          "request_hash"?: string
          "resource_id"?: string
          "response_snapshot"?: Json
          "created_at"?: string
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
      "profiles": {
        Row: {
          "user_id": string
          "display_name": string
          "timezone": string
          "created_at": string
        }
        Insert: {
          "user_id": string
          "display_name"?: string
          "timezone"?: string
          "created_at"?: string
        }
        Update: {
          "user_id"?: string
          "display_name"?: string
          "timezone"?: string
          "created_at"?: string
        }
        Relationships: [
        ]
      }
      "rolls": {
        Row: {
          "id": string
          "user_id": string
          "allocations": number[]
          "cost": number
          "threshold": number
          "won": boolean
          "slot": number | null
          "policy_version": string
          "delivery_state": string
          "created_at": string
          "resulting_balance": number
        }
        Insert: {
          "id"?: string
          "user_id": string
          "allocations": number[]
          "cost": number
          "threshold": number
          "won": boolean
          "slot"?: number | null
          "policy_version"?: string
          "delivery_state": string
          "created_at"?: string
          "resulting_balance": number
        }
        Update: {
          "id"?: string
          "user_id"?: string
          "allocations"?: number[]
          "cost"?: number
          "threshold"?: number
          "won"?: boolean
          "slot"?: number | null
          "policy_version"?: string
          "delivery_state"?: string
          "created_at"?: string
          "resulting_balance"?: number
        }
        Relationships: [
          {
            foreignKeyName: "rolls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      "route_points": {
        Row: {
          "user_id": string
          "session_id": string
          "sequence": number
          "segment_id": number
          "captured_at": string
          "received_at": string
          "lat": number
          "lng": number
          "accuracy_m": number
          "distance_delta_m": number
        }
        Insert: {
          "user_id": string
          "session_id": string
          "sequence": number
          "segment_id": number
          "captured_at": string
          "received_at"?: string
          "lat": number
          "lng": number
          "accuracy_m": number
          "distance_delta_m"?: number
        }
        Update: {
          "user_id"?: string
          "session_id"?: string
          "sequence"?: number
          "segment_id"?: number
          "captured_at"?: string
          "received_at"?: string
          "lat"?: number
          "lng"?: number
          "accuracy_m"?: number
          "distance_delta_m"?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_points_user_id_session_id_fkey"
            columns: ["user_id", "session_id"]
            isOneToOne: false
            referencedRelation: "activity_sessions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      "session_intervals": {
        Row: {
          "id": string
          "user_id": string
          "session_id": string
          "sequence": number
          "kind": string
          "start_at": string
          "end_at": string | null
          "eligibility": boolean
        }
        Insert: {
          "id"?: string
          "user_id": string
          "session_id": string
          "sequence": number
          "kind": string
          "start_at": string
          "end_at"?: string | null
          "eligibility"?: boolean
        }
        Update: {
          "id"?: string
          "user_id"?: string
          "session_id"?: string
          "sequence"?: number
          "kind"?: string
          "start_at"?: string
          "end_at"?: string | null
          "eligibility"?: boolean
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
      "task_definitions": {
        Row: {
          "id": string
          "user_id": string
          "kind": string
          "name": string
          "description": string
          "minimum_ms": number | null
          "reflection_question": string | null
          "archived_at": string | null
          "created_at": string
        }
        Insert: {
          "id"?: string
          "user_id": string
          "kind": string
          "name": string
          "description"?: string
          "minimum_ms"?: number | null
          "reflection_question"?: string | null
          "archived_at"?: string | null
          "created_at"?: string
        }
        Update: {
          "id"?: string
          "user_id"?: string
          "kind"?: string
          "name"?: string
          "description"?: string
          "minimum_ms"?: number | null
          "reflection_question"?: string | null
          "archived_at"?: string | null
          "created_at"?: string
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
      "tokenBalance": {
        Row: {
          "user_id": string
          "balance": number
          "version": number
        }
        Insert: {
          "user_id": string
          "balance"?: number
          "version"?: number
        }
        Update: {
          "user_id"?: string
          "balance"?: number
          "version"?: number
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
      "token_entries": {
        Row: {
          "id": string
          "user_id": string
          "completion_id": string | null
          "delta": number
          "resulting_balance": number
          "created_at": string
          "roll_id": string | null
        }
        Insert: {
          "id"?: string
          "user_id": string
          "completion_id"?: string | null
          "delta": number
          "resulting_balance": number
          "created_at"?: string
          "roll_id"?: string | null
        }
        Update: {
          "id"?: string
          "user_id"?: string
          "completion_id"?: string | null
          "delta"?: number
          "resulting_balance"?: number
          "created_at"?: string
          "roll_id"?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "token_entries_user_id_completion_id_fkey"
            columns: ["user_id", "completion_id"]
            isOneToOne: true
            referencedRelation: "completions"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "token_entries_user_id_roll_id_fkey"
            columns: ["user_id", "roll_id"]
            isOneToOne: true
            referencedRelation: "rolls"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      "unlock_entitlements": {
        Row: {
          "roll_id": string
          "user_id": string
          "slot": number
          "state": string
          "created_at": string
        }
        Insert: {
          "roll_id": string
          "user_id": string
          "slot": number
          "state"?: string
          "created_at"?: string
        }
        Update: {
          "roll_id"?: string
          "user_id"?: string
          "slot"?: number
          "state"?: string
          "created_at"?: string
        }
        Relationships: [
          {
            foreignKeyName: "unlock_entitlements_user_id_roll_id_fkey"
            columns: ["user_id", "roll_id"]
            isOneToOne: true
            referencedRelation: "rolls"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      "app_calendar": {
        Args: {
          "p_user_id": string
          "p_month": string
        }
        Returns: Json
      }
      "app_history": {
        Args: {
          "p_user_id": string
          "p_period"?: string
          "p_before"?: string
          "p_before_id"?: string
          "p_limit"?: number
        }
        Returns: Json
      }
      "app_mutate": {
        Args: {
          "p_user_id": string
          "p_operation": string
          "p_key": string
          "p_payload": Json
        }
        Returns: Json
      }
      "app_snapshot": {
        Args: {
          "p_user_id": string
        }
        Returns: Json
      }
      "ingest_route_points": {
        Args: {
          "p_user_id": string
          "p_session_id": string
          "p_revision": number
          "p_points": Json
          "p_gap"?: boolean
        }
        Returns: Json
      }
      "my_app_calendar": {
        Args: {
          "p_month": string
        }
        Returns: Json
      }
      "my_app_history": {
        Args: {
          "p_period": string
          "p_before": string
          "p_before_id": string
          "p_limit": number
        }
        Returns: Json
      }
      "my_app_mutate": {
        Args: {
          "p_operation": string
          "p_key": string
          "p_payload": Json
        }
        Returns: Json
      }
      "my_app_snapshot": {
        Args: never
        Returns: Json
      }
      "my_ingest_route_points": {
        Args: {
          "p_session_id": string
          "p_revision": number
          "p_points": Json
          "p_gap": boolean
        }
        Returns: Json
      }
      "my_read_session_route": {
        Args: {
          "p_session_id": string
        }
        Returns: Json
      }
      "read_session_route": {
        Args: {
          "p_user_id": string
          "p_session_id": string
        }
        Returns: Json
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
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
