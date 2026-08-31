import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20260826143000_atomic_medical_visit_save.sql",
  "utf8",
);
const previewBaseline = readFileSync(
  "tests/fixtures/previewMedicalVisitBaseline.sql",
  "utf8",
);
const previewAcceptance = readFileSync(
  "tests/fixtures/previewMedicalVisitAcceptance.sql",
  "utf8",
);

const clinicA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const clinicB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const vetA = "11111111-1111-4111-8111-111111111111";
const vetB = "22222222-2222-4222-8222-222222222222";
const secretaryA = "33333333-3333-4333-8333-333333333333";

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table public.clinics (clinic_id uuid primary key);
    create table public.staff (
      staff_id uuid primary key,
      clinic_id uuid not null references public.clinics,
      auth_user_id uuid not null unique,
      role text not null,
      is_active boolean not null default true,
      name text,
      full_name text
    );
    create table public.owners (
      owner_id text primary key,
      clinic_id uuid not null references public.clinics
    );
    create table public.patients (
      pet_id bigint primary key,
      clinic_id uuid not null references public.clinics,
      owner_id text not null references public.owners,
      weight numeric not null default 1,
      unique (clinic_id, pet_id)
    );
    create table public.appointments (
      appointment_id bigint generated always as identity primary key,
      clinic_id uuid not null references public.clinics,
      pet_id bigint not null,
      status text not null default 'scheduled',
      foreign key (clinic_id, pet_id) references public.patients(clinic_id, pet_id)
    );
    create table public.medical_visits (
      visit_id bigint generated always as identity primary key,
      appointment_id bigint references public.appointments,
      pet_id bigint references public.patients,
      visit_date timestamptz,
      vet_name text,
      reason text,
      diagnosis text,
      treatment text,
      notes text,
      attachments text,
      visit_type text,
      urgency_level text not null default 'normal',
      chief_complaint text,
      final_diagnosis text,
      follow_up_required boolean not null default false,
      follow_up_notes text,
      entry_data jsonb,
      clinic_id uuid not null references public.clinics
    );
    create table public.vaccinations (
      vaccination_id bigint generated always as identity primary key,
      pet_id bigint not null references public.patients,
      owner_id text references public.owners,
      visit_id bigint references public.medical_visits,
      vaccine_name text not null,
      given_date date not null,
      next_due_date date,
      administered_by text,
      entry_method text not null,
      notes text,
      clinic_id uuid not null references public.clinics
    );
    create table public.physical_exams (
      physical_exam_id bigint generated always as identity primary key,
      visit_id bigint references public.medical_visits,
      pet_id bigint not null references public.patients,
      exam_date timestamptz not null,
      findings text not null,
      clinic_id uuid not null references public.clinics
    );
    create table public.medical_problems (
      problem_id bigint generated always as identity primary key,
      visit_id bigint references public.medical_visits,
      pet_id bigint not null references public.patients,
      problem_text text not null,
      severity text not null,
      status text not null,
      notes text,
      clinic_id uuid not null references public.clinics
    );
    create table public.differential_diagnoses (
      diagnosis_id bigint generated always as identity primary key,
      visit_id bigint references public.medical_visits,
      pet_id bigint not null references public.patients,
      diagnosis_text text not null,
      likelihood text not null,
      notes text,
      clinic_id uuid not null references public.clinics
    );
    create table public.prescriptions (
      prescription_id bigint generated always as identity primary key,
      visit_id bigint references public.medical_visits,
      pet_id bigint references public.patients,
      medication text,
      dosage text,
      frequency text,
      duration text,
      start_date date,
      prescribed_by uuid references public.staff,
      clinic_id uuid not null references public.clinics
    );
    create table public.lab_orders (
      lab_order_id bigint generated always as identity primary key,
      pet_id bigint references public.patients,
      visit_id bigint references public.medical_visits,
      test_name text,
      category text,
      status text,
      ordered_date timestamptz,
      ordered_by uuid references public.staff,
      notes text,
      is_urgent boolean,
      test_date date,
      clinic_id uuid not null references public.clinics
    );

    insert into public.clinics values ('${clinicA}'), ('${clinicB}');
    insert into public.staff values
      ('aaaaaaaa-1111-4111-8111-111111111111','${clinicA}','${vetA}','vet',true,'ד״ר א','ד״ר אלף'),
      ('bbbbbbbb-2222-4222-8222-222222222222','${clinicB}','${vetB}','vet',true,'ד״ר ב','ד״ר בית'),
      ('cccccccc-3333-4333-8333-333333333333','${clinicA}','${secretaryA}','secretary',true,'מזכירה',null);
    insert into public.owners values ('owner-a','${clinicA}'), ('owner-b','${clinicB}');
    insert into public.patients values (10,'${clinicA}','owner-a',7), (20,'${clinicB}','owner-b',9);
    insert into public.appointments(clinic_id,pet_id,status)
    values ('${clinicA}',10,'scheduled'), ('${clinicB}',20,'scheduled');
  `);
  await db.exec(migration);
  return db;
}

function fullPayload(appointmentId = 1) {
  return {
    petId: 10,
    appointmentId,
    visitDate: "2030-01-07T10:00:00.000Z",
    visitType: "full_exam",
    urgencyLevel: "normal",
    reason: "בדיקה",
    diagnosis: "אבחנה מאושרת",
    treatment: "טיפול מתועד",
    notes: "הערה",
    followUpRequired: true,
    followUpNotes: "מעקב בעוד שבוע",
    entryData: { entryType: "full_exam" },
    physicalExam: { findings: "ממצאים תקינים" },
    problems: [{ problemText: "בעיה", severity: "normal", status: "active", notes: "" }],
    differentials: [{ diagnosisText: "אפשרות", likelihood: "possible", notes: "" }],
    prescriptions: [{ medication: "תרופה", dosage: "1", frequency: "פעם ביום", duration: "שבוע", startDate: "2030-01-07" }],
    labs: [{ testName: "דם", category: "blood", testDate: "2030-01-08", urgent: false, notes: "" }],
    weight: null,
  };
}

async function save(db, submissionId, payload) {
  return db.query(
    "select public.myvet_save_medical_entry($1::uuid, $2::jsonb) as result",
    [submissionId, JSON.stringify(payload)],
  );
}

test("migration creates the idempotency index and restricted RPC", async () => {
  const db = await createDatabase();
  const fn = await db.query("select prosecdef from pg_proc where proname='myvet_save_medical_entry'");
  const index = await db.query("select indexname from pg_indexes where indexname='medical_visits_clinic_submission_key'");
  assert.equal(fn.rows[0].prosecdef, true);
  assert.equal(index.rows.length, 1);
  const tenantFk = await db.query("select conname from pg_constraint where conname='medical_visits_clinic_submitted_by_fkey'");
  assert.equal(tenantFk.rows.length, 1);
  await db.close();
});

test("one RPC saves all full-exam rows and completes the appointment", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${vetA}', false)`);
  const response = await save(db, "10000000-0000-4000-8000-000000000001", fullPayload());
  assert.ok(Number(response.rows[0].result.visitId) > 0);
  for (const table of ["medical_visits", "physical_exams", "medical_problems", "differential_diagnoses", "prescriptions", "lab_orders"]) {
    const count = await db.query(`select count(*)::int as count from public.${table}`);
    assert.equal(count.rows[0].count, 1, table);
  }
  assert.equal((await db.query("select status from public.appointments where appointment_id=1")).rows[0].status, "completed");
  assert.equal(Number((await db.query("select weight from public.patients where pet_id=10")).rows[0].weight), 7);
  await db.close();
});

test("vaccination and weight entries persist only their type-specific data", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${vetA}', false)`);
  const base = {
    petId: 10,
    appointmentId: 1,
    visitDate: "2030-01-07T10:00:00.000Z",
    visitType: "vaccination",
    urgencyLevel: "normal",
    reason: "חיסון כלבת",
    diagnosis: "",
    treatment: "בוצע חיסון",
    notes: "",
    followUpRequired: true,
    followUpNotes: "חיסון הבא בעוד שנה",
    entryData: { entryType: "vaccination" },
    vaccination: { vaccineName: "כלבת", givenDate: "2030-01-07", nextDueDate: "2031-01-07" },
    physicalExam: null,
    problems: [],
    differentials: [],
    prescriptions: [],
    labs: [],
    weight: null,
  };
  await save(db, "10000000-0000-4000-8000-000000000007", base);
  assert.equal((await db.query("select count(*)::int as count from public.vaccinations")).rows[0].count, 1);
  assert.equal((await db.query("select status from public.appointments where appointment_id=1")).rows[0].status, "completed");

  await save(db, "10000000-0000-4000-8000-000000000008", {
    ...base,
    appointmentId: null,
    visitType: "weight_check",
    reason: "שקילה",
    treatment: "נמדד משקל",
    followUpRequired: false,
    followUpNotes: "",
    entryData: { entryType: "weight_check" },
    vaccination: null,
    weight: 8.5,
  });
  assert.equal(Number((await db.query("select weight from public.patients where pet_id=10")).rows[0].weight), 8.5);
  await db.close();
});

test("invalid child data rolls back the entire medical entry and appointment update", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${vetA}', false)`);
  const payload = fullPayload();
  payload.problems[0].severity = "unsupported";
  await assert.rejects(
    save(db, "10000000-0000-4000-8000-000000000002", payload),
    /INVALID_MEDICAL_PROBLEM/,
  );
  assert.equal((await db.query("select count(*)::int as count from public.medical_visits")).rows[0].count, 0);
  assert.equal((await db.query("select status from public.appointments where appointment_id=1")).rows[0].status, "scheduled");
  await db.close();
});

test("retrying the same submission returns the existing visit without duplicates", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${vetA}', false)`);
  const id = "10000000-0000-4000-8000-000000000003";
  const first = await save(db, id, fullPayload());
  const second = await save(db, id, fullPayload());
  assert.equal(second.rows[0].result.idempotentReplay, true);
  assert.equal(second.rows[0].result.visitId, first.rows[0].result.visitId);
  assert.equal((await db.query("select count(*)::int as count from public.medical_visits")).rows[0].count, 1);
  await db.close();
});

test("the same submission id cannot be replayed with changed medical content", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${vetA}', false)`);
  const id = "10000000-0000-4000-8000-000000000009";
  await save(db, id, fullPayload());
  await assert.rejects(
    save(db, id, { ...fullPayload(), treatment: "טיפול שונה" }),
    /IDEMPOTENCY_KEY_REUSED/,
  );
  assert.equal((await db.query("select count(*)::int as count from public.medical_visits")).rows[0].count, 1);
  await db.close();
});

test("missing visit date is rejected without writing a medical record", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${vetA}', false)`);
  const payload = fullPayload();
  delete payload.visitDate;
  await assert.rejects(
    save(db, "10000000-0000-4000-8000-000000000010", payload),
    /INVALID_VISIT_DATE/,
  );
  assert.equal((await db.query("select count(*)::int as count from public.medical_visits")).rows[0].count, 0);
  await db.close();
});

test("other-clinic pets and non-medical staff cannot use the RPC", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${vetA}', false)`);
  const otherClinic = { ...fullPayload(null), petId: 20, appointmentId: null };
  await assert.rejects(
    save(db, "10000000-0000-4000-8000-000000000004", otherClinic),
    /PET_NOT_FOUND/,
  );
  await db.exec(`select set_config('request.jwt.claim.sub', '${secretaryA}', false)`);
  await assert.rejects(
    save(db, "10000000-0000-4000-8000-000000000005", { ...fullPayload(null), appointmentId: null }),
    /MEDICAL_STAFF_REQUIRED/,
  );
  await db.close();
});

test("database constraint rejects attributing a visit to staff from another clinic", async () => {
  const db = await createDatabase();
  await assert.rejects(
    db.query(
      `insert into public.medical_visits
        (pet_id, visit_date, vet_name, reason, treatment, attachments, visit_type,
         urgency_level, clinic_id, submission_id, submission_hash, submitted_by)
       values ($1, now(), 'בדיקה', 'בדיקה', 'בדיקה', '0', 'note', 'normal',
         $2::uuid, $3::uuid, md5('{}'), $4::uuid)`,
      [10, clinicA, "10000000-0000-4000-8000-000000000011", "bbbbbbbb-2222-4222-8222-222222222222"],
    ),
    /medical_visits_clinic_submitted_by_fkey/,
  );
  await db.close();
});

test("appointment must belong to the selected pet and clinic", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${vetA}', false)`);
  await assert.rejects(
    save(db, "10000000-0000-4000-8000-000000000006", { ...fullPayload(), petId: 10, appointmentId: 2 }),
    /APPOINTMENT_NOT_FOUND/,
  );
  await db.close();
});

test("Preview-only baseline and acceptance package execute end-to-end", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema private;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table auth.users (
      id uuid primary key,
      aud text,
      role text,
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb,
      raw_user_meta_data jsonb,
      created_at timestamptz,
      updated_at timestamptz
    );

    create table public.clinics (
      clinic_id uuid primary key,
      slug text unique not null,
      display_name text not null,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table public.staff (
      staff_id uuid primary key default gen_random_uuid(),
      name text,
      role text,
      license_no text,
      certification_level text,
      auth_user_id uuid unique references auth.users(id),
      email text,
      full_name text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      clinic_id uuid not null references public.clinics(clinic_id)
    );
    create table public.owners (
      owner_id text primary key,
      created_at timestamptz not null default now(),
      owner_last_name text,
      phone text,
      email text,
      address text,
      owner_first_name text,
      auth_user_id uuid unique,
      terms_accepted_at timestamptz,
      terms_version text,
      clinic_id uuid not null references public.clinics(clinic_id),
      unique (clinic_id, owner_id)
    );
    create table public.patients (
      pet_id bigint generated always as identity primary key,
      created_at timestamptz not null default now(),
      pet_name text,
      species text,
      breed text,
      gender text,
      birth_date date,
      microchip text,
      allergies text,
      weight numeric not null default 1,
      owner_id text not null references public.owners(owner_id),
      neutered_status text not null default 'unknown',
      clinic_id uuid not null references public.clinics(clinic_id),
      foreign key (clinic_id, owner_id) references public.owners(clinic_id, owner_id)
    );
    create table public.appointments (
      appointment_id bigint generated always as identity primary key,
      pet_id bigint references public.patients(pet_id),
      start_time timestamptz,
      end_time timestamptz,
      department text,
      vet_name text,
      room text,
      appointment_type text,
      color text,
      notes text,
      appointment_mode text not null default 'physical',
      clinic_id uuid not null references public.clinics(clinic_id),
      status text not null default 'scheduled'
    );
    create table public.clinic_booking_hours (
      clinic_id uuid not null references public.clinics(clinic_id),
      weekday smallint not null check (weekday between 0 and 6),
      is_open boolean not null default true,
      opens_at time not null,
      closes_at time not null,
      slot_minutes smallint not null default 30 check (slot_minutes between 10 and 240),
      max_bookings smallint not null check (max_bookings between 0 and 200),
      updated_at timestamptz not null default now(),
      updated_by uuid references auth.users(id),
      primary key (clinic_id, weekday),
      constraint clinic_booking_hours_valid_window check (
        (is_open and closes_at > opens_at and max_bookings > 0)
        or (not is_open and max_bookings = 0)
      )
    );

    create function private.myvet_current_clinic_id() returns uuid
    language sql stable security definer set search_path = '' as $$
      select s.clinic_id from public.staff s
      where s.auth_user_id = (select auth.uid()) and s.is_active = true
      limit 1
    $$;
  `);

  await db.exec(previewBaseline);
  await db.exec(migration);
  await db.exec(previewAcceptance);

  const syntheticRows = await db.query(`
    select
      (select count(*)::int from public.clinics) as clinics,
      (select count(*)::int from public.staff) as staff,
      (select count(*)::int from public.medical_visits) as visits,
      (select count(*)::int from auth.users) as users
  `);
  assert.deepEqual(syntheticRows.rows[0], {
    clinics: 0,
    staff: 0,
    visits: 0,
    users: 0,
  });
  await db.close();
});
