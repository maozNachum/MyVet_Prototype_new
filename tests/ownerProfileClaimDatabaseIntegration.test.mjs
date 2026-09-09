import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20260906120000_harden_owner_profile_claim.sql",
  "utf8",
);

const ids = {
  userA: "20000000-0000-0000-0000-000000000001",
  userB: "20000000-0000-0000-0000-000000000002",
  clinicA: "10000000-0000-0000-0000-000000000001",
  clinicB: "10000000-0000-0000-0000-000000000002",
};

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;

    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz
    );
    create or replace function auth.uid()
    returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create or replace function auth.jwt()
    returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

    create table public.clinics (
      clinic_id uuid primary key,
      display_name text not null
    );
    create table public.owners (
      owner_id text primary key,
      clinic_id uuid not null references public.clinics(clinic_id),
      email text,
      auth_user_id uuid unique references auth.users(id)
    );
    insert into public.clinics(clinic_id, display_name) values
      ('${ids.clinicA}', 'Clinic A'),
      ('${ids.clinicB}', 'Clinic B');
  `);
  await db.exec(migration);
  return db;
}

async function addAuthUser(db, id, email, confirmed = true) {
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values ($1,$2,case when $3 then now() else null end)",
    [id, email, confirmed],
  );
}

async function setIdentity(db, id, email, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || ""]);
  await db.query(
    "select set_config('request.jwt.claims', $1, false)",
    [id ? JSON.stringify({ sub: id, email, role }) : ""],
  );
  await db.exec(`set role ${role}`);
}

async function resetIdentity(db) {
  await db.exec(`
    reset role;
    select set_config('request.jwt.claim.sub', '', false);
    select set_config('request.jwt.claims', '', false);
  `);
}

test("anonymous and missing identities cannot execute the owner claim", async () => {
  const db = await createDatabase();
  try {
    await setIdentity(db, null, null, "anon");
    await assert.rejects(db.query("select public.claim_owner_profile()"), /permission denied/i);
    await resetIdentity(db);

    await setIdentity(db, null, null);
    await assert.rejects(db.query("select public.claim_owner_profile()"), /AUTH_REQUIRED/);
  } finally {
    await resetIdentity(db);
    await db.close();
  }
});

test("an unconfirmed or mismatched Auth email cannot claim an owner", async () => {
  const db = await createDatabase();
  try {
    await addAuthUser(db, ids.userA, "owner@example.test", false);
    await db.query(
      "insert into public.owners(owner_id,clinic_id,email) values ('OWNER-A',$1,'owner@example.test')",
      [ids.clinicA],
    );
    await setIdentity(db, ids.userA, "owner@example.test");
    await assert.rejects(db.query("select public.claim_owner_profile()"), /AUTH_EMAIL_NOT_VERIFIED/);

    await resetIdentity(db);
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [ids.userA]);
    await setIdentity(db, ids.userA, "different@example.test");
    await assert.rejects(db.query("select public.claim_owner_profile()"), /AUTH_EMAIL_NOT_VERIFIED/);
    await resetIdentity(db);
    assert.equal(
      (await db.query("select auth_user_id from public.owners where owner_id='OWNER-A'")).rows[0].auth_user_id,
      null,
    );
  } finally {
    await resetIdentity(db);
    await db.close();
  }
});

test("exactly one normalized email match is claimed and retries are idempotent", async () => {
  const db = await createDatabase();
  try {
    await addAuthUser(db, ids.userA, "owner@example.test");
    await db.query(
      "insert into public.owners(owner_id,clinic_id,email) values ('OWNER-A',$1,'  Owner@Example.Test  ')",
      [ids.clinicA],
    );
    await setIdentity(db, ids.userA, "OWNER@example.test");

    const first = await db.query("select public.claim_owner_profile() as owner_id");
    const retry = await db.query("select public.claim_owner_profile() as owner_id");
    assert.equal(first.rows[0].owner_id, "OWNER-A");
    assert.equal(retry.rows[0].owner_id, "OWNER-A");
    await resetIdentity(db);
    assert.equal(
      (await db.query("select auth_user_id from public.owners where owner_id='OWNER-A'")).rows[0].auth_user_id,
      ids.userA,
    );
  } finally {
    await resetIdentity(db);
    await db.close();
  }
});

test("overlapping client retries return one stable owner assignment", async () => {
  const db = await createDatabase();
  try {
    await addAuthUser(db, ids.userA, "retry@example.test");
    await db.query(
      "insert into public.owners(owner_id,clinic_id,email) values ('OWNER-RETRY',$1,'retry@example.test')",
      [ids.clinicA],
    );
    await setIdentity(db, ids.userA, "retry@example.test");

    const results = await Promise.all([
      db.query("select public.claim_owner_profile() as owner_id"),
      db.query("select public.claim_owner_profile() as owner_id"),
      db.query("select public.claim_owner_profile() as owner_id"),
    ]);
    assert.deepEqual(results.map((result) => result.rows[0].owner_id), [
      "OWNER-RETRY",
      "OWNER-RETRY",
      "OWNER-RETRY",
    ]);

    await resetIdentity(db);
    const linked = await db.query(
      "select owner_id from public.owners where auth_user_id=$1",
      [ids.userA],
    );
    assert.deepEqual(linked.rows.map((row) => row.owner_id), ["OWNER-RETRY"]);
  } finally {
    await resetIdentity(db);
    await db.close();
  }
});

test("no matching owner returns null and changes no owner row", async () => {
  const db = await createDatabase();
  try {
    await addAuthUser(db, ids.userA, "missing@example.test");
    await db.query(
      "insert into public.owners(owner_id,clinic_id,email) values ('OWNER-A',$1,'other@example.test')",
      [ids.clinicA],
    );
    await setIdentity(db, ids.userA, "missing@example.test");
    const result = await db.query("select public.claim_owner_profile() as owner_id");
    assert.equal(result.rows[0].owner_id, null);
    await resetIdentity(db);
    assert.equal(
      (await db.query("select auth_user_id from public.owners where owner_id='OWNER-A'")).rows[0].auth_user_id,
      null,
    );
  } finally {
    await resetIdentity(db);
    await db.close();
  }
});

test("duplicate email matches across clinics fail closed without changing either row", async () => {
  const db = await createDatabase();
  try {
    await addAuthUser(db, ids.userA, "duplicate@example.test");
    await db.query(
      `insert into public.owners(owner_id,clinic_id,email) values
        ('OWNER-A',$1,'duplicate@example.test'),
        ('OWNER-B',$2,' DUPLICATE@example.test ')`,
      [ids.clinicA, ids.clinicB],
    );
    await setIdentity(db, ids.userA, "duplicate@example.test");
    await assert.rejects(db.query("select public.claim_owner_profile()"), /OWNER_PROFILE_AMBIGUOUS/);
    await resetIdentity(db);
    const owners = await db.query("select auth_user_id from public.owners order by owner_id");
    assert.deepEqual(owners.rows.map((row) => row.auth_user_id), [null, null]);
  } finally {
    await resetIdentity(db);
    await db.close();
  }
});

test("a profile linked to another Auth user cannot be reclaimed", async () => {
  const db = await createDatabase();
  try {
    await addAuthUser(db, ids.userA, "shared@example.test");
    await addAuthUser(db, ids.userB, "shared@example.test");
    await db.query(
      "insert into public.owners(owner_id,clinic_id,email,auth_user_id) values ('OWNER-B',$1,'shared@example.test',$2)",
      [ids.clinicB, ids.userB],
    );
    await setIdentity(db, ids.userA, "shared@example.test");
    await assert.rejects(db.query("select public.claim_owner_profile()"), /OWNER_PROFILE_ALREADY_CLAIMED/);
    await resetIdentity(db);
    assert.equal(
      (await db.query("select auth_user_id from public.owners where owner_id='OWNER-B'")).rows[0].auth_user_id,
      ids.userB,
    );
  } finally {
    await resetIdentity(db);
    await db.close();
  }
});

test("a free and an already-linked match remain ambiguous and neither is changed", async () => {
  const db = await createDatabase();
  try {
    await addAuthUser(db, ids.userA, "mixed@example.test");
    await addAuthUser(db, ids.userB, "mixed@example.test");
    await db.query(
      `insert into public.owners(owner_id,clinic_id,email,auth_user_id) values
        ('OWNER-FREE',$1,'mixed@example.test',null),
        ('OWNER-LINKED',$2,'mixed@example.test',$3)`,
      [ids.clinicA, ids.clinicB, ids.userB],
    );
    await setIdentity(db, ids.userA, "mixed@example.test");
    await assert.rejects(db.query("select public.claim_owner_profile()"), /OWNER_PROFILE_AMBIGUOUS/);

    await resetIdentity(db);
    const owners = await db.query(
      "select owner_id,auth_user_id from public.owners order by owner_id",
    );
    assert.deepEqual(owners.rows, [
      { owner_id: "OWNER-FREE", auth_user_id: null },
      { owner_id: "OWNER-LINKED", auth_user_id: ids.userB },
    ]);
  } finally {
    await resetIdentity(db);
    await db.close();
  }
});

test("the RPC exposes no browser-controlled clinic or owner parameter", async () => {
  const db = await createDatabase();
  try {
    await addAuthUser(db, ids.userA, "owner@example.test");
    await setIdentity(db, ids.userA, "owner@example.test");
    await assert.rejects(
      db.query("select public.claim_owner_profile($1::uuid)", [ids.clinicB]),
      /does not exist|function.*claim_owner_profile/i,
    );
  } finally {
    await resetIdentity(db);
    await db.close();
  }
});
