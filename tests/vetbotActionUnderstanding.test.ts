import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVetBotActionConversationText,
  inferInventoryOperation,
  matchUniqueVetBotNameInTextForTest,
  normalizeVetBotLookup,
  refineVetBotActionProposal,
} from "../supabase/functions/_shared/vetbotActions.ts";
import { validateVetBotOutput } from "../supabase/functions/_shared/ai/schemas.ts";

test("inventory operation is inferred from a complete Hebrew request", () => {
  assert.equal(inferInventoryOperation("הוסף 1 יחידה למלאי של נורופן"), "add");
  assert.equal(inferInventoryOperation("הפחת 2 יחידות מאמוקסיצלין"), "remove");
  assert.equal(inferInventoryOperation("עדכן את הכמות של בונזו ל-8"), "set");
  assert.equal(inferInventoryOperation("קיבלנו עוד 3 יחידות נורופן"), "add");
  assert.equal(inferInventoryOperation("השתמשנו ב-2 יחידות נורופן"), "remove");
});

test("a unique patient is found inside natural Hebrew with a small typo", () => {
  assert.deepEqual(matchUniqueVetBotNameInTextForTest(["בל", "נלה"], "תשריין לבלל מקום מחר בבוקר"), {
    value: "בל",
    ambiguous: false,
  });
  assert.equal(matchUniqueVetBotNameInTextForTest(["בל", "בל"], "תקבע לבל תור").ambiguous, true);
  assert.equal(matchUniqueVetBotNameInTextForTest(["בל"], "תקבע לי תור").value, null);
});

test("natural Hebrew synonyms refine operational intents deterministically", () => {
  const booking = refineVetBotActionProposal({ type: "none" }, "תשריין לבל מקום מחר בשמונה בבוקר לבדיקה כללית", "appointments");
  assert.equal(booking?.type, "book_appointment");
  assert.equal(booking?.appointmentTime, "08:00");
  assert.equal(booking?.appointmentType, "בדיקה כללית");
  assert.match(String(booking?.appointmentDate), /^20\d{2}-\d{2}-\d{2}$/);
  assert.equal(refineVetBotActionProposal({ type: "none" }, "תוותר על התור של בל", "appointments")?.type, "cancel_appointment");
  assert.equal(refineVetBotActionProposal({ type: "none" }, "שים בצד בארכיון את שיחה מספר 13", "digital")?.conversationRef, 13);
  assert.equal(refineVetBotActionProposal({ type: "none" }, "בדיקה מספר 10 לא סובלת דיחוי", "lab")?.isUrgent, true);
  const block = refineVetBotActionProposal({ type: "none" }, "אל תאפשר תורים ב 2026-07-28 בין 10:00 ל 11:00", "appointments");
  assert.equal(block?.blockDate, "2026-07-28");
  assert.equal(block?.blockStart, "10:00");
  assert.equal(block?.blockEnd, "11:00");
  assert.equal(refineVetBotActionProposal({ type: "forbidden" }, "תשריין לבל תור מחר", "appointments")?.type, "book_appointment");
  assert.equal(refineVetBotActionProposal({ type: "book_appointment" }, "תקבע תור ואז תמחק את המטופל", "appointments")?.type, "forbidden");
  assert.equal(refineVetBotActionProposal(null, "קח אותי למסך המלאי", "dashboard")?.type, "navigate");
  assert.equal(refineVetBotActionProposal(null, "פתח פריט חדש במלאי בשם בדיקה", "inventory")?.type, "create_inventory_item");
});

test("appointment details are preserved across short Hebrew follow-up turns", () => {
  const conversation = buildVetBotActionConversationText([
    { role: "user", content: "תקבע תור חיסון לבל בתאריך 20.07.2026 בשעה 17:00" },
    { role: "assistant", content: "כדי להמשיך חסרים לי פרטים" },
    { role: "user", content: "20.07.2026" },
  ], "20.07.2026");
  const proposal = refineVetBotActionProposal({ type: "book_appointment" }, conversation, "appointments");

  assert.equal(proposal?.type, "book_appointment");
  assert.equal(proposal?.appointmentDate, "2026-07-20");
  assert.equal(proposal?.appointmentTime, "17:00");
  assert.equal(proposal?.appointmentType, "חיסון");
  assert.match(conversation, /בל/);
});

test("a clear new topic does not inherit an unfinished appointment action", () => {
  const conversation = buildVetBotActionConversationText([
    { role: "user", content: "תקבע תור חיסון לבל מחר בשעה 10:00" },
  ], "פתח את מסך המלאי");

  assert.equal(conversation, "פתח את מסך המלאי");
  assert.equal(refineVetBotActionProposal(null, conversation, "dashboard")?.type, "navigate");
});

test("invalid Israeli calendar dates are not accepted as appointment dates", () => {
  const proposal = refineVetBotActionProposal({ type: "book_appointment" }, "תקבע לבל תור חיסון ב-31.02.2026 בשעה 10:00", "appointments");
  assert.equal(proposal?.appointmentDate, undefined);
});

test("an adjust proposal is completed deterministically without another turn", () => {
  const proposal = refineVetBotActionProposal({
    type: "adjust_inventory",
    itemName: "נורופן",
    quantity: 1,
  }, "הוסף 1 יחידה למלאי של נורופן", "inventory");

  assert.equal(proposal?.type, "adjust_inventory");
  assert.equal(proposal?.inventoryOperation, "add");
});

test("an inventory action can be recovered from natural Hebrew when the provider is unavailable", () => {
  const proposal = refineVetBotActionProposal(null, "קיבלנו עוד 3 יחידות של נורופן למלאי", "inventory");
  assert.equal(proposal?.type, "adjust_inventory");
  assert.equal(proposal?.inventoryOperation, "add");
  assert.equal(proposal?.quantity, 3);
  assert.equal(proposal?.itemName, "נורופן");
});

test("creating a new item is distinct from changing an existing quantity", () => {
  const create = refineVetBotActionProposal({
    type: "adjust_inventory",
    itemName: "תחבושת בדיקה",
    quantity: 2,
  }, "הוסף פריט חדש למלאי בשם תחבושת בדיקה", "inventory");
  const adjust = refineVetBotActionProposal({
    type: "adjust_inventory",
    itemName: "תחבושת",
    quantity: 2,
  }, "הוסף 2 יחידות למלאי של תחבושת", "inventory");

  assert.equal(create?.type, "create_inventory_item");
  assert.equal(adjust?.type, "adjust_inventory");
  assert.equal(adjust?.inventoryOperation, "add");
});

test("name normalization tolerates punctuation, niqqud and spacing", () => {
  assert.equal(normalizeVetBotLookup("  בֶּל׳  "), "בל");
  assert.equal(normalizeVetBotLookup("נורופן--200"), "נורופן 200");
});

test("the strict VetBot schema accepts a complete create-inventory proposal", () => {
  const output = validateVetBotOutput({
    answer: "הכנתי פריט חדש לבדיקה.",
    summary: "פריט חדש",
    urgency: "normal",
    confidence: "high",
    findings: [],
    suggestedActions: [],
    actionProposal: {
      type: "create_inventory_item",
      intentSummary: "יצירת פריט מלאי",
      missingFields: [],
      itemName: "תחבושת",
      itemCategory: "consumable",
      quantity: 4,
      lowStockThreshold: 2,
      unitPrice: 8.5,
    },
    memorySummary: "",
  });

  assert.equal(output.actionProposal.type, "create_inventory_item");
  assert.equal(output.actionProposal.itemCategory, "consumable");
});
