import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationDir = "supabase/migrations";
const migrations = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();

test("migration names are unique and sensitive policies are never unconditional", () => {
  assert.equal(new Set(migrations).size, migrations.length);
  for (const name of migrations) {
    const sql = readFileSync(join(migrationDir, name), "utf8");
    assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i, name);
  }
});

test("SECURITY DEFINER functions use a fixed search_path and are not granted to public or anon", () => {
  for (const name of migrations) {
    const sql = readFileSync(join(migrationDir, name), "utf8");
    const functions = sql.match(/create\s+(?:or\s+replace\s+)?function[\s\S]*?\$\$[\s\S]*?\$\$\s*;/gi) || [];
    for (const fn of functions.filter((block) => /security\s+definer/i.test(block))) {
      assert.match(fn, /set\s+search_path\s*=\s*(?:''|'[^']*'|[a-z0-9_, ]+)/i, name);
    }
    assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function[^;]*\s+to\s+(?:public|anon)(?:\s|,|;)/i, name);
  }
});

test("every Edge Function verifies JWT and resolves the authenticated user", () => {
  const config = readFileSync("supabase/config.toml", "utf8");
  const functions = readdirSync("supabase/functions", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name);
  for (const name of functions) {
    assert.match(config, new RegExp(`\\[functions\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][\\s\\S]*?verify_jwt\\s*=\\s*true`), name);
    assert.match(readFileSync(join("supabase/functions", name, "index.ts"), "utf8"), /auth\.getUser\(\)/, name);
  }
});

test("frontend cannot contain provider endpoints, server keys or service-role usage", () => {
  const stack = ["src"];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        const source = readFileSync(path, "utf8");
        assert.doesNotMatch(source, /GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_|generativelanguage\.googleapis\.com/i, path);
      }
    }
  }
});

test("medical storage remains private and uses short-lived signed links", () => {
  const storage = readFileSync("supabase/migrations/20260716213812_ai_storage_security.sql", "utf8");
  assert.match(storage, /set\s+public\s*=\s*false/i);
  assert.doesNotMatch(storage, /set\s+public\s*=\s*true/i);
  const digitalCare = readFileSync("supabase/functions/digitalcare-transcription/index.ts", "utf8");
  assert.match(digitalCare, /createSignedUrl\([^,]+,\s*60\)/);
});

test("owner communication stays in DigitalCare without a manual portal-update panel", () => {
  const clients = readFileSync("src/app/pages/Clients.tsx", "utf8");
  const digitalCare = readFileSync("src/app/pages/DigitalCare.tsx", "utf8");
  const portalNotifications = readFileSync("src/services/portalNotifications.ts", "utf8");

  assert.doesNotMatch(clients, /OwnerPortalNotificationsPanel|עדכוני פורטל ללקוח|שלח לפורטל/);
  assert.doesNotMatch(portalNotifications, /createOwnerNotification/);
  assert.match(digitalCare, /publishDigitalMessageToOwner/);
});
