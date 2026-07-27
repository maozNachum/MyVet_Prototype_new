import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20260719195338_secure_patient_deletion.sql",
  "utf8",
);

const adminId = "11111111-1111-4111-8111-111111111111";
const vetId = "22222222-2222-4222-8222-222222222222";
const clinicId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherClinicId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

    create table public.staff (
      staff_id uuid primary key,
      clinic_id uuid not null,
      auth_user_id uuid not null,
      role text not null,
      is_active boolean not null default true
    );

    create table public.patients (
      pet_id bigint primary key,
      clinic_id uuid not null,
      pet_name text not null,
      unique (clinic_id, pet_id)
    );

    create table public.appointments (
      appointment_id bigint primary key,
      clinic_id uuid not null,
      pet_id bigint not null,
      foreign key (clinic_id, pet_id)
        references public.patients(clinic_id, pet_id) on delete restrict
    );

    create table public.appointment_notes (
      note_id bigint primary key,
      appointment_id bigint not null
        references public.appointments(appointment_id) on delete restrict
    );

    create table public.medical_visits (
      visit_id bigint primary key,
      pet_id bigint not null references public.patients(pet_id) on delete restrict
    );

    insert into public.staff (staff_id, clinic_id, auth_user_id, role)
    values
      ('33333333-3333-4333-8333-333333333333', '${clinicId}', '${adminId}', 'clinic_admin'),
      ('44444444-4444-4444-8444-444444444444', '${clinicId}', '${vetId}', 'vet');

    insert into public.patients (pet_id, clinic_id, pet_name)
    values
      (10, '${clinicId}', 'Target'),
      (20, '${clinicId}', 'Keep'),
      (30, '${otherClinicId}', 'Other clinic');

    insert into public.appointments (appointment_id, clinic_id, pet_id)
    values (100, '${clinicId}', 10), (200, '${clinicId}', 20);

    insert into public.appointment_notes (note_id, appointment_id)
    values (1000, 100), (2000, 200);

    insert into public.medical_visits (visit_id, pet_id)
    values (10000, 10), (20000, 20);
  `);

  await db.exec(migration);
  return db;
}

test("clinic admin deletion removes the complete dependency tree only for the selected patient", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${adminId}', false)`);

  const result = await db.query("select public.myvet_delete_patient(10) as result");
  assert.equal(result.rows[0].result.deleted, true);

  const patients = await db.query("select pet_id from public.patients order by pet_id");
  const appointments = await db.query("select appointment_id from public.appointments order by appointment_id");
  const notes = await db.query("select note_id from public.appointment_notes order by note_id");
  const visits = await db.query("select visit_id from public.medical_visits order by visit_id");

  assert.deepEqual(patients.rows, [{ pet_id: 20 }, { pet_id: 30 }]);
  assert.deepEqual(appointments.rows, [{ appointment_id: 200 }]);
  assert.deepEqual(notes.rows, [{ note_id: 2000 }]);
  assert.deepEqual(visits.rows, [{ visit_id: 20000 }]);

  await db.close();
});

test("a veterinarian cannot delete a patient", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${vetId}', false)`);

  await assert.rejects(
    db.query("select public.myvet_delete_patient(10)"),
    /Only a clinic administrator may delete a patient/,
  );

  const patients = await db.query("select count(*)::int as count from public.patients");
  assert.equal(patients.rows[0].count, 3);

  await db.close();
});
