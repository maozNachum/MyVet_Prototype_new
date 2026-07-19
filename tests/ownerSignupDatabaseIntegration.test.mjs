import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20260719123000_secure_owner_signup.sql",
  "utf8",
);

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema private;
    create schema auth;
    create table public.clinics (
      clinic_id uuid primary key,
      slug text not null unique,
      display_name text not null,
      is_active boolean not null default true
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
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    insert into public.clinics(clinic_id, slug, display_name)
    values ('10000000-0000-0000-0000-000000000001', 'myvet-primary', 'MyVet');
  `);
  await db.exec(migration);
  return db;
}

function signupMetadata(ownerId, fullName = "לקוח בדיקה") {
  return JSON.stringify({
    role: "owner",
    owner_id: ownerId,
    full_name: fullName,
    phone: "0500000000",
    terms_version: "myvet-owner-portal-v1",
  });
}

test("unconfirmed signup waits for verification, then creates one protected owner profile", async () => {
  const db = await createDatabase();
  const userId = "20000000-0000-0000-0000-000000000001";

  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3::jsonb)",
    [userId, "owner-one@example.test", signupMetadata("100000001")],
  );
  assert.equal((await db.query("select count(*)::int as count from public.owners")).rows[0].count, 0);

  await db.query("update auth.users set email_confirmed_at = now() where id = $1", [userId]);
  const owner = (await db.query(
    "select owner_id,auth_user_id,email,phone,terms_version from public.owners where auth_user_id=$1",
    [userId],
  )).rows[0];
  assert.equal(owner.owner_id, "100000001");
  assert.equal(owner.email, "owner-one@example.test");
  assert.equal(owner.phone, "0500000000");
  assert.equal(owner.terms_version, "myvet-owner-portal-v1");

  const metadata = (await db.query("select raw_user_meta_data from auth.users where id=$1", [userId])).rows[0]
    .raw_user_meta_data;
  assert.deepEqual(metadata, {});
  await db.close();
});

test("verified signup claims a matching clinic record atomically", async () => {
  const db = await createDatabase();
  const userId = "20000000-0000-0000-0000-000000000002";
  await db.exec(`
    insert into public.owners(clinic_id,owner_id,email)
    values ('10000000-0000-0000-0000-000000000001','100000002','owner-two@example.test');
  `);

  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ($1,$2,now(),$3::jsonb)",
    [userId, "owner-two@example.test", signupMetadata("100000002")],
  );
  const result = await db.query("select auth_user_id from public.owners where owner_id='100000002'");
  assert.equal(result.rows[0].auth_user_id, userId);
  await db.close();
});

test("email mismatch aborts signup without claiming or creating an owner", async () => {
  const db = await createDatabase();
  await db.exec(`
    insert into public.owners(clinic_id,owner_id,email)
    values ('10000000-0000-0000-0000-000000000001','100000003','expected@example.test');
  `);

  await assert.rejects(
    db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ($1,$2,now(),$3::jsonb)",
      [
        "20000000-0000-0000-0000-000000000003",
        "wrong@example.test",
        signupMetadata("100000003"),
      ],
    ),
    /OWNER_SIGNUP_EMAIL_MISMATCH/,
  );
  assert.equal((await db.query("select auth_user_id from public.owners where owner_id='100000003'")).rows[0].auth_user_id, null);
  assert.equal((await db.query("select count(*)::int as count from auth.users")).rows[0].count, 0);
  await db.close();
});

test("non-owner Auth signup is not coupled to the clinic owner table", async () => {
  const db = await createDatabase();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ($1,$2,now(),$3::jsonb)",
    [
      "20000000-0000-0000-0000-000000000004",
      "staff@example.test",
      JSON.stringify({ role: "staff" }),
    ],
  );
  assert.equal((await db.query("select count(*)::int as count from public.owners")).rows[0].count, 0);
  await db.close();
});
