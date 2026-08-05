# MyVet Repository Guide

This file applies to the entire repository. Before substantial work, read the relevant source files and, when applicable, `docs/PROJECT_CONTEXT_HE.md`, `docs/SUPABASE_ARCHITECTURE_HE.md`, `docs/CODEX_HANDOFF_STAGE_0_TO_9_HE.md`, `docs/PRODUCTION_RUNBOOK_HE.md`, and `docs/VETBOT_PRIVACY_DPIA_HE.md`.

## Project

- MyVet is a veterinary clinic and pet medical-record management system.
- Preserve the existing project architecture and naming conventions.
- Inspect the current branch, `git status`, relevant files, queries, and migrations before modifying code. Preserve unrelated worktree changes.
- Reuse existing components, hooks, services, utilities, types, and patterns.
- Prefer focused, reversible changes over broad rewrites.
- Do not modify unrelated screens or behavior.
- The working integration branch is `Full_Demo` unless the user explicitly selects another branch.
- Do not merge to `master`, push, or deploy to Production without explicit approval.

## Verified stack and structure

- The frontend uses React 18, TypeScript, Vite 6, React Router 7, Tailwind CSS 4, Lucide icons, and Sonner toasts.
- Supabase provides Auth, PostgreSQL data access, Realtime, Storage, RPCs, and Edge Functions through `@supabase/supabase-js`.
- `src/main.tsx` mounts `src/app/App.tsx`; routes are defined in `src/app/routes.tsx` with `createBrowserRouter` and lazy-loaded page modules.
- `src/app/pages/Layout.tsx` verifies staff access and composes the shared navbar, command center, footer, VetBot shell, and route outlet.
- Shared application state uses React Context providers in `src/app/data`, notably `MedicalStore`, `AppointmentStore`, and `LabStore`. Keep page-local state local when no shared store is needed.
- `src/app/pages` contains route screens; `src/app/components` contains domain and shared UI; `src/app/hooks` contains `use*` hooks; `src/services` contains reusable Supabase-facing services.
- `src/app/components/ai` contains VetBot UI, context construction, sanitization, policies, persistence, and structured-response handling.
- Components and TSX files use PascalCase; hooks use a `use` prefix; service and utility files use camelCase; database identifiers use snake_case; migrations use timestamp-prefixed snake_case filenames.
- The Vite alias `@` resolves to `src`, but existing relative-import style may be preserved in nearby files.

## UI and content

- The main application language is Hebrew and the interface uses RTL. Existing app shells, portal surfaces, toasts, and modal content use RTL explicitly.
- The UI uses Heebo, Tailwind utility classes, a light blue application canvas, white cards, and MyVet blues including `#1e40af` and `#2563eb`.
- User-facing Hebrew must be concise, natural, and practical.
- Do not add developer-oriented, technical, explanatory, or meta text to the UI.
- Do not repeat the same information in headings, subtitles, cards, or helper text.
- Preserve consistency with existing screens and the existing design language.
- Reuse shared patterns such as `ModalOverlay`, `ModalHeader`, `PillPicker`, `SuccessMessage`, and Sonner toasts when they fit.
- Keep the customer portal mobile-first, preserve comfortable touch targets, and verify both desktop and mobile layouts.
- Every control that looks interactive must perform a real action or be disabled with a clear reason.
- Do not perform a full redesign when the request is focused.

## Forms and validation

- Existing forms use both React Hook Form with Zod (for example in patient and appointment flows) and focused inline validation. Follow the established pattern of the screen being changed.
- Do not silently prevent submission by disabling submit without useful feedback.
- After invalid submission, show exactly which required or invalid fields need attention.
- Use clear inline validation and a Sonner toast or form summary when appropriate.
- Preserve entered data when validation fails.
- Prevent duplicate submission while a request is processing.
- Include loading, success, empty, disabled, and error states where relevant.

## Supabase

- The browser client is created only in `src/services/supabaseClient.ts` from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Existing Supabase access is split between context stores, route screens, reusable services, and authenticated Edge Functions. Inspect the neighboring implementation before choosing placement for a new query.
- Never expose `service_role`, provider secrets, API keys, or privileged credentials to frontend code or `VITE_*` variables.
- Never invent table names, columns, keys, relationships, RPCs, policies, or storage buckets.
- Inspect existing application queries and all relevant SQL migrations before proposing a database change.
- Keep SQL changes separate from frontend and Edge Function changes. Add timestamped migrations under `supabase/migrations`; keep rollback instructions under `supabase/rollback` when needed.
- Review RLS, grants, affected roles, tenant/owner boundaries, and Storage policies for every affected table or bucket.
- Existing sensitive migrations use RLS, scoped grants, and `SECURITY DEFINER` functions with an explicit safe `search_path`; preserve those security patterns.
- Use private Storage and short-lived signed URLs for sensitive medical documents. Do not make medical buckets public.
- Prefer additive, backward-compatible database changes. Do not rename or destructively change existing schema without a compatibility plan.
- Do not apply migrations, alter Production data, deploy Edge Functions, or perform other destructive/Production operations without explicit approval.

## VetBot and AI

- User-facing AI is named `VetBot`.
- Frontend AI code must use the existing clients/services and server Edge Functions; do not call Gemini or another provider directly from a React component.
- Provider, model, prompt, permissions, feature flags, and kill switches are server-owned. Preserve the shared gateway and provider-adapter structure under `supabase/functions/_shared/ai`.
- Validate structured AI input and output, minimize/redact sensitive data, and do not log full personal or medical content.
- AI may prepare drafts or proposed actions, but medical content and business mutations requiring approval must not be committed automatically.
- Preserve manual fallback paths when an AI capability is disabled, times out, or fails.

## Available commands

Use only scripts that exist in `package.json`:

- `npm run dev` — start Vite locally.
- `npm run build` — production build.
- `npm run typecheck:ai` — strict type-check for the shared AI infrastructure covered by `tsconfig.ai-infrastructure.json`; it is not a full frontend type-check.
- `npm run test:vetbot` — broad VetBot, security, database-integration, AI-stage, accessibility, and regression suite.
- `npm run test:frontend-secrets` — scan frontend sources for server AI secrets.
- `npm run test:accessibility` — accessibility foundation tests.
- Additional focused `test:*` scripts exist for privacy, AI infrastructure/data security, visit summaries, DigitalCare AI, RAG, OCR, client summaries, follow-up suggestions, hardening, and anonymous access; select the ones relevant to the change.
- There is currently no `lint` script. Do not claim lint was run and do not add a linter solely for unrelated work.

## Implementation and verification

- Preserve existing behavior unless the requested feature requires changing it.
- Do not install a new production dependency unless necessary and approved by the task scope.
- For React changes, review hook dependencies and cleanup, accessibility, loading/error states, responsive behavior, and stable list keys.
- For functional changes, run `npm run test:vetbot`, `npm run build`, and `git diff --check` at minimum; add the relevant focused scripts above.
- For Supabase/security changes, also run the relevant database/RLS/security tests. Do not claim live Supabase verification unless it actually occurred.
- Fix errors introduced by the work. Do not broaden the task to fix unrelated failures without approval.
- Report files changed, verification performed, database or Edge Function changes, manual steps, and remaining limitations.
