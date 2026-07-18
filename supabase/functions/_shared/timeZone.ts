export const MYVET_TIME_ZONE = "Asia/Jerusalem";

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInTimeZone(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = partsInTimeZone(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const inputWithoutMilliseconds = Math.floor(date.getTime() / 1000) * 1000;
  return representedAsUtc - inputWithoutMilliseconds;
}

function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const wallClockMidnight = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utcTime = wallClockMidnight;

  // Resolve the offset at local midnight. Repeating also handles a DST change
  // between the initial UTC guess and the resolved instant.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const resolved = wallClockMidnight - timeZoneOffsetMs(new Date(utcTime), timeZone);
    if (resolved === utcTime) break;
    utcTime = resolved;
  }

  return new Date(utcTime);
}

export function dayRangeInTimeZone(
  days = 1,
  now = new Date(),
  timeZone = MYVET_TIME_ZONE,
) {
  const current = partsInTimeZone(now, timeZone);
  const start = zonedMidnightUtc(current.year, current.month, current.day, timeZone);
  const endCalendarDate = new Date(Date.UTC(current.year, current.month - 1, current.day + days));
  const end = zonedMidnightUtc(
    endCalendarDate.getUTCFullYear(),
    endCalendarDate.getUTCMonth() + 1,
    endCalendarDate.getUTCDate(),
    timeZone,
  );

  return { start: start.toISOString(), end: end.toISOString() };
}
