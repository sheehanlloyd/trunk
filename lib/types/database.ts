/**
 * Hand-written database types — the single source of truth for row shapes and
 * enums used across the app. Mirrors supabase/migrations/0001_initial_schema.sql.
 * Keep in sync when the schema changes (or regenerate with `supabase gen types`).
 */

// --- Enums -------------------------------------------------------------------
export type BusinessStatus =
  | "trial"
  | "active"
  | "past_due"
  | "paused"
  | "canceled";

export type UserRole = "owner" | "staff";

export type ConversationChannel = "chat" | "voice";

export type ConversationOutcome =
  | "booked"
  | "no_action"
  | "unclear"
  | "emergency_escalated"
  | "voicemail_left";

export type BookingStatus = "new" | "confirmed" | "owner_contacted" | "canceled";

export type NotificationType = "sms" | "email";

export type NotificationStatus = "sent" | "failed";

// --- Structured JSON shapes --------------------------------------------------
export interface ServiceItem {
  service: string;
  description?: string;
  price_range?: string;
}

export interface ConversationTurn {
  role: "customer" | "assistant";
  text: string;
}

// --- Row types ---------------------------------------------------------------
export interface Business {
  id: string;
  name: string;
  owner_email: string;
  phone_number: string | null;
  service_area: string | null;
  services: ServiceItem[];
  hours: Record<string, string>;
  emergency_policy: string | null;
  raw_scraped_content: string | null;
  status: BusinessStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

export interface BusinessUser {
  id: string;
  business_id: string;
  email: string;
  role: UserRole;
  auth_user_id: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  business_id: string;
  channel: ConversationChannel;
  customer_name: string | null;
  customer_phone: string | null;
  transcript: ConversationTurn[];
  outcome: ConversationOutcome | null;
  ai_confidence_flag: boolean;
  created_at: string;
}

export interface Booking {
  id: string;
  conversation_id: string | null;
  business_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  requested_service: string | null;
  preferred_time: string | null;
  notes: string | null;
  status: BookingStatus;
  created_at: string;
}

export interface Lead {
  id: string;
  business_id: string;
  conversation_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  requested_service: string | null;
  preferred_time: string | null;
  notes: string | null;
  reason: string | null;
  created_at: string;
}

export interface KnowledgeCorrection {
  id: string;
  business_id: string;
  original_content: string | null;
  corrected_content: string | null;
  created_by: string | null;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  business_id: string;
  type: NotificationType;
  related_booking_id: string | null;
  status: NotificationStatus;
  created_at: string;
}
