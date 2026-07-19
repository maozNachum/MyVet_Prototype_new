import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  AI_CONVERSATION_STORAGE_PREFIX,
  buildAiContinuationQuestion,
  clearAiConversations,
  getAiContextTransitionMessage,
  loadAiConversation,
  saveAiConversation,
} from "../src/app/components/ai/aiConversationStorage.ts";

function installConversationStorage() {
  const data = new Map<string, string>();
  const localStorage = {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => data.delete(key),
    setItem: (key: string, value: string) => data.set(key, value),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
  return localStorage;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test("VetBot conversation survives component remounts and keeps a bounded history", () => {
  installConversationStorage();
  const messages = Array.from({ length: 35 }, (_, index) => ({ role: "user", content: `message-${index}` }));

  saveAiConversation("main", messages, "summary");
  const restored = loadAiConversation<{ role: string; content: string }>("main");

  assert.equal(restored.messages.length, 30);
  assert.equal(restored.messages[0].content, "message-5");
  assert.equal(restored.messages.at(-1)?.content, "message-34");
  assert.equal(restored.memorySummary, "summary");
});

test("logout clears every VetBot surface without removing unrelated browser data", () => {
  const storage = installConversationStorage();
  saveAiConversation("main", [{ content: "main" }]);
  saveAiConversation("reports", [{ content: "reports" }]);
  storage.setItem("myvet_vetbot_conversation:main", "legacy");
  storage.setItem("myvet_unrelated", "keep");

  clearAiConversations();

  assert.equal(storage.getItem(`${AI_CONVERSATION_STORAGE_PREFIX}main`), null);
  assert.equal(storage.getItem(`${AI_CONVERSATION_STORAGE_PREFIX}reports`), null);
  assert.equal(storage.getItem("myvet_vetbot_conversation:main"), null);
  assert.equal(storage.getItem("myvet_unrelated"), "keep");
});

test("invalid stored data fails closed without breaking the chat", () => {
  const storage = installConversationStorage();
  storage.setItem(`${AI_CONVERSATION_STORAGE_PREFIX}main`, "not-json");

  assert.deepEqual(loadAiConversation("main").messages, []);
  assert.equal(storage.getItem(`${AI_CONVERSATION_STORAGE_PREFIX}main`), null);
});

test("VetBot preserves the visible thread but starts a clean model history after a context change", () => {
  installConversationStorage();
  const messages = Array.from({ length: 35 }, (_, index) => ({ role: "user", content: `message-${index}` }));

  saveAiConversation("main", messages, "", {
    activeContext: { key: "medical-record:17", label: "התיק הרפואי של בל" },
    historyStartIndex: 32,
  });
  const restored = loadAiConversation<{ role: string; content: string }>("main");

  assert.equal(restored.messages.length, 30);
  assert.equal(restored.historyStartIndex, 27);
  assert.deepEqual(restored.activeContext, {
    key: "medical-record:17",
    label: "התיק הרפואי של בל",
  });
});

test("VetBot announces only real page or patient context transitions", () => {
  const current = { key: "medical-record:17", label: "התיק הרפואי של בל" };

  assert.equal(getAiContextTransitionMessage(undefined, current), null);
  assert.equal(getAiContextTransitionMessage(current, current), null);
  assert.match(
    getAiContextTransitionMessage(current, { key: "medical-record:21", label: "התיק הרפואי של לולה" }) || "",
    /התיק הרפואי של לולה/,
  );
});

test("the local compatibility request carries appointment details into a date-only follow-up", () => {
  const question = buildAiContinuationQuestion([
    { role: "user", content: "תקבע תור חיסון לבל בשעה 17:00" },
    { role: "assistant", content: "באיזה תאריך?" },
    { role: "user", content: "20.07.2026" },
  ], "20.07.2026");

  assert.match(question, /תקבע תור חיסון לבל בשעה 17:00/);
  assert.match(question, /2026-07-20/);
});

test("the local compatibility request drops old action details when the user changes topic", () => {
  const question = buildAiContinuationQuestion([
    { role: "user", content: "תקבע תור חיסון לבל בשעה 17:00" },
  ], "פתח את מסך המלאי");

  assert.equal(question, "פתח את מסך המלאי");
});

test("the proactive briefing is compact by default and logout paths clear the chat", () => {
  const drawer = readFileSync("src/app/components/ai/AiAssistantDrawer.tsx", "utf8");
  const navbar = readFileSync("src/app/components/Navbar.tsx", "utf8");
  const portal = readFileSync("src/app/pages/ClientPortal.tsx", "utf8");
  const reports = readFileSync("src/app/components/reports/AIInsightsPanel.tsx", "utf8");
  const pageAssistants = readFileSync("src/app/components/ai/PageAssistants.tsx", "utf8");

  assert.match(drawer, /aria-expanded=\{isBriefingExpanded\}/);
  assert.match(drawer, /מה כדאי לבדוק היום/);
  assert.match(drawer, /saveAiConversation\("main"/);
  assert.match(drawer, /nextMessages\.slice\(historyStartIndexRef\.current\)\.slice\(-8\)/);
  assert.match(drawer, /contextIdentity\.label/);
  assert.match(pageAssistants, /`medical-record:\$\{patientRef \|\| "unselected"\}`/);
  assert.match(pageAssistants, /`digital-care:\$\{conversationRef \|\| "unselected"\}`/);
  assert.match(reports, /saveAiConversation\("reports"/);
  assert.match(navbar, /clearAiConversations\(\)/);
  assert.match(portal, /clearAiConversations\(\)/);
});
