import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.MYVET_TEST_SUPABASE_URL;
const anonKey = process.env.MYVET_TEST_ANON_KEY;
const serviceRoleKey = process.env.MYVET_TEST_SERVICE_ROLE_KEY;
const allowedProjectRef = process.env.MYVET_TEST_ALLOWED_PROJECT_REF;
const productionProjectRef = "bavpqmopcrhtrwatmyng";
const keepFixtures = process.env.MYVET_TEST_KEEP_FIXTURES === "1";

if (
  !url ||
  !anonKey ||
  !serviceRoleKey ||
  !allowedProjectRef ||
  allowedProjectRef === productionProjectRef ||
  url !== `https://${allowedProjectRef}.supabase.co`
) {
  throw new Error("Refusing to run: an explicitly allowed non-Production Supabase Preview target is required.");
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceRoleKey, clientOptions);
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const password = "MyVet!Invite#2026Aa";
const adminEmail = `onboarding-admin-${suffix}@example.invalid`;
const secondAdminEmail = `onboarding-admin-b-${suffix}@example.invalid`;
const staffEmail = `onboarding-staff-${suffix}@example.invalid`;
const wrongEmail = `onboarding-wrong-${suffix}@example.invalid`;
const ownerEmail = `onboarding-owner-${suffix}@example.invalid`;
const redirectEmail = `onboarding-redirect-${suffix}@example.invalid`;
const ownerRedirectEmail = `onboarding-owner-redirect-${suffix}@example.invalid`;
const ownerId = String(100_000_000 + Math.floor(Math.random() * 900_000_000));
const createdUserIds = new Set();
const createdClinicIds = new Set();

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

async function dataOrThrow(result, label) {
  if (result.error) {
    const details = [
      result.error.message,
      result.error.code,
      result.error.status,
      result.error.name,
    ].filter(Boolean).join(" | ");
    throw new Error(`${label}: ${details || JSON.stringify(result.error)}`);
  }
  return result.data;
}

async function expectRpcFailure(promise, expectedCode, label) {
  const result = await promise;
  assert(result.error, `${label}: request unexpectedly succeeded.`);
  assert.match(result.error.message, new RegExp(expectedCode), `${label}: unexpected error ${result.error.message}`);
}

function actionLinkRedirect(actionLink) {
  const redirect = new URL(actionLink).searchParams.get("redirect_to");
  return redirect ? decodeURIComponent(redirect) : null;
}

async function makeConfirmedUser(email, metadata = {}) {
  const created = await dataOrThrow(
    await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata }),
    `create Auth user ${email}`,
  );
  createdUserIds.add(created.user.id);
  return created.user;
}

async function signIn(email) {
  const client = createClient(url, anonKey, clientOptions);
  await dataOrThrow(await client.auth.signInWithPassword({ email, password }), `sign in ${email}`);
  return client;
}

async function deleteWhere(table, column, values) {
  if (values.length === 0) return;
  const { error } = await admin.from(table).delete().in(column, values);
  if (error) console.error(`cleanup_warning:${table}:${error.message}`);
}

try {
  const adminUser = await makeConfirmedUser(adminEmail, { full_name: "מנהל בדיקות MyVet" });
  const adminClient = await signIn(adminEmail);

  const firstClinicRows = await dataOrThrow(
    await adminClient.rpc("myvet_create_clinic", {
      requested_slug: `qa-${suffix}-a`,
      requested_display_name: "מרפאת קבלה א׳",
    }),
    "create first clinic",
  );
  const firstClinicId = firstClinicRows[0]?.clinic_id;
  assert.match(firstClinicId || "", /^[0-9a-f-]{36}$/i, "First clinic was not created.");
  createdClinicIds.add(firstClinicId);

  const enrollment = await dataOrThrow(
    await adminClient.auth.mfa.enroll({ factorType: "totp", friendlyName: "MyVet onboarding acceptance" }),
    "enroll admin TOTP",
  );
  await dataOrThrow(
    await adminClient.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code: totp(enrollment.totp.secret) }),
    "verify admin TOTP",
  );

  await makeConfirmedUser(secondAdminEmail, { full_name: "מנהל מרפאה ב׳" });
  const secondAdminClient = await signIn(secondAdminEmail);
  const secondClinicRows = await dataOrThrow(
    await secondAdminClient.rpc("myvet_create_clinic", {
      requested_slug: `qa-${suffix}-b`,
      requested_display_name: "מרפאת קבלה ב׳",
    }),
    "create second clinic",
  );
  const secondClinicId = secondClinicRows[0]?.clinic_id;
  assert.match(secondClinicId || "", /^[0-9a-f-]{36}$/i, "Second clinic was not created.");
  createdClinicIds.add(secondClinicId);

  assert.equal(
    await dataOrThrow(
      await adminClient.rpc("myvet_set_active_clinic", { requested_clinic_id: firstClinicId }),
      "switch admin to first clinic",
    ),
    firstClinicId,
  );
  const directOwnerInsert = await adminClient.from("owners").insert({
    owner_id: `FORGED-${suffix.toUpperCase()}`,
    clinic_id: firstClinicId,
    email: `forged-${suffix}@example.invalid`,
  });
  assert.ok(directOwnerInsert.error, "Authenticated browser user could insert directly into owners.");
  const forgedOwnerRows = await dataOrThrow(
    await admin.from("owners").select("owner_id").eq("owner_id", `FORGED-${suffix.toUpperCase()}`),
    "verify direct owner insert rejection",
  );
  assert.equal(forgedOwnerRows.length, 0, "Rejected direct owner insert left a persisted row.");
  await expectRpcFailure(
    adminClient.rpc("myvet_set_active_clinic", { requested_clinic_id: secondClinicId }),
    "CLINIC_ACCESS_DENIED",
    "reject admin switch to foreign clinic",
  );

  const staffInvites = await dataOrThrow(
    await adminClient.rpc("myvet_create_clinic_invitation", {
      requested_clinic_id: firstClinicId,
      requested_email: staffEmail,
      requested_invitation_type: "staff",
      requested_role: "vet",
    }),
    "create staff invitation",
  );
  const staffToken = staffInvites[0]?.invitation_token;
  assert.equal(typeof staffToken, "string", "Staff invitation token was not returned.");

  const staffRedirect = `http://localhost:5173/login?mode=login&role=staff&invite=${encodeURIComponent(staffToken)}`;
  const staffLink = await dataOrThrow(
    await admin.auth.admin.generateLink({
      type: "signup",
      email: staffEmail,
      password,
      options: {
        redirectTo: staffRedirect,
        data: { role: "staff", full_name: "וטרינר בדיקות", invitation_token: staffToken },
      },
    }),
    "generate staff signup link",
  );
  createdUserIds.add(staffLink.user.id);
  assert.equal(actionLinkRedirect(staffLink.properties.action_link), staffRedirect, "Staff redirect was not allowlisted.");

  await makeConfirmedUser(wrongEmail, { full_name: "משתמש זר" });
  const wrongClient = await signIn(wrongEmail);
  await expectRpcFailure(
    wrongClient.rpc("myvet_accept_clinic_invitation", {
      requested_token: staffToken,
      requested_full_name: "משתמש זר",
    }),
    "INVITATION_INVALID_OR_EXPIRED",
    "reject invitation for wrong email",
  );

  const staffClient = createClient(url, anonKey, clientOptions);
  await dataOrThrow(
    await staffClient.auth.verifyOtp({ token_hash: staffLink.properties.hashed_token, type: "signup" }),
    "confirm staff signup",
  );
  const acceptedStaff = await dataOrThrow(
    await staffClient.rpc("myvet_accept_clinic_invitation", {
      requested_token: staffToken,
      requested_full_name: "וטרינר בדיקות",
    }),
    "accept staff invitation",
  );
  assert.equal(acceptedStaff.clinic_id, firstClinicId);
  assert.equal(acceptedStaff.role, "vet");
  await expectRpcFailure(
    staffClient.rpc("myvet_accept_clinic_invitation", {
      requested_token: staffToken,
      requested_full_name: "וטרינר בדיקות",
    }),
    "INVITATION_INVALID_OR_EXPIRED",
    "reject replayed staff invitation",
  );
  const staffEnrollment = await dataOrThrow(
    await staffClient.auth.mfa.enroll({ factorType: "totp", friendlyName: "MyVet invited staff acceptance" }),
    "enroll invited staff TOTP",
  );
  await dataOrThrow(
    await staffClient.auth.mfa.challengeAndVerify({
      factorId: staffEnrollment.id,
      code: totp(staffEnrollment.totp.secret),
    }),
    "verify invited staff TOTP",
  );
  assert.equal(
    await dataOrThrow(
      await staffClient.rpc("myvet_set_active_clinic", { requested_clinic_id: firstClinicId }),
      "set staff active clinic",
    ),
    firstClinicId,
  );
  await expectRpcFailure(
    staffClient.rpc("myvet_set_active_clinic", { requested_clinic_id: secondClinicId }),
    "CLINIC_ACCESS_DENIED",
    "reject staff switch to foreign clinic",
  );
  const staffVisibleClinics = await dataOrThrow(await staffClient.from("clinics").select("clinic_id"), "read staff clinics");
  assert.deepEqual(staffVisibleClinics.map((clinic) => clinic.clinic_id), [firstClinicId]);

  const ownerInvites = await dataOrThrow(
    await adminClient.rpc("myvet_create_clinic_invitation", {
      requested_clinic_id: firstClinicId,
      requested_email: ownerEmail,
      requested_invitation_type: "owner",
      requested_owner_id: ownerId,
    }),
    "create owner invitation",
  );
  const ownerToken = ownerInvites[0]?.invitation_token;
  assert.equal(typeof ownerToken, "string", "Owner invitation token was not returned.");
  const ownerRedirect = `http://localhost:5173/login?mode=login&role=owner&invite=${encodeURIComponent(ownerToken)}`;
  const ownerLink = await dataOrThrow(
    await admin.auth.admin.generateLink({
      type: "signup",
      email: ownerEmail,
      password,
      options: {
        redirectTo: ownerRedirect,
        data: { role: "owner", owner_id: ownerId, full_name: "בעלים בדיקות", phone: "0521234567", terms_version: "myvet-owner-portal-v1", invitation_token: ownerToken },
      },
    }),
    "generate owner signup link",
  );
  createdUserIds.add(ownerLink.user.id);
  if (keepFixtures) console.log(`debug_owner_user_id:${ownerLink.user.id}`);
  assert.equal(actionLinkRedirect(ownerLink.properties.action_link), ownerRedirect, "Owner invitation redirect was not allowlisted.");
  const ownerClient = createClient(url, anonKey, clientOptions);
  await dataOrThrow(await ownerClient.auth.verifyOtp({ token_hash: ownerLink.properties.hashed_token, type: "signup" }), "confirm owner signup");
  const acceptedOwner = await dataOrThrow(
    await ownerClient.rpc("myvet_accept_clinic_invitation", {
      requested_token: ownerToken,
      requested_full_name: "בעלים בדיקות",
      requested_phone: "0521234567",
      requested_owner_id: ownerId,
      requested_terms_version: "myvet-owner-portal-v1",
    }),
    "accept owner invitation",
  );
  assert.equal(acceptedOwner.clinic_id, firstClinicId);
  const ownerRows = await dataOrThrow(
    await ownerClient.from("owners").select("owner_id, clinic_id, auth_user_id").eq("owner_id", ownerId),
    "read accepted owner",
  );
  assert.equal(ownerRows.length, 1);
  assert.equal(ownerRows[0].clinic_id, firstClinicId);
  assert.equal(ownerRows[0].auth_user_id, ownerLink.user.id);
  await expectRpcFailure(
    ownerClient.rpc("myvet_accept_clinic_invitation", {
      requested_token: ownerToken,
      requested_full_name: "בעלים בדיקות",
      requested_phone: "0521234567",
      requested_owner_id: ownerId,
      requested_terms_version: "myvet-owner-portal-v1",
    }),
    "INVITATION_INVALID_OR_EXPIRED",
    "reject replayed owner invitation",
  );
  assert.equal(
    await dataOrThrow(
      await ownerClient.rpc("myvet_set_active_clinic", { requested_clinic_id: firstClinicId }),
      "set owner active clinic",
    ),
    firstClinicId,
  );
  await expectRpcFailure(
    ownerClient.rpc("myvet_set_active_clinic", { requested_clinic_id: secondClinicId }),
    "CLINIC_ACCESS_DENIED",
    "reject owner switch to foreign clinic",
  );

  const redirectTarget = `http://localhost:5173/login?mode=login&role=staff&invite=${suffix}`;
  const redirectLink = await dataOrThrow(
    await admin.auth.admin.generateLink({
      type: "signup",
      email: redirectEmail,
      password,
      options: { redirectTo: redirectTarget },
    }),
    "generate wildcard redirect link",
  );
  createdUserIds.add(redirectLink.user.id);
  assert.equal(actionLinkRedirect(redirectLink.properties.action_link), redirectTarget, "Dynamic invitation redirect failed.");

  const ownerPortalRedirect = "http://localhost:5173/portal";
  const ownerRedirectLink = await dataOrThrow(
    await admin.auth.admin.generateLink({ type: "signup", email: ownerRedirectEmail, password, options: { redirectTo: ownerPortalRedirect } }),
    "generate owner redirect link",
  );
  createdUserIds.add(ownerRedirectLink.user.id);
  assert.equal(actionLinkRedirect(ownerRedirectLink.properties.action_link), ownerPortalRedirect, "Owner portal redirect was not allowlisted.");

  console.log("multi_clinic_onboarding_preview_passed");
  console.log("verified:redirects,staff_invite,owner_invite,single_use,email_binding,mfa,clinic_switch,tenant_isolation,direct_owner_insert_blocked");
} finally {
  const clinicIds = [...createdClinicIds];
  const userIds = [...createdUserIds];
  if (keepFixtures) {
    console.log(`debug_fixture_suffix:${suffix}`);
    console.log("multi_clinic_onboarding_cleanup_skipped");
    process.exitCode = 1;
  } else {
  await deleteWhere("owners", "clinic_id", clinicIds);
  await deleteWhere("staff", "clinic_id", clinicIds);
  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`cleanup_warning:auth.users:${error.message || "Auth cleanup failed"}`);
  }
  console.log(`multi_clinic_onboarding_admin_cleanup_required:qa-${suffix}`);
  }
}
