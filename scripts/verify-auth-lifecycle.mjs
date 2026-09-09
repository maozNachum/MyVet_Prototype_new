import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.MYVET_TEST_SUPABASE_URL;
const anonKey = process.env.MYVET_TEST_ANON_KEY;
const serviceRoleKey = process.env.MYVET_TEST_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey || !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/.test(url)) {
  throw new Error("Refusing to run: local Supabase test credentials are required.");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = randomUUID().slice(0, 8);
const userEmail = `auth-admin-${suffix}@example.invalid`;
const weakEmail = `auth-weak-${suffix}@example.invalid`;
const password = "MyVet!Local#2026";
const clinicId = randomUUID();
const staffId = randomUUID();
const ownerId = `AUTH-${suffix.toUpperCase()}`;
const petId = 970000 + Math.floor(Math.random() * 20000);
let userId = null;

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
  const weakSignup = await weakClient.auth.signUp({
    email: weakEmail,
    password: "weak123",
  });
  assert.ok(weakSignup.error, "Local Auth accepted a weak password.");

  const created = await requireNoError(
    await admin.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
    }),
    "create test user",
  );
  userId = created.user.id;

  await requireNoError(
    await admin.from("clinics").insert({
      clinic_id: clinicId,
      slug: `auth-${suffix}`,
      display_name: "Auth lifecycle test clinic",
    }),
    "create test clinic",
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
    await admin.from("owners").insert({
      owner_id: ownerId,
      clinic_id: clinicId,
      email: `owner-${suffix}@example.invalid`,
    }),
    "create test owner",
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

  const initialAal = await requireNoError(
    await client.auth.mfa.getAuthenticatorAssuranceLevel(),
    "read initial AAL",
  );
  assert.equal(initialAal.currentLevel, "aal1");

  const beforeMfa = await requireNoError(
    await client.from("patients").select("pet_id"),
    "query before MFA",
  );
  assert.equal(beforeMfa.length, 0, "AAL1 clinic admin could read patient data.");

  const enrollment = await requireNoError(
    await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "MyVet local acceptance" }),
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

  const afterMfa = await requireNoError(
    await client.from("patients").select("pet_id").eq("pet_id", petId),
    "query after MFA",
  );
  assert.equal(afterMfa.length, 1, "AAL2 clinic admin did not regain tenant access.");

  await requireNoError(
    await admin.from("staff").update({ is_active: false }).eq("staff_id", staffId),
    "disable test staff",
  );
  const afterDisable = await requireNoError(
    await client.from("patients").select("pet_id").eq("pet_id", petId),
    "query after disable",
  );
  assert.equal(afterDisable.length, 0, "Disabled staff retained patient access.");
  const refreshed = await client.auth.refreshSession();
  assert.ok(refreshed.error, "Disabled staff retained a refreshable session.");

  console.log("auth_lifecycle_local_passed");
} finally {
  await admin.from("patients").delete().eq("pet_id", petId);
  await admin.from("owners").delete().eq("owner_id", ownerId);
  await admin.from("staff").delete().eq("staff_id", staffId);
  await admin.from("clinics").delete().eq("clinic_id", clinicId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}
