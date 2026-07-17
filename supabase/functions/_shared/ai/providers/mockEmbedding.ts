import type { EmbeddingProviderAdapter, EmbeddingProviderRequest, EmbeddingProviderResult } from "../types.ts";

// Deterministic test adapter. It is selected only by an explicit server-side
// environment value and is never exposed as a browser option.
export class MockEmbeddingAdapter implements EmbeddingProviderAdapter {
  readonly id = "mock";

  async embed(request: EmbeddingProviderRequest): Promise<EmbeddingProviderResult> {
    const values = Array.from({ length: request.dimensions }, () => 0);
    const tokens = request.text.normalize("NFKC").toLocaleLowerCase("he")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
    const addFeature = (feature: string, weight: number) => {
      let hash = 2166136261;
      for (const character of feature) {
        hash ^= character.codePointAt(0) || 0;
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      const index = hash % request.dimensions;
      const sign = (hash & 0x80000000) === 0 ? 1 : -1;
      values[index] += sign * weight;
    };
    for (const token of tokens) {
      const variants = new Set([token]);
      let stem = token;
      for (let depth = 0; depth < 2 && stem.length > 2 && /^[והבכלמש]/u.test(stem); depth += 1) {
        stem = stem.slice(1);
        if (stem.length >= 2) variants.add(stem);
      }
      for (const variant of variants) addFeature(`token:${variant}`, variant === token ? 2 : 1.4);
      const padded = `^${token}$`;
      for (let index = 0; index <= padded.length - 3; index += 1) {
        addFeature(`tri:${padded.slice(index, index + 3)}`, 0.35);
      }
    }
    if (tokens.length === 0) addFeature("empty", 1);
    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    return {
      embedding: values.map((value) => value / magnitude),
      provider: this.id,
      model: request.model,
      usage: {},
    };
  }
}
