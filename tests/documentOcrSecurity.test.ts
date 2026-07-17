import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AiGatewayError } from "../supabase/functions/_shared/ai/errors.ts";
import { isAiCapabilityEnabled } from "../supabase/functions/_shared/ai/featureFlags.ts";
import { runDocumentExtractionGateway } from "../supabase/functions/_shared/ai/gateway.ts";
import { validateDocumentExtraction } from "../supabase/functions/_shared/ai/schemas.ts";
import { InMemoryRateLimiter } from "../supabase/functions/_shared/ai/rateLimit.ts";
import type { DocumentExtractionProviderAdapter, EnvReader } from "../supabase/functions/_shared/ai/types.ts";

const envFrom = (values: Record<string, string | undefined>): EnvReader => (name) => values[name];
const field = (value = "", confidence: "not_found" | "low" | "medium" | "high" = value ? "high" : "not_found") => ({ value, confidence });
const validExtraction = {
  document_kind: "vaccination_sticker",
  vaccination: {
    vaccine_name: field("Rabies"), vaccine_type: field(), manufacturer: field("Example Pharma"),
    batch_number: field("LOT-123"), barcode_value: field(), given_date: field("2026-07-17"),
    next_due_date: field(), expiry_date: field("2027-12-31"), administered_by: field(), notes: field(),
  },
  document: { title: field(), document_date: field(), summary: field(), test_name: field(), test_result: field() },
  warnings: [],
};

function mockAdapter(output: unknown = validExtraction): DocumentExtractionProviderAdapter {
  return {
    id: "mock-document-extraction",
    async extractStructured(request) {
      return { output: request.validateOutput(output), provider: "mock-document-extraction", model: "mock-ocr-v1", attempts: 1, usage: {} };
    },
  };
}

const enabledEnv = envFrom({ AI_DOCUMENT_OCR_ENABLED: "true", AI_VACCINATION_OCR_ENABLED: "true" });

for (const mimeType of ["image/jpeg", "image/png", "application/pdf"]) {
  test(`document gateway accepts bounded ${mimeType} through a provider adapter`, async () => {
    const result = await runDocumentExtractionGateway({
      actorId: "verified-user", documentKind: "vaccination_sticker", mimeType,
      bytes: new Uint8Array(64).fill(1),
    }, { env: enabledEnv, documentAdapter: mockAdapter(), rateLimiter: new InMemoryRateLimiter() });
    assert.equal(result.output.vaccination.vaccine_name.value, "Rabies");
    assert.equal(result.telemetry.capability, "vaccination.ocr");
    assert.equal("bytes" in result.telemetry, false);
  });
}

test("OCR flags default off and kill switches are independent from existing AI", () => {
  assert.equal(isAiCapabilityEnabled("document.ocr", envFrom({})), false);
  assert.equal(isAiCapabilityEnabled("vaccination.ocr", envFrom({})), false);
  assert.equal(isAiCapabilityEnabled("vaccination.ocr", envFrom({ AI_DOCUMENT_OCR_ENABLED: "true", AI_VACCINATION_OCR_ENABLED: "true", AI_VACCINATION_OCR_KILL_SWITCH: "true" })), false);
  assert.equal(isAiCapabilityEnabled("vetbot.general", envFrom({ AI_DOCUMENT_OCR_ENABLED: "false" })), true);
});

test("disabled OCR never calls the provider", async () => {
  let called = false;
  const adapter: DocumentExtractionProviderAdapter = { id: "must-not-run", async extractStructured() { called = true; throw new Error("unexpected"); } };
  await assert.rejects(
    runDocumentExtractionGateway({ actorId: "u", documentKind: "vaccination_sticker", mimeType: "image/jpeg", bytes: new Uint8Array(64) }, { env: envFrom({}), documentAdapter: adapter }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_FEATURE_DISABLED",
  );
  assert.equal(called, false);
});

test("strict output validation rejects unknown keys, malformed dates and invented values", () => {
  assert.throws(() => validateDocumentExtraction({ ...validExtraction, medical_advice: "invented" }), AiGatewayError);
  assert.throws(() => validateDocumentExtraction({ ...validExtraction, vaccination: { ...validExtraction.vaccination, given_date: field("17/07/2026") } }), AiGatewayError);
  const normalized = validateDocumentExtraction({ ...validExtraction, vaccination: { ...validExtraction.vaccination, manufacturer: field("invented", "not_found") } });
  assert.equal(normalized.vaccination.manufacturer.value, "");
});

test("provider failure is controlled and does not produce a partial record", async () => {
  const adapter: DocumentExtractionProviderAdapter = { id: "failing", async extractStructured() { throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: true }); } };
  await assert.rejects(
    runDocumentExtractionGateway({ actorId: "u", documentKind: "vaccination_sticker", mimeType: "image/png", bytes: new Uint8Array(64) }, { env: enabledEnv, documentAdapter: adapter }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_PROVIDER_UNAVAILABLE",
  );
});

test("gateway rejects unsupported and oversized files before a provider call", async () => {
  let called = false;
  const adapter: DocumentExtractionProviderAdapter = { id: "must-not-run", async extractStructured() { called = true; throw new Error("unexpected"); } };
  await assert.rejects(
    runDocumentExtractionGateway({ actorId: "u", documentKind: "vaccination_sticker", mimeType: "image/gif" as "image/jpeg", bytes: new Uint8Array(64) }, { env: enabledEnv, documentAdapter: adapter }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_INPUT_INVALID",
  );
  await assert.rejects(
    runDocumentExtractionGateway({ actorId: "u", documentKind: "vaccination_sticker", mimeType: "image/jpeg", bytes: new Uint8Array(8_388_609) }, { env: enabledEnv, documentAdapter: adapter }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_INPUT_INVALID",
  );
  assert.equal(called, false);
});

test("Edge function enforces server identity, MIME signatures, private storage and duplicate confirmation", () => {
  const source = readFileSync("supabase/functions/document-ocr/index.ts", "utf8");
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /\.eq\("auth_user_id", authData\.user\.id\)/);
  assert.match(source, /\.eq\("pet_id", petId\)\.eq\("clinic_id", clinicId\)/);
  assert.match(source, /0xff, 0xd8, 0xff/);
  assert.match(source, /0x89, 0x50, 0x4e, 0x47/);
  assert.match(source, /0x25, 0x50, 0x44, 0x46/);
  assert.match(source, /MAX_FILE_BYTES/);
  assert.match(source, /schema\("storage"\).*from\("buckets"\)/s);
  assert.match(source, /POSSIBLE_DUPLICATE/);
  assert.match(source, /duplicateConfirmed/);
  assert.doesNotMatch(source, /createPublicUrl/);
  assert.doesNotMatch(source, /form\.get\("provider"\)|form\.get\("model"\)|form\.get\("prompt"\)/);
});

test("vaccination UI keeps manual entry and requires explicit extraction and save", () => {
  const source = readFileSync("src/app/components/VaccinationBook.tsx", "utf8");
  const service = readFileSync("src/services/documentOcr.ts", "utf8");
  assert.match(source, /extractStickerDetails/);
  assert.match(source, /חלץ פרטים/);
  assert.match(source, /שום חיסון לא נשמר לפני אישור/);
  assert.match(source, /saveVaccination\(false\)/);
  assert.match(source, /שמור בכל זאת/);
  assert.match(service, /להמשיך בהזנה ידנית/);
  assert.match(source, /startScanner/);
});
