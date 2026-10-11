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
      activities: {
        Row: {
          activity_type: string
          branch_id: string | null
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
          performed_by: string | null
        }
        Insert: {
          activity_type: string
          branch_id?: string | null
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
          performed_by?: string | null
        }
        Update: {
          activity_type?: string
          branch_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_other: boolean
          name: string
          organization_id: string
          sort: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_other?: boolean
          name: string
          organization_id: string
          sort?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_other?: boolean
          name?: string
          organization_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "affiliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          amount: number | null
          approval_kind: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          approver_level: string
          assigned_member_id: string | null
          branch_id: string | null
          close_summary: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          customer_id: string | null
          details: string | null
          due_at: string | null
          entity_id: string | null
          entity_type: string | null
          equipment: string | null
          id: string
          location: string | null
          organization_id: string
          priority: string
          product_id: string | null
          quantity: number | null
          rejection_reason: string | null
          request_type: string
          requested_by: string | null
          status: string
          submitted_at: string | null
          supplier_id: string | null
          supplier_name: string | null
          task_id: string | null
          ticket_no: number
          ticket_type: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          approval_kind?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          approver_level?: string
          assigned_member_id?: string | null
          branch_id?: string | null
          close_summary?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          customer_id?: string | null
          details?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          equipment?: string | null
          id?: string
          location?: string | null
          organization_id: string
          priority?: string
          product_id?: string | null
          quantity?: number | null
          rejection_reason?: string | null
          request_type?: string
          requested_by?: string | null
          status?: string
          submitted_at?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          task_id?: string | null
          ticket_no?: number
          ticket_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          approval_kind?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          approver_level?: string
          assigned_member_id?: string | null
          branch_id?: string | null
          close_summary?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          customer_id?: string | null
          details?: string | null
          due_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          equipment?: string | null
          id?: string
          location?: string | null
          organization_id?: string
          priority?: string
          product_id?: string | null
          quantity?: number | null
          rejection_reason?: string | null
          request_type?: string
          requested_by?: string | null
          status?: string
          submitted_at?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          task_id?: string | null
          ticket_no?: number
          ticket_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          branch_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          branch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          branch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_policies: {
        Row: {
          branch_id: string | null
          id: string
          membership_plan_id: string | null
          notice_unit: string
          notice_value: number
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id?: string | null
          id?: string
          membership_plan_id?: string | null
          notice_unit?: string
          notice_value?: number
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string | null
          id?: string
          membership_plan_id?: string | null
          notice_unit?: string
          notice_value?: number
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_policies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_policies_membership_plan_id_fkey"
            columns: ["membership_plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_requests: {
        Row: {
          assigned_member_id: string | null
          branch_id: string | null
          created_by: string | null
          customer_id: string
          effective_date: string | null
          handled_at: string | null
          id: string
          membership_id: string | null
          note: string | null
          organization_id: string
          policy_snapshot: Json | null
          reason: string | null
          requested_at: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_member_id?: string | null
          branch_id?: string | null
          created_by?: string | null
          customer_id: string
          effective_date?: string | null
          handled_at?: string | null
          id?: string
          membership_id?: string | null
          note?: string | null
          organization_id: string
          policy_snapshot?: Json | null
          reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_member_id?: string | null
          branch_id?: string | null
          created_by?: string | null
          customer_id?: string
          effective_date?: string | null
          handled_at?: string | null
          id?: string
          membership_id?: string | null
          note?: string | null
          organization_id?: string
          policy_snapshot?: Json | null
          reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_requests_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          allowed: boolean
          branch_id: string
          created_at: string
          customer_id: string
          id: string
          method: string | null
          organization_id: string
          performed_by: string | null
          reasons: string[]
        }
        Insert: {
          allowed: boolean
          branch_id: string
          created_at?: string
          customer_id: string
          id?: string
          method?: string | null
          organization_id: string
          performed_by?: string | null
          reasons?: string[]
        }
        Update: {
          allowed?: boolean
          branch_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          method?: string | null
          organization_id?: string
          performed_by?: string | null
          reasons?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_bookings: {
        Row: {
          attended: boolean
          branch_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          organization_id: string
          session_date: string
          status: string
          template_id: string
        }
        Insert: {
          attended?: boolean
          branch_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          organization_id: string
          session_date: string
          status?: string
          template_id: string
        }
        Update: {
          attended?: boolean
          branch_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          organization_id?: string
          session_date?: string
          status?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_bookings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "class_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      class_rooms: {
        Row: {
          active: boolean
          branch_id: string
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          active?: boolean
          branch_id: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          active?: boolean
          branch_id?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_rooms_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_templates: {
        Row: {
          active: boolean
          branch_id: string
          capacity: number
          created_at: string
          duration_min: number
          id: string
          instructor_member_id: string | null
          name: string
          organization_id: string
          room_id: string
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          branch_id: string
          capacity?: number
          created_at?: string
          duration_min?: number
          id?: string
          instructor_member_id?: string | null
          name: string
          organization_id: string
          room_id: string
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          active?: boolean
          branch_id?: string
          capacity?: number
          created_at?: string
          duration_min?: number
          id?: string
          instructor_member_id?: string | null
          name?: string
          organization_id?: string
          room_id?: string
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_templates_instructor_member_id_fkey"
            columns: ["instructor_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_templates_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "class_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_requirements: {
        Row: {
          active: boolean
          configuration: Json
          created_at: string
          entity_type: string
          id: string
          key: string
          name: string
          organization_id: string | null
          required: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          configuration?: Json
          created_at?: string
          entity_type?: string
          id?: string
          key: string
          name: string
          organization_id?: string | null
          required?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          configuration?: Json
          created_at?: string
          entity_type?: string
          id?: string
          key?: string
          name?: string
          organization_id?: string | null
          required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_requirements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_compliance_items: {
        Row: {
          completed_at: string | null
          customer_id: string
          expires_at: string | null
          id: string
          metadata: Json
          organization_id: string
          requirement_id: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          customer_id: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          requirement_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          customer_id?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          requirement_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_compliance_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_compliance_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_compliance_items_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "compliance_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          customer_id: string
          document_type: string
          file_name: string | null
          id: string
          organization_id: string
          signed_at: string | null
          status: string
          storage_path: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          customer_id: string
          document_type: string
          file_name?: string | null
          id?: string
          organization_id: string
          signed_at?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          customer_id?: string
          document_type?: string
          file_name?: string | null
          id?: string
          organization_id?: string
          signed_at?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_freezes: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          end_date: string
          id: string
          membership_id: string
          note: string | null
          organization_id: string
          reason: string
          start_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          end_date: string
          id?: string
          membership_id: string
          note?: string | null
          organization_id: string
          reason: string
          start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          end_date?: string
          id?: string
          membership_id?: string
          note?: string | null
          organization_id?: string
          reason?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_freezes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_freezes_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_freezes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          affiliation_id: string | null
          affiliation_other: string | null
          birth_date: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          desk_note: string | null
          email: string | null
          full_name: string
          home_branch_id: string | null
          id: string
          joined_at: string
          national_id: string | null
          normalized_phone: string | null
          organization_id: string
          payment_method: string | null
          payment_method_details: string | null
          phone: string | null
          photo_path: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          affiliation_id?: string | null
          affiliation_other?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          desk_note?: string | null
          email?: string | null
          full_name: string
          home_branch_id?: string | null
          id?: string
          joined_at?: string
          national_id?: string | null
          normalized_phone?: string | null
          organization_id: string
          payment_method?: string | null
          payment_method_details?: string | null
          phone?: string | null
          photo_path?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          affiliation_id?: string | null
          affiliation_other?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          desk_note?: string | null
          email?: string | null
          full_name?: string
          home_branch_id?: string | null
          id?: string
          joined_at?: string
          national_id?: string | null
          normalized_phone?: string | null
          organization_id?: string
          payment_method?: string | null
          payment_method_details?: string | null
          phone?: string | null
          photo_path?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_affiliation_id_fkey"
            columns: ["affiliation_id"]
            isOneToOne: false
            referencedRelation: "affiliations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_home_branch_id_fkey"
            columns: ["home_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          created_at: string
          id: string
          organization_id: string
          plan_date: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          created_at?: string
          id?: string
          organization_id: string
          plan_date: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          plan_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_plans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          acknowledged_at: string | null
          branch_id: string | null
          created_at: string
          detected_at: string
          entity_id: string
          entity_type: string
          explanation: string | null
          id: string
          metadata: Json
          organization_id: string
          recommended_action: string | null
          resolved_at: string | null
          rule_key: string
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          branch_id?: string | null
          created_at?: string
          detected_at?: string
          entity_id: string
          entity_type: string
          explanation?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          recommended_action?: string | null
          resolved_at?: string | null
          rule_key: string
          severity: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          branch_id?: string | null
          created_at?: string
          detected_at?: string
          entity_id?: string
          entity_type?: string
          explanation?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          recommended_action?: string | null
          resolved_at?: string | null
          rule_key?: string
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          branch_id: string
          created_at: string
          expiry_date: string | null
          id: string
          lot_number: string | null
          organization_id: string
          product_id: string
          quantity: number
          received_at: string | null
          return_deadline: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number?: string | null
          organization_id: string
          product_id: string
          quantity?: number
          received_at?: string | null
          return_deadline?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number?: string | null
          organization_id?: string
          product_id?: string
          quantity?: number
          received_at?: string | null
          return_deadline?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string | null
          cost: number | null
          created_at: string
          default_supplier_id: string | null
          deleted_at: string | null
          id: string
          import_code: string | null
          is_demo: boolean
          kind: string
          name: string
          organization_id: string
          price: number | null
          replacement_product_id: string | null
          return_window_days: number | null
          returnable: boolean
          sku: string | null
          status: string
          subcategory: string | null
          track_expiry: boolean
          updated_at: string
          variant: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          cost?: number | null
          created_at?: string
          default_supplier_id?: string | null
          deleted_at?: string | null
          id?: string
          import_code?: string | null
          is_demo?: boolean
          kind?: string
          name: string
          organization_id: string
          price?: number | null
          replacement_product_id?: string | null
          return_window_days?: number | null
          returnable?: boolean
          sku?: string | null
          status?: string
          subcategory?: string | null
          track_expiry?: boolean
          updated_at?: string
          variant?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          cost?: number | null
          created_at?: string
          default_supplier_id?: string | null
          deleted_at?: string | null
          id?: string
          import_code?: string | null
          is_demo?: boolean
          kind?: string
          name?: string
          organization_id?: string
          price?: number | null
          replacement_product_id?: string | null
          return_window_days?: number | null
          returnable?: boolean
          sku?: string | null
          status?: string
          subcategory?: string | null
          track_expiry?: boolean
          updated_at?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_products_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_products_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock_levels: {
        Row: {
          branch_id: string
          current_stock: number
          id: string
          minimum_stock: number
          organization_id: string
          product_id: string
          target_stock: number | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          current_stock?: number
          id?: string
          minimum_stock?: number
          organization_id: string
          product_id: string
          target_stock?: number | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          current_stock?: number
          id?: string
          minimum_stock?: number
          organization_id?: string
          product_id?: string
          target_stock?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_levels_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_levels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_levels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          branch_id: string
          created_at: string
          document_path: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          notes: string | null
          organization_id: string
          override_reason: string | null
          override_used: boolean
          performed_by: string | null
          product_id: string
          quantity_delta: number
          reason: string | null
          reference: string | null
          stock_after: number
          stock_before: number
          transaction_type: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          document_path?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          notes?: string | null
          organization_id: string
          override_reason?: string | null
          override_used?: boolean
          performed_by?: string | null
          product_id: string
          quantity_delta: number
          reason?: string | null
          reference?: string | null
          stock_after: number
          stock_before: number
          transaction_type: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          document_path?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          notes?: string | null
          organization_id?: string
          override_reason?: string | null
          override_used?: boolean
          performed_by?: string | null
          product_id?: string
          quantity_delta?: number
          reason?: string | null
          reference?: string | null
          stock_after?: number
          stock_before?: number
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_member_id: string | null
          branch_id: string
          converted_customer_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          last_activity_at: string | null
          loss_note: string | null
          loss_reason: string | null
          normalized_phone: string | null
          organization_id: string
          phone: string | null
          source: string
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_member_id?: string | null
          branch_id: string
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          last_activity_at?: string | null
          loss_note?: string | null
          loss_reason?: string | null
          normalized_phone?: string | null
          organization_id: string
          phone?: string | null
          source?: string
          stage?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_member_id?: string | null
          branch_id?: string
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          last_activity_at?: string | null
          loss_note?: string | null
          loss_reason?: string | null
          normalized_phone?: string | null
          organization_id?: string
          phone?: string | null
          source?: string
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_customer_id_fkey"
            columns: ["converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_branch_access: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          organization_member_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          organization_member_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          organization_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_branch_access_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_branch_access_organization_member_id_fkey"
            columns: ["organization_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          active: boolean
          billing_period: string
          created_at: string
          id: string
          metadata: Json
          name: string
          organization_id: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_period?: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_period?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          branch_id: string | null
          cancel_approved_at: string | null
          cancel_approved_by: string | null
          cancel_note: string | null
          cancel_override_reason: string | null
          cancel_performed_at: string | null
          cancel_reason: string | null
          cancellation_request_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          customer_id: string
          display_name: string
          end_date: string | null
          id: string
          membership_plan_id: string | null
          organization_id: string
          price: number
          scheduled_cancel_date: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          cancel_approved_at?: string | null
          cancel_approved_by?: string | null
          cancel_note?: string | null
          cancel_override_reason?: string | null
          cancel_performed_at?: string | null
          cancel_reason?: string | null
          cancellation_request_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          customer_id: string
          display_name: string
          end_date?: string | null
          id?: string
          membership_plan_id?: string | null
          organization_id: string
          price?: number
          scheduled_cancel_date?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          cancel_approved_at?: string | null
          cancel_approved_by?: string | null
          cancel_note?: string | null
          cancel_override_reason?: string | null
          cancel_performed_at?: string | null
          cancel_reason?: string | null
          cancellation_request_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          customer_id?: string
          display_name?: string
          end_date?: string | null
          id?: string
          membership_plan_id?: string | null
          organization_id?: string
          price?: number
          scheduled_cancel_date?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_cancellation_request_id_fkey"
            columns: ["cancellation_request_id"]
            isOneToOne: false
            referencedRelation: "cancellation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_membership_plan_id_fkey"
            columns: ["membership_plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          insight_id: string | null
          link: string | null
          organization_id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          insight_id?: string | null
          link?: string | null
          organization_id: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          insight_id?: string | null
          link?: string | null
          organization_id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          invited_email: string | null
          job_title: string | null
          joined_at: string | null
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          invited_email?: string | null
          job_title?: string | null
          joined_at?: string | null
          organization_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          invited_email?: string | null
          job_title?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          cancellation_requests_entry_enabled: boolean
          created_at: string
          currency: string
          deleted_at: string | null
          email: string | null
          id: string
          legal_name: string | null
          name: string
          phone: string | null
          rules_evaluated_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cancellation_requests_entry_enabled?: boolean
          created_at?: string
          currency?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          name: string
          phone?: string | null
          rules_evaluated_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cancellation_requests_entry_enabled?: boolean
          created_at?: string
          currency?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          phone?: string | null
          rules_evaluated_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string
          currency: string
          customer_id: string
          due_at: string | null
          external_reference: string | null
          failure_reason: string | null
          id: string
          membership_id: string | null
          metadata: Json
          organization_id: string
          paid_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          due_at?: string | null
          external_reference?: string | null
          failure_reason?: string | null
          id?: string
          membership_id?: string | null
          metadata?: Json
          organization_id: string
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          due_at?: string | null
          external_reference?: string | null
          failure_reason?: string | null
          id?: string
          membership_id?: string | null
          metadata?: Json
          organization_id?: string
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          job_title: string | null
          locale: string
          phone: string | null
          timezone: string
          updated_at: string
          username: string | null
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          job_title?: string | null
          locale?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          locale?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      report_permissions: {
        Row: {
          can_export: boolean
          can_view: boolean
          id: string
          member_id: string | null
          organization_id: string
          own_only: boolean
          report_key: string
          role: string | null
          updated_at: string
        }
        Insert: {
          can_export?: boolean
          can_view?: boolean
          id?: string
          member_id?: string | null
          organization_id: string
          own_only?: boolean
          report_key: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          can_export?: boolean
          can_view?: boolean
          id?: string
          member_id?: string | null
          organization_id?: string
          own_only?: boolean
          report_key?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_permissions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          branch_ids: string[]
          created_at: string
          file_path: string | null
          format: string
          id: string
          member_id: string | null
          organization_id: string
          params: Json
          report_key: string
          report_name: string
          row_count: number
          user_id: string
        }
        Insert: {
          branch_ids?: string[]
          created_at?: string
          file_path?: string | null
          format: string
          id?: string
          member_id?: string | null
          organization_id: string
          params?: Json
          report_key: string
          report_name: string
          row_count?: number
          user_id?: string
        }
        Update: {
          branch_ids?: string[]
          created_at?: string
          file_path?: string | null
          format?: string
          id?: string
          member_id?: string | null
          organization_id?: string
          params?: Json
          report_key?: string
          report_name?: string
          row_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_runs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_definitions: {
        Row: {
          configuration: Json
          created_at: string
          default_severity: string
          enabled: boolean
          entity_type: string
          id: string
          key: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          default_severity?: string
          enabled?: boolean
          entity_type: string
          id?: string
          key: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          default_severity?: string
          enabled?: boolean
          entity_type?: string
          id?: string
          key?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          owner_member_id: string
          report_key: string | null
          shared_roles: string[]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          owner_member_id: string
          report_key?: string | null
          shared_roles?: string[]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          owner_member_id?: string
          report_key?: string | null
          shared_roles?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_reports_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_lines: {
        Row: {
          applied_delta: number | null
          count_id: string
          counted_at: string | null
          counted_by: string | null
          counted_qty: number | null
          id: string
          organization_id: string
          product_id: string
          reason: string | null
          system_qty: number
        }
        Insert: {
          applied_delta?: number | null
          count_id: string
          counted_at?: string | null
          counted_by?: string | null
          counted_qty?: number | null
          id?: string
          organization_id: string
          product_id: string
          reason?: string | null
          system_qty: number
        }
        Update: {
          applied_delta?: number | null
          count_id?: string
          counted_at?: string | null
          counted_by?: string | null
          counted_qty?: number | null
          id?: string
          organization_id?: string
          product_id?: string
          reason?: string | null
          system_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_lines_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          created_at: string
          id: string
          note: string | null
          opened_at: string
          opened_by: string | null
          organization_id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          created_at?: string
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          organization_id: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          created_at: string
          default_return_window_days: number | null
          email: string | null
          expired_return_policy: string | null
          id: string
          lead_time_days: number | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_return_window_days?: number | null
          email?: string | null
          expired_return_policy?: string | null
          id?: string
          lead_time_days?: number | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_return_window_days?: number | null
          email?: string | null
          expired_return_policy?: string | null
          id?: string
          lead_time_days?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_member_id: string | null
          branch_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          organization_id: string
          plan_date: string | null
          plan_rank: number | null
          priority: string
          rule_key: string | null
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_member_id?: string | null
          branch_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id: string
          plan_date?: string | null
          plan_rank?: number | null
          priority?: string
          rule_key?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_member_id?: string | null
          branch_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string
          plan_date?: string | null
          plan_rank?: number | null
          priority?: string
          rule_key?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          body: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          performed_by: string | null
          ticket_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          organization_id: string
          performed_by?: string | null
          ticket_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          performed_by?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_files: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string
          organization_id: string
          size_bytes: number
          storage_path: string
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          organization_id: string
          size_bytes: number
          storage_path: string
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          organization_id?: string
          size_bytes?: number
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_files_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _bm_active: {
        Args: { _org: string; br: string[]; d: string }
        Returns: {
          customer_id: string
        }[]
      }
      _bm_kpis: {
        Args: { _from: string; _org: string; _to: string; br: string[] }
        Returns: Json
      }
      _log_customer: {
        Args: { _cust: string; _desc: string; _meta: Json; _type: string }
        Returns: undefined
      }
      _skip_automation: { Args: never; Returns: boolean }
      _sync_rule: {
        Args: {
          _action: string
          _entity: string
          _org: string
          _rows: Json
          _rule: string
          _sev: string
        }
        Returns: undefined
      }
      _ticket_link_ok: {
        Args: { _id: string; _kind: string; _org: string }
        Returns: boolean
      }
      _ticket_log: {
        Args: { _body: string; _meta: Json; _t: string; _type: string }
        Returns: undefined
      }
      apply_freezes: { Args: { _customer?: string }; Returns: undefined }
      apply_inventory_transaction: {
        Args: {
          _branch: string
          _document_path?: string
          _expiry_date?: string
          _idempotency_key?: string
          _lot_id?: string
          _lot_number?: string
          _meta?: Json
          _notes?: string
          _override?: boolean
          _override_reason?: string
          _product: string
          _quantity: number
          _reason?: string
          _reference?: string
          _supplier?: string
          _type: string
        }
        Returns: Json
      }
      apply_scheduled_cancellations: { Args: never; Returns: number }
      approve_daily_plan: {
        Args: { _branch: string; _date: string }
        Returns: undefined
      }
      approve_stock_count: { Args: { _count: string }; Returns: Json }
      book_class: {
        Args: { _customer: string; _date: string; _template: string }
        Returns: string
      }
      bootstrap_current_user: { Args: { _full_name?: string }; Returns: Json }
      branch_management_report: {
        Args: { _branches?: string[]; _from: string; _org: string; _to: string }
        Returns: Json
      }
      can_manage_ticket: { Args: { _t: string }; Returns: boolean }
      can_view_ticket: { Args: { _t: string }; Returns: boolean }
      cancel_booking: { Args: { _booking: string }; Returns: undefined }
      cancel_membership: {
        Args: {
          _effective: string
          _membership: string
          _note: string
          _override_reason?: string
          _reason: string
          _request: string
        }
        Returns: Json
      }
      cancel_stock_count: { Args: { _count: string }; Returns: undefined }
      cancellation_policy_for: { Args: { _membership: string }; Returns: Json }
      change_membership_plan: {
        Args: { _membership: string; _plan: string }
        Returns: undefined
      }
      check_in_customer: {
        Args: { _branch: string; _customer: string }
        Returns: Json
      }
      convert_lead_to_customer: { Args: { _lead: string }; Returns: string }
      create_ticket: {
        Args: {
          _branch: string
          _data: Json
          _details: string
          _org: string
          _priority: string
          _title: string
          _type: string
        }
        Returns: string
      }
      current_member_id: { Args: { _org: string }; Returns: string }
      end_freeze: { Args: { _freeze: string }; Returns: undefined }
      entry_block_reasons: { Args: { _customer: string }; Returns: string[] }
      evaluate_rules: { Args: { _org: string }; Returns: undefined }
      find_person_by_phone: {
        Args: { _org: string; _phone: string }
        Returns: {
          full_name: string
          id: string
          kind: string
          stage: string
          status: string
        }[]
      }
      get_dashboard_kpis: {
        Args: { _branch?: string; _org: string }
        Returns: Json
      }
      has_branch_access: {
        Args: { _branch: string; _org: string }
        Returns: boolean
      }
      is_org_admin: { Args: { _org: string }; Returns: boolean }
      is_org_manager: { Args: { _org: string }; Returns: boolean }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      member_role: { Args: { _org: string }; Returns: string }
      my_report_permissions: { Args: { _org: string }; Returns: Json }
      normalize_phone: { Args: { _p: string }; Returns: string }
      notice_date: { Args: { _from: string; _policy: Json }; Returns: string }
      open_cancellation_request: {
        Args: {
          _assigned: string
          _membership: string
          _note: string
          _reason: string
          _requested_at: string
        }
        Returns: string
      }
      open_stock_count: {
        Args: { _branch: string; _note?: string; _products?: string[] }
        Returns: string
      }
      preview_cancellation_date: {
        Args: { _membership: string; _requested: string }
        Returns: Json
      }
      refresh_insights: { Args: { _org: string }; Returns: string }
      report_branches: {
        Args: { _branches: string[]; _org: string }
        Returns: string[]
      }
      report_perm: { Args: { _key: string; _org: string }; Returns: Json }
      rule_setting: {
        Args: { _key: string; _org: string }
        Returns: Record<string, unknown>
      }
      run_custom_report: {
        Args: {
          _branches?: string[]
          _columns: string[]
          _from: string
          _org: string
          _source: string
          _status?: string
          _to: string
        }
        Returns: Json
      }
      run_report: {
        Args: {
          _branches?: string[]
          _from: string
          _key: string
          _org: string
          _to: string
        }
        Returns: Json
      }
      search_entities: {
        Args: { _limit?: number; _q: string }
        Returns: {
          entity_type: string
          id: string
          phone: string
          status: string
          title: string
        }[]
      }
      set_count_line: {
        Args: { _counted: number; _line: string; _reason?: string }
        Returns: undefined
      }
      shares_org_with: { Args: { _user: string }; Returns: boolean }
      suggest_daily_plan: {
        Args: { _branch: string; _date: string }
        Returns: number
      }
      ticket_add_file: {
        Args: {
          _mime: string
          _name: string
          _path: string
          _size: number
          _t: string
        }
        Returns: undefined
      }
      ticket_close: {
        Args: { _summary: string; _t: string }
        Returns: undefined
      }
      ticket_comment: {
        Args: { _body: string; _t: string }
        Returns: undefined
      }
      ticket_decide: {
        Args: { _approve: boolean; _reason: string; _t: string }
        Returns: undefined
      }
      ticket_update: {
        Args: { _field: string; _t: string; _value: string }
        Returns: undefined
      }
      transfer_stock: {
        Args: {
          _from: string
          _idempotency_key?: string
          _note?: string
          _product: string
          _quantity: number
          _to: string
        }
        Returns: Json
      }
      update_cancellation_request: {
        Args: {
          _assigned: string
          _note: string
          _request: string
          _status: string
        }
        Returns: undefined
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
