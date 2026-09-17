begin;

-- Close P0 definer read-path MFA and bind approved VetBot actions to their clinic.
-- No table shape, API signature, or data changes.

CREATE OR REPLACE FUNCTION public.myvet_save_medical_entry(requested_submission_id uuid, requested_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor record;
  patient record;
  appointment record;
  existing_visit public.medical_visits%rowtype;
  created_visit public.medical_visits%rowtype;
  item jsonb;
  target_pet_id bigint;
  target_appointment_id bigint;
  visit_at timestamptz;
  target_visit_type text;
  target_urgency text;
  target_reason text;
  target_diagnosis text;
  target_treatment text;
  target_notes text;
  target_follow_up_required boolean;
  target_follow_up_notes text;
  target_entry_data jsonb;
  target_submission_hash text;
  target_weight numeric;
  vaccination jsonb;
  physical_exam jsonb;
  problems jsonb;
  differentials jsonb;
  prescriptions jsonb;
  labs jsonb;
  vaccine_given_date date;
  vaccine_next_due_date date;
  prescription_start_date date;
  lab_test_date date;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if requested_submission_id is null
     or requested_payload is null
     or jsonb_typeof(requested_payload) <> 'object' then
    raise exception 'INVALID_MEDICAL_ENTRY' using errcode = '22023';
  end if;

  target_submission_hash := md5(requested_payload::text);

  select
    staff.staff_id,
    staff.clinic_id,
    coalesce(nullif(btrim(staff.full_name), ''), nullif(btrim(staff.name), ''), 'צוות רפואי') as display_name,
    staff.role
  into actor
  from public.staff as staff
  where staff.auth_user_id = (select auth.uid())
    and staff.is_active = true
    and staff.role in ('clinic_admin', 'vet', 'nurse')
  limit 1;

  if not found then
    raise exception 'MEDICAL_STAFF_REQUIRED' using errcode = '42501';
  end if;

  -- Enforce MFA before the idempotent read path as well as before writes.
  if not private.myvet_staff_mfa_satisfied(actor.role) then
    raise exception 'MFA_REQUIRED' using errcode = '42501';
  end if;

  -- Serialize retries that reuse the same idempotency key.
  perform pg_advisory_xact_lock(
    hashtextextended(actor.clinic_id::text || ':' || requested_submission_id::text, 0)
  );

  if coalesce(requested_payload ->> 'petId', '') !~ '^[1-9][0-9]*$' then
    raise exception 'INVALID_PET_ID' using errcode = '22023';
  end if;
  target_pet_id := (requested_payload ->> 'petId')::bigint;

  select pet.pet_id, pet.owner_id, pet.clinic_id
  into patient
  from public.patients as pet
  where pet.pet_id = target_pet_id
    and pet.clinic_id = actor.clinic_id
  for key share;

  if not found then
    raise exception 'PET_NOT_FOUND' using errcode = 'P0002';
  end if;

  if nullif(btrim(coalesce(requested_payload ->> 'appointmentId', '')), '') is not null then
    if (requested_payload ->> 'appointmentId') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_APPOINTMENT_ID' using errcode = '22023';
    end if;
    target_appointment_id := (requested_payload ->> 'appointmentId')::bigint;
  end if;

  select visit.*
  into existing_visit
  from public.medical_visits as visit
  where visit.clinic_id = actor.clinic_id
    and visit.submitted_by = actor.staff_id
    and visit.submission_id = requested_submission_id
  limit 1;

  if found then
    if existing_visit.pet_id is distinct from target_pet_id
       or existing_visit.appointment_id is distinct from target_appointment_id
       or existing_visit.submission_hash is distinct from target_submission_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;

    return jsonb_build_object(
      'visitId', existing_visit.visit_id,
      'patientId', existing_visit.pet_id,
      'appointmentId', existing_visit.appointment_id,
      'visitDate', existing_visit.visit_date,
      'vetName', existing_visit.vet_name,
      'reason', existing_visit.reason,
      'diagnosis', existing_visit.diagnosis,
      'treatment', existing_visit.treatment,
      'notes', existing_visit.notes,
      'visitType', existing_visit.visit_type,
      'urgencyLevel', existing_visit.urgency_level,
      'finalDiagnosis', existing_visit.final_diagnosis,
      'followUpRequired', existing_visit.follow_up_required,
      'followUpNotes', existing_visit.follow_up_notes,
      'entryData', existing_visit.entry_data,
      'idempotentReplay', true
    );
  end if;

  if target_appointment_id is not null then
    select a.appointment_id, a.pet_id, a.clinic_id, a.status
    into appointment
    from public.appointments as a
    where a.appointment_id = target_appointment_id
      and a.clinic_id = actor.clinic_id
    for update;

    if not found then
      raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if appointment.pet_id is distinct from target_pet_id then
      raise exception 'APPOINTMENT_PET_MISMATCH' using errcode = '42501';
    end if;
    if appointment.status = 'cancelled' then
      raise exception 'APPOINTMENT_CANCELLED' using errcode = '22023';
    end if;
    if appointment.status = 'completed' then
      raise exception 'APPOINTMENT_ALREADY_COMPLETED' using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.medical_visits as visit
      where visit.clinic_id = actor.clinic_id
        and visit.appointment_id = target_appointment_id
    ) then
      raise exception 'APPOINTMENT_VISIT_ALREADY_EXISTS' using errcode = '23505';
    end if;
  end if;

  if nullif(btrim(coalesce(requested_payload ->> 'visitDate', '')), '') is null then
    raise exception 'INVALID_VISIT_DATE' using errcode = '22007';
  end if;

  begin
    visit_at := (requested_payload ->> 'visitDate')::timestamptz;
  exception when others then
    raise exception 'INVALID_VISIT_DATE' using errcode = '22007';
  end;

  if visit_at is null then
    raise exception 'INVALID_VISIT_DATE' using errcode = '22007';
  end if;

  target_visit_type := btrim(coalesce(requested_payload ->> 'visitType', ''));
  target_urgency := btrim(coalesce(requested_payload ->> 'urgencyLevel', 'normal'));
  target_reason := btrim(coalesce(requested_payload ->> 'reason', ''));
  target_diagnosis := btrim(coalesce(requested_payload ->> 'diagnosis', ''));
  target_treatment := btrim(coalesce(requested_payload ->> 'treatment', ''));
  target_notes := btrim(coalesce(requested_payload ->> 'notes', ''));
  target_follow_up_required := coalesce((requested_payload ->> 'followUpRequired')::boolean, false);
  target_follow_up_notes := btrim(coalesce(requested_payload ->> 'followUpNotes', ''));
  target_entry_data := requested_payload -> 'entryData';

  if target_visit_type not in ('full_exam', 'vaccination', 'weight_check', 'prescription_only', 'lab', 'follow_up', 'note') then
    raise exception 'INVALID_VISIT_TYPE' using errcode = '22023';
  end if;
  if target_urgency not in ('normal', 'serious', 'critical') then
    raise exception 'INVALID_URGENCY_LEVEL' using errcode = '22023';
  end if;
  if target_reason = '' or char_length(target_reason) > 2000
     or char_length(target_diagnosis) > 4000
     or target_treatment = '' or char_length(target_treatment) > 10000
     or char_length(target_notes) > 10000
     or char_length(target_follow_up_notes) > 4000 then
    raise exception 'INVALID_MEDICAL_ENTRY_DETAILS' using errcode = '22023';
  end if;
  if target_entry_data is not null
     and target_entry_data <> 'null'::jsonb
     and jsonb_typeof(target_entry_data) <> 'object' then
    raise exception 'INVALID_ENTRY_DATA' using errcode = '22023';
  end if;

  vaccination := requested_payload -> 'vaccination';
  physical_exam := requested_payload -> 'physicalExam';
  problems := coalesce(requested_payload -> 'problems', '[]'::jsonb);
  differentials := coalesce(requested_payload -> 'differentials', '[]'::jsonb);
  prescriptions := coalesce(requested_payload -> 'prescriptions', '[]'::jsonb);
  labs := coalesce(requested_payload -> 'labs', '[]'::jsonb);

  if jsonb_typeof(problems) <> 'array' or jsonb_array_length(problems) > 50
     or jsonb_typeof(differentials) <> 'array' or jsonb_array_length(differentials) > 50
     or jsonb_typeof(prescriptions) <> 'array' or jsonb_array_length(prescriptions) > 50
     or jsonb_typeof(labs) <> 'array' or jsonb_array_length(labs) > 50 then
    raise exception 'INVALID_MEDICAL_ENTRY_COLLECTIONS' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(requested_payload ->> 'weight', '')), '') is not null then
    begin
      target_weight := (requested_payload ->> 'weight')::numeric;
    exception when others then
      raise exception 'INVALID_WEIGHT' using errcode = '22023';
    end;
    if target_weight <= 0 or target_weight > 500 then
      raise exception 'INVALID_WEIGHT' using errcode = '22023';
    end if;
  end if;

  if target_visit_type = 'weight_check' and target_weight is null then
    raise exception 'WEIGHT_REQUIRED' using errcode = '22023';
  end if;
  if target_weight is not null and target_visit_type <> 'weight_check' then
    raise exception 'UNEXPECTED_WEIGHT' using errcode = '22023';
  end if;
  if target_visit_type = 'vaccination'
     and (vaccination is null or vaccination = 'null'::jsonb or jsonb_typeof(vaccination) <> 'object') then
    raise exception 'VACCINATION_REQUIRED' using errcode = '22023';
  end if;
  if vaccination is not null and vaccination <> 'null'::jsonb and target_visit_type <> 'vaccination' then
    raise exception 'UNEXPECTED_VACCINATION' using errcode = '22023';
  end if;
  if physical_exam is not null
     and physical_exam <> 'null'::jsonb
     and jsonb_typeof(physical_exam) <> 'object' then
    raise exception 'INVALID_PHYSICAL_EXAM' using errcode = '22023';
  end if;
  if physical_exam is not null and physical_exam <> 'null'::jsonb and target_visit_type <> 'full_exam' then
    raise exception 'UNEXPECTED_PHYSICAL_EXAM' using errcode = '22023';
  end if;
  if jsonb_array_length(problems) > 0 and target_visit_type <> 'full_exam'
     or jsonb_array_length(differentials) > 0 and target_visit_type <> 'full_exam'
     or jsonb_array_length(prescriptions) > 0 and target_visit_type not in ('full_exam', 'prescription_only')
     or jsonb_array_length(labs) > 0 and target_visit_type not in ('full_exam', 'lab') then
    raise exception 'UNEXPECTED_MEDICAL_ENTRY_COLLECTION' using errcode = '22023';
  end if;

  insert into public.medical_visits (
    appointment_id, pet_id, visit_date, vet_name, reason, diagnosis, treatment,
    notes, attachments, visit_type, urgency_level, chief_complaint,
    final_diagnosis, follow_up_required, follow_up_notes, entry_data,
    clinic_id, submission_id, submission_hash, submitted_by
  ) values (
    target_appointment_id, target_pet_id, visit_at, actor.display_name, target_reason,
    nullif(target_diagnosis, ''), target_treatment, nullif(target_notes, ''), '0',
    target_visit_type, target_urgency, target_reason, nullif(target_diagnosis, ''),
    target_follow_up_required, nullif(target_follow_up_notes, ''),
    case when target_entry_data = 'null'::jsonb then null else target_entry_data end,
    actor.clinic_id, requested_submission_id, target_submission_hash, actor.staff_id
  )
  returning * into created_visit;

  if vaccination is not null and vaccination <> 'null'::jsonb then
    if btrim(coalesce(vaccination ->> 'vaccineName', '')) = ''
       or char_length(vaccination ->> 'vaccineName') > 250 then
      raise exception 'INVALID_VACCINATION' using errcode = '22023';
    end if;
    begin
      vaccine_given_date := coalesce(nullif(vaccination ->> 'givenDate', '')::date, visit_at::date);
      vaccine_next_due_date := nullif(vaccination ->> 'nextDueDate', '')::date;
    exception when others then
      raise exception 'INVALID_VACCINATION_DATE' using errcode = '22007';
    end;

    insert into public.vaccinations (
      pet_id, owner_id, visit_id, vaccine_name, given_date, next_due_date,
      administered_by, entry_method, notes, clinic_id
    ) values (
      target_pet_id, patient.owner_id, created_visit.visit_id,
      btrim(vaccination ->> 'vaccineName'), vaccine_given_date, vaccine_next_due_date,
      actor.display_name, 'manual', nullif(btrim(coalesce(vaccination ->> 'notes', '')), ''),
      actor.clinic_id
    );
  end if;

  if physical_exam is not null and physical_exam <> 'null'::jsonb
     and btrim(coalesce(physical_exam ->> 'findings', '')) <> '' then
    if char_length(physical_exam ->> 'findings') > 10000 then
      raise exception 'INVALID_PHYSICAL_EXAM' using errcode = '22023';
    end if;
    insert into public.physical_exams (visit_id, pet_id, exam_date, findings, clinic_id)
    values (
      created_visit.visit_id, target_pet_id, visit_at,
      btrim(physical_exam ->> 'findings'), actor.clinic_id
    );
  end if;

  for item in select value from jsonb_array_elements(problems) loop
    if btrim(coalesce(item ->> 'problemText', '')) = ''
       or char_length(item ->> 'problemText') > 2000
       or coalesce(item ->> 'severity', '') not in ('normal', 'serious', 'critical')
       or coalesce(item ->> 'status', '') not in ('active', 'improved', 'resolved')
       or char_length(coalesce(item ->> 'notes', '')) > 4000 then
      raise exception 'INVALID_MEDICAL_PROBLEM' using errcode = '22023';
    end if;
    insert into public.medical_problems (
      visit_id, pet_id, problem_text, severity, status, notes, clinic_id
    ) values (
      created_visit.visit_id, target_pet_id, btrim(item ->> 'problemText'),
      item ->> 'severity', item ->> 'status',
      nullif(btrim(coalesce(item ->> 'notes', '')), ''), actor.clinic_id
    );
  end loop;

  for item in select value from jsonb_array_elements(differentials) loop
    if btrim(coalesce(item ->> 'diagnosisText', '')) = ''
       or char_length(item ->> 'diagnosisText') > 2000
       or coalesce(item ->> 'likelihood', '') not in ('low', 'possible', 'likely')
       or char_length(coalesce(item ->> 'notes', '')) > 4000 then
      raise exception 'INVALID_DIFFERENTIAL_DIAGNOSIS' using errcode = '22023';
    end if;
    insert into public.differential_diagnoses (
      visit_id, pet_id, diagnosis_text, likelihood, notes, clinic_id
    ) values (
      created_visit.visit_id, target_pet_id, btrim(item ->> 'diagnosisText'),
      item ->> 'likelihood', nullif(btrim(coalesce(item ->> 'notes', '')), ''),
      actor.clinic_id
    );
  end loop;

  for item in select value from jsonb_array_elements(prescriptions) loop
    if btrim(coalesce(item ->> 'medication', '')) = ''
       or btrim(coalesce(item ->> 'dosage', '')) = ''
       or btrim(coalesce(item ->> 'frequency', '')) = ''
       or btrim(coalesce(item ->> 'duration', '')) = ''
       or char_length(item ->> 'medication') > 500
       or char_length(item ->> 'dosage') > 500
       or char_length(item ->> 'frequency') > 500
       or char_length(item ->> 'duration') > 500 then
      raise exception 'INVALID_PRESCRIPTION' using errcode = '22023';
    end if;
    begin
      prescription_start_date := coalesce(nullif(item ->> 'startDate', '')::date, visit_at::date);
    exception when others then
      raise exception 'INVALID_PRESCRIPTION_DATE' using errcode = '22007';
    end;
    insert into public.prescriptions (
      visit_id, pet_id, medication, dosage, frequency, duration,
      start_date, prescribed_by, clinic_id
    ) values (
      created_visit.visit_id, target_pet_id, btrim(item ->> 'medication'),
      btrim(item ->> 'dosage'), btrim(item ->> 'frequency'),
      btrim(item ->> 'duration'), prescription_start_date, actor.staff_id, actor.clinic_id
    );
  end loop;

  for item in select value from jsonb_array_elements(labs) loop
    if btrim(coalesce(item ->> 'testName', '')) = ''
       or char_length(item ->> 'testName') > 500
       or coalesce(item ->> 'category', '') not in ('blood', 'urine', 'imaging', 'biopsy', 'other')
       or char_length(coalesce(item ->> 'notes', '')) > 4000 then
      raise exception 'INVALID_LAB_ORDER' using errcode = '22023';
    end if;
    begin
      lab_test_date := nullif(item ->> 'testDate', '')::date;
    exception when others then
      raise exception 'INVALID_LAB_DATE' using errcode = '22007';
    end;
    insert into public.lab_orders (
      pet_id, visit_id, test_name, category, status, ordered_date,
      ordered_by, notes, is_urgent, test_date, clinic_id
    ) values (
      target_pet_id, created_visit.visit_id, btrim(item ->> 'testName'),
      item ->> 'category', 'ordered', visit_at, actor.staff_id,
      nullif(btrim(coalesce(item ->> 'notes', '')), ''),
      coalesce((item ->> 'urgent')::boolean, false), lab_test_date, actor.clinic_id
    );
  end loop;

  if target_weight is not null then
    update public.patients
    set weight = target_weight
    where pet_id = target_pet_id
      and clinic_id = actor.clinic_id;
  end if;

  if target_appointment_id is not null then
    update public.appointments
    set status = 'completed'
    where appointment_id = target_appointment_id
      and clinic_id = actor.clinic_id;
  end if;

  return jsonb_build_object(
    'visitId', created_visit.visit_id,
    'patientId', created_visit.pet_id,
    'appointmentId', created_visit.appointment_id,
    'visitDate', created_visit.visit_date,
    'vetName', created_visit.vet_name,
    'reason', created_visit.reason,
    'diagnosis', created_visit.diagnosis,
    'treatment', created_visit.treatment,
    'notes', created_visit.notes,
    'visitType', created_visit.visit_type,
    'urgencyLevel', created_visit.urgency_level,
    'finalDiagnosis', created_visit.final_diagnosis,
    'followUpRequired', created_visit.follow_up_required,
    'followUpNotes', created_visit.follow_up_notes,
    'entryData', created_visit.entry_data,
    'idempotentReplay', false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.myvet_execute_vetbot_inventory_create(requested_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_row public.vetbot_action_requests%rowtype;
  actor_current_role text;
  created_id bigint;
  item_name_value text;
  category_value text;
  quantity_value bigint;
  threshold_value integer;
  price_value numeric;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.vetbot_action_requests
  set status = 'expired'
  where action_request_id = requested_action_id
    and actor_id = auth.uid()
    and status = 'pending'
    and expires_at <= now();

  select * into request_row
  from public.vetbot_action_requests
  where action_request_id = requested_action_id
    and actor_id = auth.uid()
  for update;

  if not found then raise exception 'ACTION_NOT_FOUND'; end if;
  if request_row.clinic_id is distinct from private.myvet_current_clinic_id() then
    raise exception 'ACTION_CLINIC_CHANGED';
  end if;
  if not private.myvet_is_clinic_staff(request_row.clinic_id, null) then
    raise exception 'STAFF_REQUIRED';
  end if;
  if request_row.status <> 'pending' then raise exception 'ACTION_NOT_PENDING'; end if;
  if request_row.expires_at <= now() then raise exception 'ACTION_EXPIRED'; end if;
  if request_row.action_type <> 'create_inventory_item' then raise exception 'ACTION_TYPE_NOT_ALLOWED'; end if;

  select staff.role into actor_current_role
  from public.staff as staff
  where staff.auth_user_id = auth.uid()
    and staff.is_active = true
    and staff.clinic_id = request_row.clinic_id
  limit 1;

  if actor_current_role is null or actor_current_role not in ('clinic_admin', 'vet', 'nurse', 'secretary') then
    raise exception 'STAFF_REQUIRED';
  end if;
  if actor_current_role <> request_row.actor_role then
    raise exception 'ROLE_CHANGED_OR_NOT_ALLOWED';
  end if;

  begin
    item_name_value := btrim(request_row.payload ->> 'item_name');
    category_value := request_row.payload ->> 'category';
    quantity_value := (request_row.payload ->> 'stock_quantity')::bigint;
    threshold_value := (request_row.payload ->> 'low_stock_threshold')::integer;
    price_value := round((request_row.payload ->> 'price')::numeric, 2);

    if item_name_value is null or length(item_name_value) < 2 or length(item_name_value) > 160 then
      raise exception 'INVALID_ITEM_NAME';
    end if;
    if category_value not in ('medication', 'equipment', 'consumable', 'other') then
      raise exception 'INVALID_CATEGORY';
    end if;
    if quantity_value < 0 or quantity_value > 1000000
      or threshold_value < 0 or threshold_value > 1000000
      or price_value < 0 or price_value > 1000000 then
      raise exception 'INVALID_INVENTORY_VALUES';
    end if;
    if exists (
      select 1
      from public.inventory as existing_item
      where existing_item.clinic_id = request_row.clinic_id
        and lower(regexp_replace(btrim(existing_item.item_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(item_name_value, '\s+', ' ', 'g'))
    ) then
      raise exception 'INVENTORY_ITEM_ALREADY_EXISTS';
    end if;

    insert into public.inventory (
      clinic_id, item_name, category, stock_quantity, low_stock_threshold, price
    ) values (
      request_row.clinic_id, item_name_value, category_value, quantity_value, threshold_value, price_value
    ) returning item_id into created_id;

    update public.vetbot_action_requests
    set status = 'executed',
        result = jsonb_build_object('item_id', created_id),
        confirmed_at = now(),
        executed_at = now(),
        error_code = null
    where action_request_id = requested_action_id;

    return jsonb_build_object(
      'ok', true,
      'action_type', request_row.action_type,
      'result', jsonb_build_object('item_id', created_id)
    );
  exception when others then
    update public.vetbot_action_requests
    set status = 'failed', error_code = left(sqlerrm, 120), confirmed_at = now()
    where action_request_id = requested_action_id;
    return jsonb_build_object(
      'ok', false,
      'action_type', request_row.action_type,
      'error_code', left(sqlerrm, 120)
    );
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.myvet_execute_vetbot_action_v2(requested_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_row public.vetbot_action_requests%rowtype;
  actor_current_role text;
  created_id bigint;
  action_result jsonb := '{}'::jsonb;
  start_value timestamptz;
  end_value timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into request_row
  from public.vetbot_action_requests
  where action_request_id = requested_action_id
    and actor_id = (select auth.uid());

  if not found then raise exception 'ACTION_NOT_FOUND'; end if;
  if request_row.clinic_id is distinct from private.myvet_current_clinic_id()
     or not private.myvet_user_has_clinic_access(request_row.clinic_id) then
    raise exception 'ACTION_CLINIC_CHANGED';
  end if;
  if request_row.action_type not in ('book_appointment', 'reschedule_appointment', 'cancel_appointment') then
    return public.myvet_execute_vetbot_action(requested_action_id);
  end if;

  update public.vetbot_action_requests
  set status = 'expired'
  where action_request_id = requested_action_id
    and actor_id = (select auth.uid())
    and status = 'pending'
    and expires_at <= now();

  select * into request_row
  from public.vetbot_action_requests
  where action_request_id = requested_action_id
    and actor_id = (select auth.uid())
  for update;

  if request_row.status <> 'pending' then raise exception 'ACTION_NOT_PENDING'; end if;
  if request_row.expires_at <= now() then raise exception 'ACTION_EXPIRED'; end if;

  select staff.role into actor_current_role
  from public.staff as staff
  where staff.auth_user_id = (select auth.uid()) and staff.is_active = true
    and staff.clinic_id = request_row.clinic_id
    and private.myvet_staff_mfa_satisfied(staff.role)
  limit 1;
  if actor_current_role is null and exists (
    select 1 from public.owners where auth_user_id = (select auth.uid()) and clinic_id = request_row.clinic_id
  ) then actor_current_role := 'owner'; end if;
  if actor_current_role is null or actor_current_role <> request_row.actor_role then
    raise exception 'ROLE_CHANGED_OR_NOT_ALLOWED';
  end if;

  begin
    if request_row.action_type = 'book_appointment' then
      start_value := (request_row.payload ->> 'start_time')::timestamptz;
      end_value := (request_row.payload ->> 'end_time')::timestamptz;
      if actor_current_role = 'owner' then
        created_id := public.myvet_owner_book_appointment(
          (request_row.payload ->> 'pet_id')::bigint,
          start_value,
          end_value,
          request_row.payload ->> 'appointment_type',
          case when request_row.payload ->> 'appointment_mode' = 'video' then 'video' else 'physical' end,
          request_row.payload ->> 'notes'
        );
      else
        created_id := public.myvet_staff_book_appointment(
          (request_row.payload ->> 'pet_id')::bigint,
          start_value,
          end_value,
          request_row.payload ->> 'department',
          request_row.payload ->> 'vet_name',
          request_row.payload ->> 'room',
          request_row.payload ->> 'appointment_type',
          case when request_row.payload ->> 'appointment_mode' = 'video' then 'video' else 'physical' end,
          case when request_row.payload ->> 'urgency' = 'urgent' then 'red' else 'blue' end,
          request_row.payload ->> 'notes'
        );
      end if;
      action_result := jsonb_build_object('appointment_id', created_id);
    elsif request_row.action_type = 'reschedule_appointment' then
      start_value := (request_row.payload ->> 'start_time')::timestamptz;
      end_value := (request_row.payload ->> 'end_time')::timestamptz;
      if actor_current_role = 'owner' then
        created_id := public.myvet_owner_reschedule_appointment(
          (request_row.payload ->> 'appointment_id')::bigint, start_value, end_value
        );
      else
        created_id := public.myvet_staff_reschedule_appointment(
          (request_row.payload ->> 'appointment_id')::bigint, start_value, end_value
        );
      end if;
      action_result := jsonb_build_object('appointment_id', created_id);
    else
      if actor_current_role = 'owner' then
        created_id := public.myvet_owner_cancel_appointment((request_row.payload ->> 'appointment_id')::bigint);
      else
        created_id := public.myvet_staff_cancel_appointment((request_row.payload ->> 'appointment_id')::bigint);
      end if;
      action_result := jsonb_build_object('appointment_id', created_id, 'status', 'cancelled');
    end if;

    update public.vetbot_action_requests
    set status = 'executed', result = action_result, confirmed_at = now(), executed_at = now(), error_code = null
    where action_request_id = requested_action_id;
    return jsonb_build_object('ok', true, 'action_type', request_row.action_type, 'result', action_result);
  exception when others then
    update public.vetbot_action_requests
    set status = 'failed', error_code = left(sqlerrm, 120), confirmed_at = now()
    where action_request_id = requested_action_id;
    return jsonb_build_object('ok', false, 'action_type', request_row.action_type, 'error_code', left(sqlerrm, 120));
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.myvet_execute_vetbot_action(requested_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_row public.vetbot_action_requests%rowtype;
  actor_current_role text;
  affected_count integer := 0;
  created_id bigint;
  action_result jsonb := '{}'::jsonb;
  pet_id_value bigint;
  appointment_id_value bigint;
  start_value timestamptz;
  end_value timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.vetbot_action_requests
  set status = 'expired'
  where action_request_id = requested_action_id
    and actor_id = auth.uid()
    and status = 'pending'
    and expires_at <= now();

  select * into request_row
  from public.vetbot_action_requests
  where action_request_id = requested_action_id
    and actor_id = auth.uid()
  for update;

  if not found then
    raise exception 'ACTION_NOT_FOUND';
  end if;
  if request_row.clinic_id is distinct from private.myvet_current_clinic_id()
     or not private.myvet_user_has_clinic_access(request_row.clinic_id) then
    raise exception 'ACTION_CLINIC_CHANGED';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'ACTION_NOT_PENDING';
  end if;
  if request_row.expires_at <= now() then
    raise exception 'ACTION_EXPIRED';
  end if;

  select staff.role into actor_current_role
  from public.staff as staff
  where staff.auth_user_id = auth.uid()
    and staff.is_active = true
    and staff.clinic_id = request_row.clinic_id
    and private.myvet_staff_mfa_satisfied(staff.role)
  limit 1;

  if actor_current_role is null and exists (
    select 1 from public.owners as owner_profile where owner_profile.auth_user_id = auth.uid() and owner_profile.clinic_id = request_row.clinic_id
  ) then
    actor_current_role := 'owner';
  end if;

  if actor_current_role is null or actor_current_role <> request_row.actor_role then
    raise exception 'ROLE_CHANGED_OR_NOT_ALLOWED';
  end if;

  begin
    case request_row.action_type
      when 'book_appointment' then
        pet_id_value := (request_row.payload ->> 'pet_id')::bigint;
        start_value := (request_row.payload ->> 'start_time')::timestamptz;
        end_value := (request_row.payload ->> 'end_time')::timestamptz;

        if actor_current_role = 'owner' and not public.myvet_pet_owned(pet_id_value::text) then
          raise exception 'PET_NOT_OWNED';
        elsif actor_current_role <> 'owner' and not public.myvet_is_active_staff() then
          raise exception 'STAFF_REQUIRED';
        end if;
        if not public.myvet_slot_is_bookable(start_value, end_value, null) then
          raise exception 'SLOT_NOT_AVAILABLE';
        end if;

        insert into public.appointments (
          pet_id, start_time, end_time, department, vet_name, room,
          appointment_type, appointment_mode, color, notes
        ) values (
          pet_id_value,
          start_value,
          end_value,
          left(coalesce(nullif(request_row.payload ->> 'department', ''), 'כללי'), 80),
          left(coalesce(nullif(request_row.payload ->> 'vet_name', ''), 'טרם שובץ'), 120),
          left(coalesce(nullif(request_row.payload ->> 'room', ''), case when request_row.payload ->> 'appointment_mode' = 'video' then 'דיגיטל' else 'טרם שובץ' end), 80),
          left(request_row.payload ->> 'appointment_type', 120),
          case when request_row.payload ->> 'appointment_mode' = 'video' then 'video' else 'physical' end,
          case when request_row.payload ->> 'urgency' = 'urgent' then 'red' else 'blue' end,
          nullif(left(coalesce(request_row.payload ->> 'notes', ''), 1000), '')
        ) returning appointment_id into created_id;
        action_result := jsonb_build_object('appointment_id', created_id);

      when 'reschedule_appointment' then
        appointment_id_value := (request_row.payload ->> 'appointment_id')::bigint;
        start_value := (request_row.payload ->> 'start_time')::timestamptz;
        end_value := (request_row.payload ->> 'end_time')::timestamptz;

        select appointment.pet_id into pet_id_value
        from public.appointments as appointment
        where appointment.appointment_id = appointment_id_value;
        if pet_id_value is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
        if actor_current_role = 'owner' and not public.myvet_pet_owned(pet_id_value::text) then
          raise exception 'APPOINTMENT_NOT_ALLOWED';
        elsif actor_current_role <> 'owner' and not public.myvet_is_active_staff() then
          raise exception 'STAFF_REQUIRED';
        end if;
        if not public.myvet_slot_is_bookable(start_value, end_value, appointment_id_value) then
          raise exception 'SLOT_NOT_AVAILABLE';
        end if;
        update public.appointments
        set start_time = start_value, end_time = end_value
        where appointment_id = appointment_id_value;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'APPOINTMENT_UPDATE_FAILED'; end if;
        action_result := jsonb_build_object('appointment_id', appointment_id_value);

      when 'cancel_appointment' then
        appointment_id_value := (request_row.payload ->> 'appointment_id')::bigint;
        select appointment.pet_id into pet_id_value
        from public.appointments as appointment
        where appointment.appointment_id = appointment_id_value;
        if pet_id_value is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
        if actor_current_role = 'owner' and not public.myvet_pet_owned(pet_id_value::text) then
          raise exception 'APPOINTMENT_NOT_ALLOWED';
        elsif actor_current_role <> 'owner' and not public.myvet_is_active_staff() then
          raise exception 'STAFF_REQUIRED';
        end if;
        delete from public.appointments where appointment_id = appointment_id_value;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'APPOINTMENT_DELETE_FAILED'; end if;
        action_result := jsonb_build_object('appointment_id', appointment_id_value);

      when 'adjust_inventory' then
        if actor_current_role not in ('clinic_admin', 'vet', 'nurse', 'secretary') then
          raise exception 'STAFF_REQUIRED';
        end if;
        if (request_row.payload ->> 'new_quantity')::bigint < 0
          or (request_row.payload ->> 'new_quantity')::bigint > 1000000 then
          raise exception 'INVALID_QUANTITY';
        end if;
        update public.inventory
        set stock_quantity = (request_row.payload ->> 'new_quantity')::bigint
        where clinic_id = request_row.clinic_id and item_id = (request_row.payload ->> 'item_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
        action_result := jsonb_build_object('item_id', (request_row.payload ->> 'item_id')::bigint, 'new_quantity', (request_row.payload ->> 'new_quantity')::bigint);

      when 'archive_conversation' then
        if actor_current_role = 'owner' then raise exception 'STAFF_REQUIRED'; end if;
        update public.conversations
        set status = 'closed', closed_at = now(), updated_at = now()
        where clinic_id = request_row.clinic_id and conversation_id = (request_row.payload ->> 'conversation_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'CONVERSATION_NOT_FOUND'; end if;
        action_result := jsonb_build_object('conversation_id', (request_row.payload ->> 'conversation_id')::bigint);

      when 'restore_conversation' then
        if actor_current_role = 'owner' then raise exception 'STAFF_REQUIRED'; end if;
        update public.conversations
        set status = 'waiting_staff', closed_at = null, updated_at = now()
        where clinic_id = request_row.clinic_id and conversation_id = (request_row.payload ->> 'conversation_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'CONVERSATION_NOT_FOUND'; end if;
        action_result := jsonb_build_object('conversation_id', (request_row.payload ->> 'conversation_id')::bigint);

      when 'set_conversation_priority' then
        if actor_current_role = 'owner' then raise exception 'STAFF_REQUIRED'; end if;
        if request_row.payload ->> 'priority' not in ('normal', 'urgent') then
          raise exception 'INVALID_PRIORITY';
        end if;
        update public.conversations
        set priority = request_row.payload ->> 'priority', updated_at = now()
        where clinic_id = request_row.clinic_id and conversation_id = (request_row.payload ->> 'conversation_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'CONVERSATION_NOT_FOUND'; end if;
        action_result := jsonb_build_object('conversation_id', (request_row.payload ->> 'conversation_id')::bigint, 'priority', request_row.payload ->> 'priority');

      when 'set_lab_urgency' then
        if actor_current_role not in ('clinic_admin', 'vet', 'nurse') then
          raise exception 'MEDICAL_ROLE_REQUIRED';
        end if;
        update public.lab_orders
        set is_urgent = coalesce((request_row.payload ->> 'is_urgent')::boolean, false)
        where clinic_id = request_row.clinic_id and lab_order_id = (request_row.payload ->> 'lab_order_id')::bigint
          and coalesce(status, '') <> 'completed';
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'OPEN_LAB_ORDER_NOT_FOUND'; end if;
        action_result := jsonb_build_object('lab_order_id', (request_row.payload ->> 'lab_order_id')::bigint);

      when 'block_booking_time' then
        if actor_current_role not in ('clinic_admin', 'secretary') then
          raise exception 'SCHEDULING_ROLE_REQUIRED';
        end if;
        insert into public.clinic_booking_blocks (
          clinic_id, block_date, is_all_day, starts_at, ends_at, reason, created_by
        ) values (
          request_row.clinic_id, (request_row.payload ->> 'block_date')::date,
          coalesce((request_row.payload ->> 'is_all_day')::boolean, false),
          case when coalesce((request_row.payload ->> 'is_all_day')::boolean, false) then null else (request_row.payload ->> 'starts_at')::time end,
          case when coalesce((request_row.payload ->> 'is_all_day')::boolean, false) then null else (request_row.payload ->> 'ends_at')::time end,
          nullif(left(coalesce(request_row.payload ->> 'reason', ''), 200), ''),
          auth.uid()
        ) returning block_id into created_id;
        action_result := jsonb_build_object('block_id', created_id);
      else
        raise exception 'ACTION_TYPE_NOT_ALLOWED';
    end case;

    update public.vetbot_action_requests
    set status = 'executed', result = action_result, confirmed_at = now(), executed_at = now(), error_code = null
    where action_request_id = requested_action_id;

    return jsonb_build_object('ok', true, 'action_type', request_row.action_type, 'result', action_result);
  exception when others then
    update public.vetbot_action_requests
    set status = 'failed', error_code = left(sqlerrm, 120), confirmed_at = now()
    where action_request_id = requested_action_id;
    return jsonb_build_object('ok', false, 'action_type', request_row.action_type, 'error_code', left(sqlerrm, 120));
  end;
end;
$function$;

revoke all on function public.myvet_save_medical_entry(uuid,jsonb) from public,anon,service_role;
grant execute on function public.myvet_save_medical_entry(uuid,jsonb) to authenticated;
revoke all on function public.myvet_execute_vetbot_inventory_create(uuid), public.myvet_execute_vetbot_action_v2(uuid) from public,anon;
grant execute on function public.myvet_execute_vetbot_inventory_create(uuid), public.myvet_execute_vetbot_action_v2(uuid) to authenticated,service_role;
-- Legacy delegate remains internal to v2.
revoke all on function public.myvet_execute_vetbot_action(uuid) from public,anon,authenticated,service_role;
commit;
