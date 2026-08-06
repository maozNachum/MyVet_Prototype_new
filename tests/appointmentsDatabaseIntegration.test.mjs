import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20260805213000_atomic_staff_appointment_booking.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/rollback/appointments/01_remove_staff_booking_rpc.sql",
  "utf8",
);

async function createAppointmentDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;

    create function auth.uid() returns uuid
    language sql stable
    as $$ select '00000000-0000-0000-0000-000000000111'::uuid $$;

    create function private.myvet_current_clinic_id() returns uuid
    language sql stable
    as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

    create function private.myvet_is_clinic_staff(uuid, text) returns boolean
    language sql stable
    as $$ select true $$;

    create table public.patients (
      pet_id bigint primary key,
      clinic_id uuid not null
    );

    create table public.appointments (
      appointment_id bigint generated always as identity primary key,
      clinic_id uuid not null,
      pet_id bigint not null references public.patients(pet_id),
      start_time timestamptz not null,
      end_time timestamptz,
      department text,
      vet_name text,
      room text,
      appointment_type text,
      appointment_mode text,
      color text,
      notes text
    );

    insert into public.patients (pet_id, clinic_id) values
      (1, '00000000-0000-0000-0000-000000000001'),
      (2, '00000000-0000-0000-0000-000000000002');
  `);
  return db;
}

async function book(db, overrides = {}) {
  const input = {
    petId: 1,
    start: "2099-08-05T09:00:00+03:00",
    end: "2099-08-05T09:30:00+03:00",
    department: "כללי",
    vet: "ד״ר בדיקה א",
    room: "חדר 1",
    type: "בדיקה",
    mode: "physical",
    color: "blue",
    notes: null,
    ...overrides,
  };
  return db.query(
    `select public.myvet_staff_book_appointment(
      $1::bigint, $2::timestamptz, $3::timestamptz, $4::text, $5::text,
      $6::text, $7::text, $8::text, $9::text, $10::text
    ) as appointment_id`,
    [
      input.petId, input.start, input.end, input.department, input.vet,
      input.room, input.type, input.mode, input.color, input.notes,
    ],
  );
}

test("staff appointment migration compiles, isolates the clinic and protects shared resources", async () => {
  const db = await createAppointmentDatabase();
  try {
    await db.exec(migration);

    const first = await book(db);
    assert.equal(first.rows[0].appointment_id, 1);

    await assert.rejects(() => book(db), /VET_UNAVAILABLE/);

    const parallelResource = await book(db, {
      vet: "ד״ר בדיקה ב",
      room: "חדר 2",
    });
    assert.equal(parallelResource.rows[0].appointment_id, 2);

    await assert.rejects(
      () => book(db, { petId: 2, vet: "ד״ר בדיקה ג", room: "חדר 3" }),
      /PATIENT_NOT_IN_CLINIC/,
    );

    const permissions = await db.query(`
      select
        has_function_privilege('anon', 'public.myvet_staff_book_appointment(bigint,timestamptz,timestamptz,text,text,text,text,text,text,text)', 'execute') as anon_execute,
        has_function_privilege('authenticated', 'public.myvet_staff_book_appointment(bigint,timestamptz,timestamptz,text,text,text,text,text,text,text)', 'execute') as authenticated_execute
    `);
    assert.equal(permissions.rows[0].anon_execute, false);
    assert.equal(permissions.rows[0].authenticated_execute, true);

    await db.exec(rollback);
    const functionCount = await db.query(`
      select count(*)::int as count
      from pg_proc
      where proname = 'myvet_staff_book_appointment'
    `);
    assert.equal(functionCount.rows[0].count, 0);

    const appointments = await db.query("select count(*)::int as count from public.appointments");
    assert.equal(appointments.rows[0].count, 2, "rollback must not delete appointment data");
  } finally {
    await db.close();
  }
});
