import { protectPayload } from "../privacy.ts";
import { getAiModelConfiguration, getEmbeddingConfiguration } from "./config.ts";
import { AiGatewayError, asAiGatewayError } from "./errors.ts";
import { isAiCapabilityEnabled } from "./featureFlags.ts";
import { buildDigitalCareSummaryUserPayload, buildRagAnswerUserPayload, buildVetBotUserPayload, buildVisitSummaryUserPayload, PROMPT_REGISTRY } from "./prompts.ts";
import { GeminiDocumentExtractionAdapter } from "./providers/geminiDocumentExtraction.ts";
import { GeminiProviderAdapter } from "./providers/gemini.ts";
import { GeminiEmbeddingAdapter } from "./providers/geminiEmbedding.ts";
import { MockEmbeddingAdapter } from "./providers/mockEmbedding.ts";
import { GeminiTranscriptionAdapter } from "./providers/geminiTranscription.ts";
import { InMemoryRateLimiter } from "./rateLimit.ts";
import { DIGITALCARE_TRANSCRIPT_RESPONSE_SCHEMA, DIGITALCARE_TRANSCRIPT_SCHEMA_VERSION, DOCUMENT_EXTRACTION_RESPONSE_SCHEMA, DOCUMENT_EXTRACTION_SCHEMA_VERSION, RAG_ANSWER_RESPONSE_SCHEMA, RAG_ANSWER_SCHEMA_VERSION, validateDigitalCareTranscript, validateDocumentExtraction, validateRagAnswer, validateVetBotOutput, validateVisitSummaryOutput, VETBOT_OUTPUT_SCHEMA_VERSION, VETBOT_RESPONSE_SCHEMA, VISIT_SUMMARY_OUTPUT_SCHEMA_VERSION, VISIT_SUMMARY_RESPONSE_SCHEMA, type ValidatedDigitalCareTranscript, type ValidatedDocumentExtraction, type ValidatedRagAnswer, type ValidatedVetBotOutput, type ValidatedVisitSummaryOutput } from "./schemas.ts";
import type { AiProviderAdapter, DigitalCareSummaryGatewayInput, DigitalCareTranscriptionGatewayInput, DocumentExtractionGatewayInput, DocumentExtractionProviderAdapter, EmbeddingProviderAdapter, EnvReader, GatewayTelemetry, RagAnswerGatewayInput, TranscriptionProviderAdapter, VisitSummaryGatewayInput, VetBotGatewayInput, VetBotGatewayResult } from "./types.ts";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

export const runtimeEnv: EnvReader = (name) => {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
};

const sharedRateLimiter = new InMemoryRateLimiter();

export interface VetBotGatewayOptions {
  env?: EnvReader;
  adapter?: AiProviderAdapter;
  rateLimiter?: InMemoryRateLimiter;
  now?: () => number;
}

export interface DigitalCareGatewayOptions extends VetBotGatewayOptions {
  transcriptionAdapter?: TranscriptionProviderAdapter;
}

export interface RagGatewayOptions extends VetBotGatewayOptions {
  embeddingAdapter?: EmbeddingProviderAdapter;
}

export interface DocumentExtractionGatewayOptions extends VetBotGatewayOptions {
  documentAdapter?: DocumentExtractionProviderAdapter;
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function auditLog(telemetry: GatewayTelemetry) {
  console.info("AI_GATEWAY_AUDIT", telemetry);
}

export function auditTags(telemetry: GatewayTelemetry) {
  const usage = telemetry.usage;
  return [
    `capability:${telemetry.capability}`,
    `prompt:${telemetry.promptVersion}`,
    `schema:${telemetry.schemaVersion}`,
    `request:${telemetry.requestId}`,
    `latency_ms:${telemetry.latencyMs}`,
    `attempts:${telemetry.attempts}`,
    usage.inputTokens === undefined ? null : `input_tokens:${usage.inputTokens}`,
    usage.outputTokens === undefined ? null : `output_tokens:${usage.outputTokens}`,
    usage.totalTokens === undefined ? null : `total_tokens:${usage.totalTokens}`,
  ].filter((tag): tag is string => Boolean(tag));
}

export function telemetryFromError(error: unknown) {
  return (error as { telemetry?: GatewayTelemetry } | null)?.telemetry;
}

export async function runVetBotGateway(
  input: VetBotGatewayInput,
  options: VetBotGatewayOptions = {},
): Promise<VetBotGatewayResult<ValidatedVetBotOutput>> {
  const env = options.env || runtimeEnv;
  const now = options.now || Date.now;
  const startedAt = now();
  const id = requestId();
  const prompt = PROMPT_REGISTRY["vetbot.general"];
  const config = getAiModelConfiguration(env);
  let provider: string = config.provider;
  let model = "none";
  let attempts = 0;
  let usage = {};

  try {
    if (!isAiCapabilityEnabled("vetbot.general", env)) {
      throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
    }
    if (!input.actorId || !input.question.trim()) {
      throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
    }

    (options.rateLimiter || sharedRateLimiter).check(
      `${input.actorId}:vetbot.general`,
      config.requestsPerMinute,
      now(),
    );

    const protectedInput = protectPayload({
      question: input.question,
      context: input.context,
      history: input.history,
      memorySummary: input.memorySummary,
      tools: input.tools,
    });
    const safe = protectedInput.value;
    const adapter = options.adapter || new GeminiProviderAdapter(env);
    provider = adapter.id;
    const result = await adapter.generateStructured({
      systemPrompt: prompt.system,
      retryPrompt: prompt.retrySuffix,
      userPayload: buildVetBotUserPayload({
        mode: input.mode,
        role: input.role,
        question: safe.question,
        context: safe.context,
        history: Array.isArray(safe.history) ? safe.history : [],
        memorySummary: typeof safe.memorySummary === "string" ? safe.memorySummary : undefined,
        tools: safe.tools,
        actions: input.actions,
        actionCatalog: input.actionCatalog,
        currentTimeInIsrael: input.currentTimeInIsrael,
      }),
      responseSchema: VETBOT_RESPONSE_SCHEMA,
      models: config.models,
      timeoutMs: config.requestTimeoutMs,
      totalTimeoutMs: config.totalTimeoutMs,
      maxSafeRetries: config.maxSafeRetries,
      validateOutput: validateVetBotOutput,
    });
    model = result.model;
    attempts = result.attempts;
    usage = result.usage;
    const telemetry: GatewayTelemetry = {
      requestId: id,
      capability: "vetbot.general",
      provider,
      model,
      promptVersion: prompt.version,
      schemaVersion: VETBOT_OUTPUT_SCHEMA_VERSION,
      outcome: "success",
      latencyMs: Math.max(0, now() - startedAt),
      attempts,
      usage,
    };
    auditLog(telemetry);
    return { output: result.output, telemetry, redaction: protectedInput.report };
  } catch (error) {
    const safeError = asAiGatewayError(error);
    const telemetry: GatewayTelemetry = {
      requestId: id,
      capability: "vetbot.general",
      provider,
      model,
      promptVersion: prompt.version,
      schemaVersion: VETBOT_OUTPUT_SCHEMA_VERSION,
      outcome: safeError.code === "AI_FEATURE_DISABLED"
        ? "disabled"
        : safeError.code === "AI_RATE_LIMITED"
          ? "rate_limited"
          : "failed",
      latencyMs: Math.max(0, now() - startedAt),
      attempts,
      usage,
      errorCode: safeError.code,
    };
    (safeError as AiGatewayError & { telemetry?: GatewayTelemetry }).telemetry = telemetry;
    auditLog(telemetry);
    throw safeError;
  }
}

export async function runVisitSummaryGateway(
  input: VisitSummaryGatewayInput,
  options: VetBotGatewayOptions = {},
): Promise<VetBotGatewayResult<ValidatedVisitSummaryOutput>> {
  const env = options.env || runtimeEnv;
  const now = options.now || Date.now;
  const startedAt = now();
  const id = requestId();
  const prompt = PROMPT_REGISTRY["visit-summary.generate"];
  const config = getAiModelConfiguration(env);
  let provider: string = config.provider;
  let model = "none";
  let attempts = 0;
  let usage = {};

  try {
    if (!isAiCapabilityEnabled("visit-summary.generate", env)) {
      throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
    }
    if (!input.actorId) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
    (options.rateLimiter || sharedRateLimiter).check(
      `${input.actorId}:visit-summary.generate`,
      Math.min(config.requestsPerMinute, 8),
      now(),
    );
    const protectedInput = protectPayload(input.visitContext);
    const adapter = options.adapter || new GeminiProviderAdapter(env);
    provider = adapter.id;
    const result = await adapter.generateStructured({
      systemPrompt: prompt.system,
      retryPrompt: prompt.retrySuffix,
      userPayload: buildVisitSummaryUserPayload(protectedInput.value),
      responseSchema: VISIT_SUMMARY_RESPONSE_SCHEMA,
      models: config.models,
      timeoutMs: config.requestTimeoutMs,
      totalTimeoutMs: config.totalTimeoutMs,
      maxSafeRetries: config.maxSafeRetries,
      validateOutput: validateVisitSummaryOutput,
    });
    model = result.model;
    attempts = result.attempts;
    usage = result.usage;
    const telemetry: GatewayTelemetry = {
      requestId: id,
      capability: "visit-summary.generate",
      provider,
      model,
      promptVersion: prompt.version,
      schemaVersion: VISIT_SUMMARY_OUTPUT_SCHEMA_VERSION,
      outcome: "success",
      latencyMs: Math.max(0, now() - startedAt),
      attempts,
      usage,
    };
    auditLog(telemetry);
    return { output: result.output, telemetry, redaction: protectedInput.report };
  } catch (error) {
    const safeError = asAiGatewayError(error);
    const telemetry: GatewayTelemetry = {
      requestId: id,
      capability: "visit-summary.generate",
      provider,
      model,
      promptVersion: prompt.version,
      schemaVersion: VISIT_SUMMARY_OUTPUT_SCHEMA_VERSION,
      outcome: safeError.code === "AI_FEATURE_DISABLED" ? "disabled" : safeError.code === "AI_RATE_LIMITED" ? "rate_limited" : "failed",
      latencyMs: Math.max(0, now() - startedAt),
      attempts,
      usage,
      errorCode: safeError.code,
    };
    (safeError as AiGatewayError & { telemetry?: GatewayTelemetry }).telemetry = telemetry;
    auditLog(telemetry);
    throw safeError;
  }
}

export async function runDigitalCareTranscriptionGateway(
  input: DigitalCareTranscriptionGatewayInput,
  options: DigitalCareGatewayOptions = {},
): Promise<VetBotGatewayResult<ValidatedDigitalCareTranscript>> {
  const env = options.env || runtimeEnv;
  const now = options.now || Date.now;
  const startedAt = now();
  const id = requestId();
  const prompt = PROMPT_REGISTRY["digitalcare.transcribe"];
  const config = getAiModelConfiguration(env);
  let provider: string = config.provider;
  let model = "none";
  let attempts = 0;
  let usage = {};
  try {
    if (!isAiCapabilityEnabled("digitalcare.transcribe", env)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
    if (!input.actorId || !input.audio.length || input.audio.length > 10_485_760
      || !["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"].includes(input.mimeType)) {
      throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
    }
    (options.rateLimiter || sharedRateLimiter).check(`${input.actorId}:digitalcare.transcribe`, Math.min(config.requestsPerMinute, 4), now());
    const adapter = options.transcriptionAdapter || new GeminiTranscriptionAdapter(env);
    provider = adapter.id;
    const result = await adapter.transcribeStructured({
      systemPrompt: prompt.system,
      audio: input.audio,
      mimeType: input.mimeType,
      responseSchema: DIGITALCARE_TRANSCRIPT_RESPONSE_SCHEMA,
      models: config.models,
      timeoutMs: Math.max(config.requestTimeoutMs, 18_000),
      totalTimeoutMs: Math.max(config.totalTimeoutMs, 40_000),
      maxSafeRetries: Math.min(config.maxSafeRetries, 1),
      validateOutput: validateDigitalCareTranscript,
    });
    model = result.model; attempts = result.attempts; usage = result.usage;
    const telemetry: GatewayTelemetry = {
      requestId: id, capability: "digitalcare.transcribe", provider, model,
      promptVersion: prompt.version, schemaVersion: DIGITALCARE_TRANSCRIPT_SCHEMA_VERSION,
      outcome: "success", latencyMs: Math.max(0, now() - startedAt), attempts, usage,
    };
    auditLog(telemetry);
    return { output: result.output, telemetry, redaction: { total: 0, categories: [] } };
  } catch (error) {
    const safeError = asAiGatewayError(error);
    const telemetry: GatewayTelemetry = {
      requestId: id, capability: "digitalcare.transcribe", provider, model,
      promptVersion: prompt.version, schemaVersion: DIGITALCARE_TRANSCRIPT_SCHEMA_VERSION,
      outcome: safeError.code === "AI_FEATURE_DISABLED" ? "disabled" : safeError.code === "AI_RATE_LIMITED" ? "rate_limited" : "failed",
      latencyMs: Math.max(0, now() - startedAt), attempts, usage, errorCode: safeError.code,
    };
    (safeError as AiGatewayError & { telemetry?: GatewayTelemetry }).telemetry = telemetry;
    auditLog(telemetry);
    throw safeError;
  }
}

export async function runDigitalCareSummaryGateway(
  input: DigitalCareSummaryGatewayInput,
  options: VetBotGatewayOptions = {},
): Promise<VetBotGatewayResult<ValidatedVisitSummaryOutput>> {
  const env = options.env || runtimeEnv;
  const now = options.now || Date.now;
  const startedAt = now();
  const id = requestId();
  const prompt = PROMPT_REGISTRY["digitalcare.summary"];
  const config = getAiModelConfiguration(env);
  let provider: string = config.provider;
  let model = "none";
  let attempts = 0;
  let usage = {};
  try {
    if (!isAiCapabilityEnabled("digitalcare.summary", env)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
    if (!input.actorId || !input.transcript.trim() || input.transcript.length > 300_000) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
    (options.rateLimiter || sharedRateLimiter).check(`${input.actorId}:digitalcare.summary`, Math.min(config.requestsPerMinute, 6), now());
    const protectedInput = protectPayload({ digitalcare_transcript: input.transcript });
    const safeTranscript = String((protectedInput.value as Record<string, unknown>).digitalcare_transcript || "");
    const adapter = options.adapter || new GeminiProviderAdapter(env);
    provider = adapter.id;
    const result = await adapter.generateStructured({
      systemPrompt: prompt.system,
      retryPrompt: prompt.retrySuffix,
      userPayload: buildDigitalCareSummaryUserPayload(safeTranscript),
      responseSchema: VISIT_SUMMARY_RESPONSE_SCHEMA,
      models: config.models,
      timeoutMs: config.requestTimeoutMs,
      totalTimeoutMs: config.totalTimeoutMs,
      maxSafeRetries: config.maxSafeRetries,
      validateOutput: validateVisitSummaryOutput,
    });
    model = result.model; attempts = result.attempts; usage = result.usage;
    const telemetry: GatewayTelemetry = {
      requestId: id, capability: "digitalcare.summary", provider, model,
      promptVersion: prompt.version, schemaVersion: VISIT_SUMMARY_OUTPUT_SCHEMA_VERSION,
      outcome: "success", latencyMs: Math.max(0, now() - startedAt), attempts, usage,
    };
    auditLog(telemetry);
    return { output: result.output, telemetry, redaction: protectedInput.report };
  } catch (error) {
    const safeError = asAiGatewayError(error);
    const telemetry: GatewayTelemetry = {
      requestId: id, capability: "digitalcare.summary", provider, model,
      promptVersion: prompt.version, schemaVersion: VISIT_SUMMARY_OUTPUT_SCHEMA_VERSION,
      outcome: safeError.code === "AI_FEATURE_DISABLED" ? "disabled" : safeError.code === "AI_RATE_LIMITED" ? "rate_limited" : "failed",
      latencyMs: Math.max(0, now() - startedAt), attempts, usage, errorCode: safeError.code,
    };
    (safeError as AiGatewayError & { telemetry?: GatewayTelemetry }).telemetry = telemetry;
    auditLog(telemetry);
    throw safeError;
  }
}

export async function runRagEmbeddingGateway(
  actorId: string,
  text: string,
  task: "retrieval_document" | "retrieval_query",
  options: RagGatewayOptions = {},
) {
  const env = options.env || runtimeEnv;
  const now = options.now || Date.now;
  const startedAt = now();
  const id = requestId();
  const capability = task === "retrieval_document" ? "rag.index" as const : "rag.answer" as const;
  const config = getEmbeddingConfiguration(env);
  let provider: string = config.provider;
  try {
    if (!isAiCapabilityEnabled(capability, env)) {
      throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
    }
    const compactText = text.trim();
    if (!actorId || !compactText || compactText.length > 12_000) {
      throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
    }
    (options.rateLimiter || sharedRateLimiter).check(
      `${actorId}:${capability}`,
      task === "retrieval_document" ? 60 : 12,
      now(),
    );
    const protectedInput = protectPayload({ text: compactText });
    const safeText = String((protectedInput.value as { text?: unknown }).text || "").trim();
    if (!safeText) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
    const adapter = options.embeddingAdapter || (config.provider === "mock"
      ? new MockEmbeddingAdapter()
      : new GeminiEmbeddingAdapter(env));
    provider = adapter.id;
    const result = await adapter.embed({
      text: safeText,
      task,
      model: config.model,
      dimensions: config.dimensions,
      timeoutMs: config.timeoutMs,
    });
    if (result.embedding.length !== config.dimensions) {
      throw new AiGatewayError("AI_OUTPUT_INVALID", { httpStatus: 502 });
    }
    const telemetry: GatewayTelemetry = {
      requestId: id,
      capability,
      provider,
      model: result.model,
      promptVersion: "embedding-task-v1",
      schemaVersion: config.version,
      outcome: "success",
      latencyMs: Math.max(0, now() - startedAt),
      attempts: 1,
      usage: result.usage,
    };
    auditLog(telemetry);
    return { embedding: result.embedding, telemetry, configuration: config };
  } catch (error) {
    const safeError = asAiGatewayError(error);
    const telemetry: GatewayTelemetry = {
      requestId: id,
      capability,
      provider,
      model: config.model,
      promptVersion: "embedding-task-v1",
      schemaVersion: config.version,
      outcome: safeError.code === "AI_FEATURE_DISABLED" ? "disabled"
        : safeError.code === "AI_RATE_LIMITED" ? "rate_limited" : "failed",
      latencyMs: Math.max(0, now() - startedAt),
      attempts: 1,
      usage: {},
      errorCode: safeError.code,
    };
    (safeError as AiGatewayError & { telemetry?: GatewayTelemetry }).telemetry = telemetry;
    auditLog(telemetry);
    throw safeError;
  }
}

export async function runRagAnswerGateway(
  input: RagAnswerGatewayInput,
  options: RagGatewayOptions = {},
): Promise<VetBotGatewayResult<ValidatedRagAnswer>> {
  const env = options.env || runtimeEnv;
  const now = options.now || Date.now;
  const startedAt = now();
  const id = requestId();
  const prompt = PROMPT_REGISTRY["rag.answer"];
  const config = getAiModelConfiguration(env);
  let provider: string = config.provider;
  let model = "none";
  let attempts = 0;
  let usage = {};
  try {
    if (!isAiCapabilityEnabled("rag.answer", env)) {
      throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
    }
    if (!input.actorId || !input.question.trim() || input.question.length > 1_200
      || input.sources.length < 1 || input.sources.length > 8) {
      throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
    }
    const sourceIds = new Set(input.sources.map((source) => source.chunkId));
    if (sourceIds.size !== input.sources.length
      || input.sources.some((source) => !/^S[1-8]$/.test(source.chunkId)
        || source.content.length > 3_000 || !source.content.trim())) {
      throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
    }
    (options.rateLimiter || sharedRateLimiter).check(`${input.actorId}:rag.answer`, 12, now());
    const protectedInput = protectPayload({ question: input.question, sources: input.sources });
    const safe = protectedInput.value as { question: string; sources: RagAnswerGatewayInput["sources"] };
    const adapter = options.adapter || new GeminiProviderAdapter(env);
    provider = adapter.id;
    const result = await adapter.generateStructured({
      systemPrompt: prompt.system,
      retryPrompt: prompt.retrySuffix,
      userPayload: buildRagAnswerUserPayload({
        actorId: input.actorId,
        question: safe.question,
        sources: safe.sources,
      }),
      responseSchema: RAG_ANSWER_RESPONSE_SCHEMA,
      models: config.models,
      timeoutMs: config.requestTimeoutMs,
      totalTimeoutMs: config.totalTimeoutMs,
      maxSafeRetries: config.maxSafeRetries,
      validateOutput: (value) => {
        const output = validateRagAnswer(value);
        if (output.usedSourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
          throw new AiGatewayError("AI_OUTPUT_INVALID", { retryable: true });
        }
        return output;
      },
    });
    model = result.model;
    attempts = result.attempts;
    usage = result.usage;
    const telemetry: GatewayTelemetry = {
      requestId: id,
      capability: "rag.answer",
      provider,
      model,
      promptVersion: prompt.version,
      schemaVersion: RAG_ANSWER_SCHEMA_VERSION,
      outcome: "success",
      latencyMs: Math.max(0, now() - startedAt),
      attempts,
      usage,
    };
    auditLog(telemetry);
    return { output: result.output, telemetry, redaction: protectedInput.report };
  } catch (error) {
    const safeError = asAiGatewayError(error);
    const telemetry: GatewayTelemetry = {
      requestId: id,
      capability: "rag.answer",
      provider,
      model,
      promptVersion: prompt.version,
      schemaVersion: RAG_ANSWER_SCHEMA_VERSION,
      outcome: safeError.code === "AI_FEATURE_DISABLED" ? "disabled"
        : safeError.code === "AI_RATE_LIMITED" ? "rate_limited" : "failed",
      latencyMs: Math.max(0, now() - startedAt),
      attempts,
      usage,
      errorCode: safeError.code,
    };
    (safeError as AiGatewayError & { telemetry?: GatewayTelemetry }).telemetry = telemetry;
    auditLog(telemetry);
    throw safeError;
  }
}

export async function runDocumentExtractionGateway(
  input: DocumentExtractionGatewayInput,
  options: DocumentExtractionGatewayOptions = {},
): Promise<VetBotGatewayResult<ValidatedDocumentExtraction>> {
  const env = options.env || runtimeEnv;
  const now = options.now || Date.now;
  const startedAt = now();
  const id = requestId();
  const prompt = PROMPT_REGISTRY["document.ocr"];
  const config = getAiModelConfiguration(env);
  const capability = input.documentKind === "vaccination_sticker" || input.documentKind === "vaccination_book"
    ? "vaccination.ocr" as const
    : "document.ocr" as const;
  let provider: string = config.provider;
  let model = "none";
  let attempts = 0;
  let usage = {};
  try {
    if (!isAiCapabilityEnabled(capability, env)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
    if (!input.actorId || input.bytes.length < 16 || input.bytes.length > 8_388_608
      || !["image/jpeg", "image/png", "application/pdf"].includes(input.mimeType)) {
      throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
    }
    (options.rateLimiter || sharedRateLimiter).check(`${input.actorId}:${capability}`, Math.min(config.requestsPerMinute, 6), now());
    const adapter = options.documentAdapter || new GeminiDocumentExtractionAdapter(env);
    provider = adapter.id;
    const result = await adapter.extractStructured({
      systemPrompt: prompt.system,
      documentKind: input.documentKind,
      bytes: input.bytes,
      mimeType: input.mimeType,
      responseSchema: DOCUMENT_EXTRACTION_RESPONSE_SCHEMA,
      models: config.models,
      timeoutMs: Math.max(config.requestTimeoutMs, 15_000),
      totalTimeoutMs: Math.max(config.totalTimeoutMs, 35_000),
      maxSafeRetries: Math.min(config.maxSafeRetries, 1),
      validateOutput: validateDocumentExtraction,
    });
    model = result.model;
    attempts = result.attempts;
    usage = result.usage;
    const telemetry: GatewayTelemetry = {
      requestId: id, capability, provider, model,
      promptVersion: prompt.version, schemaVersion: DOCUMENT_EXTRACTION_SCHEMA_VERSION,
      outcome: "success", latencyMs: Math.max(0, now() - startedAt), attempts, usage,
    };
    auditLog(telemetry);
    return { output: result.output, telemetry, redaction: { total: 0, categories: [] } };
  } catch (error) {
    const safeError = asAiGatewayError(error);
    const telemetry: GatewayTelemetry = {
      requestId: id, capability, provider, model,
      promptVersion: prompt.version, schemaVersion: DOCUMENT_EXTRACTION_SCHEMA_VERSION,
      outcome: safeError.code === "AI_FEATURE_DISABLED" ? "disabled" : safeError.code === "AI_RATE_LIMITED" ? "rate_limited" : "failed",
      latencyMs: Math.max(0, now() - startedAt), attempts, usage, errorCode: safeError.code,
    };
    (safeError as AiGatewayError & { telemetry?: GatewayTelemetry }).telemetry = telemetry;
    auditLog(telemetry);
    throw safeError;
  }
}
