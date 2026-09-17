import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

async function service(client) {
  const key = `privacyMock${Math.random().toString(36).slice(2)}`;
  globalThis[key] = client;
  const source = readFileSync("src/services/privacyRequestManagement.ts", "utf8")
    .replace('import { supabase } from "./supabaseClient";', `const supabase = globalThis[${JSON.stringify(key)}];`);
  try { return await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`); }
  finally { delete globalThis[key]; }
}

test("management rejects insufficient notes without a write", async () => {
  const api = await service({ rpc() { throw Error("unexpected write"); } });
  await assert.rejects(api.managePrivacyRequest("request", "completed", "short"), /10/);
});

test("management sends normalized notes through the existing RPC only", async () => {
  const calls = [];
  const api = await service({ async rpc(...args) { calls.push(args); return { data: "request", error: null }; } });
  await api.managePrivacyRequest("request", "in_review", "  verified synthetic request  ");
  assert.deepEqual(calls, [["myvet_manage_privacy_request", {
    requested_request_id: "request", requested_status: "in_review", requested_resolution_notes: "verified synthetic request",
  }]]);
});

test("management hides raw server details and rejects missing acknowledgement", async () => {
  const denied = await service({ async rpc() { return { error: { message: "SQL private.clinic MFA_REQUIRED" } }; } });
  await assert.rejects(denied.managePrivacyRequest("request", "in_review", "synthetic notes"), (error) => error.message.includes("אימות נוסף") && !error.message.includes("SQL"));
  const absent = await service({ async rpc() { return { data: null }; } });
  await assert.rejects(absent.managePrivacyRequest("request", "in_review", "synthetic notes"), /לא התקבל אישור/);
});

test("queue scopes clinic and statuses, uses stable ordering and one lookahead row", async () => {
  const calls = [];
  const query = {};
  for (const method of ["select", "eq", "in", "order"]) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.range = async (...args) => { calls.push(["range", ...args]); return { data: Array.from({ length: 21 }, (_, index) => ({ request_id: String(index), owner_id: "owner", request_type: "access", status: "submitted", submitted_at: "2026-09-17" })) }; };
  const api = await service({ from(table) { assert.equal(table, "privacy_requests"); return query; } });
  const result = await api.listClinicPrivacyRequests("clinic-a", "open", 1);
  assert.equal(result.requests.length, 20); assert.equal(result.hasNext, true);
  assert.ok(calls.some((c) => JSON.stringify(c) === JSON.stringify(["eq", "clinic_id", "clinic-a"])));
  assert.ok(calls.some((c) => JSON.stringify(c) === JSON.stringify(["in", "status", ["submitted", "identity_review", "in_review"]])));
  assert.deepEqual(calls.at(-1), ["range", 20, 40]);
  assert.deepEqual(calls.at(-2), ["order", "request_id", { ascending: true }]);
});
