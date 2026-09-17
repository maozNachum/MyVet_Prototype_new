import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const filename = "20260916182805_harden_definer_mfa_and_action_scope.sql";
const migration = readFileSync("supabase/migrations/" + filename, "utf8");
const oldMedical = readFileSync("supabase/migrations/20260826143000_atomic_medical_visit_save.sql", "utf8");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const Q = "33333333-3333-4333-8333-333333333333";
const payload = { petId: 10, reason: "known medical payload" };
function extractFunction(sql, name) {
  const start = sql.toLowerCase().indexOf("create or replace function public." + name + "(");
  assert.ok(start >= 0);
  const rest = sql.slice(start);
  const marker = rest.match(/\bas\s+(\$[a-z_0-9]*\$)/i);
  const end = rest.indexOf(marker[1], marker.index + marker[0].length);
  return rest.slice(0, end + marker[1].length) + ";";
}
async function database(harden = true) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create function private.myvet_current_clinic_id() returns uuid language sql stable as $$ select nullif(current_setting('test.clinic',true),'')::uuid $$;
    create function private.myvet_staff_mfa_satisfied(staff_role text) returns boolean language sql stable as $$ select staff_role not in ('clinic_admin','vet') or current_setting('test.aal',true)='aal2' $$;
    create table public.staff(staff_id uuid primary key,clinic_id uuid,auth_user_id uuid,role text,is_active boolean,name text,full_name text);
    create table public.owners(owner_id text,clinic_id uuid,auth_user_id uuid);
    create function private.myvet_is_clinic_staff(target uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.staff where auth_user_id=auth.uid() and clinic_id=target and is_active and (roles is null or role=any(roles)) and private.myvet_staff_mfa_satisfied(role)) $$;
    create function private.myvet_user_has_clinic_access(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.myvet_is_clinic_staff(target,null) or exists(select 1 from public.owners where auth_user_id=auth.uid() and clinic_id=target) $$;
    create table public.patients(pet_id bigint,owner_id text,clinic_id uuid);
    create table public.appointments(appointment_id bigint,clinic_id uuid,pet_id bigint,status text);
    create table public.medical_visits(visit_id bigint,clinic_id uuid,submitted_by uuid,submission_id uuid,submission_hash text,pet_id bigint,appointment_id bigint,visit_date timestamptz,vet_name text,reason text,diagnosis text,treatment text,notes text,visit_type text,urgency_level text,final_diagnosis text,follow_up_required boolean,follow_up_notes text,entry_data jsonb);
    create table public.vetbot_action_requests(action_request_id uuid primary key,actor_id uuid,actor_role text,clinic_id uuid,action_type text,payload jsonb,status text default 'pending',expires_at timestamptz default now()+interval '10 minutes',result jsonb,confirmed_at timestamptz,executed_at timestamptz,error_code text);
    create table public.inventory(item_id bigint generated always as identity primary key,clinic_id uuid default private.myvet_current_clinic_id(),item_name text,category text,stock_quantity bigint,low_stock_threshold int,price numeric);
    grant usage on schema public,auth,private to authenticated;
    insert into public.staff values ('${S}','${A}','${U}','vet',true,'Vet','Vet');
    insert into public.patients values (10,'OWNER','${A}');
    insert into public.medical_visits values (1,'${A}','${S}','${Q}',md5('${JSON.stringify(payload)}'::jsonb::text),10,null,now(),'Vet','private reason','private diagnosis','treatment',null,'note','normal',null,false,null,null);
  `);
  if (harden) await db.exec(migration);
  else await db.exec(extractFunction(oldMedical, "myvet_save_medical_entry"));
  await asUser(db, A, "aal2");
  return db;
}
async function asUser(db, clinic, aal) {
  await db.exec("reset role");
  await db.query("select set_config('test.user',$1,false),set_config('test.clinic',$2,false),set_config('test.aal',$3,false)",[U,clinic,aal]);
  await db.exec("set role authenticated");
}
async function request(db, clinic = A, role = "vet", kind = "create_inventory_item", extra = {}) {
  await db.exec("reset role");
  await db.query("insert into public.vetbot_action_requests(action_request_id,actor_id,actor_role,clinic_id,action_type,payload) values ($1,$2,$3,$4,$5,$6)",[Q,U,role,clinic,kind,JSON.stringify({item_name:"Shared name",category:"equipment",stock_quantity:1,low_stock_threshold:0,price:2,...extra})]);
  await db.exec("set role authenticated");
}
async function invoke(db, name = "myvet_execute_vetbot_inventory_create") {
  return (await db.query("select public."+name+"($1) as result",[Q])).rows[0].result;
}
async function replay(db) {
  return (await db.query("select public.myvet_save_medical_entry($1,$2) as result",[Q,JSON.stringify(payload)])).rows[0].result;
}
test("medical idempotent replay reproduces old AAL1 disclosure and rejects it after migration", async () => {
  const db = await database(false);
  try {
    await asUser(db,A,"aal1");
    assert.equal((await replay(db)).reason,"private reason");
    await db.exec("reset role"); await db.exec(migration);
    await asUser(db,A,"aal1");
    await assert.rejects(replay(db),/MFA_REQUIRED/);
    await asUser(db,A,"aal2");
    assert.equal((await replay(db)).idempotentReplay,true);
  } finally { await db.close(); }
});
test("inventory action cannot move to another active clinic after approval preview", async () => {
  const db = await database();
  try {
    await request(db);
    await asUser(db,B,"aal2");
    await assert.rejects(invoke(db),/ACTION_CLINIC_CHANGED/);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int n from public.inventory")).rows[0].n,0);
    assert.equal((await db.query("select status from public.vetbot_action_requests")).rows[0].status,"pending");
  } finally { await db.close(); }
});
test("inventory names are unique only within request clinic and insert carries its clinic", async () => {
  const db = await database();
  try {
    await db.exec("reset role");
    await db.query("insert into public.inventory(clinic_id,item_name) values ($1,'Shared name')",[B]);
    await db.exec("set role authenticated"); await request(db);
    assert.equal((await invoke(db)).ok,true);
    await db.exec("reset role");
    assert.deepEqual((await db.query("select clinic_id from public.inventory order by clinic_id")).rows.map(x=>x.clinic_id),[A,B]);
  } finally { await db.close(); }
});
test("inventory execution requires role and MFA in the request clinic", async () => {
  const db = await database();
  try {
    await request(db);
    await asUser(db,A,"aal1");
    await assert.rejects(invoke(db),/STAFF_REQUIRED/);
    await db.exec("reset role");
    await db.query("update public.staff set clinic_id=$1",[B]);
    await db.query("insert into public.owners values ('OWN',$1,$2)",[A,U]);
    await asUser(db,A,"aal2");
    await assert.rejects(invoke(db),/STAFF_REQUIRED/);
  } finally { await db.close(); }
});
test("legacy VetBot delegation uses request-clinic role and target scope", async () => {
  const db = await database();
  try {
    await db.exec("reset role");
    // Insert a different role first: global LIMIT 1 must not choose it.
    await db.query("update public.staff set clinic_id=$1,role='secretary'",[B]);
    await db.query("insert into public.staff values ('44444444-4444-4444-8444-444444444444',$1,$2,'vet',true,'Vet','Vet')",[A,U]);
    await db.query("insert into public.inventory(clinic_id,item_name,stock_quantity) values ($1,'Foreign',7)",[B]);
    await db.exec("set role authenticated");
    await request(db,A,"vet","adjust_inventory",{item_id:1,new_quantity:50});
    const result = await invoke(db,"myvet_execute_vetbot_action_v2");
    assert.equal(result.ok,false);
    assert.equal(result.error_code,"INVENTORY_ITEM_NOT_FOUND");
    await db.exec("reset role");
    assert.equal(Number((await db.query("select stock_quantity from public.inventory")).rows[0].stock_quantity),7);
  } finally { await db.close(); }
});
test("migration copies and exact role grants stay aligned", async () => {
  assert.equal(migration,readFileSync("tools/supabase-baseline/supabase/migrations/"+filename,"utf8"));
  const db=await database();
  try {
    const rows=(await db.query("select proname,has_function_privilege('anon',oid,'execute') anon_exec,has_function_privilege('authenticated',oid,'execute') auth_exec,has_function_privilege('service_role',oid,'execute') service_exec from pg_proc where proname in ('myvet_save_medical_entry','myvet_execute_vetbot_inventory_create','myvet_execute_vetbot_action_v2','myvet_execute_vetbot_action')")).rows;
    assert.equal(rows.length,4);
    for (const row of rows) {
      assert.equal(row.anon_exec,false);
      assert.equal(row.auth_exec,row.proname!=='myvet_execute_vetbot_action');
      assert.equal(row.service_exec,['myvet_execute_vetbot_inventory_create','myvet_execute_vetbot_action_v2'].includes(row.proname));
    }
  } finally { await db.close(); }
});

test("catalog audit fails on unexpected anonymous grants and missing allowed grants", async () => {
  const db = new PGlite();
  const audit = readFileSync('tools/supabase-baseline/verify/definer-grants.sql','utf8');
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema private;');
    const entries = [...audit.matchAll(/\('([^']+)', (true|false)\)/g)];
    assert.equal(entries.length,36);
    for (const [,signature,service] of entries) {
      await db.exec(`create function ${signature} returns boolean language sql security definer set search_path='' as $$select true$$; revoke all on function ${signature} from public; grant execute on function ${signature} to authenticated${service==='true'?',service_role':''};`);
    }
    await db.exec(audit);
    await db.exec("create function public.unexpected_anon() returns boolean language sql security definer set search_path='' as $$select true$$; revoke all on function public.unexpected_anon() from public; grant execute on function public.unexpected_anon() to anon;");
    await assert.rejects(db.exec(audit),/DEFINER_GRANTS_AUDIT_FAILED.*ANONYMOUS_GRANT/);
    await db.exec('drop function public.unexpected_anon(); revoke execute on function public.claim_owner_profile() from authenticated;');
    await assert.rejects(db.exec(audit),/DEFINER_GRANTS_AUDIT_FAILED.*MISSING_AUTHENTICATED_GRANT/);
  } finally { await db.close(); }
});
