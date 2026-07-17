import { AiGatewayError } from "../errors.ts";
import type { EnvReader, ProviderResult, ProviderUsage, TranscriptionProviderAdapter, TranscriptionProviderRequest } from "../types.ts";

type FetchLike = typeof fetch;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

function usageFrom(value: unknown): ProviderUsage {
  const usage = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (input: unknown) => typeof input === "number" && Number.isFinite(input) ? Math.max(0, Math.round(input)) : undefined;
  return { inputTokens: number(usage.promptTokenCount), outputTokens: number(usage.candidatesTokenCount), totalTokens: number(usage.totalTokenCount) };
}

async function requestWithTimeout(fetchFn: FetchLike, url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new AiGatewayError("AI_PROVIDER_TIMEOUT", { httpStatus: 504, retryable: true });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export class GeminiTranscriptionAdapter implements TranscriptionProviderAdapter {
  readonly id = "gemini";
  private readonly env: EnvReader;
  private readonly fetchFn: FetchLike;

  constructor(env: EnvReader, fetchFn: FetchLike = fetch) {
    this.env = env;
    this.fetchFn = fetchFn;
  }

  async transcribeStructured<TOutput>(request: TranscriptionProviderRequest<TOutput>): Promise<ProviderResult<TOutput>> {
    const apiKey = this.env("GEMINI_API_KEY");
    if (!apiKey) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
    const encodedAudio = toBase64(request.audio);
    const startedAt = Date.now();
    let attempts = 0;
    let lastError: unknown;
    for (const model of request.models) {
      for (let retry = 0; retry <= request.maxSafeRetries; retry += 1) {
        const remaining = request.totalTimeoutMs - (Date.now() - startedAt);
        if (remaining <= 0) throw new AiGatewayError("AI_PROVIDER_TIMEOUT", { httpStatus: 504, retryable: true });
        attempts += 1;
        try {
          const response = await requestWithTimeout(this.fetchFn,
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: request.systemPrompt }] },
                contents: [{ role: "user", parts: [
                  { text: "Transcribe this consented consultation audio." },
                  { inlineData: { mimeType: request.mimeType, data: encodedAudio } },
                ] }],
                generationConfig: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json", responseSchema: request.responseSchema },
              }),
            }, Math.min(request.timeoutMs, remaining));
          if (!response.ok) {
            if ([429, 500, 502, 503, 504].includes(response.status)) throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: true });
            throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE");
          }
          const data = await response.json() as Record<string, unknown>;
          const candidate = Array.isArray(data.candidates) ? data.candidates[0] as Record<string, unknown> | undefined : undefined;
          const content = candidate?.content && typeof candidate.content === "object" ? candidate.content as Record<string, unknown> : {};
          const parts = Array.isArray(content.parts) ? content.parts : [];
          const text = parts.map((part) => part && typeof part === "object" ? String((part as Record<string, unknown>).text || "") : "").join("").trim();
          if (!text) throw new AiGatewayError("AI_OUTPUT_INVALID", { retryable: true });
          return { output: request.validateOutput(JSON.parse(text)), provider: this.id, model, attempts, usage: usageFrom(data.usageMetadata) };
        } catch (error) {
          lastError = error;
          const retryable = error instanceof AiGatewayError && error.retryable;
          if (retryable && retry < request.maxSafeRetries) continue;
          break;
        }
      }
    }
    if (lastError instanceof AiGatewayError) throw lastError;
    throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: true });
  }
}
