import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync("supabase/migrations/20260906153000_privacy_request_workflow.sql", "utf8");
const hardeningMigration = readFileSync("supabase/migrations/20260909221500_harden_privacy_request_workflow.sql", "utf8");
const id = {
  clinicA: "10000000-0000-0000-0000-000000000001", clinicB: "10000000-0000-0000-0000-000000000002",
  ownerA: "20000000-0000-0000-0000-000000000001", ownerB: "20000000-0000-0000-0000-000000000002",
  adminA: "30000000-0000-0000-0000-000000000001", adminB: "30000000-0000-0000-0000-000000000002",
  vetA: "30000000-0000-0000-0000-000000000003",
};

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.clinics(clinic_id uuid primary key);
    create table public.owners(clinic_id uuid not null references public.clinics,owner_id text not null,auth_user_id uuid unique references auth.users,primary key(clinic_id,owner_id));
    create table public.staff(staff_id uuid primary key default gen_random_uuid(),clinic_id uuid not null references public.clinics,auth_user_id uuid unique references auth.users,role text not null,is_active boolean not null default true);
    create table public.ai_documents(document_id uuid primary key default gen_random_uuid(),retention_until timestamptz,deleted_at timestamptz);
    create table public.ai_artifacts(artifact_id uuid primary key default gen_random_uuid(),retention_until timestamptz,deleted_at timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function public.myvet_current_owner_id() returns text language sql stable security definer set search_path='' as $$ select owner_id from public.owners where auth_user_id=auth.uid() $$;
    create function private.myvet_current_clinic_id() returns uuid language sql stable security definer set search_path='' as $$ select clinic_id from public.staff where auth_user_id=auth.uid() and is_active union all select clinic_id from public.owners where auth_user_id=auth.uid() limit 1 $$;
    create function public.myvet_is_active_staff() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.staff where auth_user_id=auth.uid() and is_active) $$;
    create function private.myvet_staff_mfa_satisfied(staff_role text) returns boolean language sql stable set search_path='' as $$ select staff_role not in ('clinic_admin','vet') or coalesce(auth.jwt()->>'aal','aal1')='aal2' $$;
    create function private.myvet_is_clinic_staff(target_clinic_id uuid,allowed_roles text[] default null) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.staff where auth_user_id=auth.uid() and clinic_id=target_clinic_id and is_active and (allowed_roles is null or role=any(allowed_roles)) and private.myvet_staff_mfa_satisfied(role)) $$;
    grant usage on schema auth,private to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.jwt(),public.myvet_current_owner_id(),private.myvet_current_clinic_id(),public.myvet_is_active_staff(),private.myvet_staff_mfa_satisfied(text),private.myvet_is_clinic_staff(uuid,text[]) to authenticated,service_role;
    insert into public.clinics values ('${id.clinicA}'),('${id.clinicB}');
    insert into auth.users values ('${id.ownerA}'),('${id.ownerB}'),('${id.adminA}'),('${id.adminB}'),('${id.vetA}');
    insert into public.owners values ('${id.clinicA}','OWNER-A','${id.ownerA}'),('${id.clinicB}','OWNER-B','${id.ownerB}');
    insert into public.staff(clinic_id,auth_user_id,role) values ('${id.clinicA}','${id.adminA}','clinic_admin'),('${id.clinicB}','${id.adminB}','clinic_admin'),('${id.clinicA}','${id.vetA}','vet');
  `);
  await db.exec(migration);
  await db.exec(hardeningMigration);
  return db;
}

async function asUser(db, userId, role = "authenticated", aal = "aal1") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId || ""]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: userId || "", role, aal })]);
  await db.exec(`set role ${role}`);
}
async function reset(db) { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub','',false)"); await db.query("select set_config('request.jwt.claims','{}',false)"); }

describe("privacy-rights database workflow", { concurrency: false }, () => {
test("owners submit tenant-derived requests and duplicate open requests are idempotent", async () => {
  const db = await database();
  try {
    await asUser(db,id.ownerA);
    const first = await db.query("select public.myvet_submit_privacy_request('access','please verify') as id");
    const retry = await db.query("select public.myvet_submit_privacy_request('access','duplicate') as id");
    assert.equal(first.rows[0].id,retry.rows[0].id);
    assert.equal((await db.query("select count(*)::int count from public.privacy_requests")).rows[0].count,1);
    await reset(db);
    assert.deepEqual((await db.query("select clinic_id,owner_id,auth_user_id from public.privacy_requests")).rows[0],{clinic_id:id.clinicA,owner_id:"OWNER-A",auth_user_id:id.ownerA});
  } finally { await reset(db); await db.close(); }
});

test("concurrent open requests converge on one row", async () => {
  const db = await database();
  try {
    await asUser(db,id.ownerA);
    const [first, second] = await Promise.all([
      db.query("select public.myvet_submit_privacy_request('access','first') as id"),
      db.query("select public.myvet_submit_privacy_request('access','second') as id"),
    ]);
    assert.equal(first.rows[0].id, second.rows[0].id);
    assert.equal((await db.query("select count(*)::int count from public.privacy_requests")).rows[0].count, 1);
  } finally { await reset(db); await db.close(); }
});

test("anonymous callers and direct browser writes fail closed", async () => {
  const db = await database();
  try {
    await asUser(db,"","anon");
    await assert.rejects(db.query("select public.myvet_submit_privacy_request('access',null)"),/permission denied/i);
    await asUser(db,id.ownerA);
    await assert.rejects(db.query(`insert into public.privacy_requests(clinic_id,owner_id,auth_user_id,request_type) values ('${id.clinicA}','OWNER-A','${id.ownerA}','access')`),/permission denied/i);
  } finally { await reset(db); await db.close(); }
});

test("owners see only their requests and cannot choose another tenant", async () => {
  const db = await database();
  try {
    await asUser(db,id.ownerA); await db.query("select public.myvet_submit_privacy_request('export',null)");
    await asUser(db,id.ownerB); await db.query("select public.myvet_submit_privacy_request('correction',null)");
    assert.deepEqual((await db.query("select owner_id from public.privacy_requests")).rows,[{owner_id:"OWNER-B"}]);
  } finally { await reset(db); await db.close(); }
});

test("only an active clinic admin can manage a request in the same clinic", async () => {
  const db = await database();
  try {
    await asUser(db,id.ownerA);
    const requestId = (await db.query("select public.myvet_submit_privacy_request('deletion',null) as id")).rows[0].id;
    await asUser(db,id.vetA,"authenticated","aal2");
    assert.equal((await db.query("select count(*)::int count from public.privacy_requests")).rows[0].count,0);
    await assert.rejects(db.query("select public.myvet_manage_privacy_request($1,'in_review',null)",[requestId]),/CLINIC_ADMIN_REQUIRED/);
    await asUser(db,id.adminA,"authenticated","aal1");
    assert.equal((await db.query("select count(*)::int count from public.privacy_requests")).rows[0].count,0);
    await assert.rejects(db.query("select public.myvet_manage_privacy_request($1,'in_review',null)",[requestId]),/MFA_REQUIRED/);
    await asUser(db,id.adminB,"authenticated","aal2"); await assert.rejects(db.query("select public.myvet_manage_privacy_request($1,'in_review',null)",[requestId]),/PRIVACY_REQUEST_NOT_FOUND/);
    await asUser(db,id.adminA,"authenticated","aal2");
    assert.equal((await db.query("select count(*)::int count from public.privacy_requests")).rows[0].count,1);
    await db.query("select public.myvet_manage_privacy_request($1,'completed','reviewed')",[requestId]);
    await reset(db);
    assert.deepEqual((await db.query("select status,completed_at is not null as closed from public.privacy_requests where request_id=$1",[requestId])).rows[0],{status:"completed",closed:true});
  } finally { await reset(db); await db.close(); }
});

test("retention preview excludes boundary, future, unset and already-deleted records without mutation", async () => {
  const db = await database();
  try {
    await reset(db);
    // Freeze now() for insertion and preview so the exact boundary is meaningful.
    await db.exec("begin");
    for (const table of ["ai_documents", "ai_artifacts"]) {
      await db.exec(`insert into public.${table}(retention_until,deleted_at) values
        (now()-interval '1 microsecond',null),
        (now(),null),
        (now()+interval '1 microsecond',null),
        (null,null),
        (now()-interval '1 day',now())`);
    }
    await asUser(db,id.adminA);
    await db.exec("savepoint denied_preview");
    await assert.rejects(db.query("select public.myvet_privacy_retention_preview()"),/permission denied/i);
    await db.exec("rollback to savepoint denied_preview");
    await asUser(db,id.adminA,"service_role");
    const preview = (await db.query("select public.myvet_privacy_retention_preview() as result")).rows[0].result;
    assert.deepEqual(Object.keys(preview).sort(), ["expired_ai_artifacts", "expired_ai_documents", "generated_at"]);
    assert.equal(Number(preview.expired_ai_documents),1);
    assert.equal(Number(preview.expired_ai_artifacts),1);
    await reset(db);
    for (const table of ["ai_documents", "ai_artifacts"]) {
      assert.deepEqual((await db.query(`select count(*)::int count,
        count(*) filter (where deleted_at is not null)::int deleted
        from public.${table}`)).rows[0], {count:5,deleted:1});
    }
    await db.exec("rollback");
  } finally { await reset(db); await db.close(); }
});
});
