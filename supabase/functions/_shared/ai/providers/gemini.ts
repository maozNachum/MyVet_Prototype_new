import { AiGatewayError } from "../errors.ts";
import type { AiProviderAdapter, EnvReader, ProviderRequest, ProviderResult, ProviderUsage } from "../types.ts";

type FetchLike = typeof fetch;

class ProviderHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("AI provider request failed");
    this.status = status;
  }
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
}

function usageFrom(value: unknown): ProviderUsage {
  const usage = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    inputTokens: numeric(usage.promptTokenCount),
    outputTokens: numeric(usage.candidatesTokenCount),
    totalTokens: numeric(usage.totalTokenCount),
  };
}

async function fetchWithTimeout(fetchFn: FetchLike, url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  return await new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new AiGatewayError("AI_PROVIDER_TIMEOUT", { httpStatus: 504, retryable: true }));
    }, timeoutMs);
    fetchFn(url, { ...init, signal: controller.signal })
      .then(resolve, (error) => {
        if (controller.signal.aborted) {
          reject(new AiGatewayError("AI_PROVIDER_TIMEOUT", { httpStatus: 504, retryable: true }));
        } else {
          reject(error);
        }
      })
      .finally(() => clearTimeout(timer));
  });
}

export class GeminiProviderAdapter implements AiProviderAdapter {
  readonly id = "gemini";
  private readonly env: EnvReader;
  private readonly fetchFn: FetchLike;

  constructor(
    env: EnvReader,
    fetchFn: FetchLike = fetch,
  ) {
    this.env = env;
    this.fetchFn = fetchFn;
  }

  async generateStructured<TOutput>(request: ProviderRequest<TOutput>): Promise<ProviderResult<TOutput>> {
    const apiKey = this.env("GEMINI_API_KEY");
    if (!apiKey) {
      throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
    }

    const startedAt = Date.now();
    const transientStatuses = new Set([429, 500, 502, 503, 504]);
    // A configured model can be unavailable (404) or reject a capability/schema
    // that another configured model supports (400). Move to the next server-owned
    // model without retrying the same incompatible model.
    const modelFallbackStatuses = new Set([400, 404, ...transientStatuses]);
    let attempts = 0;
    let lastTransient: unknown;

    for (let modelIndex = 0; modelIndex < request.models.length; modelIndex += 1) {
      const model = request.models[modelIndex];
      const hasFallback = modelIndex < request.models.length - 1;
      for (let retry = 0; retry <= request.maxSafeRetries; retry += 1) {
        const elapsed = Date.now() - startedAt;
        const remaining = request.totalTimeoutMs - elapsed;
        if (remaining <= 0) {
          throw new AiGatewayError("AI_PROVIDER_TIMEOUT", { httpStatus: 504, retryable: true });
        }
        attempts += 1;
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
          const response = await fetchWithTimeout(this.fetchFn, endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: retry === 0 ? request.systemPrompt : `${request.systemPrompt} ${request.retryPrompt}` }],
              },
              contents: [{ role: "user", parts: [{ text: request.userPayload }] }],
              generationConfig: {
                temperature: retry === 0 ? 0.2 : 0,
                maxOutputTokens: retry === 0 ? 4096 : 6144,
                responseMimeType: "application/json",
                responseSchema: request.responseSchema,
              },
            }),
          }, Math.min(request.timeoutMs, remaining));

          if (!response.ok) throw new ProviderHttpError(response.status);
          const data = await response.json() as Record<string, unknown>;
          const candidate = Array.isArray(data.candidates) ? data.candidates[0] as Record<string, unknown> | undefined : undefined;
          const content = candidate?.content && typeof candidate.content === "object"
            ? candidate.content as Record<string, unknown>
            : {};
          const parts = Array.isArray(content.parts) ? content.parts : [];
          const responseText = parts
            .map((part) => part && typeof part === "object" ? String((part as Record<string, unknown>).text || "") : "")
            .join("")
            .trim();
          if (!responseText) throw new AiGatewayError("AI_OUTPUT_INVALID", { retryable: true });
          let parsed: unknown;
          try {
            parsed = JSON.parse(responseText);
          } catch {
            throw new AiGatewayError("AI_OUTPUT_INVALID", { retryable: true });
          }
          const output = request.validateOutput(parsed);
          return {
            output,
            provider: this.id,
            model,
            attempts,
            finishReason: typeof candidate?.finishReason === "string" ? candidate.finishReason : undefined,
            usage: usageFrom(data.usageMetadata),
          };
        } catch (error) {
          if (error instanceof AiGatewayError && error.code === "AI_OUTPUT_INVALID") {
            if (retry < request.maxSafeRetries) continue;
            throw error;
          }
          if (error instanceof ProviderHttpError && modelFallbackStatuses.has(error.status) && hasFallback) {
            lastTransient = error;
            break;
          }
          if (error instanceof AiGatewayError && error.code === "AI_PROVIDER_TIMEOUT" && hasFallback) {
            lastTransient = error;
            break;
          }
          if (error instanceof ProviderHttpError) {
            throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: transientStatuses.has(error.status) });
          }
          if (error instanceof AiGatewayError) throw error;
          throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: true });
        }
      }
    }

    if (lastTransient instanceof AiGatewayError) throw lastTransient;
    throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: true });
  }
}
