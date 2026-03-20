import * as XLSX from "xlsx";
import type { Patient, MedicalVisit } from "../data/patients";

const VISIT_TYPE_LABELS: Record<string, string> = {
  checkup: "בדיקה",
  surgery: "ניתוח",
  vaccination: "חיסון",
  emergency: "חירום",
  dental: "שיניים",
};

/** Exports a patient's full medical record as a structured Excel file. */
export function exportMedicalRecord(patient: Patient, visits: MedicalVisit[]) {
  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString("he-IL");

  // ── Sheet 1: Metadata ──
  const metaRows = [
    ["מערכת", "MyVet - מערכת ניהול מרפאה וטרינרית"],
    ["גרסה", "1.0"],
    ["תאריך הפקה", today],
    ["מזהה מטופל", String(patient.id)],
    [""],
    ["הנחיות ייבוא", "קובץ זה ניתן לייבוא למערכת MyVet או כל מערכת וטרינרית תואמת"],
    ["פורמט", "MyVet-Export-v1"],
  ];
  const metaSheet = XLSX.utils.aoa_to_sheet(metaRows);
  metaSheet["!cols"] = [{ wch: 20 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, metaSheet, "מטא-דאטה");

  // ── Sheet 2: Patient & Owner Info ──
  const infoRows = [
    ["═══ פרטי חיית מחמד ═══", ""],
    ["שם", patient.pet.name],
    ["מין", patient.pet.species],
    ["סוג", patient.pet.speciesType],
    ["מגדר", patient.pet.gender],
    ["גיל", String(patient.pet.age)],
    ["גזע", patient.pet.breed],
    ["משקל", patient.pet.weight],
    ["מספר שבב", patient.pet.microchip],
    ["אלרגיות", patient.pet.allergies || "אין"],
    [""],
    ["═══ פרטי בעלים ═══", ""],
    ["שם בעלים", patient.owner.name],
    ["תעודת זהות", patient.owner.id],
    ["טלפון", patient.owner.phone],
    ["כתובת", patient.owner.address],
    [""],
    ["ביקור אחרון", patient.lastVisit],
    ["תור הבא", patient.nextAppointment || "לא נקבע"],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
  infoSheet["!cols"] = [{ wch: 22 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, infoSheet, "פרטי מטופל");

  // ── Sheet 3: Medical History ──
  const historyHeader = ["#", "תאריך", "כותרת", "סוג טיפול", "תיאור", "רופא מטפל"];
  const sortedVisits = [...visits].sort((a, b) => {
    // Parse DD/MM/YYYY
    const [dA, mA, yA] = a.date.split("/").map(Number);
    const [dB, mB, yB] = b.date.split("/").map(Number);
    return new Date(yB, mB - 1, dB).getTime() - new Date(yA, mA - 1, dA).getTime();
  });

  const historyRows = sortedVisits.map((v, i) => [
    i + 1,
    v.date,
    v.title,
    VISIT_TYPE_LABELS[v.type] || v.type,
    v.description,
    v.vet,
  ]);

  const historySheet = XLSX.utils.aoa_to_sheet([historyHeader, ...historyRows]);
  historySheet["!cols"] = [
    { wch: 5 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 50 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, historySheet, "היסטוריה רפואית");

  // ── Sheet 4: Summary Stats ──
  const typeCount: Record<string, number> = {};
  const vetCount: Record<string, number> = {};
  for (const v of visits) {
    const tl = VISIT_TYPE_LABELS[v.type] || v.type;
    typeCount[tl] = (typeCount[tl] || 0) + 1;
    vetCount[v.vet] = (vetCount[v.vet] || 0) + 1;
  }

  const summaryRows = [
    ["═══ סיכום סטטיסטי ═══", ""],
    ["סה״כ ביקורים", String(visits.length)],
    [""],
    ["── לפי סוג טיפול ──", ""],
    ...Object.entries(typeCount).map(([k, v]) => [k, String(v)]),
    [""],
    ["── לפי רופא מטפל ──", ""],
    ...Object.entries(vetCount).map(([k, v]) => [k, String(v)]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 25 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "סיכום");

  // ── Download ──
  const fileName = `תיק_רפואי_${patient.pet.name}_${patient.pet.microchip}_${today.replace(/\./g, "-")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
