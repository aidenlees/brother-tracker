export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      assignments: {
        Row: {
          active: boolean
          created_at: string
          id: string
          plan_template_id: string | null
          settings: NonNullable<Json>
          start_date: string
          student_id: string
          tracker_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          plan_template_id?: string | null
          settings?: NonNullable<Json>
          start_date: string
          student_id: string
          tracker_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          plan_template_id?: string | null
          settings?: NonNullable<Json>
          start_date?: string
          student_id?: string
          tracker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assignments_plan_template_id_fkey'
            columns: ['plan_template_id']
            isOneToOne: false
            referencedRelation: 'plan_templates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignments_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignments_tracker_id_fkey'
            columns: ['tracker_id']
            isOneToOne: false
            referencedRelation: 'trackers'
            referencedColumns: ['id']
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          kind: string
          owner_id: string
          storage_path: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          kind?: string
          owner_id?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          kind?: string
          owner_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attachments_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'entries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attachments_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          at: string
          before: Json | null
          id: number
          row_id: string | null
          table_name: string
        }
        ComputedFields: never
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: never
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: never
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          entry_id: string
          id: string
        }
        ComputedFields: never
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          edited_at?: string | null
          entry_id: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'comments_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'comments_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'entries'
            referencedColumns: ['id']
          },
        ]
      }
      entries: {
        Row: {
          assignment_id: string
          created_at: string
          data: NonNullable<Json>
          date: string
          did: string | null
          field_version: number
          id: string
          minutes: number | null
          owner_id: string
          plan_item_id: string | null
          struggled: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          assignment_id: string
          created_at?: string
          data?: NonNullable<Json>
          date: string
          did?: string | null
          field_version: number
          id?: string
          minutes?: number | null
          owner_id?: string
          plan_item_id?: string | null
          struggled?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          data?: NonNullable<Json>
          date?: string
          did?: string | null
          field_version?: number
          id?: string
          minutes?: number | null
          owner_id?: string
          plan_item_id?: string | null
          struggled?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'entries_assignment_id_fkey'
            columns: ['assignment_id']
            isOneToOne: false
            referencedRelation: 'assignments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'entries_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'entries_plan_item_id_fkey'
            columns: ['plan_item_id']
            isOneToOne: false
            referencedRelation: 'plan_items'
            referencedColumns: ['id']
          },
        ]
      }
      followups: {
        Row: {
          assignment_id: string
          created_at: string
          due_date: string
          entry_id: string
          id: string
          label: string
          owner_id: string
          status: string
        }
        ComputedFields: never
        Insert: {
          assignment_id: string
          created_at?: string
          due_date: string
          entry_id: string
          id?: string
          label: string
          owner_id?: string
          status?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          due_date?: string
          entry_id?: string
          id?: string
          label?: string
          owner_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'followups_assignment_id_fkey'
            columns: ['assignment_id']
            isOneToOne: false
            referencedRelation: 'assignments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followups_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'entries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followups_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      plan_items: {
        Row: {
          assignment_id: string
          created_at: string
          date: string
          details: NonNullable<Json>
          id: string
          sort: number
          title: string
        }
        ComputedFields: never
        Insert: {
          assignment_id: string
          created_at?: string
          date: string
          details?: NonNullable<Json>
          id?: string
          sort?: number
          title: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          date?: string
          details?: NonNullable<Json>
          id?: string
          sort?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'plan_items_assignment_id_fkey'
            columns: ['assignment_id']
            isOneToOne: false
            referencedRelation: 'assignments'
            referencedColumns: ['id']
          },
        ]
      }
      plan_templates: {
        Row: {
          created_at: string
          first_date: string
          id: string
          items: NonNullable<Json>
          name: string
          tracker_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          first_date: string
          id?: string
          items: NonNullable<Json>
          name: string
          tracker_id: string
        }
        Update: {
          created_at?: string
          first_date?: string
          id?: string
          items?: NonNullable<Json>
          name?: string
          tracker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'plan_templates_tracker_id_fkey'
            columns: ['tracker_id']
            isOneToOne: false
            referencedRelation: 'trackers'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          id: string
          role: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          id: string
          role: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: NonNullable<Json>
          remind_at: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: NonNullable<Json>
          remind_at?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: NonNullable<Json>
          remind_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      tracker_versions: {
        Row: {
          created_at: string
          field_version: number
          fields: NonNullable<Json>
          tracker_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          field_version: number
          fields: NonNullable<Json>
          tracker_id: string
        }
        Update: {
          created_at?: string
          field_version?: number
          fields?: NonNullable<Json>
          tracker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tracker_versions_tracker_id_fkey'
            columns: ['tracker_id']
            isOneToOne: false
            referencedRelation: 'trackers'
            referencedColumns: ['id']
          },
        ]
      }
      trackers: {
        Row: {
          archived: boolean
          cadence: NonNullable<Json>
          color: string
          created_at: string
          display: string | null
          field_version: number
          fields: NonNullable<Json>
          followups: Json | null
          icon: string
          id: string
          metrics: NonNullable<Json>
          name: string
          pacing_flags: NonNullable<Json>
          slug: string
          sort: number
        }
        ComputedFields: never
        Insert: {
          archived?: boolean
          cadence: NonNullable<Json>
          color: string
          created_at?: string
          display?: string | null
          field_version?: number
          fields?: NonNullable<Json>
          followups?: Json | null
          icon?: string
          id?: string
          metrics?: NonNullable<Json>
          name: string
          pacing_flags?: NonNullable<Json>
          slug: string
          sort?: number
        }
        Update: {
          archived?: boolean
          cadence?: NonNullable<Json>
          color?: string
          created_at?: string
          display?: string | null
          field_version?: number
          fields?: NonNullable<Json>
          followups?: Json | null
          icon?: string
          id?: string
          metrics?: NonNullable<Json>
          name?: string
          pacing_flags?: NonNullable<Json>
          slug?: string
          sort?: number
        }
        Relationships: []
      }
      viewer_links: {
        Row: {
          created_at: string
          student_id: string
          viewer_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          student_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          student_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'viewer_links_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'viewer_links_viewer_id_fkey'
            columns: ['viewer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_tracker: {
        Args: { start: string; student: string; template?: string; tracker_slug: string }
        Returns: string
      }
      attachment_path_part: { Args: { name: string; part: number }; Returns: string }
      field_check_checkbox: { Args: { field: Json; value: Json }; Returns: string }
      field_check_checklist: { Args: { field: Json; value: Json }; Returns: string }
      field_check_counter: { Args: { field: Json; value: Json }; Returns: string }
      field_check_duration: { Args: { field: Json; value: Json }; Returns: string }
      field_check_long_text: { Args: { field: Json; value: Json }; Returns: string }
      field_check_multi_select: { Args: { field: Json; value: Json }; Returns: string }
      field_check_number: { Args: { field: Json; value: Json }; Returns: string }
      field_check_page_range: { Args: { field: Json; value: Json }; Returns: string }
      field_check_photo: { Args: { field: Json; value: Json }; Returns: string }
      field_check_rating_1_5: { Args: { field: Json; value: Json }; Returns: string }
      field_check_select: { Args: { field: Json; value: Json }; Returns: string }
      field_check_short_text: { Args: { field: Json; value: Json }; Returns: string }
      field_check_tally_group: { Args: { field: Json; value: Json }; Returns: string }
      field_check_yes_no: { Args: { field: Json; value: Json }; Returns: string }
      field_is_whole: { Args: { max: number; min: number; value: Json }; Returns: boolean }
      field_option_keys: { Args: { field: Json }; Returns: string[] }
      today_ny: { Args: Record<PropertyKey, never>; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
