// ─── Shared Constants & Utilities for Calendar/Appointment Pages ─────

export type ViewMode = "monthly" | "weekly" | "daily";
export type ActionMode = "view" | "reschedule" | "edit" | "delete";

export const HEBREW_DAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
export const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
export const HEBREW_DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export const CHIP_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   dot: "bg-blue-500" },
  green:  { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200",  dot: "bg-green-500" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" },
  amber:  { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-500" },
  red:    { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    dot: "bg-red-500" },
  teal:   { bg: "bg-teal-50",   text: "text-teal-700",   border: "border-teal-200",   dot: "bg-teal-500" },
  pink:   { bg: "bg-pink-50",   text: "text-pink-700",   border: "border-pink-200",   dot: "bg-pink-500" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" },
};

export const DEPARTMENTS = ["פנימית", "כירורגיה", "שיניים", "עור", "חירום"];
export const ROOMS = ["חדר 1", "חדר 2", "חדר 3", "חדר ניתוח", "חדר חירום"];
export const VETS = ['ד"ר יוסי כהן', 'ד"ר שרה לוי', 'ד"ר דוד מזרחי'];

// ─── Department Display Config (for colored cards) ────────────────────
export interface DeptConfig {
  bg: string;       // Tailwind bg class (10% opacity)
  text: string;     // Tailwind text class
  borderColor: string; // hex for 4px right border
  dotClass: string; // Tailwind class for dept dot
  filterDot: string; // Tailwind bg for filter panel
  label: string;
}

export const DEPT_DISPLAY_CONFIG: Record<string, DeptConfig> = {
  "כירורגיה": { bg: "bg-blue-50/80",    text: "text-blue-800",    borderColor: "#3b82f6", dotClass: "bg-blue-500",    filterDot: "bg-blue-500",    label: "כירורגיה" },
  "פנימית":   { bg: "bg-emerald-50/80", text: "text-emerald-800", borderColor: "#10b981", dotClass: "bg-emerald-500", filterDot: "bg-emerald-500", label: "פנימית"   },
  "הדמיה":    { bg: "bg-orange-50/80",  text: "text-orange-800",  borderColor: "#f97316", dotClass: "bg-orange-500",  filterDot: "bg-orange-500",  label: "הדמיה"    },
  "חירום":    { bg: "bg-red-50/80",     text: "text-red-800",     borderColor: "#ef4444", dotClass: "bg-red-500",     filterDot: "bg-red-500",     label: "חירום"    },
  "שיניים":   { bg: "bg-amber-50/80",   text: "text-amber-800",   borderColor: "#f59e0b", dotClass: "bg-amber-500",   filterDot: "bg-amber-500",   label: "שיניים"   },
  "עור":      { bg: "bg-pink-50/80",    text: "text-pink-800",    borderColor: "#ec4899", dotClass: "bg-pink-500",    filterDot: "bg-pink-500",    label: "עור"      },
};

export const FILTER_DEPARTMENTS: { key: string; label: string; color: string }[] = [
  { key: "כירורגיה", label: "כירורגיה",  color: "bg-blue-500" },
  { key: "פנימית",   label: "פנימית",    color: "bg-emerald-500" },
  { key: "הדמיה",    label: "הדמיה",     color: "bg-orange-500" },
  { key: "חירום",    label: "חירום",     color: "bg-red-500" },
  { key: "שיניים",   label: "שיניים",    color: "bg-amber-500" },
  { key: "עור",      label: "עור",       color: "bg-pink-500" },
];

export function getDeptConfig(dept: string): DeptConfig {
  return DEPT_DISPLAY_CONFIG[dept] || {
    bg: "bg-gray-50/80", text: "text-gray-700", borderColor: "#9ca3af",
    dotClass: "bg-gray-400", filterDot: "bg-gray-400", label: dept,
  };
}

// Status derived from id for demo
export function getApptStatus(id: number): { dotColor: string; label: string } {
  const m = id % 3;
  if (m === 1) return { dotColor: "bg-green-500", label: "שולם" };
  if (m === 2) return { dotColor: "bg-blue-500",  label: "ביקור פתוח" };
  return          { dotColor: "bg-red-500",   label: "מאחר" };
}

export interface DateOption { label: string; day: number; month: number; year: number }

export const AVAILABLE_DATES: DateOption[] = [
  { label: "ראשון 08/03", day: 8, month: 2, year: 2026 },
  { label: "שלישי 10/03", day: 10, month: 2, year: 2026 },
  { label: "חמישי 12/03", day: 12, month: 2, year: 2026 },
  { label: "ראשון 15/03", day: 15, month: 2, year: 2026 },
  { label: "שלישי 17/03", day: 17, month: 2, year: 2026 },
  { label: "חמישי 19/03", day: 19, month: 2, year: 2026 },
  { label: "ראשון 22/03", day: 22, month: 2, year: 2026 },
  { label: "שלישי 24/03", day: 24, month: 2, year: 2026 },
  { label: "ראשון 29/03", day: 29, month: 2, year: 2026 },
  { label: "שלישי 31/03", day: 31, month: 2, year: 2026 },
  { label: "חמישי 02/04", day: 2, month: 3, year: 2026 },
  { label: "ראשון 05/04", day: 5, month: 3, year: 2026 },
];

export const AVAILABLE_TIMES = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00",
];

// Also used in ClientPortal rescheduling (string-format dates)
export const AVAILABLE_DATE_STRINGS = [
  { label: "ראשון 08/03", value: "08/03/2026" },
  { label: "שלישי 10/03", value: "10/03/2026" },
  { label: "חמישי 12/03", value: "12/03/2026" },
  { label: "ראשון 15/03", value: "15/03/2026" },
  { label: "שלישי 17/03", value: "17/03/2026" },
  { label: "חמישי 19/03", value: "19/03/2026" },
  { label: "ראשון 22/03", value: "22/03/2026" },
  { label: "שלישי 24/03", value: "24/03/2026" },
  { label: "ראשון 29/03", value: "29/03/2026" },
  { label: "שלישי 31/03", value: "31/03/2026" },
  { label: "חמישי 02/04", value: "02/04/2026" },
  { label: "ראשון 05/04", value: "05/04/2026" },
];

export const TIMELINE_HOURS = Array.from({ length: 11 }, (_, i) => i + 8);
export const TODAY = new Date(2026, 2, 2);

// ─── Utility Functions ───────────────────────────────────────────────
export const getDaysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

export const getFirstDayOfMonth = (year: number, month: number) =>
  new Date(year, month, 1).getDay();

export const getHebrewDayName = (dayIndex: number) => HEBREW_DAY_NAMES[dayIndex];

export function addMinutes(time: string, mins: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export const isSameDateObj = (a: Date, b: Date) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

export function getChip(color: string) {
  return CHIP_COLORS[color] || CHIP_COLORS.blue;
}

export function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}