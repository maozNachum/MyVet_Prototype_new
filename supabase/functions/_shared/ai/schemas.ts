import { AiGatewayError } from "./errors.ts";
import type { VetBotMode } from "./types.ts";

export const VETBOT_OUTPUT_SCHEMA_VERSION = "2026-07-16.1";
export const VISIT_SUMMARY_OUTPUT_SCHEMA_VERSION = "2026-07-17.1";
export const DIGITALCARE_TRANSCRIPT_SCHEMA_VERSION = "2026-07-17.1";
export const RAG_ANSWER_SCHEMA_VERSION = "2026-07-17.1";

export const RAG_ANSWER_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["answered", "insufficient", "conflict"] },
    answer: { type: "string", maxLength: 2400 },
    usedSourceIds: {
      type: "array",
      maxItems: 6,
      uniqueItems: true,
      items: { type: "string", maxLength: 80 },
    },
  },
  required: ["status", "answer", "usedSourceIds"],
};

export interface ValidatedRagAnswer {
  status: "answered" | "insufficient" | "conflict";
  answer: string;
  usedSourceIds: string[];
}

const VISIT_SUMMARY_FIELDS = [
  "chief_complaint", "symptoms", "relevant_history", "examination_findings",
  "tests", "clinical_assessment", "treatments", "medications", "follow_up",
  "warnings", "unresolved_items", "source_references",
] as const;

const VISIT_SOURCE_TYPES = [
  "medical_visit", "physical_exam", "medical_problems", "differential_diagnoses",
  "prescriptions", "lab_orders",
  "digitalcare_transcript",
] as const;

export const DIGITALCARE_TRANSCRIPT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    transcript: { type: "string", maxLength: 300000 },
    language: { type: "string", maxLength: 20 },
  },
  required: ["transcript", "language"],
};

export interface ValidatedDigitalCareTranscript {
  transcript: string;
  language: string;
}

const summaryTextArray = { type: "array", maxItems: 20, items: { type: "string", maxLength: 700 } };

export const VISIT_SUMMARY_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    chief_complaint: { type: "string", maxLength: 2000 },
    symptoms: summaryTextArray,
    relevant_history: summaryTextArray,
    examination_findings: summaryTextArray,
    tests: summaryTextArray,
    clinical_assessment: { type: "string", maxLength: 4000 },
    treatments: summaryTextArray,
    medications: summaryTextArray,
    follow_up: summaryTextArray,
    warnings: summaryTextArray,
    unresolved_items: summaryTextArray,
    source_references: { type: "array", maxItems: 6, uniqueItems: true, items: { type: "string", enum: VISIT_SOURCE_TYPES } },
  },
  required: VISIT_SUMMARY_FIELDS,
};

export interface ValidatedVisitSummaryOutput {
  chief_complaint: string;
  symptoms: string[];
  relevant_history: string[];
  examination_findings: string[];
  tests: string[];
  clinical_assessment: string;
  treatments: string[];
  medications: string[];
  follow_up: string[];
  warnings: string[];
  unresolved_items: string[];
  source_references: typeof VISIT_SOURCE_TYPES[number][];
}

const ACTION_TYPES = [
  "book_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "adjust_inventory",
  "archive_conversation",
  "restore_conversation",
  "set_conversation_priority",
  "set_lab_urgency",
  "block_booking_time",
  "draft_message",
  "navigate",
  "forbidden",
  "none",
] as const;

export const VETBOT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string", description: "Short Hebrew answer with no direct identifiers." },
    summary: { type: "string" },
    urgency: { type: "string", enum: ["normal", "important", "urgent"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    findings: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          urgency: { type: "string", enum: ["normal", "important", "urgent"] },
          source: { type: "string" },
        },
        required: ["id", "title", "detail", "urgency"],
      },
    },
    suggestedActions: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          kind: { type: "string", enum: ["navigate", "review", "draft"] },
          route: { type: "string" },
          reason: { type: "string" },
          requiresConfirmation: { type: "boolean" },
        },
        required: ["id", "label", "kind", "requiresConfirmation"],
      },
    },
    actionProposal: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ACTION_TYPES },
        intentSummary: { type: "string" },
        missingFields: { type: "array", maxItems: 8, items: { type: "string" } },
        patientName: { type: "string" },
        patientSpecies: { type: "string" },
        appointmentRef: { type: "integer" },
        appointmentDate: { type: "string", format: "date" },
        appointmentTime: { type: "string" },
        currentAppointmentDate: { type: "string" },
        currentAppointmentTime: { type: "string" },
        appointmentType: { type: "string" },
        appointmentMode: { type: "string", enum: ["physical", "video"] },
        urgency: { type: "string", enum: ["normal", "urgent"] },
        itemName: { type: "string" },
        inventoryOperation: { type: "string", enum: ["set", "add", "remove"] },
        quantity: { type: "number" },
        conversationRef: { type: "integer" },
        priority: { type: "string", enum: ["normal", "urgent"] },
        labOrderRef: { type: "integer" },
        testName: { type: "string" },
        isUrgent: { type: "boolean" },
        blockDate: { type: "string" },
        blockStart: { type: "string" },
        blockEnd: { type: "string" },
        allDay: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["type", "intentSummary", "missingFields"],
    },
    memorySummary: { type: "string", description: "De-identified rolling memory for this open session only." },
  },
  required: ["answer", "urgency", "confidence", "findings", "suggestedActions", "actionProposal", "memorySummary"],
};

export interface ValidatedVetBotOutput {
  answer: string;
  summary?: string;
  urgency: "normal" | "important" | "urgent";
  confidence: "low" | "medium" | "high";
  findings: Array<Record<string, unknown>>;
  suggestedActions: Array<Record<string, unknown>>;
  actionProposal: Record<string, unknown>;
  memorySummary: string;
}

export interface ValidatedVetBotRequestBody {
  mode: VetBotMode;
  question?: string;
  context?: unknown;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  memorySummary?: string;
  userRole?: "clinic_admin" | "vet" | "nurse" | "secretary" | "owner" | "unknown";
  privacyMode?: "strict-minimization";
  noticeVersion?: string;
  actionDecision?: { requestId: string; decision: "approve" | "reject" };
}

const VETBOT_MODES = ["dashboard", "schedule", "digital-care", "inventory", "medical-record", "clients", "reports", "portal"] as const;
const VETBOT_REQUEST_KEYS = ["mode", "question", "context", "history", "memorySummary", "userRole", "privacyMode", "noticeVersion", "actionDecision"] as const;

function inputInvalid(): never {
  throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
}

export function validateVetBotRequestBody(value: unknown): ValidatedVetBotRequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) inputInvalid();
  const body = value as Record<string, unknown>;
  const allowed = new Set<string>(VETBOT_REQUEST_KEYS);
  if (Object.keys(body).some((key) => !allowed.has(key))) inputInvalid();
  if (typeof body.mode !== "string" || !VETBOT_MODES.includes(body.mode as VetBotMode)) inputInvalid();

  const result: ValidatedVetBotRequestBody = { mode: body.mode as VetBotMode };
  if (body.question !== undefined) {
    if (typeof body.question !== "string" || body.question.length > 1_600) inputInvalid();
    result.question = body.question;
  }
  if (body.context !== undefined) result.context = body.context;
  if (body.history !== undefined) {
    if (!Array.isArray(body.history) || body.history.length > 8) inputInvalid();
    result.history = body.history.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) inputInvalid();
      const message = entry as Record<string, unknown>;
      if (Object.keys(message).some((key) => key !== "role" && key !== "content")) inputInvalid();
      if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string" || message.content.length > 900) inputInvalid();
      return { role: message.role, content: message.content };
    });
  }
  if (body.memorySummary !== undefined) {
    if (typeof body.memorySummary !== "string" || body.memorySummary.length > 900) inputInvalid();
    result.memorySummary = body.memorySummary;
  }
  if (body.userRole !== undefined) {
    const roles = ["clinic_admin", "vet", "nurse", "secretary", "owner", "unknown"];
    if (typeof body.userRole !== "string" || !roles.includes(body.userRole)) inputInvalid();
    result.userRole = body.userRole as ValidatedVetBotRequestBody["userRole"];
  }
  if (body.privacyMode !== undefined) {
    if (body.privacyMode !== "strict-minimization") inputInvalid();
    result.privacyMode = body.privacyMode;
  }
  if (body.noticeVersion !== undefined) {
    if (typeof body.noticeVersion !== "string" || body.noticeVersion.length > 40) inputInvalid();
    result.noticeVersion = body.noticeVersion;
  }
  if (body.actionDecision !== undefined) {
    if (!body.actionDecision || typeof body.actionDecision !== "object" || Array.isArray(body.actionDecision)) inputInvalid();
    const decision = body.actionDecision as Record<string, unknown>;
    if (Object.keys(decision).some((key) => key !== "requestId" && key !== "decision")) inputInvalid();
    if (typeof decision.requestId !== "string" || decision.requestId.length > 80) inputInvalid();
    if (decision.decision !== "approve" && decision.decision !== "reject") inputInvalid();
    result.actionDecision = { requestId: decision.requestId, decision: decision.decision };
  }
  if (!result.actionDecision && !result.question?.trim()) inputInvalid();
  return result;
}

function invalid(): never {
  throw new AiGatewayError("AI_OUTPUT_INVALID", { retryable: true });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) invalid();
}

function text(value: unknown, max: number, required = true) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.length > max) invalid();
  return value;
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

function stringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) invalid();
  return value.map((item) => text(item, maxLength) as string);
}

export function validateVisitSummaryOutput(value: unknown): ValidatedVisitSummaryOutput {
  const result = object(value);
  exactKeys(result, VISIT_SUMMARY_FIELDS);
  return {
    chief_complaint: text(result.chief_complaint, 2_000) as string,
    symptoms: stringArray(result.symptoms, 20, 700),
    relevant_history: stringArray(result.relevant_history, 20, 700),
    examination_findings: stringArray(result.examination_findings, 20, 700),
    tests: stringArray(result.tests, 20, 700),
    clinical_assessment: text(result.clinical_assessment, 4_000) as string,
    treatments: stringArray(result.treatments, 20, 700),
    medications: stringArray(result.medications, 20, 700),
    follow_up: stringArray(result.follow_up, 20, 700),
    warnings: stringArray(result.warnings, 20, 700),
    unresolved_items: stringArray(result.unresolved_items, 20, 700),
    source_references: stringArray(result.source_references, 6, 40).map((item) =>
      enumeration(item, VISIT_SOURCE_TYPES)
    ),
  };
}

export function validateDigitalCareTranscript(value: unknown): ValidatedDigitalCareTranscript {
  const result = object(value);
  exactKeys(result, ["transcript", "language"]);
  const transcript = text(result.transcript, 300_000) as string;
  if (!transcript.trim()) invalid();
  return { transcript: transcript.trim(), language: text(result.language, 20) as string };
}

export function validateRagAnswer(value: unknown): ValidatedRagAnswer {
  const result = object(value);
  exactKeys(result, ["status", "answer", "usedSourceIds"]);
  const status = enumeration(result.status, ["answered", "insufficient", "conflict"] as const);
  const answer = text(result.answer, 2_400) as string;
  const usedSourceIds = stringArray(result.usedSourceIds, 6, 80);
  if (!answer.trim() || new Set(usedSourceIds).size !== usedSourceIds.length) invalid();
  if (/system\s*prompt|developer\s*message|api[_ -]?key|service[_ -]?role|supabase_service_role/i.test(answer)
    || /פרומפט\s*(מערכת|סודי)|הוראות\s*(מערכת|מפתח)|חשוף\s*(סוד|מפתח|פרומפט)/i.test(answer)) invalid();
  if (status === "answered" && usedSourceIds.length === 0) invalid();
  if (status === "insufficient" && usedSourceIds.length > 0) invalid();
  return { status, answer: answer.trim(), usedSourceIds };
}

function validateFinding(value: unknown) {
  const item = object(value);
  exactKeys(item, ["id", "title", "detail", "urgency", "source"]);
  text(item.id, 80);
  text(item.title, 200);
  text(item.detail, 800);
  enumeration(item.urgency, ["normal", "important", "urgent"] as const);
  text(item.source, 120, false);
  return item;
}

function validateSuggestedAction(value: unknown) {
  const item = object(value);
  exactKeys(item, ["id", "label", "kind", "route", "reason", "requiresConfirmation"]);
  text(item.id, 80);
  text(item.label, 120);
  enumeration(item.kind, ["navigate", "review", "draft"] as const);
  text(item.route, 180, false);
  text(item.reason, 300, false);
  if (item.requiresConfirmation !== true) invalid();
  return item;
}

const ACTION_FIELDS = [
  "type", "intentSummary", "missingFields", "patientName", "patientSpecies",
  "appointmentRef", "appointmentDate", "appointmentTime", "currentAppointmentDate",
  "currentAppointmentTime", "appointmentType", "appointmentMode", "urgency", "itemName",
  "inventoryOperation", "quantity", "conversationRef", "priority", "labOrderRef", "testName",
  "isUrgent", "blockDate", "blockStart", "blockEnd", "allDay", "reason",
] as const;

function validateActionProposal(value: unknown) {
  const item = object(value);
  exactKeys(item, ACTION_FIELDS);
  enumeration(item.type, ACTION_TYPES);
  text(item.intentSummary, 400);
  stringArray(item.missingFields, 8, 80);

  for (const key of ["patientName", "patientSpecies", "appointmentDate", "appointmentTime", "currentAppointmentDate", "currentAppointmentTime", "appointmentType", "itemName", "testName", "blockDate", "blockStart", "blockEnd", "reason"] as const) {
    text(item[key], 240, false);
  }
  for (const key of ["appointmentRef", "conversationRef", "labOrderRef"] as const) {
    if (item[key] !== undefined && !Number.isInteger(item[key])) invalid();
  }
  if (item.quantity !== undefined && (typeof item.quantity !== "number" || !Number.isFinite(item.quantity))) invalid();
  if (item.isUrgent !== undefined && typeof item.isUrgent !== "boolean") invalid();
  if (item.allDay !== undefined && typeof item.allDay !== "boolean") invalid();
  if (item.appointmentMode !== undefined) enumeration(item.appointmentMode, ["physical", "video"] as const);
  if (item.urgency !== undefined) enumeration(item.urgency, ["normal", "urgent"] as const);
  if (item.priority !== undefined) enumeration(item.priority, ["normal", "urgent"] as const);
  if (item.inventoryOperation !== undefined) enumeration(item.inventoryOperation, ["set", "add", "remove"] as const);
  return item;
}

export function validateVetBotOutput(value: unknown): ValidatedVetBotOutput {
  const result = object(value);
  exactKeys(result, ["answer", "summary", "urgency", "confidence", "findings", "suggestedActions", "actionProposal", "memorySummary"]);
  const findings = Array.isArray(result.findings) && result.findings.length <= 6
    ? result.findings.map(validateFinding)
    : invalid();
  const suggestedActions = Array.isArray(result.suggestedActions) && result.suggestedActions.length <= 4
    ? result.suggestedActions.map(validateSuggestedAction)
    : invalid();

  return {
    answer: text(result.answer, 4_000) as string,
    summary: text(result.summary, 800, false),
    urgency: enumeration(result.urgency, ["normal", "important", "urgent"] as const),
    confidence: enumeration(result.confidence, ["low", "medium", "high"] as const),
    findings,
    suggestedActions,
    actionProposal: validateActionProposal(result.actionProposal),
    memorySummary: text(result.memorySummary, 1_400) as string,
  };
}
