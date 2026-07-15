# VetBot Edge Function

The function is intentionally provider-isolated and read-only. It authenticates the Supabase user, resolves the role from the database, redacts direct identifiers again, executes only aggregate/read tools, requests a structured answer and stores metadata-only audit logs.

Required secrets:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; defaults to `gemini-2.5-flash`)
- `ALLOWED_ORIGINS` (comma-separated production origins)

Deployment order:

1. Review `docs/VETBOT_PRIVACY_DPIA_HE.md` and complete every production gate.
2. Apply `supabase/migrations/202607150001_vetbot_privacy.sql`.
3. Configure a paid Gemini project, disable optional log/data sharing, and complete the vendor/transfer review.
4. Set secrets in Supabase. Never add them to `.env` used by Vite.
5. Deploy `ai-assistant` with JWT verification enabled.
6. Run role, RLS, redaction and prompt-injection tests before production.

