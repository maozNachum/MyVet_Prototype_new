import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20260915120000_multi_clinic_onboarding_and_secure_owner_signup.sql",
  "utf8",
);

const adminId = "20000000-0000-0000-0000-000000000001";
const ownerId = "20000000-0000-0000-0000-000000000002";

async function setIdentity(db, userId, email, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    userId ? JSON.stringify({ sub: userId, email, role }) : "",
  ]);
  await db.exec(`set role ${role}`);
}

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema private;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    $$;
    grant usage on schema auth, private to anon, authenticated, service_role;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
    create table public.clinics (
      clinic_id uuid primary key default gen_random_uuid(),
      slug text not null unique,
      display_name text not null,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table public.owners (
      clinic_id uuid not null references public.clinics(clinic_id),
      owner_id text primary key,
      auth_user_id uuid unique,
      owner_first_name text,
      owner_last_name text,
      phone text,
      email text,
      terms_accepted_at timestamptz,
      terms_version text
    );
    create table public.staff (
      staff_id uuid primary key default gen_random_uuid(),
      clinic_id uuid not null references public.clinics(clinic_id),
      auth_user_id uuid,
      email text,
      full_name text,
      name text,
      role text,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    );
    create or replace function private.myvet_user_has_clinic_access(target_clinic_id uuid)
    returns boolean language sql stable security definer set search_path = '' as $$
      select exists(select 1 from public.staff where auth_user_id = (select auth.uid()) and clinic_id = target_clinic_id and is_active)
        or exists(select 1 from public.owners where auth_user_id = (select auth.uid()) and clinic_id = target_clinic_id)
    $$;
    create or replace function private.myvet_is_clinic_staff(target_clinic_id uuid, allowed_roles text[] default null)
    returns boolean language sql stable security definer set search_path = '' as $$
      select exists(select 1 from public.staff where auth_user_id = (select auth.uid()) and clinic_id = target_clinic_id and is_active and (allowed_roles is null or role = any(allowed_roles)))
    $$;
    create or replace function private.myvet_staff_mfa_satisfied(staff_role text)
    returns boolean language sql stable as $$ select true $$;
    grant execute on function private.myvet_user_has_clinic_access(uuid), private.myvet_is_clinic_staff(uuid, text[]) to authenticated, service_role;
    insert into public.clinics(slug, display_name) values ('legacy', 'Legacy Clinic');
    grant insert on public.owners to authenticated;
  `);
  await db.exec(migration);
  return db;
}

test("direct owner inserts are denied and invite creates a tenant-bound owner", async () => {
  const db = await createDatabase();
  try {
    await db.exec("reset role");
    await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())", [adminId, "admin@example.test"]);
    await setIdentity(db, adminId, "admin@example.test");

    await assert.rejects(
      db.query("insert into public.owners(clinic_id,owner_id,email) values ((select clinic_id from public.clinics where slug='legacy'),'000000001','owner@example.test')"),
      /permission denied|new row violates row-level security/i,
    );

    const created = await db.query(
      "select * from public.myvet_create_clinic('clinic-two', 'Clinic Two')",
    );
    const clinicId = created.rows[0].clinic_id;
    const invite = await db.query(
      "select * from public.myvet_create_clinic_invitation($1,$2,$3,$4,$5)",
      [clinicId, "owner@example.test", "owner", null, "123456789"],
    );
    const token = invite.rows[0].invitation_token;

    await db.exec("reset role");
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ($1,$2,now(),$3::jsonb)",
      [ownerId, "owner@example.test", JSON.stringify({ role: "owner", owner_id: "123456789", full_name: "בעלים בדיקה", phone: "0500000000", terms_version: "myvet-owner-portal-v1", invitation_token: token })],
    );
    await db.exec("reset role");
    const owner = await db.query("select clinic_id, owner_id, auth_user_id from public.owners where owner_id='123456789'");
    assert.equal(owner.rows[0].clinic_id, clinicId);
    assert.equal(owner.rows[0].auth_user_id, ownerId);
    const consumed = await db.query("select accepted_at from public.clinic_invitations");
    assert.ok(consumed.rows[0].accepted_at);
  } finally {
    await db.close();
  }
});
