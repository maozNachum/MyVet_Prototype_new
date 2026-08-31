# MyVet Supabase Edge Functions

This directory contains the authenticated server boundary for VetBot and the advanced AI capabilities. The current functions are:

- `ai-assistant` — VetBot responses and validated action orchestration.
- `visit-summary` — veterinarian-reviewed visit-summary drafts.
- `digitalcare-transcription` — consent-controlled transcription and summary workflow.
- `medical-record-rag` — authorized indexing and grounded medical-record Q&A.
- `document-ocr` — document and vaccination-label extraction into an editable draft.
- `client-summary` — owner-facing summary drafts based on approved medical content.
- `follow-up-suggestions` — reviewed follow-up and reminder proposals.

All seven functions have `verify_jwt = true` in `supabase/config.toml`. They must resolve identity, clinic, role and resource scope on the server. A browser-supplied `clinic_id`, `owner_id`, `pet_id`, `visit_id`, `user_id` or role is not an authorization source.

VetBot is provider-isolated but is no longer read-only. Business mutations are exposed only through allowlisted server tools, strict validation, feature flags and explicit approval where required. The model must never execute SQL or write directly to a business table.

## Server environment names

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `AI_GEMINI_FALLBACK_MODELS`
- `ALLOWED_ORIGINS`
- the feature flags, kill switches, timeout, rate-limit and embedding settings documented in `docs/CODEX_PARTNER_FULL_SYSTEM_HANDOFF_HE.md` and `docs/ai-architecture.md`.

Do not copy server secrets into Vite `.env` files or `VITE_*` variables. Model selection is server-owned. The current `ai-assistant` and shared gateway have different code defaults and fallback lists, so do not document one universal default model; inspect the relevant function and environment.

## Verification and deployment

1. Identify and approve the exact Local, Staging or Production target.
2. Review the relevant migrations, RLS, grants, Storage policies and rollback instructions.
3. Set server secrets in Supabase, never in frontend code.
4. Deploy only the required function with JWT verification enabled.
5. Run the focused security suite, `npm run test:vetbot`, `npm run typecheck:edge`, `npm run test:frontend-secrets` and `npm run build`.
6. Complete the gates in `docs/PRODUCTION_RUNBOOK_HE.md` and `docs/PRODUCTION_READINESS_ACTION_PLAN_2026-08-30.md` before Production.

The presence of a function in this directory does not prove that it is deployed or enabled in a target environment.

