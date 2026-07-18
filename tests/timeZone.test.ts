import assert from "node:assert/strict";
import test from "node:test";
import { dayRangeInTimeZone } from "../supabase/functions/_shared/timeZone.ts";

test("VetBot uses the Israeli calendar day after local midnight", () => {
  const range = dayRangeInTimeZone(1, new Date("2026-07-18T22:46:00.000Z"));

  assert.deepEqual(range, {
    start: "2026-07-18T21:00:00.000Z",
    end: "2026-07-19T21:00:00.000Z",
  });
});

test("VetBot respects the winter offset in Israel", () => {
  const range = dayRangeInTimeZone(1, new Date("2026-01-18T23:30:00.000Z"));

  assert.deepEqual(range, {
    start: "2026-01-18T22:00:00.000Z",
    end: "2026-01-19T22:00:00.000Z",
  });
});

test("multi-day schedule ranges start and end at Israeli midnight", () => {
  const range = dayRangeInTimeZone(7, new Date("2026-07-18T22:46:00.000Z"));

  assert.deepEqual(range, {
    start: "2026-07-18T21:00:00.000Z",
    end: "2026-07-25T21:00:00.000Z",
  });
});
