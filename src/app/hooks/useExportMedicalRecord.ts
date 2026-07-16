import * as XLSX from "xlsx";
import type { Patient, MedicalVisit } from "../data/patients";
import { supabase } from "../../services/supabaseClient";

const VISIT_TYPE_LABELS: Record<string, string> = {
  checkup: "בדיקה",
  surgery: "ניתוח",
  vaccination: "חיסון",
  emergency: "חירום",
  dental: "שיניים",
};

type ExportVaccination = {
  vaccine_name: string;
  vaccine_type: string | null;
  manufacturer: string | null;
  batch_number: string | null;
  barcode_value: string | null;
  given_date: string;
  next_due_date: string | null;
  expiry_date: string | null;
  administered_by: string | null;
  notes: string | null;
};

/** Exports a patient's full medical record as a structured Excel file. */
export async function exportMedicalRecord(patient: Patient, visits: MedicalVisit[]) {
  const { data: vaccinationRows, error: vaccinationsError } = await supabase
    .from("vaccinations")
    .select("vaccine_name,vaccine_type,manufacturer,batch_number,barcode_value,given_date,next_due_date,expiry_date,administered_by,notes")
    .eq("pet_id", patient.id)
    .order("given_date", { ascending: false });
  if (vaccinationsError) throw vaccinationsError;
  const vaccinations = (vaccinationRows || []) as ExportVaccination[];

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
    ["תאריך לידה", patient.pet.birthDate || ""],
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

  // ── Sheet 4: Vaccinations ──
  const vaccinationHeader = [
    "#",
    "שם חיסון",
    "סוג חיסון",
    "יצרן",
    "מספר אצווה",
    "ברקוד",
    "תאריך מתן",
    "תאריך חיסון הבא",
    "תאריך תפוגה",
    "בוצע על ידי",
    "הערות",
  ];
  const vaccinationData = vaccinations.map((record, index) => [
    index + 1,
    record.vaccine_name,
    record.vaccine_type || "",
    record.manufacturer || "",
    record.batch_number || "",
    record.barcode_value || "",
    record.given_date,
    record.next_due_date || "",
    record.expiry_date || "",
    record.administered_by || "",
    record.notes || "",
  ]);
  const vaccinationsSheet = XLSX.utils.aoa_to_sheet([
    vaccinationHeader,
    ...vaccinationData,
  ]);
  vaccinationsSheet["!cols"] = [
    { wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 22 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, vaccinationsSheet, "חיסונים");

  // ── Sheet 5: Summary Stats ──
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
    ["סה״כ חיסונים", String(vaccinations.length)],
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
