import { AiGatewayError } from "../errors.ts";
import type { EmbeddingProviderAdapter, EmbeddingProviderRequest, EmbeddingProviderResult, EnvReader } from "../types.ts";

type FetchLike = typeof fetch;

function normalized(values: unknown, dimensions: number) {
  if (!Array.isArray(values) || values.length !== dimensions
    || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new AiGatewayError("AI_OUTPUT_INVALID", { retryable: false });
  }
  const vector = values as number[];
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new AiGatewayError("AI_OUTPUT_INVALID", { retryable: false });
  }
  return vector.map((value) => value / magnitude);
}

export class GeminiEmbeddingAdapter implements EmbeddingProviderAdapter {
  readonly id = "gemini";
  private readonly env: EnvReader;
  private readonly fetchFn: FetchLike;

  constructor(env: EnvReader, fetchFn: FetchLike = fetch) {
    this.env = env;
    this.fetchFn = fetchFn;
  }

  async embed(request: EmbeddingProviderRequest): Promise<EmbeddingProviderResult> {
    const apiKey = this.env("GEMINI_API_KEY");
    if (!apiKey) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await this.fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:embedContent`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            content: { parts: [{ text: request.text }] },
            taskType: request.task === "retrieval_query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
            outputDimensionality: request.dimensions,
          }),
        },
      );
      if (!response.ok) {
        throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", {
          httpStatus: 503,
          retryable: [429, 500, 502, 503, 504].includes(response.status),
        });
      }
      const data = await response.json() as Record<string, unknown>;
      const embedding = data.embedding && typeof data.embedding === "object"
        ? (data.embedding as Record<string, unknown>).values
        : undefined;
      return {
        embedding: normalized(embedding, request.dimensions),
        provider: this.id,
        model: request.model,
        usage: {},
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AiGatewayError("AI_PROVIDER_TIMEOUT", { httpStatus: 504, retryable: true });
      }
      if (error instanceof AiGatewayError) throw error;
      throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { httpStatus: 503, retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}
