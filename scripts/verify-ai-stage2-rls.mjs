import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.STAGE2_TEST_SUPABASE_URL;
const publishableKey = process.env.STAGE2_TEST_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.STAGE2_TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !serviceRoleKey) {
  console.error("Stage 2 integration test requires the three STAGE2_TEST_SUPABASE_* variables for a disposable Preview Branch.");
  process.exit(2);
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = crypto.randomUUID().slice(0, 8);
const password = `T3st-${crypto.randomUUID()}!`;
const createdUsers = [];
const createdObjects = [];
const createdClinicIds = [];

async function createIdentity(label) {
  const email = `stage2-${runId}-${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

async function insertOne(table, value, select = "*") {
  const { data, error } = await admin.from(table).insert(value).select(select).single();
  if (error) throw error;
  return data;
}

async function main() {
  const [adminA, adminB, vetA, nurseA, ownerA, ownerB] = await Promise.all([
    createIdentity("admin-a"), createIdentity("admin-b"), createIdentity("vet-a"),
    createIdentity("nurse-a"), createIdentity("owner-a"), createIdentity("owner-b"),
  ]);

  const clinicA = await insertOne("clinics", { slug: `stage2-${runId}-a`, display_name: "Stage 2 A" }, "clinic_id");
  const clinicB = await insertOne("clinics", { slug: `stage2-${runId}-b`, display_name: "Stage 2 B" }, "clinic_id");
  createdClinicIds.push(clinicA.clinic_id, clinicB.clinic_id);

  const staffA = await insertOne("staff", { clinic_id: clinicA.clinic_id, auth_user_id: adminA.id, role: "clinic_admin", is_active: true }, "staff_id");
  await insertOne("staff", { clinic_id: clinicB.clinic_id, auth_user_id: adminB.id, role: "clinic_admin", is_active: true }, "staff_id");
  const vetStaffA = await insertOne("staff", { clinic_id: clinicA.clinic_id, auth_user_id: vetA.id, role: "vet", is_active: true }, "staff_id");
  await insertOne("staff", { clinic_id: clinicA.clinic_id, auth_user_id: nurseA.id, role: "nurse", is_active: true }, "staff_id");

  const ownerIdA = `STAGE2-${runId}-A`;
  const ownerIdB = `STAGE2-${runId}-B`;
  await insertOne("owners", { clinic_id: clinicA.clinic_id, owner_id: ownerIdA, auth_user_id: ownerA.id });
  await insertOne("owners", { clinic_id: clinicB.clinic_id, owner_id: ownerIdB, auth_user_id: ownerB.id });
  const petA = await insertOne("patients", { clinic_id: clinicA.clinic_id, owner_id: ownerIdA, pet_name: "Synthetic A", weight: 1 }, "pet_id");
  const petB = await insertOne("patients", { clinic_id: clinicB.clinic_id, owner_id: ownerIdB, pet_name: "Synthetic B", weight: 1 }, "pet_id");

  const opA = await insertOne("ai_operations", {
    clinic_id: clinicA.clinic_id, capability: "visit_summary", actor_user_id: vetA.id,
    actor_staff_id: vetStaffA.staff_id, owner_id: ownerIdA, pet_id: petA.pet_id, status: "succeeded",
  }, "operation_id");
  await insertOne("ai_operations", {
    clinic_id: clinicB.clinic_id, capability: "visit_summary", actor_user_id: adminB.id,
    owner_id: ownerIdB, pet_id: petB.pet_id, status: "succeeded",
  }, "operation_id");

  await insertOne("ai_artifacts", {
    clinic_id: clinicA.clinic_id, operation_id: opA.operation_id, owner_id: ownerIdA,
    pet_id: petA.pet_id, artifact_type: "visit_summary", status: "approved",
    content: { summary: "synthetic approved content" }, approved_by: vetStaffA.staff_id,
    approved_at: new Date().toISOString(), released_to_owner: true, released_at: new Date().toISOString(),
  }, "artifact_id");
  await insertOne("ai_artifacts", {
    clinic_id: clinicA.clinic_id, operation_id: opA.operation_id, owner_id: ownerIdA,
    pet_id: petA.pet_id, artifact_type: "visit_summary", status: "draft",
    content: { summary: "synthetic draft content" }, created_by: vetA.id,
  }, "artifact_id");

  await admin.from("ai_feature_flags").insert([
    { clinic_id: clinicA.clinic_id, capability: "visit_summary", enabled: false, kill_switch: true, updated_by: adminA.id },
    { clinic_id: clinicB.clinic_id, capability: "visit_summary", enabled: false, kill_switch: true, updated_by: adminB.id },
  ]).throwOnError();

  const { data: aOps, error: aOpsError } = await adminA.client.from("ai_operations").select("clinic_id");
  assert.ifError(aOpsError);
  assert.equal(aOps.length, 1);
  assert.equal(aOps[0].clinic_id, clinicA.clinic_id);

  const { data: bOps, error: bOpsError } = await adminB.client.from("ai_operations").select("clinic_id");
  assert.ifError(bOpsError);
  assert.equal(bOps.length, 1);
  assert.equal(bOps[0].clinic_id, clinicB.clinic_id);

  const { data: ownerArtifacts, error: ownerArtifactsError } = await ownerA.client.from("ai_artifacts").select("status,released_to_owner,content");
  assert.ifError(ownerArtifactsError);
  assert.equal(ownerArtifacts.length, 1);
  assert.equal(ownerArtifacts[0].status, "approved");
  assert.equal(ownerArtifacts[0].released_to_owner, true);

  const { data: otherOwnerArtifacts, error: otherOwnerError } = await ownerB.client.from("ai_artifacts").select("artifact_id");
  assert.ifError(otherOwnerError);
  assert.equal(otherOwnerArtifacts.length, 0);

  const { data: nurseArtifacts, error: nurseArtifactsError } = await nurseA.client.from("ai_artifacts").select("artifact_id");
  assert.ifError(nurseArtifactsError);
  assert.equal(nurseArtifacts.length, 0);

  const { error: ownerWriteError } = await ownerA.client.from("ai_artifacts").insert({
    clinic_id: clinicA.clinic_id, operation_id: opA.operation_id, pet_id: petA.pet_id,
    artifact_type: "visit_summary", status: "draft", content: {},
  });
  assert.ok(ownerWriteError, "owner browser must not insert an AI draft");

  const { error: tamperedScopeError } = await admin.from("ai_operations").insert({
    clinic_id: clinicA.clinic_id, capability: "record_qa", owner_id: ownerIdA,
    pet_id: petB.pet_id, status: "queued",
  });
  assert.ok(tamperedScopeError, "cross-clinic pet_id must fail even for the server role");

  const { data: flagsA, error: flagsAError } = await adminA.client.from("ai_feature_flags").select("clinic_id,enabled,kill_switch");
  assert.ifError(flagsAError);
  assert.equal(flagsA.length, 1);
  assert.equal(flagsA[0].clinic_id, clinicA.clinic_id);
  assert.equal(flagsA[0].enabled, false);
  assert.equal(flagsA[0].kill_switch, true);

  const anon = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { error: anonRpcError } = await anon.rpc("claim_owner_profile");
  assert.ok(anonRpcError, "anon must not execute protected RPCs");

  const documentPath = `${clinicA.clinic_id}/${petA.pet_id}/documents/${crypto.randomUUID()}.pdf`;
  const recordingPath = `${clinicA.clinic_id}/${petA.pet_id}/recordings/${crypto.randomUUID()}.webm`;
  const payload = new Uint8Array([37, 80, 68, 70]);

  const { error: vetUploadError } = await vetA.client.storage.from("ai-medical-documents").upload(documentPath, payload, { contentType: "application/pdf" });
  assert.ifError(vetUploadError);
  createdObjects.push(["ai-medical-documents", documentPath]);

  const { error: crossClinicDownloadError } = await adminB.client.storage.from("ai-medical-documents").download(documentPath);
  assert.ok(crossClinicDownloadError, "another clinic must not download the object");
  const { error: ownerDownloadError } = await ownerA.client.storage.from("ai-medical-documents").download(documentPath);
  assert.ok(ownerDownloadError, "owners have no direct AI bucket access");

  const { error: nurseRecordingError } = await nurseA.client.storage.from("ai-recordings").upload(recordingPath, payload, { contentType: "audio/webm" });
  assert.ok(nurseRecordingError, "nurse must not upload raw recordings");
  const { error: vetRecordingError } = await vetA.client.storage.from("ai-recordings").upload(recordingPath, payload, { contentType: "audio/webm" });
  assert.ifError(vetRecordingError);
  createdObjects.push(["ai-recordings", recordingPath]);

  console.log("Stage 2 Preview Branch integration checks passed.");
}

try {
  await main();
} finally {
  for (const [bucket, path] of createdObjects.reverse()) {
    await admin.storage.from(bucket).remove([path]);
  }
  if (createdClinicIds.length > 0) {
    for (const table of [
      "ai_sources", "ai_approval_history", "ai_artifacts", "ai_document_embeddings",
      "ai_document_chunks", "ai_documents", "ai_audit_events", "ai_rate_limit_windows",
      "ai_consent_records", "ai_feature_flags", "ai_operations", "patients", "owners", "staff",
    ]) {
      await admin.from(table).delete().in("clinic_id", createdClinicIds);
    }
    await admin.from("clinics").delete().in("clinic_id", createdClinicIds);
  }
  for (const userId of createdUsers.reverse()) {
    await admin.auth.admin.deleteUser(userId);
  }
}
