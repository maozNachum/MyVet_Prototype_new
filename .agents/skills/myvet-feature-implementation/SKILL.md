---
name: myvet-feature-implementation
description: End-to-end implementation workflow for MyVet features that affect multiple related parts of the system. Use when asked to add, implement, connect, complete, change, or extend a MyVet feature, module, workflow, page behavior, user flow, or cross-cutting functionality. Do not use for simple repository questions, isolated visual refinements without behavior changes, isolated database administration, or documentation-only requests.
---

# MyVet Feature Implementation

Implement the requested feature completely; do not stop at advice, a proposal, or a partial code sketch. Read and obey the repository `AGENTS.md` before working and treat it as the authority for permanent project rules.

## Understand and inspect

1. Define the expected user outcome, primary actors, entry points, complete user flow, and observable success criteria.
2. Inspect the repository and all related existing code before editing. Locate the relevant pages, components, routes, hooks, services, utilities, types, queries, tests, and neighboring features.
3. Trace how data and control currently move through the implementation, including reads, mutations, validation, state ownership, navigation, and persistence.
4. Identify dependencies, permissions, edge cases, failure modes, and likely side effects across the full flow.
5. Resolve uncertainty from repository evidence whenever possible. Do not invent tables, fields, APIs, routes, relationships, permissions, or business rules.

## Implement

1. Reuse existing architecture, components, services, utilities, types, and patterns. Avoid parallel abstractions and duplicate implementations.
2. Implement the smallest complete solution that satisfies the requested outcome while preserving unrelated behavior.
3. Cover every affected layer needed for the flow to work, rather than completing only the most visible file.
4. Include relevant loading, empty, validation, error, success, disabled, and in-progress states. Prevent inconsistent or duplicate actions where applicable.
5. Apply `$myvet-ui-ux-expert` whenever the feature includes meaningful visible interface or interaction work.
6. Apply `$myvet-supabase-change` whenever the feature includes Supabase schema, query, policy, Storage, Auth, Realtime, RPC, or Edge Function work.
7. Keep database and operational changes explicit, reviewable, and within the authorization boundaries in `AGENTS.md`.

## Verify the complete flow

1. Review the implemented user flow from entry to completion, including important alternate and failure paths.
2. Run the relevant existing type-check, lint, and test commands plus the production build required by `AGENTS.md`. If the repository has no lint command, do not invent or claim one.
3. Fix errors introduced by the implementation. Distinguish unrelated pre-existing failures from regressions caused by the change.
4. Perform focused manual or browser verification when automated checks do not cover important behavior.

## Report

Finish with a concise report containing:

- What was implemented.
- Files changed.
- Database changes, or state explicitly that there were none.
- Commands or manual steps required.
- Verification performed.
- Remaining limitations.
