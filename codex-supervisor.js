#!/usr/bin/env node
'use strict';

/**
 * Codex Auto Resume Supervisor - Windows / Node.js, dependency free.
 *
 * Design goals:
 * - Preserve the exact Codex thread id across runs.
 * - Resume only after a confidently identified short (5-hour) limit reset.
 * - Stop on weekly, credits/spend-control, additional, or ambiguous limits.
 * - Never silently switch to a different thread.
 * - Safe user stop via STOP_REQUESTED.flag / Ctrl+C.
 * - Keep Windows awake without changing global power-plan settings.
 * - UTF-8 + proper Hebrew/RTL via an HTML status dashboard.
 * - Backwards-compatible migration of state.json from older supervisor versions.
 * - No third-party npm dependencies.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const readline = require('readline');

const VERSION = '5.0.0-super';
const IS_WINDOWS = process.platform === 'win32';
const argv = process.argv.slice(2);
const SELF_TEST = argv.includes('--self-test');
const DOCTOR = argv.includes('--doctor');

function argValue(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

const PROJECT = path.resolve(argValue('--project', process.cwd()));
const STATE_DIR = path.join(PROJECT, '.codex-auto-resume');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const STATE_BACKUP_FILE = path.join(STATE_DIR, 'state.backup.json');
const LOG_FILE = path.join(STATE_DIR, 'supervisor.log');
const STATUS_HTML = path.join(STATE_DIR, 'status.html');
const LATEST_MESSAGE_TXT = path.join(STATE_DIR, 'latest-codex-message.txt');
const LATEST_MESSAGE_HTML = path.join(STATE_DIR, 'latest-codex-message.html');
const STOP_FLAG = path.join(STATE_DIR, 'STOP_REQUESTED.flag');
const LOCK_FILE = path.join(STATE_DIR, 'supervisor.lock');
const WEEKLY_MARKER = path.join(STATE_DIR, 'STOPPED_WEEKLY.txt');
const UNKNOWN_MARKER = path.join(STATE_DIR, 'STOPPED_UNKNOWN_LIMIT.txt');
const THREAD_MARKER = path.join(STATE_DIR, 'STOPPED_THREAD_PROTECTION.txt');
const DOCTOR_HTML = path.join(STATE_DIR, 'doctor-report.html');

const CONFIG = Object.freeze({
  resetBufferSeconds: 45,
  unknownShortLimitMaxMinutes: 390, // 6h30m hard ceiling
  fallbackPollSeconds: 180,
  stopCheckSeconds: 3,
  appServerTimeoutMs: 15000,
  transientRetrySeconds: [60, 180, 600],
  requireKeepAwake: true,
  openDashboardOnStart: true,
  fiveHourMinMinutes: 240,
  fiveHourMaxMinutes: 420,
  weeklyMinMinutes: 9000,
  weeklyMaxMinutes: 11520,
  exhaustedPercent: 99.5,
});

const CONTINUE_PROMPT = [
  'Continue the existing task from exactly where you stopped.',
  'Inspect the current repository state and the prior thread context before changing anything.',
  'Do not redo work that is already complete.',
  'Continue until the original task is fully complete, and run appropriate tests or verification before finishing.',
].join(' ');

let lockHandle = null;
let keepAwakeProcess = null;
let activeCodexProcess = null;
let stopRequestedInMemory = false;
let dashboardOpened = false;
let currentState = null;

function ensureDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function localTimeString(dateLike) {
  if (!dateLike) return 'לא ידוע';
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return 'לא ידוע';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function log(message, level = 'INFO') {
  ensureDir();
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  fs.appendFileSync(LOG_FILE, line + os.EOL, 'utf8');
  // Console is intentionally English/LTR only. Hebrew is rendered in status.html.
  if (level === 'ERROR') console.error(line);
  else console.log(line);
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function atomicWrite(file, content) {
  ensureDir();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, { encoding: 'utf8' });
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.previous`);
  } catch { /* best-effort backup */ }
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.copyFileSync(tmp, file); } finally { try { fs.unlinkSync(tmp); } catch {} }
  }
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function normalizePathForCompare(p) {
  if (!p) return '';
  const resolved = path.resolve(String(p));
  return IS_WINDOWS ? resolved.toLowerCase() : resolved;
}

function loadAndMigrateState() {
  let raw = readJsonSafe(STATE_FILE);
  if (!raw) raw = readJsonSafe(STATE_BACKUP_FILE);

  const base = {
    schemaVersion: 2,
    supervisorVersion: VERSION,
    projectPath: PROJECT,
    threadId: null,
    status: 'idle',
    statusDetail: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastRunAt: null,
    lastCompletedAt: null,
    lastFiveHourResetAt: null,
    weeklyResetAt: null,
    latestMessageFile: null,
    lastError: null,
    lastLimitClassification: null,
    previousSupervisorVersion: null,
  };

  if (!raw || typeof raw !== 'object') return base;

  // Backwards compatible with v1-v4 state.json: projectPath/threadId/status/updatedAt.
  if (raw.projectPath && normalizePathForCompare(raw.projectPath) !== normalizePathForCompare(PROJECT)) {
    log(`Ignoring saved thread from a different project: ${raw.projectPath}`, 'WARN');
    return base;
  }

  const migrated = { ...base, ...raw };
  migrated.schemaVersion = 2;
  migrated.previousSupervisorVersion = raw.supervisorVersion || raw.previousSupervisorVersion || 'legacy-v1-v4';
  migrated.supervisorVersion = VERSION;
  migrated.projectPath = PROJECT;
  migrated.threadId = typeof raw.threadId === 'string' && raw.threadId.trim() ? raw.threadId.trim() : null;
  migrated.updatedAt = nowIso();
  return migrated;
}

function saveState(patch = {}) {
  currentState = { ...(currentState || loadAndMigrateState()), ...patch, supervisorVersion: VERSION, projectPath: PROJECT, updatedAt: nowIso() };
  ensureDir();
  try {
    if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, STATE_BACKUP_FILE);
  } catch { /* best effort */ }
  atomicWrite(STATE_FILE, JSON.stringify(currentState, null, 2));
  renderStatus();
}

const STATUS_HE = {
  idle: 'מוכן',
  starting: 'מתחיל',
  running: 'Codex עובד',
  'waiting-5h-reset': 'ממתין לאיפוס מגבלת 5 השעות',
  'resuming-after-5h-reset': 'המכסה התאפסה — ממשיך',
  completed: 'המשימה הסתיימה',
  'stopped-weekly': 'נעצר — המכסה השבועית הסתיימה',
  'stopped-account-limit': 'נעצר — מגבלת חשבון/קרדיטים',
  'stopped-additional-limit': 'נעצר — מגבלה נוספת',
  'stopped-unknown-limit': 'נעצר — סוג המכסה לא ודאי',
  'stopped-thread-in-use': 'נעצר — ה-Thread פתוח במקום אחר',
  'stopped-thread-mismatch': 'נעצר — הגנת Thread הופעלה',
  'stopped-thread-missing': 'נעצר — ה-Thread לא נמצא',
  'stopped-error': 'נעצר עקב שגיאה',
  'stopped-user': 'נעצר בבטחה לפי בקשתך',
  'retrying-transient': 'תקלה זמנית — מנסה שוב',
  doctor: 'בדיקת מערכת',
};

function renderStatus() {
  ensureDir();
  const s = currentState || loadAndMigrateState();
  const statusHe = STATUS_HE[s.status] || htmlEscape(s.status || 'לא ידוע');
  const detail = s.statusDetail || '';
  const thread = s.threadId || 'טרם זוהה';
  const weeklyReset = s.weeklyResetAt ? localTimeString(s.weeklyResetAt) : '—';
  const fiveReset = s.lastFiveHourResetAt ? localTimeString(s.lastFiveHourResetAt) : '—';
  const lastError = s.lastError || '—';
  const latestLink = fs.existsSync(LATEST_MESSAGE_HTML)
    ? '<a href="latest-codex-message.html">פתיחת ההודעה האחרונה של Codex</a>'
    : 'עדיין אין הודעה שמורה';

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="3">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Codex Auto Resume</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; font-family: Arial, "Segoe UI", sans-serif; background:#f4f6f8; color:#17212b; direction:rtl; text-align:right; }
  .wrap { max-width:920px; margin:32px auto; padding:0 18px; }
  .card { background:#fff; border:1px solid #dde3ea; border-radius:16px; padding:22px; margin-bottom:16px; box-shadow:0 2px 10px rgba(0,0,0,.05); }
  h1 { margin:0 0 8px; font-size:28px; }
  h2 { margin:0 0 14px; font-size:19px; }
  .status { font-size:23px; font-weight:700; margin:8px 0; }
  .detail { font-size:16px; line-height:1.7; white-space:pre-wrap; unicode-bidi:plaintext; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:12px; }
  .item { background:#f8fafc; border-radius:12px; padding:14px; }
  .label { color:#5f6b76; font-size:13px; margin-bottom:5px; }
  .value { font-weight:600; overflow-wrap:anywhere; unicode-bidi:plaintext; }
  code, .ltr { direction:ltr; text-align:left; unicode-bidi:embed; font-family:Consolas,monospace; }
  .safe { border-right:5px solid #2f855a; }
  .warn { border-right:5px solid #b7791f; }
  a { color:#0057b8; }
  .small { color:#66717d; font-size:13px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card safe">
    <h1>Codex Auto Resume</h1>
    <div class="status">${htmlEscape(statusHe)}</div>
    <div class="detail">${htmlEscape(detail)}</div>
  </div>
  <div class="card">
    <h2>מצב שמור</h2>
    <div class="grid">
      <div class="item"><div class="label">פרויקט</div><div class="value ltr">${htmlEscape(PROJECT)}</div></div>
      <div class="item"><div class="label">Thread ID</div><div class="value ltr">${htmlEscape(thread)}</div></div>
      <div class="item"><div class="label">עדכון אחרון</div><div class="value">${htmlEscape(localTimeString(s.updatedAt))}</div></div>
      <div class="item"><div class="label">איפוס 5 שעות אחרון/צפוי</div><div class="value">${htmlEscape(fiveReset)}</div></div>
      <div class="item"><div class="label">איפוס שבועי צפוי</div><div class="value">${htmlEscape(weeklyReset)}</div></div>
      <div class="item"><div class="label">סיווג מכסה אחרון</div><div class="value">${htmlEscape(s.lastLimitClassification || '—')}</div></div>
    </div>
  </div>
  <div class="card">
    <h2>פלט Codex</h2>
    <div>${latestLink}</div>
  </div>
  <div class="card warn">
    <h2>עצירה בטוחה</h2>
    <div class="detail">כדי לעצור, לחץ פעמיים על <span class="ltr">Stop-Codex-Auto-Resume.bat</span>. בזמן המתנה העצירה כמעט מיידית. בזמן ש-Codex עובד, המפקח מאפשר ל-Turn הנוכחי להסתיים ורק אז עוצר, כדי לא לקטוע כתיבה לקבצים. ה-Thread ID נשמר תמיד.</div>
  </div>
  <div class="card">
    <h2>שגיאה אחרונה</h2>
    <div class="detail">${htmlEscape(lastError)}</div>
    <p class="small">גרסת Supervisor: ${htmlEscape(VERSION)}. הדף מתרענן אוטומטית כל 3 שניות.</p>
  </div>
</div>
</body></html>`;
  atomicWrite(STATUS_HTML, html);
}

function saveLatestAgentMessage(text) {
  if (!text || !text.trim()) return;
  atomicWrite(LATEST_MESSAGE_TXT, text);
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codex - הודעה אחרונה</title><style>body{font-family:Arial,"Segoe UI",sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;direction:rtl;text-align:right}.msg{white-space:pre-wrap;unicode-bidi:plaintext;line-height:1.65;font-size:16px;background:#f7f8fa;border:1px solid #ddd;border-radius:14px;padding:20px}code{direction:ltr;unicode-bidi:embed}</style></head><body><h1>ההודעה האחרונה של Codex</h1><div class="msg" dir="auto">${htmlEscape(text)}</div></body></html>`;
  atomicWrite(LATEST_MESSAGE_HTML, html);
  saveState({ latestMessageFile: LATEST_MESSAGE_HTML });
}

function openDashboardOnce() {
  if (!IS_WINDOWS || dashboardOpened || !CONFIG.openDashboardOnStart) return;
  dashboardOpened = true;
  try {
    const cmd = `start "" "${STATUS_HTML.replace(/"/g, '""')}"`;
    const p = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmd], { detached: true, windowsHide: true, stdio: 'ignore' });
    p.unref();
  } catch (err) {
    log(`Could not open dashboard automatically: ${err.message}`, 'WARN');
  }
}

function acquireLock() {
  ensureDir();
  try {
    lockHandle = fs.openSync(LOCK_FILE, 'wx');
    fs.writeFileSync(lockHandle, JSON.stringify({ pid: process.pid, startedAt: nowIso(), version: VERSION }), 'utf8');
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const existing = readJsonSafe(LOCK_FILE);
    if (existing && Number.isInteger(existing.pid)) {
      try {
        process.kill(existing.pid, 0);
        return false;
      } catch { /* stale pid */ }
    }
    try { fs.unlinkSync(LOCK_FILE); } catch {}
    lockHandle = fs.openSync(LOCK_FILE, 'wx');
    fs.writeFileSync(lockHandle, JSON.stringify({ pid: process.pid, startedAt: nowIso(), version: VERSION }), 'utf8');
    return true;
  }
}

function releaseLock() {
  if (lockHandle !== null) {
    try { fs.closeSync(lockHandle); } catch {}
    lockHandle = null;
  }
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

function isStopRequested() {
  return stopRequestedInMemory || fs.existsSync(STOP_FLAG);
}

function clearOldStopFlag() {
  try { fs.unlinkSync(STOP_FLAG); } catch {}
}

function requestStop(reason) {
  if (stopRequestedInMemory) return;
  stopRequestedInMemory = true;
  log(`Safe stop requested: ${reason}`, 'WARN');
}

async function interruptibleSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (isStopRequested()) return false;
    await new Promise(r => setTimeout(r, Math.min(CONFIG.stopCheckSeconds * 1000, end - Date.now())));
  }
  return !isStopRequested();
}

function validateThreadId(id) {
  return typeof id === 'string' && /^[0-9a-fA-F-]{20,80}$/.test(id);
}

function runCmdSync(command, timeoutMs = 15000) {
  if (!IS_WINDOWS) return { status: 0, stdout: '', stderr: '' };
  return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
    encoding: 'utf8', windowsHide: true, timeout: timeoutMs,
  });
}

function codexVersion() {
  const r = runCmdSync('codex --version', 10000);
  if (r.error || r.status !== 0) throw new Error((r.stderr || r.error?.message || 'codex --version failed').trim());
  return String(r.stdout || '').trim().split(/\r?\n/)[0];
}

async function startKeepAwake() {
  if (!IS_WINDOWS) return { ok: true, process: null, note: 'Non-Windows self-test environment' };
  const psScript = `
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CARKeepAwake {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern uint SetThreadExecutionState(uint esFlags);
}
'@
$flags=[Convert]::ToUInt32('80000001',16)
$r=[CARKeepAwake]::SetThreadExecutionState($flags)
if($r -eq 0){ throw 'SetThreadExecutionState returned 0' }
[Console]::Out.WriteLine('KEEP_AWAKE_READY')
[Console]::Out.Flush()
$parent=${process.pid}
while(Get-Process -Id $parent -ErrorAction SilentlyContinue){ Start-Sleep -Seconds 15 }
`;

  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    let errText = '';
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { p.kill(); } catch {}
        resolve({ ok: false, process: null, note: 'Keep-awake helper timed out before READY.' });
      }
    }, 8000);
    p.stderr.on('data', b => { errText += b.toString('utf8'); });
    p.stdout.on('data', b => {
      if (!settled && b.toString('utf8').includes('KEEP_AWAKE_READY')) {
        settled = true;
        clearTimeout(timer);
        keepAwakeProcess = p;
        resolve({ ok: true, process: p, note: 'SetThreadExecutionState active' });
      }
    });
    p.on('exit', code => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, process: null, note: `Keep-awake exited (${code}): ${errText.trim()}` });
      }
    });
    p.on('error', err => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, process: null, note: err.message });
      }
    });
  });
}

function stopKeepAwake() {
  if (keepAwakeProcess) {
    try { keepAwakeProcess.kill(); } catch {}
    keepAwakeProcess = null;
  }
}

function parseResetFromErrorText(text) {
  if (!text) return null;
  const match = String(text).match(/try again at\s+([^\r\n]+)/i);
  if (!match) return null;
  let candidate = match[1].trim().replace(/\)+\s*$/, '').replace(/[.\s]+$/, '');
  candidate = candidate.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const d = new Date(candidate);
  return Number.isNaN(d.getTime()) ? null : d;
}

function unixToDate(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function windowInfo(w, sourceName) {
  if (!w || typeof w !== 'object') return null;
  const used = Number(w.usedPercent ?? w.used_percent);
  const minutes = Number(w.windowDurationMins ?? w.window_minutes);
  const resetsAtRaw = w.resetsAt ?? w.resets_at;
  const reset = unixToDate(resetsAtRaw);
  return {
    sourceName,
    usedPercent: Number.isFinite(used) ? used : null,
    windowMinutes: Number.isFinite(minutes) ? minutes : null,
    resetAt: reset,
  };
}

function extractLimits(result) {
  const main = result?.rateLimits || result?.result?.rateLimits || null;
  const byId = result?.rateLimitsByLimitId || result?.result?.rateLimitsByLimitId || {};
  const resetCredits = result?.rateLimitResetCredits || result?.result?.rateLimitResetCredits || null;
  if (!main) return null;
  return {
    source: 'app-server',
    main: {
      primary: windowInfo(main.primary, 'primary'),
      secondary: windowInfo(main.secondary, 'secondary'),
      rateLimitReachedType: main.rateLimitReachedType ?? null,
      spendControlReached: main.spendControlReached ?? null,
      credits: main.credits ?? null,
      planType: main.planType ?? null,
    },
    byId,
    resetCredits,
  };
}

function pickFiveAndWeekly(limits) {
  const windows = [limits?.main?.primary, limits?.main?.secondary].filter(Boolean);
  let five = windows.find(w => w.windowMinutes >= CONFIG.fiveHourMinMinutes && w.windowMinutes <= CONFIG.fiveHourMaxMinutes) || null;
  let weekly = windows.find(w => w.windowMinutes >= CONFIG.weeklyMinMinutes && w.windowMinutes <= CONFIG.weeklyMaxMinutes) || null;

  // Conservative fallback for plans that still use primary/secondary but omit durations.
  if (!five && limits?.main?.primary && limits?.main?.secondary) {
    const p = limits.main.primary, s = limits.main.secondary;
    if (Number.isFinite(p.windowMinutes) && Number.isFinite(s.windowMinutes) && p.windowMinutes < s.windowMinutes) five = p;
  }
  if (!weekly && limits?.main?.primary && limits?.main?.secondary) {
    const p = limits.main.primary, s = limits.main.secondary;
    if (Number.isFinite(p.windowMinutes) && Number.isFinite(s.windowMinutes) && s.windowMinutes >= 4320 && s.windowMinutes > p.windowMinutes) weekly = s;
  }
  return { five, weekly };
}

function isExhausted(w) {
  return !!w && Number.isFinite(w.usedPercent) && w.usedPercent >= CONFIG.exhaustedPercent;
}

function minutesBetween(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

function classifyLimit(limits, errorText) {
  const text = String(errorText || '');
  const errorReset = parseResetFromErrorText(text);
  const { five, weekly } = pickFiveAndWeekly(limits);

  const reachedType = limits?.main?.rateLimitReachedType || '';
  const creditsType = /credits_depleted/i.test(reachedType);
  const usageControlType = /workspace_.*usage_limit_reached/i.test(reachedType);
  if (creditsType || limits?.main?.spendControlReached === true || usageControlType) {
    return { kind: 'Account', confidence: 'high', resetAt: errorReset, reason: reachedType || 'spend control' };
  }

  if (/weekly|week[ -]?limit/i.test(text)) {
    return { kind: 'Weekly', confidence: 'high', resetAt: weekly?.resetAt || errorReset, reason: 'error explicitly mentions weekly' };
  }
  if (/5[ -]?hour|five[ -]?hour/i.test(text)) {
    return { kind: 'FiveHour', confidence: 'high', resetAt: five?.resetAt || errorReset, reason: 'error explicitly mentions 5-hour' };
  }

  // If both are exhausted, weekly must stop the supervisor.
  if (isExhausted(weekly)) {
    return { kind: 'Weekly', confidence: 'high', resetAt: weekly.resetAt || errorReset, reason: 'weekly window exhausted' };
  }
  if (isExhausted(five) && !isExhausted(weekly)) {
    return { kind: 'FiveHour', confidence: 'high', resetAt: five.resetAt || errorReset, reason: '5-hour window exhausted while weekly is available' };
  }

  // Additional model/feature buckets are considered only after the main 5h/weekly
  // windows. That prevents an unrelated exhausted model bucket from masking a
  // clearly exhausted main 5-hour window.
  if (limits?.byId && typeof limits.byId === 'object') {
    for (const [id, snapshot] of Object.entries(limits.byId)) {
      if (id === 'codex') continue;
      const p = windowInfo(snapshot?.primary, `${id}:primary`);
      const s = windowInfo(snapshot?.secondary, `${id}:secondary`);
      if (isExhausted(p) || isExhausted(s)) {
        return { kind: 'Additional', confidence: 'high', resetAt: (isExhausted(p) ? p.resetAt : s.resetAt), reason: `additional limit ${id}` };
      }
    }
  }

  // Match the server error reset against the authoritative epoch windows. This is safer than
  // guessing from "hours until reset", especially when a weekly reset is only a few hours away.
  if (errorReset) {
    const fiveDelta = minutesBetween(errorReset, five?.resetAt);
    const weeklyDelta = minutesBetween(errorReset, weekly?.resetAt);
    if (weekly && weeklyDelta <= 12 && weeklyDelta + 2 < fiveDelta) {
      return { kind: 'Weekly', confidence: 'medium', resetAt: weekly.resetAt, reason: 'error reset matches weekly reset' };
    }
    if (five && fiveDelta <= 12 && fiveDelta + 2 < weeklyDelta) {
      return { kind: 'FiveHour', confidence: 'medium', resetAt: five.resetAt, reason: 'error reset matches 5-hour reset' };
    }
  }

  return { kind: 'Unknown', confidence: 'low', resetAt: errorReset, reason: 'sources do not identify the exhausted bucket with confidence' };
}

async function queryRateLimits() {
  if (!IS_WINDOWS) return null;
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'codex app-server'], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], cwd: PROJECT,
    });
    let stderr = '';
    let done = false;
    const pending = new Map();
    const timeout = setTimeout(() => finish(new Error('Codex app-server rate-limit query timed out.')), CONFIG.appServerTimeoutMs);

    function finish(err, value) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      try { p.stdin.end(); } catch {}
      try { p.kill(); } catch {}
      if (err) reject(err); else resolve(value);
    }

    p.stderr.on('data', b => { stderr += b.toString('utf8'); });
    p.on('error', err => finish(err));
    p.on('exit', code => {
      if (!done) finish(new Error(`Codex app-server exited before response (${code}). ${stderr.trim()}`));
    });

    const rl = readline.createInterface({ input: p.stdout });
    rl.on('line', line => {
      let obj;
      try { obj = JSON.parse(line); } catch { return; }
      if (obj && Object.prototype.hasOwnProperty.call(obj, 'id')) {
        const waiter = pending.get(String(obj.id));
        if (waiter) { pending.delete(String(obj.id)); waiter(obj); }
      }
    });

    function sendAndWait(id, payload) {
      return new Promise((res, rej) => {
        pending.set(String(id), res);
        try { p.stdin.write(JSON.stringify(payload) + '\n', 'utf8'); }
        catch (err) { pending.delete(String(id)); rej(err); }
      });
    }

    (async () => {
      try {
        const init = await sendAndWait(1, {
          method: 'initialize', id: 1,
          params: { clientInfo: { name: 'codex_auto_resume', title: 'Codex Auto Resume', version: VERSION } },
        });
        if (init.error) throw new Error(`initialize error: ${JSON.stringify(init.error)}`);
        p.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n', 'utf8');
        const response = await sendAndWait(7, { method: 'account/rateLimits/read', id: 7, params: {} });
        if (response.error) throw new Error(`rateLimits error: ${JSON.stringify(response.error)}`);
        const extracted = extractLimits(response.result || response);
        if (!extracted) throw new Error('rateLimits response did not contain a main rateLimits object.');
        finish(null, extracted);
      } catch (err) { finish(err); }
    })();
  });
}

function formatWindow(w) {
  if (!w) return 'n/a';
  return `used=${w.usedPercent ?? '?'}% duration=${w.windowMinutes ?? '?'}min reset=${w.resetAt ? w.resetAt.toISOString() : '?'}`;
}

function batchEscapePath(s) {
  return String(s).replace(/%/g, '%%').replace(/\^/g, '^^');
}

function makeRunnerBatch(mode, threadId, promptFile) {
  const runner = path.join(STATE_DIR, `runner-${process.pid}-${Date.now()}.cmd`);
  const projectQ = batchEscapePath(PROJECT);
  const promptQ = batchEscapePath(promptFile);
  let command;
  if (mode === 'ResumeId') {
    if (!validateThreadId(threadId)) throw new Error(`Invalid saved thread id: ${threadId}`);
    command = `call codex exec --json --skip-git-repo-check -C "${projectQ}" resume "${threadId}" - < "${promptQ}"`;
  } else if (mode === 'ResumeLast') {
    command = `call codex exec --json --skip-git-repo-check -C "${projectQ}" resume --last - < "${promptQ}"`;
  } else {
    command = `call codex exec --json --skip-git-repo-check -C "${projectQ}" - < "${promptQ}"`;
  }
  const content = `@echo off\r\nchcp 65001 >nul\r\n${command}\r\nset "CAR_EXIT=%ERRORLEVEL%"\r\nexit /b %CAR_EXIT%\r\n`;
  fs.writeFileSync(runner, content, 'utf8');
  return runner;
}

function looksLikeLimit(text) {
  return /usage limit|rate limit|limit reached|hit your.*limit|try again at|out of codex messages/i.test(String(text || ''));
}

function looksLikeActiveWriter(text) {
  return /active writer|thread-store conflict|already has an active writer/i.test(String(text || ''));
}

function looksLikeThreadMissing(text) {
  return /thread .* not found|session .* not found|rollout .* not found/i.test(String(text || ''));
}

function looksTransient(text) {
  return /connection reset|connection refused|network|timed out|timeout|websocket|temporar|502|503|504|service unavailable|connection closed/i.test(String(text || ''));
}

async function terminateProcessTree(pid, forceAfterMs = 4000) {
  if (!pid || !IS_WINDOWS) return;
  try {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T'], { windowsHide: true, timeout: 5000, encoding: 'utf8' });
  } catch {}
  await new Promise(r => setTimeout(r, forceAfterMs));
  try {
    process.kill(pid, 0);
    spawnSync('taskkill.exe', ['/F', '/PID', String(pid), '/T'], { windowsHide: true, timeout: 5000, encoding: 'utf8' });
  } catch { /* already gone */ }
}

async function runCodexTurn(mode, expectedThreadId, prompt) {
  ensureDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const promptFile = path.join(STATE_DIR, `prompt-${stamp}.txt`);
  const stdoutFile = path.join(STATE_DIR, `codex-${stamp}.stdout.jsonl`);
  const stderrFile = path.join(STATE_DIR, `codex-${stamp}.stderr.log`);
  fs.writeFileSync(promptFile, prompt, 'utf8');
  const runner = makeRunnerBatch(mode, expectedThreadId, promptFile);

  saveState({ status: 'running', statusDetail: 'Codex עובד על אותו Thread. ניתן להשאיר את המחשב ללא השגחה.', lastRunAt: nowIso(), lastError: null });
  log(`Starting Codex mode=${mode} expectedThread=${expectedThreadId || '-'} project=${PROJECT}`);

  return new Promise((resolve) => {
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${runner}"`], {
      cwd: PROJECT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeCodexProcess = child;

    const outStream = fs.createWriteStream(stdoutFile, { flags: 'a', encoding: 'utf8' });
    const errStream = fs.createWriteStream(stderrFile, { flags: 'a', encoding: 'utf8' });
    let combined = '';
    let seenThreadId = null;
    let turnCompleted = false;
    let turnFailed = false;
    let protocolLimit = false;
    let stoppedByUser = false;
    let threadMismatch = false;
    let finalAgent = '';
    let settled = false;

    function appendCombined(s) {
      combined += s + '\n';
      if (combined.length > 2_000_000) combined = combined.slice(-1_500_000);
    }

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', line => {
      outStream.write(line + os.EOL);
      appendCombined(line);
      let obj;
      try { obj = JSON.parse(line); } catch { return; }
      if (obj.type === 'thread.started' && typeof obj.thread_id === 'string') {
        seenThreadId = obj.thread_id;
        if (mode === 'ResumeId' && expectedThreadId && seenThreadId !== expectedThreadId) {
          threadMismatch = true;
          log(`THREAD PROTECTION: expected ${expectedThreadId}, Codex returned ${seenThreadId}. Stopping wrong-thread process tree immediately.`, 'ERROR');
          terminateProcessTree(child.pid, 500).catch(() => {});
        } else {
          saveState({ threadId: seenThreadId, status: 'running' });
          log(`Codex thread id confirmed: ${seenThreadId}`);
        }
      } else if (obj.type === 'turn.completed') {
        turnCompleted = true;
      } else if (obj.type === 'turn.failed') {
        turnFailed = true;
        const m = obj?.error?.message || '';
        if (m) appendCombined(m);
        if (looksLikeLimit(m)) protocolLimit = true;
      } else if (obj.type === 'error') {
        const m = obj.message || '';
        if (looksLikeLimit(m)) protocolLimit = true;
      } else if (obj.type === 'item.completed' && obj?.item?.type === 'agent_message' && typeof obj.item.text === 'string') {
        finalAgent = obj.item.text;
        saveLatestAgentMessage(finalAgent);
      }
    });

    child.stderr.on('data', b => {
      const s = b.toString('utf8');
      errStream.write(s);
      appendCombined(s);
    });

    let safeStopNotified = false;
    const stopTimer = setInterval(() => {
      if (!settled && isStopRequested() && child.exitCode === null && !safeStopNotified) {
        safeStopNotified = true;
        stoppedByUser = !threadMismatch;
        // Safe stop policy: never kill a normal active Codex turn. Let the current turn
        // finish, then the supervisor exits before sending another prompt. This avoids
        // interrupting a file write. Thread-protection mismatches are the only exception.
        saveState({
          status: 'running',
          statusDetail: 'התקבלה בקשת עצירה בטוחה. Codex יסיים את ה-Turn הנוכחי, ואז האוטומציה תעצור לפני שליחת בקשה נוספת.',
        });
        log('Safe stop requested while Codex is active; waiting for the current turn to finish before exiting.', 'WARN');
      }
    }, 500);

    child.on('error', err => appendCombined(`PROCESS_ERROR: ${err.message}`));
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearInterval(stopTimer);
      activeCodexProcess = null;
      try { rl.close(); } catch {}
      outStream.end();
      errStream.end();
      try { fs.unlinkSync(runner); } catch {}
      try { fs.unlinkSync(promptFile); } catch {}
      resolve({
        exitCode: typeof code === 'number' ? code : -1,
        threadId: seenThreadId,
        turnCompleted,
        turnFailed,
        limitDetected: protocolLimit || looksLikeLimit(combined),
        activeWriter: looksLikeActiveWriter(combined),
        threadMissing: looksLikeThreadMissing(combined),
        transient: looksTransient(combined),
        stoppedByUser,
        threadMismatch,
        text: combined,
        finalAgent,
        stdoutFile,
        stderrFile,
      });
    });
  });
}

async function getLimitsBestEffort() {
  try {
    const limits = await queryRateLimits();
    const { five, weekly } = pickFiveAndWeekly(limits);
    log(`Rate limits: 5h(${formatWindow(five)}), weekly(${formatWindow(weekly)}), reachedType=${limits.main.rateLimitReachedType || '-'}, plan=${limits.main.planType || '-'}`);
    return limits;
  } catch (err) {
    log(`Rate-limit query unavailable: ${err.message}`, 'WARN');
    return null;
  }
}

async function waitForFiveHourReset(classification, threadId) {
  let resetAt = classification.resetAt || null;
  const start = Date.now();
  const maxWait = CONFIG.unknownShortLimitMaxMinutes * 60 * 1000;

  while (true) {
    if (isStopRequested()) return { kind: 'UserStop' };

    const limits = await getLimitsBestEffort();
    if (limits) {
      const reclass = classifyLimit(limits, '5-hour limit');
      const { five, weekly } = pickFiveAndWeekly(limits);
      if (isExhausted(weekly)) return { kind: 'Weekly', resetAt: weekly.resetAt };
      if (five?.resetAt) resetAt = five.resetAt;
      if (five && !isExhausted(five)) return { kind: 'Ready' };
      if (reclass.kind === 'Account' || reclass.kind === 'Additional') return reclass;
    }

    if (resetAt && resetAt.getTime() > Date.now()) {
      const target = resetAt.getTime() + CONFIG.resetBufferSeconds * 1000;
      saveState({
        status: 'waiting-5h-reset',
        statusDetail: `מגבלת 5 השעות זוהתה בוודאות. המפקח ממתין עד ${localTimeString(new Date(target))} ואז יבדוק וימשיך את אותו Thread.`,
        lastFiveHourResetAt: resetAt.toISOString(),
        threadId,
        lastLimitClassification: 'FiveHour',
      });
      const ok = await interruptibleSleep(Math.max(1000, target - Date.now()));
      if (!ok) return { kind: 'UserStop' };
      return { kind: 'Ready' }; // actual resume is the definitive availability probe
    }

    if (Date.now() - start >= maxWait) return { kind: 'Unknown', reason: '5-hour reset time remained unavailable beyond safety ceiling' };
    saveState({
      status: 'waiting-5h-reset',
      statusDetail: `מגבלת 5 השעות זוהתה, אך זמן האיפוס אינו זמין כרגע. נבדק שוב כל ${Math.round(CONFIG.fallbackPollSeconds / 60)} דקות, עם תקרת בטיחות.`,
      threadId,
      lastLimitClassification: 'FiveHour',
    });
    const ok = await interruptibleSleep(CONFIG.fallbackPollSeconds * 1000);
    if (!ok) return { kind: 'UserStop' };
  }
}

function writeMarker(file, text) {
  atomicWrite(file, text + os.EOL);
}

function cleanupOldMarkersIfReset() {
  for (const f of [UNKNOWN_MARKER, THREAD_MARKER]) {
    try { fs.unlinkSync(f); } catch {}
  }
}

async function startupWeeklyGuard() {
  const s = currentState;
  if (s?.status === 'stopped-weekly' && s.weeklyResetAt) {
    const reset = new Date(s.weeklyResetAt);
    if (!Number.isNaN(reset.getTime()) && reset.getTime() > Date.now()) {
      saveState({ status: 'stopped-weekly', statusDetail: `המכסה השבועית עדיין לא התאפסה. האיפוס השמור הוא ${localTimeString(reset)}. לא נשלחה שום בקשה ל-Codex.` });
      return false;
    }
  }
  const limits = await getLimitsBestEffort();
  const { weekly } = pickFiveAndWeekly(limits);
  if (isExhausted(weekly)) {
    const reset = weekly.resetAt;
    const msg = `Weekly Codex quota is exhausted. Reset: ${reset ? reset.toISOString() : 'unknown'}. Thread: ${s.threadId || 'unknown'}`;
    writeMarker(WEEKLY_MARKER, msg);
    saveState({ status: 'stopped-weekly', statusDetail: `המכסה השבועית כבר מלאה. המפקח נעצר לפני ניסיון Resume.${reset ? ` איפוס צפוי: ${localTimeString(reset)}.` : ''}`, weeklyResetAt: reset?.toISOString() || null, lastLimitClassification: 'Weekly' });
    return false;
  }
  try { fs.unlinkSync(WEEKLY_MARKER); } catch {}
  return true;
}

async function supervisorMain() {
  ensureDir();
  if (!IS_WINDOWS) throw new Error('This supervisor build is intended for Windows.');
  if (!acquireLock()) {
    currentState = loadAndMigrateState();
    saveState({ status: 'stopped-error', statusDetail: 'כבר פועל מופע אחר של האוטומציה בפרויקט הזה. לא הופעל מופע נוסף.', lastError: 'Another supervisor instance is already running.' });
    throw new Error('Another supervisor instance is already running for this project.');
  }

  clearOldStopFlag();
  cleanupOldMarkersIfReset();
  currentState = loadAndMigrateState();
  saveState({ status: 'starting', statusDetail: 'האוטומציה עולה, בודקת את Codex ואת מצב המכסות, ושומרת את אותו Thread ID.', lastError: null });
  openDashboardOnce();

  const version = codexVersion();
  log(`Codex found: ${version}`);

  const awake = await startKeepAwake();
  if (!awake.ok) {
    saveState({ status: 'stopped-error', statusDetail: 'מנגנון מניעת שינה לא הצליח לעלות. האוטומציה נעצרה כדי לא להסתמך על מחשב שעלול להירדם.', lastError: awake.note });
    if (CONFIG.requireKeepAwake) throw new Error(`Keep-awake failed: ${awake.note}`);
  } else {
    log('Keep-awake enabled without changing Windows power-plan settings.');
  }

  if (!(await startupWeeklyGuard())) return;

  let threadId = currentState.threadId || null;
  let first = true;
  let transientAttempt = 0;

  while (true) {
    if (isStopRequested()) {
      saveState({ status: 'stopped-user', statusDetail: 'האוטומציה נעצרה בבטחה לפי בקשתך. ה-Thread ID נשמר ולא נמחק.' });
      break;
    }

    const mode = threadId ? 'ResumeId' : 'ResumeLast';
    const result = await runCodexTurn(mode, threadId, CONTINUE_PROMPT);
    first = false;

    if (result.threadMismatch) {
      writeMarker(THREAD_MARKER, `THREAD PROTECTION STOP. Expected: ${threadId}. Returned: ${result.threadId}. No automatic thread switch was allowed.`);
      saveState({ status: 'stopped-thread-mismatch', statusDetail: 'Codex החזיר Thread ID שונה מה-ID השמור. המפקח עצר מיד ולא עבר לשיחה אחרת.', lastError: `Expected ${threadId}, got ${result.threadId}` });
      break;
    }

    if (result.stoppedByUser || isStopRequested()) {
      saveState({ status: 'stopped-user', statusDetail: 'האוטומציה נעצרה בבטחה. כל המצב השמור וה-Thread ID נשארו לשימוש בהרצה הבאה.' });
      break;
    }

    if (result.threadId) {
      if (threadId && result.threadId !== threadId) {
        writeMarker(THREAD_MARKER, `THREAD PROTECTION STOP. Expected: ${threadId}. Returned: ${result.threadId}.`);
        saveState({ status: 'stopped-thread-mismatch', statusDetail: 'הגנת Thread עצרה מעבר אוטומטי לשיחה אחרת.', lastError: `Thread mismatch: ${threadId} -> ${result.threadId}` });
        break;
      }
      threadId = result.threadId;
      saveState({ threadId });
    }

    if (result.activeWriter) {
      saveState({ status: 'stopped-thread-in-use', statusDetail: 'אותו Thread עדיין פתוח באפליקציית Codex, ב-VS Code או בחלון אחר. סגור אותו ואז הפעל שוב את Start-Codex-Auto-Resume.bat.', lastError: 'Codex thread-store active writer conflict.' });
      break;
    }

    if (result.threadMissing) {
      writeMarker(THREAD_MARKER, `Saved thread was not found. Thread: ${threadId || 'unknown'}. Supervisor did NOT fall back to another thread.`);
      saveState({ status: 'stopped-thread-missing', statusDetail: 'ה-Thread השמור לא נמצא. מטעמי בטיחות המפקח לא עבר ל-Thread אחר ולא פתח חדש.', lastError: 'Saved Codex thread not found.' });
      break;
    }

    if (result.limitDetected) {
      transientAttempt = 0;
      const limits = await getLimitsBestEffort();
      const classification = classifyLimit(limits, result.text);
      saveState({ lastLimitClassification: classification.kind });
      log(`Limit classified as ${classification.kind} (${classification.confidence}): ${classification.reason}`);

      if (classification.kind === 'Weekly') {
        const reset = classification.resetAt;
        const msg = `Weekly Codex quota detected. Reset: ${reset ? reset.toISOString() : 'unknown'}. Thread: ${threadId || 'unknown'}`;
        writeMarker(WEEKLY_MARKER, msg);
        saveState({ status: 'stopped-weekly', statusDetail: `זוהתה המכסה השבועית. האוטומציה הפסיקה לחלוטין ולא תבצע ניסיונות נוספים.${reset ? ` האיפוס הצפוי: ${localTimeString(reset)}.` : ''}`, weeklyResetAt: reset?.toISOString() || null, threadId });
        break;
      }

      if (classification.kind === 'Account') {
        saveState({ status: 'stopped-account-limit', statusDetail: 'זוהתה מגבלת חשבון, קרדיטים או Spend Control. האוטומציה עצרה ולא תנסה שוב אוטומטית.', lastError: classification.reason, threadId });
        break;
      }

      if (classification.kind === 'Additional') {
        saveState({ status: 'stopped-additional-limit', statusDetail: 'זוהתה מגבלה נוספת שאינה מזוהה בוודאות כמגבלת 5 השעות הרגילה. האוטומציה עצרה כדי לא לנחש.', lastError: classification.reason, threadId });
        break;
      }

      if (classification.kind === 'FiveHour') {
        const waitResult = await waitForFiveHourReset(classification, threadId);
        if (waitResult.kind === 'UserStop') {
          saveState({ status: 'stopped-user', statusDetail: 'האוטומציה נעצרה בבטחה בזמן ההמתנה. ה-Thread ID נשמר.' });
          break;
        }
        if (waitResult.kind === 'Weekly') {
          const reset = waitResult.resetAt;
          writeMarker(WEEKLY_MARKER, `Weekly quota became exhausted while waiting. Reset: ${reset ? reset.toISOString() : 'unknown'}. Thread: ${threadId}`);
          saveState({ status: 'stopped-weekly', statusDetail: `בזמן ההמתנה התברר שהמכסה השבועית הסתיימה. האוטומציה עצרה.${reset ? ` איפוס: ${localTimeString(reset)}.` : ''}`, weeklyResetAt: reset?.toISOString() || null });
          break;
        }
        if (waitResult.kind === 'Account' || waitResult.kind === 'Additional' || waitResult.kind === 'Unknown') {
          writeMarker(UNKNOWN_MARKER, `Supervisor stopped instead of guessing. Reason: ${waitResult.reason || waitResult.kind}. Thread: ${threadId}`);
          saveState({ status: 'stopped-unknown-limit', statusDetail: 'לא ניתן היה להוכיח בבטחה שהגישה חזרה. האוטומציה עצרה במקום להיכנס ללולאה או לטעות במכסה השבועית.', lastError: waitResult.reason || waitResult.kind });
          break;
        }
        saveState({ status: 'resuming-after-5h-reset', statusDetail: 'זמן האיפוס של 5 השעות הגיע. האוטומציה ממשיכה עכשיו את אותו Thread בדיוק.', threadId });
        continue;
      }

      writeMarker(UNKNOWN_MARKER, `Ambiguous Codex limit. Supervisor intentionally stopped. Thread: ${threadId || 'unknown'}. Reason: ${classification.reason}`);
      saveState({ status: 'stopped-unknown-limit', statusDetail: 'Codex החזיר מגבלת שימוש, אך המקורות לא מאפשרים לקבוע בוודאות אם זו מגבלת 5 שעות או שבועית. האוטומציה עצרה במקום לנחש.', lastError: classification.reason, threadId });
      break;
    }

    if (result.exitCode === 0 && result.turnCompleted) {
      saveState({ status: 'completed', statusDetail: 'Codex סיים את ה-Turn בצורה רגילה וללא מגבלת שימוש. האוטומציה סיימה את עבודתה.', lastCompletedAt: nowIso(), threadId });
      break;
    }

    if (result.transient && transientAttempt < CONFIG.transientRetrySeconds.length) {
      const waitSec = CONFIG.transientRetrySeconds[transientAttempt++];
      saveState({ status: 'retrying-transient', statusDetail: `זוהתה תקלה זמנית ברשת/שירות. ניסיון חוזר בעוד ${Math.round(waitSec / 60)} דקות. מספר ניסיון ${transientAttempt}/${CONFIG.transientRetrySeconds.length}.`, lastError: 'Transient Codex/network error', threadId });
      const ok = await interruptibleSleep(waitSec * 1000);
      if (!ok) {
        saveState({ status: 'stopped-user', statusDetail: 'האוטומציה נעצרה בבטחה בזמן המתנה לניסיון חוזר.' });
        break;
      }
      continue;
    }

    const tail = result.text.slice(-5000);
    saveState({ status: 'stopped-error', statusDetail: 'Codex נעצר מסיבה שאינה מגבלת שימוש ואינה תקלה זמנית מוכרת. לא בוצע Retry עיוור.', lastError: tail || `Codex exit code ${result.exitCode}`, threadId });
    break;
  }
}

function assertTest(cond, name) {
  if (!cond) throw new Error(`SELF-TEST FAILED: ${name}`);
  return name;
}

function runSelfTest() {
  const passed = [];
  passed.push(assertTest(htmlEscape('<&"\'') === '&lt;&amp;&quot;&#39;', 'HTML escaping'));
  const five = { main: { primary: { usedPercent: 100, windowMinutes: 300, resetAt: new Date(Date.now() + 3600000) }, secondary: { usedPercent: 20, windowMinutes: 10080, resetAt: new Date(Date.now() + 3 * 86400000) } }, byId: {} };
  passed.push(assertTest(classifyLimit(five, 'usage limit').kind === 'FiveHour', '5-hour classification'));
  const weekly = { main: { primary: { usedPercent: 100, windowMinutes: 300, resetAt: new Date() }, secondary: { usedPercent: 100, windowMinutes: 10080, resetAt: new Date(Date.now() + 86400000) } }, byId: {} };
  passed.push(assertTest(classifyLimit(weekly, 'usage limit').kind === 'Weekly', 'weekly wins when both exhausted'));
  const account = { main: { primary: null, secondary: null, rateLimitReachedType: 'workspace_member_credits_depleted' }, byId: {} };
  passed.push(assertTest(classifyLimit(account, 'usage limit').kind === 'Account', 'credits/account stop classification'));
  const additional = { main: { primary: { usedPercent: 20, windowMinutes: 300 }, secondary: { usedPercent: 20, windowMinutes: 10080 } }, byId: { codex_other: { primary: { usedPercent: 100, windowDurationMins: 30, resetsAt: Math.floor(Date.now()/1000)+600 } } } };
  passed.push(assertTest(classifyLimit(additional, 'usage limit').kind === 'Additional', 'additional-limit stop classification'));
  const mainFivePlusAdditional = { main: { primary: { usedPercent: 100, windowMinutes: 300, resetAt: new Date(Date.now()+3600000) }, secondary: { usedPercent: 20, windowMinutes: 10080 } }, byId: { codex_other: { primary: { usedPercent: 100, windowDurationMins: 30, resetsAt: Math.floor(Date.now()/1000)+600 } } } };
  passed.push(assertTest(classifyLimit(mainFivePlusAdditional, 'usage limit').kind === 'FiveHour', 'main 5-hour takes precedence over unrelated additional bucket'));
  const unknown = { main: { primary: { usedPercent: 20, windowMinutes: 300 }, secondary: { usedPercent: 20, windowMinutes: 10080 } }, byId: {} };
  passed.push(assertTest(classifyLimit(unknown, 'usage limit').kind === 'Unknown', 'ambiguous limit fails closed'));
  passed.push(assertTest(validateThreadId('019f6088-1234-5678-9abc-def012345678'), 'thread id validation valid'));
  passed.push(assertTest(!validateThreadId('bad & thread'), 'thread id validation rejects metacharacters'));
  const picked = pickFiveAndWeekly(five);
  passed.push(assertTest(picked.five.windowMinutes === 300 && picked.weekly.windowMinutes === 10080, 'window mapping'));
  const t = parseResetFromErrorText('You have hit your usage limit, try again at Aug 27th, 2026 2:30 AM.');
  passed.push(assertTest(t instanceof Date && !Number.isNaN(t.getTime()), 'reset timestamp parser'));
  passed.push(assertTest(normalizePathForCompare(PROJECT).length > 0, 'project path normalization'));
  passed.push(assertTest(CONTINUE_PROMPT.includes('Do not redo'), 'continuation prompt preserves completed work'));
  console.log(`SELF-TEST PASS: ${passed.length}/${passed.length}`);
  for (const p of passed) console.log(`  PASS - ${p}`);
}

async function runDoctor() {
  ensureDir();
  currentState = loadAndMigrateState();
  const checks = [];
  function add(name, ok, detail) { checks.push({ name, ok, detail }); }

  add('Node.js', Number(process.versions.node.split('.')[0]) >= 18, process.version);
  add('Windows', IS_WINDOWS, process.platform);
  add('Project path', fs.existsSync(PROJECT), PROJECT);
  try { add('Codex CLI', true, codexVersion()); } catch (err) { add('Codex CLI', false, err.message); }
  add('Saved state', true, currentState.threadId ? `Thread: ${currentState.threadId}` : 'No saved thread yet; first run will use resume --last once.');
  add('Thread id format', !currentState.threadId || validateThreadId(currentState.threadId), currentState.threadId || 'n/a');

  if (fs.existsSync(LOCK_FILE)) {
    const l = readJsonSafe(LOCK_FILE);
    let alive = false;
    if (l?.pid) { try { process.kill(l.pid, 0); alive = true; } catch {} }
    add('No other supervisor', !alive, alive ? `PID ${l.pid} appears active` : 'stale lock only');
  } else add('No other supervisor', true, 'No lock present');

  try {
    const limits = await queryRateLimits();
    const { five, weekly } = pickFiveAndWeekly(limits);
    add('Rate-limit API', true, `5h: ${formatWindow(five)} | weekly: ${formatWindow(weekly)}`);
  } catch (err) { add('Rate-limit API', false, err.message); }

  try {
    const awake = await startKeepAwake();
    add('Keep-awake', awake.ok, awake.note);
    stopKeepAwake();
  } catch (err) { add('Keep-awake', false, err.message); }

  try {
    const testFile = path.join(STATE_DIR, '.write-test');
    fs.writeFileSync(testFile, 'ok', 'utf8');
    fs.unlinkSync(testFile);
    add('State directory writable', true, STATE_DIR);
  } catch (err) { add('State directory writable', false, err.message); }

  const allOk = checks.every(c => c.ok);
  const rows = checks.map(c => `<tr><td>${htmlEscape(c.name)}</td><td>${c.ok ? '✅ תקין' : '❌ דורש טיפול'}</td><td dir="auto">${htmlEscape(c.detail)}</td></tr>`).join('');
  const report = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codex Auto Resume - Doctor</title><style>body{font-family:Arial,"Segoe UI",sans-serif;max-width:1100px;margin:30px auto;padding:0 20px;direction:rtl;text-align:right}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #ddd;vertical-align:top}th{background:#f2f4f6}.ok{font-size:22px;font-weight:700}</style></head><body><h1>בדיקת Codex Auto Resume</h1><p class="ok">${allOk ? '✅ כל הבדיקות הזמינות עברו.' : '⚠️ יש בדיקה אחת או יותר שדורשת טיפול.'}</p><table><thead><tr><th>בדיקה</th><th>מצב</th><th>פרטים</th></tr></thead><tbody>${rows}</tbody></table><p>הבדיקה אינה שולחת משימת עבודה ואינה משנה את הפרויקט.</p></body></html>`;
  atomicWrite(DOCTOR_HTML, report);
  console.log(`DOCTOR ${allOk ? 'PASS' : 'ATTENTION'}: ${DOCTOR_HTML}`);
  if (IS_WINDOWS) {
    try {
      const cmd = `start "" "${DOCTOR_HTML.replace(/"/g, '""')}"`;
      const p = spawn(process.env.ComSpec || 'cmd.exe', ['/d','/s','/c',cmd], { detached:true, windowsHide:true, stdio:'ignore' });
      p.unref();
    } catch {}
  }
  process.exitCode = allOk ? 0 : 2;
}

async function cleanup() {
  if (activeCodexProcess && activeCodexProcess.exitCode === null) {
    await terminateProcessTree(activeCodexProcess.pid, 1000);
    activeCodexProcess = null;
  }
  stopKeepAwake();
  releaseLock();
}

process.on('SIGINT', () => requestStop('Ctrl+C'));
process.on('SIGTERM', () => requestStop('SIGTERM'));
process.on('uncaughtException', async err => {
  try {
    log(`Uncaught exception: ${err.stack || err.message}`, 'ERROR');
    if (currentState) saveState({ status: 'stopped-error', statusDetail: 'האוטומציה נעצרה עקב שגיאה פנימית. המצב וה-Thread ID נשמרו.', lastError: err.stack || err.message });
  } catch {}
  await cleanup();
  process.exit(1);
});
process.on('unhandledRejection', async err => {
  try { log(`Unhandled rejection: ${err?.stack || err}`, 'ERROR'); } catch {}
  await cleanup();
  process.exit(1);
});

(async () => {
  try {
    if (SELF_TEST) { runSelfTest(); return; }
    if (DOCTOR) { await runDoctor(); return; }
    await supervisorMain();
  } catch (err) {
    log(err.stack || err.message, 'ERROR');
    if (currentState) saveState({ status: 'stopped-error', statusDetail: 'האוטומציה נעצרה בבטחה עקב שגיאה. פרטי המצב נשמרו.', lastError: err.message });
    process.exitCode = 1;
  } finally {
    if (!SELF_TEST && !DOCTOR) await cleanup();
  }
})();
