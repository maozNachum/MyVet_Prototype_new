-- Roll back only the pgvector operator-qualification fix.
-- Restoring the prior body reintroduces the db-lint/operator-resolution defect,
-- so use this rollback only for emergency compatibility investigation.
-- Copy the previous function definition from:
--   supabase/migrations/20260717160500_secure_medical_record_rag_rpc.sql
-- and apply it with CREATE OR REPLACE FUNCTION.
--
-- No table, source document, chunk, embedding, or medical record is deleted.

