import type { StaffType } from "../../data/staffAuth";

export type AiAssistantMode =
  | "dashboard"
  | "schedule"
  | "digital-care"
  | "inventory"
  | "medical-record"
  | "clients"
  | "reports"
  | "portal";

export type AiUserRole = StaffType | "owner" | "unknown";
export type AiUrgency = "normal" | "important" | "urgent";
export type AiConfidence = "low" | "medium" | "high";

export interface AiQuickAction {
  label: string;
  prompt: string;
}

export interface AiFinding {
  id: string;
  title: string;
  detail: string;
  urgency: AiUrgency;
  source?: string;
}

export interface AiSuggestedAction {
  id: string;
  label: string;
  kind: "navigate" | "review" | "draft";
  route?: string;
  reason?: string;
  /** VetBot never performs a write/send action without a separate user confirmation. */
  requiresConfirmation: true;
}

export type AiActionType =
  | "book_appointment"
  | "reschedule_appointment"
  | "cancel_appointment"
  | "adjust_inventory"
  | "archive_conversation"
  | "restore_conversation"
  | "set_conversation_priority"
  | "set_lab_urgency"
  | "block_booking_time"
  | "draft_message"
  | "navigate"
  | "forbidden"
  | "none";

export interface AiActionPlan {
  requestId?: string;
  type: AiActionType;
  status: "needs_details" | "needs_confirmation" | "blocked" | "executed" | "rejected" | "failed";
  title: string;
  summary: string;
  missingFields: string[];
  details: Array<{ label: string; value: string }>;
  destructive?: boolean;
  confirmationLabel?: string;
}

export interface AiPrivacyMeta {
  mode: "strict-minimization";
  piiRemoved: boolean;
  removedCategories: string[];
  externalProcessing: boolean;
  noticeVersion: string;
}

export interface AiAssistantResult {
  answer: string;
  summary?: string;
  urgency: AiUrgency;
  confidence: AiConfidence;
  findings: AiFinding[];
  suggestedActions: AiSuggestedAction[];
  actionPlan?: AiActionPlan;
  usedTools: string[];
  memorySummary?: string;
  privacy: AiPrivacyMeta;
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
  result?: AiAssistantResult;
}

export interface AiAssistantRequest {
  mode: AiAssistantMode;
  question: string;
  context?: unknown;
  history?: AiChatMessage[];
  memorySummary?: string;
  userRole?: AiUserRole;
  privacyMode?: "strict-minimization";
  noticeVersion?: string;
}

export interface AiActionDecisionRequest {
  mode: AiAssistantMode;
  requestId: string;
  decision: "approve" | "reject";
  userRole?: AiUserRole;
}

/** Backward compatible: existing Edge Functions may still return only `answer`. */
export interface AiAssistantResponse extends Partial<AiAssistantResult> {
  answer: string;
}

