import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationPaths = [
  "supabase/migrations/20260716213752_ai_tenant_foundation.sql",
  "supabase/migrations/20260716213800_ai_data_model.sql",
  "supabase/migrations/20260716213806_ai_rls_and_rpc_hardening.sql",
  "supabase/migrations/20260716213812_ai_storage_security.sql",
];

const rollbackPaths = [
  "supabase/rollback/stage2/01_quarantine_ai_data.sql",
  "supabase/rollback/stage2/02_remove_empty_ai_storage.sql",
  "supabase/rollback/stage2/03_remove_empty_ai_schema.sql",
];
const stage3MigrationPath = "supabase/migrations/20260717120000_visit_summary_workflow.sql";
const stage3RollbackPath = "supabase/rollback/stage3/01_remove_visit_summary_workflow.sql";
const stage4MigrationPath = "supabase/migrations/20260717150000_digitalcare_transcription_workflow.sql";
const stage4RollbackPaths = [
  "supabase/rollback/stage4/01_disable_digitalcare_ai.sql",
  "supabase/rollback/stage4/02_remove_empty_digitalcare_ai.sql",
];

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let dollarTag = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    current += char;

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (!quote && !dollarTag && char === "-" && next === "-") {
      current += next;
      index += 1;
      lineComment = true;
      continue;
    }
    if (!quote && !dollarTag && char === "/" && next === "*") {
      current += next;
      index += 1;
      blockComment = true;
      continue;
    }
    if (!quote && char === "$") {
      const match = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        if (!dollarTag) dollarTag = tag;
        else if (dollarTag === tag) dollarTag = null;
        current += tag.slice(1);
        index += tag.length - 1;
        continue;
      }
    }
    if (!dollarTag && (char === "'" || char === '"')) {
      if (!quote) quote = char;
      else if (quote === char && next === char) {
        current += next;
        index += 1;
      } else if (quote === char) quote = null;
      continue;
    }
    if (!quote && !dollarTag && char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const baseSchema = String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner uuid,
  owner_id text
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(object_name text)
returns text[] language sql immutable as $$
  select case
    when position('/' in object_name) = 0 then array[]::text[]
    else string_to_array(regexp_replace(object_name, '/[^/]+$', ''), '/')
  end
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

create table public.staff (
  staff_id uuid primary key default gen_random_uuid(), name text, role text,
  auth_user_id uuid, email text, full_name text, is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.owners (
  owner_id text primary key, created_at timestamptz not null default now(),
  owner_first_name text, owner_last_name text, phone text, email text, address text,
  auth_user_id uuid, terms_accepted_at timestamptz, terms_version text
);
create table public.patients (
  pet_id bigint generated always as identity primary key, created_at timestamptz not null default now(),
  pet_name text, species text, breed text, gender text, birth_date date, microchip text,
  allergies text, weight numeric not null default 1, owner_id text not null references public.owners(owner_id),
  neutered_status text not null default 'unknown'
);
create table public.appointments (
  appointment_id bigint generated always as identity primary key, pet_id bigint references public.patients(pet_id),
  start_time timestamptz, end_time timestamptz, department text, vet_name text, room text,
  appointment_type text, color text, notes text, appointment_mode text not null default 'clinic'
);
create table public.medical_visits (
  visit_id bigint generated always as identity primary key, appointment_id bigint references public.appointments(appointment_id),
  pet_id bigint references public.patients(pet_id), visit_date timestamptz, vet_name text,
  reason text, diagnosis text, treatment text, notes text, attachments text, visit_type text,
  urgency_level text not null default 'normal', chief_complaint text, final_diagnosis text,
  follow_up_required boolean not null default false, follow_up_notes text, entry_data jsonb
);
create table public.payments (
  payment_id bigint generated always as identity primary key, owner_id text not null references public.owners(owner_id),
  pet_id bigint, visit_id bigint, appointment_id bigint, amount numeric(10,2) not null,
  status text not null, payment_method text, paid_at timestamptz, due_date date, notes text,
  created_at timestamptz not null default now()
);
create table public.payment_items (
  payment_item_id bigint generated always as identity primary key, payment_id bigint not null,
  visit_id bigint, item_type text, item_name text, quantity numeric, unit_price numeric,
  discount numeric, total_price numeric, source_type text, source_id text, notes text,
  created_at timestamptz not null default now()
);
create table public.payment_transactions (
  transaction_id bigint generated always as identity primary key, payment_id bigint not null,
  owner_id text not null, amount numeric(12,2) not null, payment_method text not null,
  tendered_amount numeric(12,2), change_amount numeric(12,2) not null, source text not null,
  processed_by uuid not null, created_at timestamptz not null default now()
);
create table public.physical_exams (
  physical_exam_id bigint generated always as identity primary key, visit_id bigint, pet_id bigint not null,
  exam_date timestamptz not null default now(), findings text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.medical_problems (
  problem_id bigint generated always as identity primary key, visit_id bigint, pet_id bigint not null,
  problem_text text not null default '', severity text not null default 'normal', status text not null default 'active',
  notes text, created_at timestamptz not null default now()
);
create table public.differential_diagnoses (
  diagnosis_id bigint generated always as identity primary key, visit_id bigint, pet_id bigint not null,
  diagnosis_text text not null default '', likelihood text not null default 'unknown', notes text,
  created_at timestamptz not null default now()
);
create table public.prescriptions (
  prescription_id bigint generated always as identity primary key, visit_id bigint, pet_id bigint,
  medication text, dosage text, frequency text, duration text, start_date date, prescribed_by uuid
);
create table public.vaccinations (
  vaccination_id uuid primary key default gen_random_uuid(), pet_id bigint not null, owner_id text,
  visit_id bigint, vaccine_name text not null default '', vaccine_type text, manufacturer text,
  batch_number text, barcode_value text, given_date date not null default current_date,
  next_due_date date, expiry_date date, administered_by text, entry_method text not null default 'manual',
  sticker_image_path text, sticker_image_url text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.documents (
  document_id bigint generated always as identity primary key, owner_id text, pet_id bigint, visit_id bigint,
  file_name text not null default '', file_path text not null, file_url text, mime_type text, file_size bigint,
  category text not null default 'other', uploaded_by uuid, uploaded_by_role text, notes text,
  uploaded_at timestamptz not null default now()
);
create table public.lab_orders (
  lab_order_id bigint generated always as identity primary key, pet_id bigint, test_name text, category text,
  status text, ordered_date timestamptz, ordered_by uuid, results text, normal_range text,
  result_value text, result_status text, completed_date timestamptz, notes text, is_urgent boolean,
  test_date date, visit_id bigint
);
create table public.hospitalizations (
  hospitalization_id bigint generated always as identity primary key, pet_id bigint not null, owner_id text,
  visit_id bigint, department text, cage_or_room text, reason text, status text, severity text,
  admitted_at timestamptz, expected_discharge_at timestamptz, discharged_at timestamptz,
  vet_name text, discharge_summary text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.conversations (
  conversation_id bigint generated always as identity primary key, owner_id text not null, pet_id bigint,
  assigned_staff_id uuid, subject text, status text, priority text, last_message_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), closed_at timestamptz
);
create table public.messages (
  message_id bigint generated always as identity primary key, conversation_id bigint not null,
  sender_type text, sender_owner_id text, sender_staff_id uuid, sender_name text, message_text text,
  message_type text, is_read_by_owner boolean, is_read_by_staff boolean, created_at timestamptz not null default now()
);
create table public.message_attachments (
  attachment_id bigint generated always as identity primary key, message_id bigint, conversation_id bigint not null,
  owner_id text, pet_id bigint, file_name text, file_path text not null, file_url text, mime_type text,
  file_size bigint, uploaded_by_type text, uploaded_at timestamptz not null default now()
);
create table public.video_sessions (
  session_id bigint generated always as identity primary key, conversation_id bigint, owner_id text,
  pet_id bigint, staff_id uuid, meeting_url text, status text, scheduled_at timestamptz,
  started_at timestamptz, ended_at timestamptz, notes text, created_at timestamptz not null default now()
);
create table public.notifications (
  notification_id bigint generated always as identity primary key, owner_id text, pet_id bigint,
  title text, message text, type text, target text, is_read boolean, action_url text,
  created_at timestamptz not null default now(), read_at timestamptz, created_by_role text,
  event_type text, source_type text, source_id text, metadata jsonb not null default '{}'::jsonb
);
create table public.reminders (
  reminder_id bigint generated always as identity primary key, owner_id text, pet_id bigint,
  appointment_id bigint, visit_id bigint, title text, message text, reminder_type text,
  due_at timestamptz, status text, created_at timestamptz not null default now(), completed_at timestamptz,
  notes text, action_url text, is_read boolean, read_at timestamptz, source_type text,
  source_id text, metadata jsonb not null default '{}'::jsonb
);
create table public.inventory (
  item_id bigint generated always as identity primary key, item_name text, category text,
  stock_quantity bigint, price numeric, low_stock_threshold integer not null default 0
);
create table public.service_catalog (
  service_id bigint generated always as identity primary key, service_code text, service_name text,
  category text, default_price numeric, is_active boolean,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clinic_booking_hours (
  weekday smallint primary key, is_open boolean not null default true,
  opens_at time not null default '08:00', closes_at time not null default '17:00',
  slot_minutes smallint not null default 30, max_bookings smallint not null default 1,
  updated_at timestamptz not null default now(), updated_by uuid
);
create table public.clinic_booking_blocks (
  block_id bigint generated always as identity primary key, block_date date not null,
  is_all_day boolean not null default false, starts_at time, ends_at time, reason text,
  created_at timestamptz not null default now(), created_by uuid
);
create table public.insights (
  insight_id bigint generated always as identity primary key, title text, description text, category text,
  severity text, status text, impact text, recommended_action text, action_label text, action_url text,
  related_owner_id text, related_pet_id bigint, related_payment_id bigint, related_lab_order_id bigint,
  related_appointment_id bigint, created_at timestamptz not null default now(), resolved_at timestamptz, notes text
);
create table public.vetbot_action_requests (
  action_request_id uuid primary key default gen_random_uuid(), actor_id uuid not null, actor_role text,
  action_type text, payload jsonb not null default '{}'::jsonb, preview jsonb not null default '{}'::jsonb,
  status text, result jsonb, error_code text, created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes', confirmed_at timestamptz, executed_at timestamptz
);
create table public.vetbot_audit_logs (
  audit_id bigint generated always as identity primary key, actor_id uuid not null, actor_role text,
  mode text, tool_names text[] not null default '{}', redaction_categories text[] not null default '{}',
  redaction_count integer not null default 0, outcome text, provider text, model_name text,
  notice_version text, error_code text, created_at timestamptz not null default now()
);
create table public.vetbot_feedback (
  feedback_id bigint generated always as identity primary key, actor_id uuid not null, mode text,
  helpful boolean, used_tools text[] not null default '{}', notice_version text,
  created_at timestamptz not null default now()
);
create table public.vetbot_knowledge (
  knowledge_id bigint generated always as identity primary key, slug text, title text, content text,
  source_label text, is_active boolean not null default true, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public) values
  ('documents', 'documents', false), ('chat-attachments', 'chat-attachments', false);

do $$ declare table_row record; begin
  for table_row in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', table_row.tablename);
    execute format('grant all privileges on table public.%I to anon, authenticated, service_role', table_row.tablename);
  end loop;
end $$;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

create policy legacy_global_staff on public.appointments for all to authenticated using (true) with check (true);
create policy legacy_anon_insights on public.insights for all to anon using (true) with check (true);
create policy legacy_public_patients on public.patients for select to public using (true);

create or replace function public.myvet_execute_vetbot_action(uuid)
returns jsonb language sql security definer set search_path='' as $$ select '{}'::jsonb $$;
`;

const ids = {
  adminA: "10000000-0000-4000-8000-000000000001",
  adminB: "10000000-0000-4000-8000-000000000002",
  vetA: "10000000-0000-4000-8000-000000000003",
  nurseA: "10000000-0000-4000-8000-000000000004",
  ownerA: "10000000-0000-4000-8000-000000000005",
  ownerB: "10000000-0000-4000-8000-000000000006",
};

async function createDatabase() {
  const db = new PGlite();
  await db.exec(baseSchema);
  for (const path of migrationPaths) {
    await applySqlFile(db, path);
  }
  return db;
}

async function applySqlFile(db, path) {
  const statements = splitSqlStatements(readFileSync(path, "utf8"));
  for (const [index, statement] of statements.entries()) {
    try {
      await db.exec(statement);
    } catch (error) {
      const preview = statement.replace(/\s+/g, " ").slice(0, 180);
      error.message = `${path} statement ${index + 1} (${preview}): ${error.message}`;
      throw error;
    }
  }
}

async function setIdentity(db, userId, role = "authenticated") {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`);
  if (userId) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
  }
  await db.exec(`set role ${role};`);
}

async function resetIdentity(db) {
  await db.exec("reset role;");
}

async function seedTwoClinics(db) {
  const bootstrap = await db.query("select clinic_id from public.clinics where slug='myvet-primary'");
  const clinicA = bootstrap.rows[0].clinic_id;
  const second = await db.query(
    "insert into public.clinics(slug,display_name) values ('stage2-b','Stage 2 B') returning clinic_id",
  );
  const clinicB = second.rows[0].clinic_id;

  await db.query("insert into auth.users(id) select unnest($1::uuid[])", [Object.values(ids)]);
  const staff = await db.query(
    `insert into public.staff(clinic_id,auth_user_id,role,is_active,name) values
      ($1,$3,'clinic_admin',true,'Admin A'), ($2,$4,'clinic_admin',true,'Admin B'),
      ($1,$5,'vet',true,'Vet A'), ($1,$6,'nurse',true,'Nurse A')
     returning staff_id,auth_user_id`,
    [clinicA, clinicB, ids.adminA, ids.adminB, ids.vetA, ids.nurseA],
  );
  const staffByUser = Object.fromEntries(staff.rows.map((row) => [row.auth_user_id, row.staff_id]));

  await db.query(
    `insert into public.owners(clinic_id,owner_id,auth_user_id,email) values
      ($1,'OWNER-A',$3,'owner-a@example.invalid'), ($2,'OWNER-B',$4,'owner-b@example.invalid')`,
    [clinicA, clinicB, ids.ownerA, ids.ownerB],
  );
  const petA = await db.query(
    "insert into public.patients(clinic_id,owner_id,pet_name,weight) values ($1,'OWNER-A','Pet A',1) returning pet_id",
    [clinicA],
  );
  const petB = await db.query(
    "insert into public.patients(clinic_id,owner_id,pet_name,weight) values ($1,'OWNER-B','Pet B',1) returning pet_id",
    [clinicB],
  );
  const visitA = await db.query(
    "insert into public.medical_visits(clinic_id,pet_id,visit_date,vet_name,reason) values ($1,$2,now(),'Vet A','Follow-up') returning visit_id",
    [clinicA, petA.rows[0].pet_id],
  );
  const visitB = await db.query(
    "insert into public.medical_visits(clinic_id,pet_id,visit_date,vet_name,reason) values ($1,$2,now(),'Vet B','Follow-up') returning visit_id",
    [clinicB, petB.rows[0].pet_id],
  );
  const opA = await db.query(
    `insert into public.ai_operations(clinic_id,capability,actor_user_id,actor_staff_id,owner_id,pet_id,status)
     values ($1,'visit_summary',$2,$3,'OWNER-A',$4,'succeeded') returning operation_id`,
    [clinicA, ids.vetA, staffByUser[ids.vetA], petA.rows[0].pet_id],
  );
  await db.query(
    `insert into public.ai_operations(clinic_id,capability,actor_user_id,owner_id,pet_id,status)
     values ($1,'visit_summary',$2,'OWNER-B',$3,'succeeded')`,
    [clinicB, ids.adminB, petB.rows[0].pet_id],
  );
  await db.query(
    `insert into public.ai_artifacts(
       clinic_id,operation_id,owner_id,pet_id,artifact_type,status,content,approved_by,approved_at,released_to_owner,released_at
     ) values ($1,$2,'OWNER-A',$3,'visit_summary','approved','{"summary":"approved"}'::jsonb,$4,now(),true,now())`,
    [clinicA, opA.rows[0].operation_id, petA.rows[0].pet_id, staffByUser[ids.vetA]],
  );
  await db.query(
    `insert into public.ai_artifacts(clinic_id,operation_id,owner_id,pet_id,artifact_type,status,content,created_by)
     values ($1,$2,'OWNER-A',$3,'visit_summary','draft','{"summary":"draft"}'::jsonb,$4)`,
    [clinicA, opA.rows[0].operation_id, petA.rows[0].pet_id, ids.vetA],
  );
  await db.query(
    `insert into public.ai_audit_events(clinic_id,actor_user_id,operation_id,capability,event_type,outcome)
     values ($1,$2,$3,'visit_summary','draft_created','success')`,
    [clinicA, ids.vetA, opA.rows[0].operation_id],
  );

  return {
    clinicA, clinicB,
    petA: petA.rows[0].pet_id,
    petB: petB.rows[0].pet_id,
    visitA: visitA.rows[0].visit_id,
    visitB: visitB.rows[0].visit_id,
    vetStaffA: staffByUser[ids.vetA],
    nurseStaffA: staffByUser[ids.nurseA],
    operationA: opA.rows[0].operation_id,
  };
}

test("Stage 2 migrations execute in order and every new sensitive table has FORCE RLS", async () => {
  const db = await createDatabase();
  try {
    const tables = await db.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname like 'ai_%' and c.relkind='r'
      order by c.relname
    `);
    assert.equal(tables.rows.length, 11);
    for (const row of tables.rows) {
      assert.equal(row.relrowsecurity, true, `${row.relname} must have RLS`);
      assert.equal(row.relforcerowsecurity, true, `${row.relname} must force RLS`);
    }

    const broad = await db.query(`
      select schemaname,tablename,policyname from pg_policies
      where (schemaname='public' or schemaname='storage')
        and (coalesce(qual,'') ~* '^\\s*\\(?true\\)?\\s*$'
          or coalesce(with_check,'') ~* '^\\s*\\(?true\\)?\\s*$')
    `);
    assert.deepEqual(broad.rows, []);
  } finally {
    await db.close();
  }
});

test("tenant, owner, veterinary approval and Storage boundaries are enforced by PostgreSQL", async () => {
  const db = await createDatabase();
  try {
    const seeded = await seedTwoClinics(db);

    await setIdentity(db, ids.adminA);
    const adminAOps = await db.query("select clinic_id from public.ai_operations order by created_at");
    assert.equal(adminAOps.rows.length, 1);
    assert.equal(adminAOps.rows[0].clinic_id, seeded.clinicA);
    await assert.rejects(
      db.query("insert into public.patients(clinic_id,owner_id,pet_name,weight) values ($1,'OWNER-B','Tampered',1)", [seeded.clinicB]),
    );
    await resetIdentity(db);

    await setIdentity(db, ids.ownerA);
    const ownerPets = await db.query("select pet_id from public.patients");
    assert.deepEqual(ownerPets.rows.map((row) => Number(row.pet_id)), [Number(seeded.petA)]);
    const ownerArtifacts = await db.query("select status,content from public.ai_artifacts");
    assert.equal(ownerArtifacts.rows.length, 1);
    assert.equal(ownerArtifacts.rows[0].status, "approved");
    assert.equal(ownerArtifacts.rows[0].content.summary, "approved");
    assert.equal((await db.query("select * from public.ai_audit_events")).rows.length, 0);
    assert.equal((await db.query("select * from public.ai_document_chunks")).rows.length, 0);
    assert.equal((await db.query("select * from storage.objects where bucket_id='ai-medical-documents'")).rows.length, 0);
    await resetIdentity(db);

    await setIdentity(db, ids.nurseA);
    assert.equal((await db.query("select * from public.ai_artifacts")).rows.length, 0);
    await assert.rejects(
      db.query(
        `insert into public.ai_operations(clinic_id,capability,status) values ($1,'visit_summary','queued')`,
        [seeded.clinicA],
      ),
    );
    await resetIdentity(db);

    await assert.rejects(
      db.query(
        `insert into public.ai_artifacts(
           clinic_id,operation_id,owner_id,pet_id,artifact_type,status,content,approved_by,approved_at
         ) values ($1,$2,'OWNER-A',$3,'visit_summary','approved','{}'::jsonb,$4,now())`,
        [seeded.clinicA, seeded.operationA, seeded.petA, seeded.nurseStaffA],
      ),
      /AI_APPROVAL_REQUIRES_VETERINARIAN/,
    );
    await assert.rejects(
      db.query(
        `insert into public.ai_operations(clinic_id,capability,owner_id,pet_id,status)
         values ($1,'record_qa','OWNER-A',$2,'queued')`,
        [seeded.clinicA, seeded.petB],
      ),
      /AI_SCOPE_PET_MISMATCH/,
    );

    await setIdentity(db, ids.vetA);
    const safePath = `${seeded.clinicA}/${seeded.petA}/documents/synthetic.pdf`;
    await db.query(
      "insert into storage.objects(bucket_id,name,owner) values ('ai-medical-documents',$1,$2)",
      [safePath, ids.vetA],
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name,owner) values ('ai-medical-documents',$1,$2)",
        [`${seeded.clinicB}/${seeded.petB}/documents/guessed.pdf`, ids.vetA],
      ),
    );
    await resetIdentity(db);

    await setIdentity(db, ids.adminB);
    assert.equal((await db.query("select * from storage.objects where name=$1", [safePath])).rows.length, 0);
    await resetIdentity(db);

    await setIdentity(db, null, "anon");
    await assert.rejects(db.query("select * from public.ai_artifacts"));
    await assert.rejects(db.query("select public.claim_owner_profile()"));
    await resetIdentity(db);
  } finally {
    await db.close();
  }
});

test("empty Stage 2 AI schema and buckets can be rolled back without restoring unsafe policies", async () => {
  const db = await createDatabase();
  try {
    for (const path of rollbackPaths) await db.exec(readFileSync(path, "utf8"));
    assert.equal((await db.query("select to_regclass('public.ai_operations') as value")).rows[0].value, null);
    assert.equal((await db.query("select count(*)::int as count from storage.buckets where id like 'ai-%'")).rows[0].count, 0);
    const compatibilityColumns = await db.query(`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='vetbot_audit_logs'
        and column_name in ('request_id','prompt_version','schema_version','latency_ms','input_tokens','output_tokens')
    `);
    assert.deepEqual(compatibilityColumns.rows, []);
    const unsafe = await db.query(`
      select 1 from pg_policies
      where (schemaname='public' or schemaname='storage')
        and ('anon'=any(roles) or 'public'=any(roles))
    `);
    assert.deepEqual(unsafe.rows, []);
  } finally {
    await db.close();
  }
});

test("Stage 3 visit-summary workflow keeps drafts separate and requires a veterinarian to approve", async () => {
  const db = await createDatabase();
  try {
    await applySqlFile(db, stage3MigrationPath);
    const seed = await seedTwoClinics(db);
    const summary = {
      chief_complaint: "בדיקת מעקב",
      symptoms: ["ירידה בתיאבון"],
      relevant_history: [],
      examination_findings: ["ממצא שתועד בבדיקה"],
      tests: [],
      clinical_assessment: "לא צוין",
      treatments: [],
      medications: [],
      follow_up: ["מעקב לפי הרשומה"],
      warnings: [],
      unresolved_items: ["אבחנה סופית לא צוינה"],
      source_references: ["medical_visit", "physical_exam"],
    };

    await assert.rejects(
      db.query(
        `select * from public.myvet_create_visit_summary_draft(
          $1,$2,'{}'::jsonb,$3,'test-provider','test-model','2026-07-17.1',25,10,20
        )`,
        [ids.vetA, seed.visitA, crypto.randomUUID()],
      ),
      /VISIT_SUMMARY_INPUT_INVALID/,
    );
    await assert.rejects(
      db.query(
        `select * from public.myvet_create_visit_summary_draft(
          $1,$2,$3::jsonb,$4,'test-provider','test-model','2026-07-17.1',25,10,20
        )`,
        [ids.vetA, seed.visitB, JSON.stringify(summary), crypto.randomUUID()],
      ),
      /VISIT_SUMMARY_ACCESS_DENIED/,
    );

    const draft = await db.query(
      `select * from public.myvet_create_visit_summary_draft(
        $1,$2,$3::jsonb,$4,'test-provider','test-model','2026-07-17.1',25,10,20
      )`,
      [ids.vetA, seed.visitA, JSON.stringify(summary), crypto.randomUUID()],
    );
    assert.equal(draft.rows[0].status, "draft");
    const draftId = draft.rows[0].artifact_id;

    const medicalBefore = await db.query("select notes,diagnosis,treatment from public.medical_visits where visit_id=$1", [seed.visitA]);
    assert.deepEqual(medicalBefore.rows[0], { notes: null, diagnosis: null, treatment: null });

    await setIdentity(db, ids.ownerA);
    assert.equal((await db.query("select count(*)::int as count from public.ai_artifacts where visit_id=$1", [seed.visitA])).rows[0].count, 0);
    await resetIdentity(db);

    await setIdentity(db, ids.nurseA);
    await assert.rejects(
      db.query("select * from public.myvet_transition_visit_summary($1,'approve',$2::jsonb,null)", [draftId, JSON.stringify(summary)]),
      /VISIT_SUMMARY_ACCESS_DENIED/,
    );
    await resetIdentity(db);

    await setIdentity(db, ids.vetA);
    const editedSummary = { ...summary, unresolved_items: [] };
    const edited = await db.query(
      "select * from public.myvet_transition_visit_summary($1,'save',$2::jsonb,null)",
      [draftId, JSON.stringify(editedSummary)],
    );
    assert.equal(edited.rows[0].status, "edited");
    const approved = await db.query(
      "select * from public.myvet_transition_visit_summary($1,'approve',$2::jsonb,null)",
      [edited.rows[0].artifact_id, JSON.stringify(editedSummary)],
    );
    assert.equal(approved.rows[0].status, "approved");
    assert.equal(approved.rows[0].version_number, 3);
    await assert.rejects(
      db.query("select * from public.myvet_transition_visit_summary($1,'approve',$2::jsonb,null)", [edited.rows[0].artifact_id, JSON.stringify(editedSummary)]),
      /VISIT_SUMMARY_NOT_EDITABLE|VISIT_SUMMARY_VERSION_CONFLICT/,
    );
    await resetIdentity(db);

    const medicalAfter = await db.query("select notes,diagnosis,treatment from public.medical_visits where visit_id=$1", [seed.visitA]);
    assert.deepEqual(medicalAfter.rows[0], medicalBefore.rows[0]);
    const versions = await db.query(
      "select status,version_number from public.ai_artifacts where visit_id=$1 order by version_number",
      [seed.visitA],
    );
    assert.deepEqual(versions.rows, [
      { status: "superseded", version_number: 1 },
      { status: "superseded", version_number: 2 },
      { status: "approved", version_number: 3 },
    ]);

    const rejectedVisit = await db.query(
      "insert into public.medical_visits(clinic_id,pet_id,visit_date,vet_name,reason) values ($1,$2,now(),'Vet A','Second visit') returning visit_id",
      [seed.clinicA, seed.petA],
    );
    const rejectedDraft = await db.query(
      `select * from public.myvet_create_visit_summary_draft(
        $1,$2,$3::jsonb,$4,'test-provider','test-model','2026-07-17.1',25,10,20
      )`,
      [ids.vetA, rejectedVisit.rows[0].visit_id, JSON.stringify(summary), crypto.randomUUID()],
    );
    await setIdentity(db, ids.vetA);
    const rejected = await db.query(
      "select * from public.myvet_transition_visit_summary($1,'reject',null,'Requires correction')",
      [rejectedDraft.rows[0].artifact_id],
    );
    assert.equal(rejected.rows[0].status, "rejected");
    await resetIdentity(db);
    const rejectionHistory = await db.query(
      "select change_summary->>'rejection_reason' as reason from public.ai_approval_history where artifact_id=$1",
      [rejected.rows[0].artifact_id],
    );
    assert.equal(rejectionHistory.rows[0].reason, "Requires correction");

    await db.query("insert into public.ai_feature_flags(clinic_id,capability,enabled,kill_switch) values ($1,'visit_summary',false,false)", [seed.clinicA]);
    const disabledVisit = await db.query(
      "insert into public.medical_visits(clinic_id,pet_id,visit_date,vet_name,reason) values ($1,$2,now(),'Vet A','Disabled visit') returning visit_id",
      [seed.clinicA, seed.petA],
    );
    await assert.rejects(
      db.query(
        `select * from public.myvet_create_visit_summary_draft(
          $1,$2,$3::jsonb,$4,'test-provider','test-model','2026-07-17.1',25,10,20
        )`,
        [ids.vetA, disabledVisit.rows[0].visit_id, JSON.stringify(summary), crypto.randomUUID()],
      ),
      /AI_FEATURE_DISABLED/,
    );
  } finally {
    await db.close();
  }
});

test("Stage 3 workflow rollback removes capabilities without deleting protected artifacts", async () => {
  const db = await createDatabase();
  try {
    await applySqlFile(db, stage3MigrationPath);
    await applySqlFile(db, stage3RollbackPath);
    assert.equal((await db.query("select to_regprocedure('public.myvet_transition_visit_summary(uuid,text,jsonb,text)') as value")).rows[0].value, null);
    assert.equal((await db.query("select to_regprocedure('public.myvet_create_visit_summary_draft(uuid,bigint,jsonb,uuid,text,text,text,integer,integer,integer)') as value")).rows[0].value, null);
    assert.notEqual((await db.query("select to_regclass('public.ai_artifacts') as value")).rows[0].value, null);
  } finally {
    await db.close();
  }
});

test("Stage 4 DigitalCare requires consent, isolates tenants and keeps AI output behind veterinarian approval", async () => {
  const db = await createDatabase();
  try {
    await applySqlFile(db, stage3MigrationPath);
    await applySqlFile(db, stage4MigrationPath);
    const seed = await seedTwoClinics(db);
    const appointmentA = await db.query(
      "insert into public.appointments(clinic_id,pet_id,start_time,end_time,appointment_mode,appointment_type) values ($1,$2,now(),now()+interval '30 minutes','video','DigitalCare') returning appointment_id",
      [seed.clinicA, seed.petA],
    );
    const appointmentB = await db.query(
      "insert into public.appointments(clinic_id,pet_id,start_time,end_time,appointment_mode,appointment_type) values ($1,$2,now(),now()+interval '30 minutes','video','DigitalCare') returning appointment_id",
      [seed.clinicB, seed.petB],
    );
    const conversationA = await db.query(
      "insert into public.conversations(clinic_id,owner_id,pet_id,subject,status,priority) values ($1,'OWNER-A',$2,'Consultation','open','normal') returning conversation_id",
      [seed.clinicA, seed.petA],
    );
    const sessionA = await db.query(
      `insert into public.video_sessions(clinic_id,conversation_id,owner_id,pet_id,staff_id,meeting_url,status)
       values ($1,$2,'OWNER-A',$3,$4,'https://meet.google.com/test','active') returning session_id`,
      [seed.clinicA, conversationA.rows[0].conversation_id, seed.petA, seed.vetStaffA],
    );
    await db.query(
      `update public.ai_feature_flags set enabled=true,kill_switch=false
       where clinic_id=$1 and capability in ('digitalcare_transcription','digitalcare_recording','digitalcare_summary')`,
      [seed.clinicA],
    );
    await db.query(
      `insert into public.ai_feature_flags(clinic_id,capability,enabled,kill_switch)
       values ($1,'visit_summary',true,false) on conflict (clinic_id,capability) do update set enabled=true,kill_switch=false`,
      [seed.clinicA],
    );
    const objectPath = `${seed.clinicA}/${seed.petA}/digitalcare/${sessionA.rows[0].session_id}/${crypto.randomUUID()}.webm`;
    const beginArgs = [ids.vetA, sessionA.rows[0].session_id, appointmentA.rows[0].appointment_id,
      "digitalcare-consent-he-2026-07-17.1", true, false, false, objectPath, "audio/webm", 1];

    await assert.rejects(
      db.query("select * from public.myvet_begin_digitalcare_capture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [...beginArgs.slice(0, 4), false, ...beginArgs.slice(5)]),
      /DIGITALCARE_CONSENT_REQUIRED/,
    );
    await assert.rejects(
      db.query("select * from public.myvet_begin_digitalcare_capture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [ids.nurseA, ...beginArgs.slice(1)]),
      /DIGITALCARE_ACCESS_DENIED/,
    );
    await assert.rejects(
      db.query("select * from public.myvet_begin_digitalcare_capture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [ids.vetA, sessionA.rows[0].session_id, appointmentB.rows[0].appointment_id, ...beginArgs.slice(3)]),
      /DIGITALCARE_ACCESS_DENIED/,
    );

    const started = await db.query(
      "select * from public.myvet_begin_digitalcare_capture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", beginArgs,
    );
    assert.equal(started.rows.length, 1);
    assert.equal(started.rows[0].owner_id, "OWNER-A");
    const repeated = await db.query(
      "select * from public.myvet_begin_digitalcare_capture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", beginArgs,
    );
    assert.equal(repeated.rows[0].recording_document_id, started.rows[0].recording_document_id);
    assert.equal((await db.query("select count(*)::int as count from public.ai_documents where appointment_id=$1", [appointmentA.rows[0].appointment_id])).rows[0].count, 1);

    const transcript = await db.query(
      `select * from public.myvet_complete_digitalcare_transcript(
        $1,$2,'Automatic consultation transcript','he',$3,'test-provider','test-model',25,10,20
      )`,
      [ids.vetA, sessionA.rows[0].session_id, crypto.randomUUID()],
    );
    assert.equal(transcript.rows[0].status, "draft");

    await setIdentity(db, ids.ownerA);
    assert.equal((await db.query("select count(*)::int as count from public.ai_artifacts where artifact_type='transcript'")).rows[0].count, 0);
    await resetIdentity(db);
    await setIdentity(db, ids.adminB);
    assert.equal((await db.query("select count(*)::int as count from public.ai_consent_records where video_session_id=$1", [sessionA.rows[0].session_id])).rows[0].count, 0);
    await resetIdentity(db);

    await setIdentity(db, null, "service_role");

    const visit = await db.query("select public.myvet_ensure_digitalcare_visit($1,$2) as visit_id", [ids.vetA, sessionA.rows[0].session_id]);
    const summary = {
      chief_complaint: "DigitalCare consultation", symptoms: [], relevant_history: [],
      examination_findings: [], tests: [], clinical_assessment: "Not stated",
      treatments: [], medications: [], follow_up: [], warnings: [],
      unresolved_items: ["Veterinarian review required"], source_references: ["digitalcare_transcript"],
    };
    const draft = await db.query(
      `select * from public.myvet_create_visit_summary_draft(
        $1,$2,$3::jsonb,$4,'test-provider','test-model','2026-07-17.1',25,10,20
      )`,
      [ids.vetA, visit.rows[0].visit_id, JSON.stringify(summary), crypto.randomUUID()],
    );
    await db.query("select public.myvet_link_digitalcare_summary_source($1,$2,$3)", [ids.vetA, sessionA.rows[0].session_id, draft.rows[0].artifact_id]);
    const shell = await db.query("select treatment,entry_data->>'aiContentApproved' as approved from public.medical_visits where visit_id=$1", [visit.rows[0].visit_id]);
    assert.equal(shell.rows[0].treatment, null);
    assert.equal(shell.rows[0].approved, "false");

    await setIdentity(db, ids.nurseA);
    await assert.rejects(
      db.query("select * from public.myvet_transition_visit_summary($1,'approve',$2::jsonb,null)", [draft.rows[0].artifact_id, JSON.stringify(summary)]),
      /VISIT_SUMMARY_ACCESS_DENIED/,
    );
    await resetIdentity(db);
    await setIdentity(db, ids.vetA);
    const approved = await db.query("select * from public.myvet_transition_visit_summary($1,'approve',$2::jsonb,null)", [draft.rows[0].artifact_id, JSON.stringify(summary)]);
    assert.equal(approved.rows[0].status, "approved");
    await resetIdentity(db);
    const official = await db.query("select entry_data->>'aiContentApproved' as approved from public.medical_visits where visit_id=$1", [visit.rows[0].visit_id]);
    assert.equal(official.rows[0].approved, "true");
    assert.equal((await db.query("select count(*)::int as count from public.ai_sources where artifact_id=$1 and source_type='digitalcare'", [approved.rows[0].artifact_id])).rows[0].count, 1);
  } finally {
    await db.close();
  }
});

test("Stage 4 empty Preview rollback restores the Stage 3 surface", async () => {
  const db = await createDatabase();
  try {
    await applySqlFile(db, stage3MigrationPath);
    await applySqlFile(db, stage4MigrationPath);
    for (const path of stage4RollbackPaths) await applySqlFile(db, path);
    assert.equal((await db.query("select to_regprocedure('public.myvet_begin_digitalcare_capture(uuid,bigint,bigint,text,boolean,boolean,boolean,text,text,bigint)') as value")).rows[0].value, null);
    assert.equal((await db.query("select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='video_sessions' and column_name='transcription_status'")).rows[0].count, 0);
    assert.equal((await db.query("select count(*)::int as count from public.ai_feature_flags where capability in ('digitalcare_transcription','digitalcare_recording','digitalcare_summary')")).rows[0].count, 0);
    const stage4OnlySummary = {
      chief_complaint: "x", symptoms: [], relevant_history: [], examination_findings: [],
      tests: [], clinical_assessment: "x", treatments: [], medications: [],
      follow_up: [], warnings: [], unresolved_items: [], source_references: ["digitalcare_transcript"],
    };
    assert.equal((await db.query("select private.myvet_is_valid_visit_summary($1::jsonb) as valid", [JSON.stringify(stage4OnlySummary)])).rows[0].valid, false);
  } finally {
    await db.close();
  }
});
