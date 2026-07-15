import test from "node:test";
import assert from "node:assert/strict";
import { protectAiPayload, redactSensitiveText } from "../src/app/components/ai/aiSanitizer.ts";

test("VetBot removes direct identifiers from free text", () => {
  const raw = "שם הבעלים: ישראל ישראלי, תז 123456782, טלפון 050-1234567, mail@example.com, כתובת רחוב הרצל 12 תל אביב https://example.com/private";
  const safe = redactSensitiveText(raw);

  assert.doesNotMatch(safe, /123456782/);
  assert.doesNotMatch(safe, /050-1234567/);
  assert.doesNotMatch(safe, /mail@example\.com/);
  assert.doesNotMatch(safe, /הרצל 12/);
  assert.doesNotMatch(safe, /example\.com/);
  assert.match(safe, /הוסר|הוסרה/);
});

test("VetBot drops sensitive object fields and keeps aggregate facts", () => {
  const protectedPayload = protectAiPayload({
    owner_id: "123456782",
    ownerName: "ישראל ישראלי",
    petName: "לאקי",
    phone: "0501234567",
    address: "הרצל 12",
    summary: { appointmentsToday: 8, urgentLabs: 2 },
  });

  assert.deepEqual(protectedPayload.value, { summary: { appointmentsToday: 8, urgentLabs: 2 } });
  assert.ok(protectedPayload.report.total >= 5);
  assert.ok(protectedPayload.report.categories.includes("sensitive-field"));
});
