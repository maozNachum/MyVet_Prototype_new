import { protectPayload } from "../privacy.ts";
import { getAiModelConfiguration } from "./config.ts";
import { AiGatewayError, asAiGatewayError } from "./errors.ts";
import { isAiCapabilityEnabled } from "./featureFlags.ts";
import { buildDigitalCareSummaryUserPayload, buildVetBotUserPayload, buildVisitSummaryUserPayload, PROMPT_REGISTRY } from "./prompts.ts";
import { GeminiProviderAdapter } from "./providers/gemini.ts";
import { GeminiTranscriptionAdapter } from "./providers/geminiTranscription.ts";
import { InMemoryRateLimiter } from "./rateLimit.ts";
import { DIGITALCARE_TRANSCRIPT_RESPONSE_SCHEMA, DIGITALCARE_TRANSCRIPT_SCHEMA_VERSION, validateDigitalCareTranscript, validateVetBotOutput, validateVisitSummaryOutput, VETBOT_OUTPUT_SCHEMA_VERSION, VETBOT_RESPONSE_SCHEMA, VISIT_SUMMARY_OUTPUT_SCHEMA_VERSION, VISIT_SUMMARY_RESPONSE_SCHEMA, type ValidatedDigitalCareTranscript, type ValidatedVetBotOutput, type ValidatedVisitSummaryOutput } from "./schemas.ts";
import type { AiProviderAdapter, DigitalCareSummaryGatewayInput, DigitalCareTranscriptionGatewayInput, EnvReader, GatewayTelemetry, TranscriptionProviderAdapter, VisitSummaryGatewayInput, VetBotGatewayInput, VetBotGatewayResult } from "./types.ts";

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
