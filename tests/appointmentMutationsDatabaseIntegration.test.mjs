import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20260825191948_atomic_appointment_mutations.sql",
  "utf8",
);
const capacityMigration = readFileSync(
  "supabase/migrations/20260826093922_enforce_staff_appointment_capacity.sql",
  "utf8",
);

const clinicA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const clinicB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const staffA = "11111111-1111-4111-8111-111111111111";
const staffB = "22222222-2222-4222-8222-222222222222";
const ownerA = "33333333-3333-4333-8333-333333333333";
const ownerB = "44444444-4444-4444-8444-444444444444";

async function createDatabase() {
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

    create table public.clinics (clinic_id uuid primary key);
    create table public.staff (
      staff_id uuid primary key,
      clinic_id uuid not null references public.clinics,
      auth_user_id uuid not null unique,
      role text not null,
      is_active boolean not null default true
    );
    create table public.owners (
      owner_id bigint primary key,
      clinic_id uuid not null references public.clinics,
      auth_user_id uuid not null unique
    );
    create table public.patients (
      pet_id bigint primary key,
      clinic_id uuid not null references public.clinics,
      owner_id bigint not null references public.owners,
      unique (clinic_id, pet_id)
    );
    create table public.appointments (
      appointment_id bigint generated always as identity primary key,
      clinic_id uuid not null references public.clinics,
      pet_id bigint not null,
      start_time timestamptz not null,
      end_time timestamptz not null,
      department text,
      vet_name text,
      room text,
      appointment_type text,
      appointment_mode text not null default 'physical',
      color text,
      notes text,
      status text not null default 'scheduled',
      foreign key (clinic_id, pet_id) references public.patients(clinic_id, pet_id)
    );
    create table public.clinic_booking_hours (
      clinic_id uuid not null references public.clinics,
      weekday smallint not null,
      is_open boolean not null,
      opens_at time not null,
      closes_at time not null,
      slot_minutes integer not null,
      max_bookings integer not null,
      primary key (clinic_id, weekday)
    );
    create table public.clinic_booking_blocks (
      block_id bigint generated always as identity primary key,
      clinic_id uuid not null references public.clinics,
      block_date date not null,
      is_all_day boolean not null default false,
      starts_at time,
      ends_at time
    );
    create table public.vetbot_action_requests (
      action_request_id uuid primary key,
      actor_id uuid not null,
      actor_role text not null,
      action_type text not null,
      payload jsonb not null default '{}'::jsonb,
      preview jsonb not null default '{}'::jsonb,
      status text not null default 'pending',
      result jsonb,
      error_code text,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now() + interval '10 minutes',
      confirmed_at timestamptz,
      executed_at timestamptz
    );

    create function private.myvet_current_clinic_id() returns uuid
    language sql stable security definer set search_path = '' as $$
      select clinic_id from (
        select clinic_id from public.staff where auth_user_id = (select auth.uid()) and is_active
        union all
        select clinic_id from public.owners where auth_user_id = (select auth.uid())
      ) memberships limit 1
    $$;
    create function private.myvet_is_clinic_staff(target uuid, allowed text[]) returns boolean
    language sql stable security definer set search_path = '' as $$
      select exists (
        select 1 from public.staff
        where clinic_id = target and auth_user_id = (select auth.uid()) and is_active
          and (allowed is null or role = any(allowed))
      )
    $$;
    create function public.myvet_owner_book_appointment(bigint,timestamptz,timestamptz,text,text,text)
    returns bigint language sql as $$ select 1::bigint $$;
    create function public.myvet_execute_vetbot_action(uuid)
    returns jsonb language sql as $$ select '{"ok":true}'::jsonb $$;

    insert into public.clinics values ('${clinicA}'), ('${clinicB}');
    insert into public.staff values
      ('aaaaaaaa-1111-4111-8111-111111111111','${clinicA}','${staffA}','clinic_admin',true),
      ('bbbbbbbb-2222-4222-8222-222222222222','${clinicB}','${staffB}','vet',true);
    insert into public.owners values
      (1,'${clinicA}','${ownerA}'),
      (2,'${clinicB}','${ownerB}');
    insert into public.patients values
      (10,'${clinicA}',1), (11,'${clinicA}',1), (20,'${clinicB}',2);
    insert into public.clinic_booking_hours
      select clinic_id, weekday, true, '08:00', '17:00', 30, 20
      from public.clinics cross join generate_series(0,6) weekday;
  `);
  await db.exec(migration);
  await db.exec(capacityMigration);
  return db;
}

test("migration creates the hardened RPCs and conflict trigger", async () => {
  const db = await createDatabase();
  const functions = await db.query(`
    select proname from pg_proc
    where proname in (
      'myvet_staff_book_appointment','myvet_staff_reschedule_appointment',
      'myvet_staff_cancel_appointment','myvet_staff_update_appointment','myvet_owner_reschedule_appointment',
      'myvet_owner_cancel_appointment','myvet_execute_vetbot_action_v2'
    ) order by proname
  `);
  assert.equal(functions.rows.length, 7);
  const trigger = await db.query("select tgname from pg_trigger where tgname='a_myvet_guard_appointment_resource_conflict'");
  assert.equal(trigger.rows.length, 1);
  await db.close();
});

test("staff booking prevents same-clinic resource overlap and allows reuse after cancellation", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${staffA}', false)`);
  const first = await db.query(`select public.myvet_staff_book_appointment(
    10,'2030-01-07 10:00+02','2030-01-07 10:30+02','כללי','ד"ר בדיקה','חדר 1','בדיקה','physical','blue',null
  ) as id`);
  assert.ok(Number(first.rows[0].id) > 0);

  await assert.rejects(
    db.query(`select public.myvet_staff_book_appointment(
      11,'2030-01-07 10:15+02','2030-01-07 10:45+02','כללי','ד"ר בדיקה','חדר 2','בדיקה','physical','blue',null
    )`),
    /VET_ALREADY_BOOKED/,
  );

  await db.query("select public.myvet_staff_cancel_appointment($1)", [first.rows[0].id]);
  const replacement = await db.query(`select public.myvet_staff_book_appointment(
    11,'2030-01-07 10:00+02','2030-01-07 10:30+02','כללי','ד"ר בדיקה','חדר 1','בדיקה','physical','blue',null
  ) as id`);
  assert.ok(Number(replacement.rows[0].id) > 0);

  const cancelled = await db.query("select status from public.appointments where appointment_id=$1", [first.rows[0].id]);
  assert.equal(cancelled.rows[0].status, "cancelled");
  await db.close();
});

test("owner cancellation is tenant-scoped and preserves the appointment row", async () => {
  const db = await createDatabase();
  await db.exec(`
    insert into public.appointments(clinic_id,pet_id,start_time,end_time,vet_name,room,appointment_type,appointment_mode,status)
    values
      ('${clinicA}',10,'2030-01-07 11:00+02','2030-01-07 11:30+02','טרם שובץ','—','בדיקה','physical','scheduled'),
      ('${clinicB}',20,'2030-01-07 11:00+02','2030-01-07 11:30+02','טרם שובץ','—','בדיקה','physical','scheduled');
  `);
  await db.exec(`select set_config('request.jwt.claim.sub', '${ownerA}', false)`);
  await db.query("select public.myvet_owner_cancel_appointment(1)");
  const own = await db.query("select status from public.appointments where appointment_id=1");
  assert.equal(own.rows[0].status, "cancelled");
  await assert.rejects(
    db.query("select public.myvet_owner_cancel_appointment(2)"),
    /APPOINTMENT_NOT_FOUND/,
  );
  assert.equal((await db.query("select count(*)::int as count from public.appointments")).rows[0].count, 2);
  await db.close();
});

test("owner reschedule keeps the original time when the requested slot is occupied", async () => {
  const db = await createDatabase();
  await db.exec(`
    insert into public.appointments(clinic_id,pet_id,start_time,end_time,vet_name,room,appointment_type,appointment_mode,status)
    values
      ('${clinicA}',10,'2030-01-07 12:00+02','2030-01-07 12:30+02','טרם שובץ','טרם שובץ','בדיקה','physical','scheduled'),
      ('${clinicA}',11,'2030-01-07 13:00+02','2030-01-07 13:30+02','טרם שובץ','טרם שובץ','בדיקה','physical','scheduled');
  `);
  await db.exec(`select set_config('request.jwt.claim.sub', '${ownerA}', false)`);
  await assert.rejects(
    db.query("select public.myvet_owner_reschedule_appointment(1,'2030-01-07 13:00+02','2030-01-07 13:30+02')"),
    /SLOT_NOT_AVAILABLE/,
  );
  const unchanged = await db.query("select start_time from public.appointments where appointment_id=1");
  assert.equal(new Date(unchanged.rows[0].start_time).toISOString(), "2030-01-07T10:00:00.000Z");
  await db.close();
});

test("staff edit is tenant-scoped and preserves the original row on a resource conflict", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${staffA}', false)`);
  const first = await db.query(`select public.myvet_staff_book_appointment(
    10,'2030-01-07 15:00+02','2030-01-07 15:30+02','כללי','ד"ר עריכה','חדר 1','בדיקה','physical','blue',null
  ) as id`);
  const second = await db.query(`select public.myvet_staff_book_appointment(
    11,'2030-01-07 16:00+02','2030-01-07 16:30+02','כללי','ד"ר עריכה','חדר 2','בדיקה','physical','blue',null
  ) as id`);
  await assert.rejects(
    db.query(`select public.myvet_staff_update_appointment(
      $1,'2030-01-07 15:00+02','2030-01-07 15:30+02','כללי','ד"ר עריכה','חדר 2','בדיקה','physical','blue',null
    )`, [second.rows[0].id]),
    /VET_ALREADY_BOOKED/,
  );
  const unchanged = await db.query("select start_time from public.appointments where appointment_id=$1", [second.rows[0].id]);
  assert.equal(new Date(unchanged.rows[0].start_time).toISOString(), "2030-01-07T14:00:00.000Z");
  assert.ok(Number(first.rows[0].id) > 0);
  await db.close();
});

test("staff cannot edit a completed appointment", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${staffA}', false)`);
  await db.exec(`
    insert into public.appointments(
      clinic_id,pet_id,start_time,end_time,department,vet_name,room,
      appointment_type,appointment_mode,color,notes,status
    ) values (
      '${clinicA}',10,'2030-01-07 09:00+02','2030-01-07 09:30+02','כללי',
      'ד"ר בדיקה','חדר 1','בדיקה','physical','blue',null,'completed'
    );
  `);

  await assert.rejects(
    db.query(`select public.myvet_staff_update_appointment(
      1,'2030-01-07 10:00+02','2030-01-07 10:30+02','כללי','ד"ר בדיקה','חדר 2',
      'בדיקה','physical','blue',null
    )`),
    /APPOINTMENT_NOT_EDITABLE/,
  );

  const unchanged = await db.query("select start_time,status from public.appointments where appointment_id=1");
  assert.equal(new Date(unchanged.rows[0].start_time).toISOString(), "2030-01-07T07:00:00.000Z");
  assert.equal(unchanged.rows[0].status, "completed");
  await db.close();
});

test("staff scheduling respects clinic hours, blocks and daily capacity", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${staffA}', false)`);
  await db.exec(`
    update public.clinic_booking_hours
    set max_bookings=1
    where clinic_id='${clinicA}' and weekday=1;
  `);

  await db.query(`select public.myvet_staff_book_appointment(
    10,'2030-01-07 10:00+02','2030-01-07 10:30+02','כללי','ד"ר קיבולת א','חדר א',
    'בדיקה','physical','blue',null
  )`);
  await assert.rejects(
    db.query(`select public.myvet_staff_book_appointment(
      11,'2030-01-07 11:00+02','2030-01-07 11:30+02','כללי','ד"ר קיבולת ב','חדר ב',
      'בדיקה','physical','blue',null
    )`),
    /SLOT_NOT_AVAILABLE/,
  );
  await assert.rejects(
    db.query(`select public.myvet_staff_book_appointment(
      11,'2030-01-08 07:00+02','2030-01-08 07:30+02','כללי','ד"ר מוקדם','חדר ג',
      'בדיקה','physical','blue',null
    )`),
    /SLOT_NOT_AVAILABLE/,
  );
  await db.close();
});

test("two clinics may use the same resource label without leaking scheduling state", async () => {
  const db = await createDatabase();
  await db.exec(`select set_config('request.jwt.claim.sub', '${staffA}', false)`);
  await db.query(`select public.myvet_staff_book_appointment(
    10,'2030-01-07 14:00+02','2030-01-07 14:30+02','כללי','ד"ר משותף','חדר 1','בדיקה','physical','blue',null
  )`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${staffB}', false)`);
  const other = await db.query(`select public.myvet_staff_book_appointment(
    20,'2030-01-07 14:00+02','2030-01-07 14:30+02','כללי','ד"ר משותף','חדר 1','בדיקה','physical','blue',null
  ) as id`);
  assert.ok(Number(other.rows[0].id) > 0);
  await db.close();
});
