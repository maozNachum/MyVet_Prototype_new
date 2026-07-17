export type AiCapability =
  | "vetbot.general"
  | "vetbot.actions"
  | "vetbot.appointment-actions"
  | "visit-summary.generate"
  | "digitalcare.transcribe"
  | "digitalcare.recording"
  | "digitalcare.summary"
  | "rag.index"
  | "rag.answer";

export type VetBotMode =
  | "dashboard"
  | "schedule"
  | "digital-care"
  | "inventory"
  | "medical-record"
  | "clients"
  | "reports"
  | "portal";

export type VetBotRole = "clinic_admin" | "vet" | "nurse" | "secretary" | "owner";

export type EnvReader = (name: string) => string | undefined;

export interface VetBotGatewayInput {
  actorId: string;
  mode: VetBotMode;
  role: VetBotRole;
  question: string;
  context: unknown;
  history: unknown[];
  memorySummary?: string;
  tools: unknown;
  actions: unknown[];
  actionCatalog: unknown;
  currentTimeInIsrael: string;
}

export interface VisitSummaryGatewayInput {
  actorId: string;
  visitContext: unknown;
}

export interface DigitalCareTranscriptionGatewayInput {
  actorId: string;
  audio: Uint8Array;
  mimeType: string;
  languageHint?: string;
}

export interface DigitalCareSummaryGatewayInput {
  actorId: string;
  transcript: string;
}

export interface RagAnswerGatewayInput {
  actorId: string;
  question: string;
  sources: Array<{
    chunkId: string;
    sourceType: string;
    sourceDate?: string | null;
    sourceTitle: string;
    content: string;
  }>;
}

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ProviderRequest<TOutput> {
  systemPrompt: string;
  retryPrompt: string;
  userPayload: string;
  responseSchema: Record<string, unknown>;
  models: string[];
  timeoutMs: number;
  totalTimeoutMs: number;
  maxSafeRetries: number;
  validateOutput: (value: unknown) => TOutput;
}

export interface ProviderResult<TOutput> {
  output: TOutput;
  provider: string;
  model: string;
  attempts: number;
  finishReason?: string;
  usage: ProviderUsage;
}

export interface AiProviderAdapter {
  readonly id: string;
  generateStructured<TOutput>(request: ProviderRequest<TOutput>): Promise<ProviderResult<TOutput>>;
}

export interface TranscriptionProviderRequest<TOutput> {
  systemPrompt: string;
  audio: Uint8Array;
  mimeType: string;
  responseSchema: Record<string, unknown>;
  models: string[];
  timeoutMs: number;
  totalTimeoutMs: number;
  maxSafeRetries: number;
  validateOutput: (value: unknown) => TOutput;
}

export interface TranscriptionProviderAdapter {
  readonly id: string;
  transcribeStructured<TOutput>(request: TranscriptionProviderRequest<TOutput>): Promise<ProviderResult<TOutput>>;
}

export interface EmbeddingProviderRequest {
  text: string;
  task: "retrieval_document" | "retrieval_query";
  model: string;
  dimensions: 768;
  timeoutMs: number;
}

export interface EmbeddingProviderResult {
  embedding: number[];
  provider: string;
  model: string;
  usage: ProviderUsage;
}

export interface EmbeddingProviderAdapter {
  readonly id: string;
  embed(request: EmbeddingProviderRequest): Promise<EmbeddingProviderResult>;
}

export type GatewayOutcome = "success" | "failed" | "disabled" | "rate_limited";

export interface GatewayTelemetry {
  requestId: string;
  capability: AiCapability;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  outcome: GatewayOutcome;
  latencyMs: number;
  attempts: number;
  usage: ProviderUsage;
  errorCode?: string;
}

export interface VetBotGatewayResult<TOutput> {
  output: TOutput;
  telemetry: GatewayTelemetry;
  redaction: { total: number; categories: string[] };
}
