export type AiAssistantMode =
  | "dashboard"
  | "schedule"
  | "digital-care"
  | "inventory"
  | "medical-record"
  | "clients"
  | "portal";

export type AiUserRole = "vet" | "nurse" | "secretary" | "owner" | "unknown";

export interface AiQuickAction {
  label: string;
  prompt: string;
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiAssistantRequest {
  mode: AiAssistantMode;
  question: string;
  context?: unknown;
  history?: AiChatMessage[];
  userRole?: AiUserRole;
}

export interface AiAssistantResponse {
  answer: string;
}
