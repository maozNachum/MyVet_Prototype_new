import * as XLSX from "xlsx";
import type { LabOrder } from "../data/LabStore";

const CATEGORY_LABELS: Record<string, string> = {
  blood: "בדיקת דם",
  urine: "בדיקת שתן",
  imaging: "הדמיה",
  biopsy: "ביופסיה",
  other: "אחר",
};

const STATUS_LABELS: Record<string, string> = {
  ordered: "הוזמנה",
  "in-progress": "בביצוע",
  completed: "הושלמה",
};

const RESULT_STATUS_LABELS: Record<string, string> = {
  normal: "תקין",
  abnormal: "חריג",
  critical: "קריטי",
};

export function exportLabResults(petName: string, orders: LabOrder[]) {
  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString("he-IL");

  // ── Sheet 1: All Lab Orders ──
  const header = [
    "#",
    "שם הבדיקה",
    "קטגוריה",
    "סטטוס",
    "דחוף",
    "תאריך הזמנה",
    "הוזמן ע״י",
    "תאריך השלמה",
    "תוצאה כללית",
    "ערכים",
    "טווח נורמלי",
    "סטטוס תוצאה",
    "הערות",
  ];

  const sorted = [...orders].sort((a, b) => {
    const statusOrder: Record<string, number> = { ordered: 0, "in-progress": 1, completed: 2 };
    return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
  });

  const rows = sorted.map((o, i) => [
    i + 1,
    o.testName,
    CATEGORY_LABELS[o.category] || o.category,
    STATUS_LABELS[o.status] || o.status,
    o.urgent ? "כן" : "לא",
    o.orderedDate,
    o.orderedBy,
    o.completedDate || "—",
    o.results || "—",
    o.resultValue || "—",
    o.normalRange || "—",
    o.resultStatus ? RESULT_STATUS_LABELS[o.resultStatus] || "" : "—",
    o.notes || "",
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = [
    { wch: 5 },
    { wch: 28 },
    { wch: 12 },
    { wch: 10 },
    { wch: 6 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 40 },
    { wch: 30 },
    { wch: 30 },
    { wch: 10 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, sheet, "בדיקות מעבדה");

  // ── Sheet 2: Summary ──
  const completedCount = orders.filter((o) => o.status === "completed").length;
  const pendingCount = orders.filter((o) => o.status !== "completed").length;
  const abnormalCount = orders.filter((o) => o.resultStatus === "abnormal" || o.resultStatus === "critical").length;

  const catCounts: Record<string, number> = {};
  for (const o of orders) {
    const label = CATEGORY_LABELS[o.category] || o.category;
    catCounts[label] = (catCounts[label] || 0) + 1;
  }

  const summaryRows = [
    ["═══ סיכום בדיקות מעבדה ═══", ""],
    ["שם החיה", petName],
    ["תאריך הפקה", today],
    [""],
    ["סה״כ בדיקות", String(orders.length)],
    ["הושלמו", String(completedCount)],
    ["ממתינות / בביצוע", String(pendingCount)],
    ["ממצאים חריגים", String(abnormalCount)],
    [""],
    ["── לפי קטגוריה ──", ""],
    ...Object.entries(catCounts).map(([k, v]) => [k, String(v)]),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 28 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "סיכום");

  // ── Download ──
  const fileName = `בדיקות_מעבדה_${petName}_${today.replace(/\./g, "-")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
