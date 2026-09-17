import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.MYVET_TEST_SUPABASE_URL;
const anonKey = process.env.MYVET_TEST_ANON_KEY;
const serviceRoleKey = process.env.MYVET_TEST_SERVICE_ROLE_KEY;
const allowedProjectRef = process.env.MYVET_TEST_ALLOWED_PROJECT_REF;
const targetUrl = url ? new URL(url) : null;
const isLocalTarget = Boolean(targetUrl && ["http:", "https:"].includes(targetUrl.protocol)
  && ["127.0.0.1", "localhost"].includes(targetUrl.hostname));
const isAllowedPreview = Boolean(
  allowedProjectRef && allowedProjectRef !== "bavpqmopcrhtrwatmyng"
    && url === `https://${allowedProjectRef}.supabase.co`,
);

if (!url || !anonKey || !serviceRoleKey || (!isLocalTarget && !isAllowedPreview)) {
  throw new Error("Refusing to run: an explicitly allowed Local or Preview Supabase target is required.");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = randomUUID().slice(0, 8);
const userEmail = `auth-admin-${suffix}@example.invalid`;
const weakEmail = `auth-weak-${suffix}@example.invalid`;
const ownerEmail = `auth-owner-${suffix}@example.invalid`;
const claimEmail = `auth-claim-${suffix}@example.invalid`;
const edgeEmail = `auth-edge-${suffix}@example.invalid`;
const inviteEmail = `auth-invite-${suffix}@example.invalid`;
const recoveryEmail = `auth-recovery-${suffix}@example.invalid`;
const password = "MyVet!Local#2026";
const recoveredPassword = "MyVet!Recovered#2026";
const clinicId = randomUUID();
const clinicIdB = randomUUID();
const staffId = randomUUID();
const edgeStaffId = randomUUID();
const ownerId = `AUTH-${suffix.toUpperCase()}`;
const claimOwnerA = `CLAIM-A-${suffix.toUpperCase()}`;
const claimOwnerB = `CLAIM-B-${suffix.toUpperCase()}`;
const petId = 970000 + Math.floor(Math.random() * 20000);
let userId = null;
let ownerUserId = null;
let claimUserId = null;
let weakUserId = null;
let edgeUserId = null;
let inviteUserId = null;
let recoveryUserId = null;
const storageFixtures = [];

const edgeSmokeCases = [
  { name: "ai-assistant", body: { mode: "dashboard", question: "בדיקת הרשאות" } },
  { name: "client-summary", body: { action: "load", visitId: 999_999_991 } },
  { name: "digitalcare-transcription", body: { action: "status", videoSessionId: 999_999_991 } },
  { name: "follow-up-suggestions", body: { action: "load", visitId: 999_999_991 } },
  { name: "medical-record-rag", body: { action: "status", petId: 999_999_991 } },
  { name: "visit-summary", body: { action: "load", visitId: 999_999_991 } },
  { name: "document-ocr", form: true },
];

async function invokeEdgeFunction(testCase, accessToken) {
  const headers = { apikey: anonKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body;
  if (testCase.form) {
    body = new FormData();
    body.set("action", "extract");
    body.set("petId", "999999991");
    body.set("documentKind", "medical_document");
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(testCase.body);
  }
  const response = await fetch(`${url}/functions/v1/${testCase.name}`, {
    method: "POST",
    headers,
    body,
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* Gateway errors may not be JSON. */ }
  return { status: response.status, error: payload?.error || null };
}

async function assertEdgeMfaBoundary(accessToken, expectedMfaRequired) {
  for (const testCase of edgeSmokeCases) {
    const result = await invokeEdgeFunction(testCase, accessToken);
    if (expectedMfaRequired) {
      assert.equal(result.status, 403, `${testCase.name} did not reject AAL1 with HTTP 403.`);
      assert.equal(result.error, "MFA_REQUIRED", `${testCase.name} did not return MFA_REQUIRED at AAL1.`);
    } else {
      assert.notEqual(result.status, 401, `${testCase.name} rejected a valid AAL2 JWT.`);
      assert.notEqual(result.error, "MFA_REQUIRED", `${testCase.name} still rejected AAL2 as MFA_REQUIRED.`);
    }
  }
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replace(/=|\s/g, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid TOTP secret returned by Auth.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, timestamp = Date.now()) {
  const counter = BigInt(Math.floor(timestamp / 30_000));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function requireNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

try {
  const weakClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (isAllowedPreview) {
    const policyProbe = await requireNoError(
      await admin.auth.admin.createUser({ email: weakEmail, password, email_confirm: true }),
      "create password-policy probe user",
    );
    weakUserId = policyProbe.user.id;
    await requireNoError(
      await weakClient.auth.signInWithPassword({ email: weakEmail, password }),
      "sign in password-policy probe user",
    );
    const weakUpdate = await weakClient.auth.updateUser({ password: "weak123" });
    assert.equal(weakUpdate.error?.code, "weak_password", "Hosted Auth did not reject the weak password update.");
    assert.ok(
      weakUpdate.error?.reasons?.some((reason) => reason === "length" || reason === "characters"),
      `Hosted Auth rejected the weak password without a verified length/characters reason: ${weakUpdate.error?.message || "no error"}`,
    );
    const leakedUpdate = await weakClient.auth.updateUser({ password: "Password123!" });
    assert.equal(leakedUpdate.error?.code, "weak_password", "Hosted Auth did not reject the leaked password update.");
    assert.ok(
      leakedUpdate.error?.reasons?.includes("pwned"),
      `Hosted Auth did not identify the password as leaked: ${leakedUpdate.error?.message || "no error"}`,
    );
  } else {
    const weakSignup = await weakClient.auth.signUp({ email: weakEmail, password: "weak123" });
    assert.equal(weakSignup.error?.code, "weak_password", "Auth did not reject the weak password for password-policy reasons.");
    assert.ok(
      weakSignup.error?.reasons?.some((reason) => reason === "length" || reason === "characters"),
      `Auth rejected the weak password without a verified length/characters reason: ${weakSignup.error?.message || "no error"}`,
    );
  }

  const created = await requireNoError(
    await admin.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
    }),
    "create test user",
  );
  userId = created.user.id;
  const createdOwner = await requireNoError(
    await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    }),
    "create privacy owner",
  );
  ownerUserId = createdOwner.user.id;
  const createdClaimUser = await requireNoError(
    await admin.auth.admin.createUser({
      email: claimEmail,
      password,
      email_confirm: true,
    }),
    "create owner-claim test user",
  );
  claimUserId = createdClaimUser.user.id;
  const createdEdgeUser = await requireNoError(
    await admin.auth.admin.createUser({
      email: edgeEmail,
      password,
      email_confirm: true,
    }),
    "create Edge MFA test user",
  );
  edgeUserId = createdEdgeUser.user.id;
  const createdRecoveryUser = await requireNoError(
    await admin.auth.admin.createUser({
      email: recoveryEmail,
      password,
      email_confirm: true,
    }),
    "create recovery test user",
  );
  recoveryUserId = createdRecoveryUser.user.id;

  const inviteLink = await requireNoError(
    await admin.auth.admin.generateLink({ type: "invite", email: inviteEmail }),
    "generate invite link",
  );
  inviteUserId = inviteLink.user.id;
  const inviteClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await requireNoError(
    await inviteClient.auth.verifyOtp({
      token_hash: inviteLink.properties.hashed_token,
      type: "invite",
    }),
    "verify invite token",
  );
  await requireNoError(
    await inviteClient.auth.updateUser({ password }),
    "set invited user password",
  );
  await requireNoError(
    await inviteClient.auth.signInWithPassword({ email: inviteEmail, password }),
    "sign in invited user",
  );

  const recoveryLink = await requireNoError(
    await admin.auth.admin.generateLink({ type: "recovery", email: recoveryEmail }),
    "generate recovery link",
  );
  const recoveryClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await requireNoError(
    await recoveryClient.auth.verifyOtp({
      token_hash: recoveryLink.properties.hashed_token,
      type: "recovery",
    }),
    "verify recovery token",
  );
  await requireNoError(
    await recoveryClient.auth.updateUser({ password: recoveredPassword }),
    "update recovered password",
  );
  await requireNoError(
    await recoveryClient.auth.signInWithPassword({
      email: recoveryEmail,
      password: recoveredPassword,
    }),
    "sign in with recovered password",
  );
  console.log(isAllowedPreview ? "auth_invite_recovery_preview_passed" : "auth_invite_recovery_local_passed");

  await requireNoError(
    await admin.from("clinics").insert({
      clinic_id: clinicId,
      slug: `auth-${suffix}`,
      display_name: "Auth lifecycle test clinic",
    }),
    "create test clinic",
  );
  await requireNoError(
    await admin.from("clinics").insert({
      clinic_id: clinicIdB,
      slug: `auth-${suffix}-b`,
      display_name: "Auth lifecycle test clinic B",
    }),
    "create second test clinic",
  );
  await requireNoError(
    await admin.from("staff").insert({
      staff_id: staffId,
      clinic_id: clinicId,
      auth_user_id: userId,
      role: "clinic_admin",
      is_active: true,
      name: "Auth lifecycle admin",
      full_name: "Auth lifecycle admin",
      email: userEmail,
    }),
    "create test staff",
  );
  await requireNoError(
    await admin.from("staff").insert({
      staff_id: edgeStaffId,
      clinic_id: clinicId,
      auth_user_id: edgeUserId,
      role: "vet",
      is_active: true,
      name: "Edge MFA veterinarian",
      full_name: "Edge MFA veterinarian",
      email: edgeEmail,
    }),
    "create Edge MFA test staff",
  );
  await requireNoError(
    await admin.from("owners").insert({
      owner_id: ownerId,
      clinic_id: clinicId,
      auth_user_id: ownerUserId,
      email: ownerEmail,
    }),
    "create test owner",
  );
  await requireNoError(
    await admin.from("owners").insert([
      { owner_id: claimOwnerA, clinic_id: clinicId, email: claimEmail },
      { owner_id: claimOwnerB, clinic_id: clinicIdB, email: claimEmail },
    ]),
    "create ambiguous owner profiles",
  );
  await requireNoError(
    await admin.from("patients").insert({
      pet_id: petId,
      clinic_id: clinicId,
      owner_id: ownerId,
      pet_name: "Auth lifecycle pet",
      weight: 1,
    }),
    "create test patient",
  );

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await requireNoError(
    await client.auth.signInWithPassword({ email: userEmail, password }),
    "sign in test admin",
  );

  const claimClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await requireNoError(
    await claimClient.auth.signInWithPassword({ email: claimEmail, password }),
    "sign in owner-claim user",
  );
  const ambiguousClaim = await claimClient.rpc("claim_owner_profile");
  assert.match(ambiguousClaim.error?.message || "", /OWNER_PROFILE_AMBIGUOUS/);
  const ambiguousProfiles = await requireNoError(
    await admin.from("owners").select("owner_id, auth_user_id").in("owner_id", [claimOwnerA, claimOwnerB]),
    "verify ambiguous owner profiles",
  );
  assert.equal(ambiguousProfiles.length, 2);
  assert.ok(ambiguousProfiles.every((owner) => owner.auth_user_id === null));

  if (isAllowedPreview) {
    for (const testCase of edgeSmokeCases) {
      const unauthenticated = await invokeEdgeFunction(testCase, null);
      assert.equal(unauthenticated.status, 401, `${testCase.name} accepted a request without JWT.`);
    }
    const edgeClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const edgeSignIn = await requireNoError(
      await edgeClient.auth.signInWithPassword({ email: edgeEmail, password }),
      "sign in Edge MFA test user",
    );
    await assertEdgeMfaBoundary(edgeSignIn.session.access_token, true);
    const edgeEnrollment = await requireNoError(
      await edgeClient.auth.mfa.enroll({ factorType: "totp", friendlyName: "MyVet Edge acceptance" }),
      "enroll Edge TOTP",
    );
    const edgeAal2 = await requireNoError(
      await edgeClient.auth.mfa.challengeAndVerify({
        factorId: edgeEnrollment.id,
        code: totp(edgeEnrollment.totp.secret),
      }),
      "verify Edge TOTP",
    );
    await assertEdgeMfaBoundary(edgeAal2.access_token, false);
    console.log(`edge_mfa_preview_passed:${edgeSmokeCases.length}`);
  }

  const ownerClientA = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ownerClientB = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await requireNoError(
    await ownerClientA.auth.signInWithPassword({ email: ownerEmail, password }),
    "sign in privacy owner A",
  );
  await requireNoError(
    await ownerClientB.auth.signInWithPassword({ email: ownerEmail, password }),
    "sign in privacy owner B",
  );
  const [privacyRequestA, privacyRequestB] = await Promise.all([
    ownerClientA.rpc("myvet_submit_privacy_request", {
      requested_type: "access",
      requested_details: "first concurrent request",
    }),
    ownerClientB.rpc("myvet_submit_privacy_request", {
      requested_type: "access",
      requested_details: "second concurrent request",
    }),
  ]);
  const privacyRequestIdA = await requireNoError(privacyRequestA, "submit privacy request A");
  const privacyRequestIdB = await requireNoError(privacyRequestB, "submit privacy request B");
  assert.equal(privacyRequestIdA, privacyRequestIdB, "Concurrent privacy requests created different rows.");
  const openRequests = await requireNoError(
    await admin
      .from("privacy_requests")
      .select("request_id")
      .eq("clinic_id", clinicId)
      .eq("owner_id", ownerId)
      .eq("request_type", "access")
      .in("status", ["submitted", "identity_review", "in_review"]),
    "count concurrent privacy requests",
  );
  assert.equal(openRequests.length, 1, "Concurrent privacy requests were not deduplicated.");

  const initialAal = await requireNoError(
    await client.auth.mfa.getAuthenticatorAssuranceLevel(),
    "read initial AAL",
  );
  assert.equal(initialAal.currentLevel, "aal1");

  const manageBeforeMfa = await client.rpc("myvet_manage_privacy_request", {
    requested_request_id: privacyRequestIdA,
    requested_status: "in_review",
    requested_resolution_notes: null,
  });
  assert.match(manageBeforeMfa.error?.message || "", /MFA_REQUIRED/);

  const beforeMfa = await requireNoError(
    await client.from("patients").select("pet_id"),
    "query before MFA",
  );
  assert.equal(beforeMfa.length, 0, "AAL1 clinic admin could read patient data.");

  const enrollment = await requireNoError(
    await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "MyVet acceptance" }),
    "enroll TOTP",
  );
  await requireNoError(
    await client.auth.mfa.challengeAndVerify({
      factorId: enrollment.id,
      code: totp(enrollment.totp.secret),
    }),
    "verify TOTP",
  );

  const verifiedAal = await requireNoError(
    await client.auth.mfa.getAuthenticatorAssuranceLevel(),
    "read verified AAL",
  );
  assert.equal(verifiedAal.currentLevel, "aal2");

  await requireNoError(
    await client.rpc("myvet_manage_privacy_request", {
      requested_request_id: privacyRequestIdA,
      requested_status: "completed",
      requested_resolution_notes: "local acceptance",
    }),
    "manage privacy request after MFA",
  );

  const afterMfa = await requireNoError(
    await client.from("patients").select("pet_id").eq("pet_id", petId),
    "query after MFA",
  );
  assert.equal(afterMfa.length, 1, "AAL2 clinic admin did not regain tenant access.");

  for (const bucket of ["documents", "chat-attachments"]) {
    const path = `${userId}/p0-revoke-${suffix}.txt`;
    await requireNoError(await client.storage.from(bucket).upload(path, "synthetic P0 revoke fixture", {
      contentType: "text/plain", upsert: false,
    }), `upload ${bucket} fixture`);
    storageFixtures.push({ bucket, path });
    const downloaded = await requireNoError(await client.storage.from(bucket).download(path), `active download ${bucket}`);
    assert.equal(await downloaded.text(), "synthetic P0 revoke fixture");
    const signed = await requireNoError(await client.storage.from(bucket).createSignedUrl(path, 5), `active signing ${bucket}`);
    storageFixtures.at(-1).signedUrl = signed.signedUrl;
    const signedResponse = await fetch(signed.signedUrl);
    assert.equal(signedResponse.status, 200, `active signed download ${bucket}`);
    assert.equal(await signedResponse.text(), "synthetic P0 revoke fixture");
  }

  await requireNoError(
    await admin.from("staff").update({ role: "nurse" }).eq("staff_id", staffId),
    "change test staff role",
  );
  const afterRoleChangeRefresh = await client.auth.refreshSession();
  assert.ok(afterRoleChangeRefresh.error, "Staff role change retained a refreshable session.");
  const postRoleClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await requireNoError(
    await postRoleClient.auth.signInWithPassword({ email: userEmail, password }),
    "sign in after role change",
  );
  const afterRoleChangeSignIn = await requireNoError(
    await postRoleClient.from("patients").select("pet_id").eq("pet_id", petId),
    "query after role-change sign-in",
  );
  assert.equal(afterRoleChangeSignIn.length, 1, "Nurse lost the existing role-scoped tenant access.");

  await requireNoError(
    await admin.from("staff").update({ is_active: false }).eq("staff_id", staffId),
    "disable test staff",
  );
  const afterDisable = await requireNoError(
    await postRoleClient.from("patients").select("pet_id").eq("pet_id", petId),
    "query after disable",
  );
  assert.equal(afterDisable.length, 0, "Disabled staff retained patient access.");
  for (const { bucket, path } of storageFixtures) {
    assert.ok((await postRoleClient.storage.from(bucket).download(path)).error, `disabled download ${bucket}`);
    assert.ok((await postRoleClient.storage.from(bucket).createSignedUrl(path, 60)).error, `disabled signing ${bucket}`);
    assert.ok((await postRoleClient.storage.from(bucket).update(path, "forbidden")).error, `disabled update ${bucket}`);
    await postRoleClient.storage.from(bucket).remove([path]);
    // Storage may return an empty success for a filtered delete; verify persisted bytes.
    const persisted = await requireNoError(await admin.storage.from(bucket).download(path), `verify denied delete ${bucket}`);
    assert.equal(await persisted.text(), "synthetic P0 revoke fixture");
  }
  // Previously issued bearer URLs have a separate expiry; never claim immediate revocation.
  await new Promise((resolve) => setTimeout(resolve, 7000));
  for (const { bucket, signedUrl } of storageFixtures) {
    const expired = await fetch(signedUrl);
    assert.ok(!expired.ok, `expired signed URL still works in ${bucket}`);
    await expired.arrayBuffer();
  }
  console.log("storage_revoke_http_and_short_url_expiry_passed");
  const refreshed = await postRoleClient.auth.refreshSession();
  assert.ok(refreshed.error, "Disabled staff retained a refreshable session.");

  console.log(isAllowedPreview ? "auth_lifecycle_preview_passed" : "auth_lifecycle_local_passed");
} finally {
  for (const { bucket, path } of storageFixtures) {
    await requireNoError(await admin.storage.from(bucket).remove([path]), `clean ${bucket} fixture`);
  }
  await requireNoError(
    await admin.from("privacy_requests").delete().eq("clinic_id", clinicId),
    "clean privacy requests",
  );
  await requireNoError(await admin.from("patients").delete().eq("pet_id", petId), "clean patient");
  await requireNoError(
    await admin.from("owners").delete().in("owner_id", [ownerId, claimOwnerA, claimOwnerB]),
    "clean owners",
  );
  await requireNoError(await admin.from("staff").delete().eq("staff_id", staffId), "clean staff");
  await requireNoError(await admin.from("staff").delete().eq("staff_id", edgeStaffId), "clean Edge staff");
  // Required fail-closed AI flag rows intentionally reject deletion, including
  // cascades from clinics. The isolated Preview branch is deleted after this
  // acceptance run, so retain only these empty clinic fixtures until teardown.
  if (userId) await requireNoError(await admin.auth.admin.deleteUser(userId), "clean staff Auth user");
  if (ownerUserId) {
    await requireNoError(await admin.auth.admin.deleteUser(ownerUserId), "clean owner Auth user");
  }
  if (claimUserId) {
    await requireNoError(await admin.auth.admin.deleteUser(claimUserId), "clean claim Auth user");
  }
  if (weakUserId) {
    await requireNoError(await admin.auth.admin.deleteUser(weakUserId), "clean password-policy Auth user");
  }
  if (edgeUserId) {
    await requireNoError(await admin.auth.admin.deleteUser(edgeUserId), "clean Edge Auth user");
  }
  if (inviteUserId) {
    await requireNoError(await admin.auth.admin.deleteUser(inviteUserId), "clean invited Auth user");
  }
  if (recoveryUserId) {
    await requireNoError(await admin.auth.admin.deleteUser(recoveryUserId), "clean recovery Auth user");
  }
}
