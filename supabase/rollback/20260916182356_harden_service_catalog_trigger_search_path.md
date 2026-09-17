# Rollback: service catalog trigger search path

The additive migration only pins the function search path; it changes no rows,
grants, trigger bindings or function body. Prefer a forward correction.

If a verified compatibility issue requires rollback, after environment approval:

```sql
alter function public.set_updated_at() reset search_path;
```

This restores the previous mutable search path and reopens the advisor warning.
Do not run on Production without explicit approval. Re-run the timestamp trigger
behavior check after any forward correction.
