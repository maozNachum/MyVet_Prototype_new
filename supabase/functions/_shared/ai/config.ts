import type { EnvReader } from "./types.ts";

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export interface AiModelConfiguration {
  provider: "gemini";
  models: string[];
  requestTimeoutMs: number;
  totalTimeoutMs: number;
  maxSafeRetries: number;
  requestsPerMinute: number;
}

export function getAiModelConfiguration(env: EnvReader): AiModelConfiguration {
  const configuredModel = (env("GEMINI_MODEL") || "gemini-3.5-flash").trim();
  const fallbackModels = (env("AI_GEMINI_FALLBACK_MODELS") || "gemini-3.5-flash,gemini-2.5-flash")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return {
    provider: "gemini",
    models: [...new Set([configuredModel, ...fallbackModels])].slice(0, 4),
    requestTimeoutMs: boundedInteger(env("AI_REQUEST_TIMEOUT_MS"), 8_000, 1_000, 20_000),
    totalTimeoutMs: boundedInteger(env("AI_TOTAL_TIMEOUT_MS"), 24_000, 2_000, 45_000),
    maxSafeRetries: boundedInteger(env("AI_MAX_SAFE_RETRIES"), 1, 0, 2),
    requestsPerMinute: boundedInteger(env("AI_RATE_LIMIT_PER_MINUTE"), 20, 1, 120),
  };
}
