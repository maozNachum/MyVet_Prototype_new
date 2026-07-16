-- Remove legacy demo policies that would otherwise bypass authenticated
-- staff/owner authorization and the clinic availability checks.
drop policy if exists "myvet_demo_select" on public.appointments;
drop policy if exists "myvet_demo_insert" on public.appointments;
drop policy if exists "myvet_demo_update" on public.appointments;
drop policy if exists "myvet_demo_delete" on public.appointments;

revoke all privileges on table public.appointments from anon;
