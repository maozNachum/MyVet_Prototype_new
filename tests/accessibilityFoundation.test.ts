import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("public and authenticated surfaces expose a keyboard skip target", () => {
  assert.match(read("src/app/App.tsx"), /href="#main-content"/);
  assert.match(read("src/app/pages/Layout.tsx"), /id="main-content"[\s\S]*tabIndex=\{-1\}/);
  assert.match(read("src/app/pages/Login.tsx"), /<main id="main-content"[\s\S]*tabIndex=\{-1\}/);
  assert.match(read("src/app/pages/ClientPortal.tsx"), /<main id="main-content"[\s\S]*tabIndex=\{-1\}/);
});

test("accessibility statement is public, reportable and does not claim unverified compliance", () => {
  const routes = read("src/app/routes.tsx");
  const statement = read("src/app/pages/AccessibilityStatement.tsx");
  const footer = read("src/app/components/Footer.tsx");

  assert.match(routes, /path: "\/accessibility"/);
  assert.match(footer, /to="\/accessibility"/);
  assert.match(statement, /mailto:info@myvet\.co\.il\?subject=/);
  assert.match(statement, /טרם עברה בדיקת התאמה מלאה/);
  assert.match(statement, /איננו מצהירים בשלב זה על עמידה מלאה/);
});

test("global keyboard focus and reduced-motion preferences remain visible", () => {
  const theme = read("src/styles/theme.css");
  assert.match(theme, /:focus-visible/);
  assert.match(theme, /prefers-reduced-motion:\s*reduce/);
});

test("critical icon-only controls have accessible names", () => {
  const login = read("src/app/pages/Login.tsx");
  const portal = read("src/app/pages/ClientPortal.tsx");
  const digitalCare = read("src/app/pages/DigitalCare.tsx");
  assert.match(login, /aria-label=\{showPassword \? "הסתרת הסיסמה" : "הצגת הסיסמה"\}/);
  assert.match(login, /aria-invalid=\{Boolean\(formErrors\.email\)\}/);
  assert.match(login, /role="alert"/);
  assert.match(portal, /aria-label=\{unreadNotificationsCount > 0/);
  assert.match(portal, /role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(digitalCare, /aria-label="צירוף קובץ לשיחה"/);
  assert.match(digitalCare, /aria-label=\{sending \? "שולח הודעה" : "שליחת הודעה ללקוח"\}/);
});

test("owner booking announces validation failures", () => {
  const booking = read("src/app/components/OwnerBookAppointment.tsx");
  assert.match(booking, /role="alert" aria-live="assertive"/);
});
