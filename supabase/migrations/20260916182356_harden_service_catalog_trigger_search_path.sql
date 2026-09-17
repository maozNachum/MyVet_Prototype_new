-- Preserve the existing trigger body, ownership and privileges. pg_catalog
-- remains implicitly available with an empty path, so now() is still resolved.
alter function public.set_updated_at() set search_path = '';
