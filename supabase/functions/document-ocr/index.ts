import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import { asAiGatewayError } from "../_shared/ai/errors.ts";
import { isAiCapabilityEnabled } from "../_shared/ai/featureFlags.ts";
import { runDocumentExtractionGateway, runtimeEnv, telemetryFromError } from "../_shared/ai/gateway.ts";
import type { DocumentExtractionKind } from "../_shared/ai/types.ts";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const DOCUMENT_KINDS = new Set<DocumentExtractionKind>([
  "vaccination_sticker", "vaccination_book", "medical_document", "visit_summary", "lab_result",
]);
const VACCINATION_FIELDS = [
  "vaccine_name", "vaccine_type", "manufacturer", "batch_number", "barcode_value",
  "given_date", "next_due_date", "expiry_date", "administered_by", "notes",
] as const;

type VaccinationDraft = Record<typeof VACCINATION_FIELDS[number], string>;

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin") || "";
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",").map((item) => item.trim()).filter(Boolean);
  if (!origin) return "";
  if (configured.includes(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return "";
}

function json(request: Request, body: unknown, status = 200) {
  const origin = allowedOrigin(request);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Origin",
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function startsWith(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value);
}

function verifiedMime(file: File, bytes: Uint8Array) {
  const declared = file.type.toLowerCase();
  if (!ALLOWED_MIME.has(declared)) return null;
  if (declared === "image/jpeg" && startsWith(bytes, [0xff, 0xd8, 0xff])) return declared;
  if (declared === "image/png" && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return declared;
  if (declared === "application/pdf" && startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return declared;
  return null;
}

function requiredText(form: FormData, name: string, maxLength: number) {
  const value = form.get(name);
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error("INVALID_REQUEST");
  return value.trim();
}

function optionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > maxLength) throw new Error("INVALID_DRAFT");
  return value.trim();
}

function validateDraft(value: unknown): VaccinationDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_DRAFT");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !VACCINATION_FIELDS.includes(key as typeof VACCINATION_FIELDS[number]))) throw new Error("INVALID_DRAFT");
  const result = Object.fromEntries(VACCINATION_FIELDS.map((field) => [field, optionalText(input[field], field === "notes" ? 2000 : 240)])) as VaccinationDraft;
  if (!result.vaccine_name) throw new Error("MISSING_VACCINE_NAME");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.given_date)) throw new Error("MISSING_GIVEN_DATE");
  for (const field of ["next_due_date", "expiry_date"] as const) {
    if (result[field] && !/^\d{4}-\d{2}-\d{2}$/.test(result[field])) throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return result;
}

function extension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "application/pdf") return "pdf";
  return "jpg";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(request, {}, 204);
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json(request, { error: "AUTH_REQUIRED" }, 401);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey) return json(request, { error: "SERVICE_UNAVAILABLE" }, 503);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json(request, { error: "AUTH_REQUIRED" }, 401);

    const form = await request.formData();
    const action = requiredText(form, "action", 20);
    if (action !== "extract" && action !== "save") return json(request, { error: "INVALID_REQUEST" }, 400);
    const petId = Number(requiredText(form, "petId", 30));
    if (!Number.isSafeInteger(petId) || petId <= 0) return json(request, { error: "INVALID_REQUEST" }, 400);
    const documentKind = requiredText(form, "documentKind", 40) as DocumentExtractionKind;
    if (!DOCUMENT_KINDS.has(documentKind)) return json(request, { error: "INVALID_REQUEST" }, 400);
    const capability = documentKind === "vaccination_sticker" || documentKind === "vaccination_book"
      ? "vaccination.ocr" as const
      : "document.ocr" as const;
    if (!isAiCapabilityEnabled(capability, runtimeEnv)) {
      return json(request, { error: "AI_FEATURE_DISABLED" }, 503);
    }

    const { data: staff } = await admin.from("staff").select("clinic_id,role,is_active")
      .eq("auth_user_id", authData.user.id).eq("is_active", true).maybeSingle();
    const { data: owner } = staff ? { data: null } : await admin.from("owners").select("clinic_id,owner_id")
      .eq("auth_user_id", authData.user.id).maybeSingle();
    const staffAllowed = Boolean(staff && ["clinic_admin", "vet", "nurse"].includes(staff.role));
    if (!staffAllowed && !owner) return json(request, { error: "ACCESS_DENIED" }, 403);
    const clinicId = String(staff?.clinic_id || owner?.clinic_id || "");
    const { data: pet } = await admin.from("patients").select("pet_id,owner_id,clinic_id")
      .eq("pet_id", petId).eq("clinic_id", clinicId).maybeSingle();
    if (!pet || (owner && String(pet.owner_id) !== String(owner.owner_id))) return json(request, { error: "ACCESS_DENIED" }, 403);
    if (action === "save" && !staffAllowed) return json(request, { error: "STAFF_APPROVAL_REQUIRED" }, 403);

    const { data: tenantFlag, error: tenantFlagError } = await admin.from("ai_feature_flags")
      .select("enabled,kill_switch")
      .eq("clinic_id", clinicId)
      .eq("capability", "document_ocr")
      .maybeSingle();
    if (tenantFlagError || !tenantFlag?.enabled || tenantFlag.kill_switch) {
      return json(request, { error: "AI_FEATURE_DISABLED" }, 503);
    }

    const uploaded = form.get("file");
    if (!(uploaded instanceof File) || uploaded.size < 16 || uploaded.size > MAX_FILE_BYTES) {
      return json(request, { error: uploaded instanceof File && uploaded.size > MAX_FILE_BYTES ? "FILE_TOO_LARGE" : "INVALID_FILE" }, 400);
    }
    const bytes = new Uint8Array(await uploaded.arrayBuffer());
    const mimeType = verifiedMime(uploaded, bytes);
    if (!mimeType) return json(request, { error: "UNSUPPORTED_FILE" }, 400);

    if (action === "extract") {
      const result = await runDocumentExtractionGateway({ actorId: authData.user.id, documentKind, bytes, mimeType });
      console.info("DOCUMENT_OCR_AUDIT", { requestId: result.telemetry.requestId, outcome: "success", capability: result.telemetry.capability, mimeType, sizeBytes: bytes.length });
      return json(request, { extraction: result.output, telemetry: { requestId: result.telemetry.requestId } });
    }

    if (documentKind !== "vaccination_sticker" && documentKind !== "vaccination_book") return json(request, { error: "SAVE_NOT_SUPPORTED" }, 400);
    let draft: VaccinationDraft;
    try {
      draft = validateDraft(JSON.parse(requiredText(form, "draft", 6000)));
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_DRAFT";
      return json(request, { error: code }, 400);
    }
    const duplicateConfirmed = form.get("duplicateConfirmed") === "true";
    let duplicateQuery = admin.from("vaccinations")
      .select("vaccination_id,vaccine_name,batch_number,given_date,manufacturer")
      .eq("clinic_id", clinicId).eq("pet_id", petId)
      .ilike("vaccine_name", draft.vaccine_name).eq("given_date", draft.given_date);
    if (draft.batch_number) duplicateQuery = duplicateQuery.ilike("batch_number", draft.batch_number);
    const { data: duplicates, error: duplicateError } = await duplicateQuery.limit(1);
    if (duplicateError) throw duplicateError;
    if (duplicates?.length && !duplicateConfirmed) return json(request, { error: "POSSIBLE_DUPLICATE", duplicate: duplicates[0] }, 409);

    const { data: bucket } = await admin.schema("storage").from("buckets").select("public").eq("id", "documents").maybeSingle();
    if (!bucket) return json(request, { error: "STORAGE_NOT_CONFIGURED" }, 503);
    if (bucket?.public === true) return json(request, { error: "STORAGE_NOT_PRIVATE" }, 503);
    const objectPath = `vaccinations/${clinicId}/${petId}/${crypto.randomUUID()}.${extension(mimeType)}`;
    const { error: uploadError } = await admin.storage.from("documents").upload(objectPath, bytes, { contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;
    const payload = {
      clinic_id: clinicId,
      pet_id: petId,
      owner_id: pet.owner_id,
      vaccine_name: draft.vaccine_name,
      vaccine_type: draft.vaccine_type || null,
      manufacturer: draft.manufacturer || null,
      batch_number: draft.batch_number || null,
      barcode_value: draft.barcode_value || null,
      given_date: draft.given_date,
      next_due_date: draft.next_due_date || null,
      expiry_date: draft.expiry_date || null,
      administered_by: draft.administered_by || null,
      notes: draft.notes || null,
      entry_method: "photo",
      sticker_image_path: objectPath,
      sticker_image_url: null,
    };
    const { data: vaccination, error: saveError } = await admin.from("vaccinations").insert(payload).select("*").single();
    if (saveError) {
      await admin.storage.from("documents").remove([objectPath]);
      throw saveError;
    }
    console.info("DOCUMENT_OCR_AUDIT", { outcome: "saved_after_confirmation", capability: "vaccination.ocr", duplicateOverride: Boolean(duplicates?.length) });
    return json(request, { vaccination }, 201);
  } catch (error) {
    const safe = asAiGatewayError(error);
    const telemetry = telemetryFromError(error);
    console.error("DOCUMENT_OCR_AUDIT", { outcome: "failed", errorCode: safe.code, requestId: telemetry?.requestId });
    const status = safe.httpStatus || 500;
    const publicCode = ["AI_FEATURE_DISABLED", "AI_RATE_LIMITED", "AI_PROVIDER_TIMEOUT", "AI_PROVIDER_UNAVAILABLE", "AI_OUTPUT_INVALID"].includes(safe.code)
      ? safe.code : "DOCUMENT_OCR_FAILED";
    return json(request, { error: publicCode }, status);
  }
});
