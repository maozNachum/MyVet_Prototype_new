# Rollback — privacy request workflow

This migration is additive. If the workflow must be disabled, revoke execute on
`public.myvet_submit_privacy_request(text,text)` from `authenticated` and hide the
frontend form first. Preserve submitted requests for audit and legal review.

Do not drop `privacy_requests` or erase submitted requests without written legal
approval. The management RPC is service-role only and does not delete customer,
medical, Storage, AI, billing, audit, or backup data.
