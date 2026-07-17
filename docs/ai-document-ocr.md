# MyVet AI — Stage 6 document OCR

## Scope and status

Stage 6 adds provider-agnostic extraction for `vaccination_sticker`, `vaccination_book`, `medical_document`, `visit_summary`, and `lab_result`. The user-facing review/save flow is integrated first into the existing vaccination book. Other document kinds share the gateway and schema but are not persisted automatically.

The capability is **off by default**. It was verified with a deterministic mock adapter, not a live OCR provider. Do not enable it in Production before a controlled provider test.

## Vaccination flow

1. An authenticated staff member selects an existing patient and JPEG, PNG or PDF.
2. `document-ocr` verifies the JWT and derives actor, clinic and patient access on the server. It validates size and file magic bytes.
3. The Edge Function calls `runDocumentExtractionGateway`; UI code never calls Gemini directly.
4. `GeminiDocumentExtractionAdapter` owns provider-specific multimodal handling.
5. The gateway validates strict structured output. Missing fields are empty; dates must be `YYYY-MM-DD`.
6. The UI shows an editable draft, missing/low-confidence fields, warnings and a preview. Nothing is saved automatically.
7. Explicit save revalidates access and the draft, checks possible duplicates, verifies private storage, stores the file under an opaque tenant/patient path and inserts into the existing `vaccinations` table.
8. A duplicate requires a second explicit confirmation. A failed database insert removes the just-uploaded file.

Manual entry, barcode camera, editing and deletion remain on their existing paths and continue when OCR is disabled.

## Security boundaries

- Frontend sends only action, patient reference, document kind, file, reviewed draft and duplicate confirmation.
- Provider, model, prompt, role, clinic and owner are server-owned.
- Active `clinic_admin`, `vet` and `nurse` roles are permitted. An owner is restricted to their own pet; the current edit UI remains staff-only.
- JPEG, PNG and PDF signatures are checked server-side; maximum size is 8 MiB.
- Files use the private `documents` bucket. No durable public URL is stored; viewing continues through short-lived signed URLs.
- Logs contain metadata only, never file bytes, extracted medical text, prompts or secrets.
- Document content is untrusted. Embedded instructions and prompt injection are ignored.

## Existing schema mapping

Extraction maps to the existing `vaccinations` fields: `vaccine_name`, `vaccine_type`, `manufacturer`, `batch_number`, `barcode_value`, `given_date`, `next_due_date`, `expiry_date`, `administered_by`, and `notes`. Existing `pet_id`, `owner_id`, `entry_method`, `sticker_image_path`, and `sticker_image_url` are reused. No parallel vaccination model was created.

## Environment (server only)

- `AI_DOCUMENT_OCR_ENABLED=false`
- `AI_VACCINATION_OCR_ENABLED=false`
- `AI_DOCUMENT_OCR_KILL_SWITCH=false`
- `AI_VACCINATION_OCR_KILL_SWITCH=false`
- `GEMINI_API_KEY` — existing provider secret, required only for live verification.
- `GEMINI_MODEL` and existing AI model configuration.
- `ALLOWED_ORIGINS` — permitted web origins.

These belong to Supabase Edge Function configuration and must not have a `VITE_` prefix. RAG remains unchanged and off: `AI_RAG_INDEX_ENABLED=false`, `AI_RAG_QA_ENABLED=false`, `AI_ALLOW_MOCK_PROVIDER=false`.

## Failure behavior

Timeout, provider failure, invalid output, denied access and invalid files return stable public codes without stack traces. The selected file and form remain available for retry or manual entry. Partial extraction is never persisted.

## Verification status

`tests/documentOcrSecurity.test.ts` covers gateway schemas, flags, kill switches, JPEG/PNG/PDF, invalid and oversized files, provider failure, authorization boundaries, MIME signatures, private storage and explicit save/duplicate behavior. A live Gemini request was not made, so the feature flags remain off. No Stage 6 SQL migration was needed.

## Controlled enablement

In non-production only: deploy `document-ocr`, configure the existing provider secret, enable `AI_DOCUMENT_OCR_ENABLED=true` and then `AI_VACCINATION_OCR_ENABLED=true`, and test synthetic documents plus denial, duplicate and failure cases. Keep all RAG flags off.

## Rollback

1. Set both OCR enable flags to `false`, or set an OCR kill switch to `true`.
2. If code rollback is required, revert the Stage 6 code and undeploy only `document-ocr`.
3. Do not delete vaccinations, the documents bucket, medical records or existing files. Stage 6 adds no database migration.
