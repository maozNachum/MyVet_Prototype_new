import { AiGatewayError } from "../errors.ts";
import type { DocumentExtractionProviderAdapter, DocumentExtractionProviderRequest, EnvReader, ProviderResult, ProviderUsage } from "../types.ts";

type FetchLike = typeof fetch;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function usageFrom(value: unknown): ProviderUsage {
  const usage = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const numeric = (input: unknown) => typeof input === "number" && Number.isFinite(input) ? Math.max(0, Math.round(input)) : undefined;
  return { inputTokens: numeric(usage.promptTokenCount), outputTokens: numeric(usage.candidatesTokenCount), totalTokens: numeric(usage.totalTokenCount) };
}

async function withTimeout(fetchFn: FetchLike, url: string, init: RequestInit, timeoutMs: number) {
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

export class GeminiDocumentExtractionAdapter implements DocumentExtractionProviderAdapter {
  readonly id = "gemini";
  private readonly env: EnvReader;
  private readonly fetchFn: FetchLike;

  constructor(env: EnvReader, fetchFn: FetchLike = fetch) {
    this.env = env;
    this.fetchFn = fetchFn;
  }

  async extractStructured<TOutput>(request: DocumentExtractionProviderRequest<TOutput>): Promise<ProviderResult<TOutput>> {
    const apiKey = this.env("GEMINI_API_KEY");
    if (!apiKey) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
    const encoded = toBase64(request.bytes);
    const startedAt = Date.now();
    let attempts = 0;
    let lastError: unknown;
    for (const model of request.models) {
      for (let retry = 0; retry <= request.maxSafeRetries; retry += 1) {
        const remaining = request.totalTimeoutMs - (Date.now() - startedAt);
        if (remaining <= 0) throw new AiGatewayError("AI_PROVIDER_TIMEOUT", { httpStatus: 504, retryable: true });
        attempts += 1;
        try {
          const response = await withTimeout(this.fetchFn,
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: retry === 0 ? request.systemPrompt : `${request.systemPrompt} Return corrected schema-valid JSON.` }] },
                contents: [{ role: "user", parts: [
                  { text: `DOCUMENT_KIND=${request.documentKind}. Extract visible data only.` },
                  { inlineData: { mimeType: request.mimeType, data: encoded } },
                ] }],
                generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: request.responseSchema },
              }),
            }, Math.min(request.timeoutMs, remaining));
          if (!response.ok) throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: [429, 500, 502, 503, 504].includes(response.status) });
          const data = await response.json() as Record<string, unknown>;
          const candidate = Array.isArray(data.candidates) ? data.candidates[0] as Record<string, unknown> | undefined : undefined;
          const content = candidate?.content && typeof candidate.content === "object" ? candidate.content as Record<string, unknown> : {};
          const parts = Array.isArray(content.parts) ? content.parts : [];
          const responseText = parts.map((part) => part && typeof part === "object" ? String((part as Record<string, unknown>).text || "") : "").join("").trim();
          if (!responseText) throw new AiGatewayError("AI_OUTPUT_INVALID", { retryable: true });
          let parsed: unknown;
          try {
            parsed = JSON.parse(responseText);
          } catch {
            throw new AiGatewayError("AI_OUTPUT_INVALID", { retryable: true });
          }
          return { output: request.validateOutput(parsed), provider: this.id, model, attempts, usage: usageFrom(data.usageMetadata) };
        } catch (error) {
          lastError = error;
          if (error instanceof AiGatewayError && error.retryable && retry < request.maxSafeRetries) continue;
          break;
        }
      }
    }
    if (lastError instanceof AiGatewayError) throw lastError;
    throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: true });
  }
}
