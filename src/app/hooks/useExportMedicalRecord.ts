import * as XLSX from "xlsx";
import type { Patient } from "../data/patients";
import { supabase } from "../../services/supabaseClient";

const VISIT_TYPE_LABELS: Record<string, string> = {
  full_exam: "בדיקה רפואית",
  checkup: "בדיקה",
  surgery: "ניתוח",
  vaccination: "חיסון",
  emergency: "חירום",
  dental: "שיניים",
  weight_check: "שקילה",
  prescription_only: "מרשם",
  lab: "בדיקת מעבדה",
  follow_up: "מעקב",
  note: "הערה רפואית",
  hospitalization: "אשפוז",
  hospitalization_discharge: "שחרור מאשפוז",
  video_consultation: "שיחת וידאו",
};

const URGENCY_LABELS: Record<string, string> = {
  normal: "רגיל",
  serious: "חמור",
  critical: "קריטי",
};

const LAB_CATEGORY_LABELS: Record<string, string> = {
  blood: "בדיקת דם",
  urine: "בדיקת שתן",
  imaging: "הדמיה",
  biopsy: "ביופסיה",
  other: "אחר",
};

const LAB_STATUS_LABELS: Record<string, string> = {
  ordered: "הוזמנה",
  "in-progress": "בביצוע",
  completed: "הושלמה",
};

const LAB_RESULT_STATUS_LABELS: Record<string, string> = {
  normal: "תקין",
  abnormal: "חריג",
  critical: "קריטי",
};

type ExportMedicalVisit = {
  visit_date: string;
  vet_name: string | null;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  visit_type: string | null;
  urgency_level: string | null;
  chief_complaint: string | null;
  final_diagnosis: string | null;
  follow_up_required: boolean | null;
  follow_up_notes: string | null;
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

type ExportLabOrder = {
  test_name: string;
  category: string | null;
  status: string | null;
  ordered_date: string;
  test_date: string | null;
  ordered_by: string | null;
  results: string | null;
  normal_range: string | null;
  result_value: string | null;
  result_status: string | null;
  completed_date: string | null;
  notes: string | null;
  is_urgent: boolean | null;
};

function dateOnly(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function neuteredStatusLabel(value?: string) {
  if (value === "yes") return "כן";
  if (value === "no") return "לא";
  return "לא ידוע";
}

function setSheetLayout(sheet: XLSX.WorkSheet, widths: number[], rowCount: number) {
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  if (rowCount > 0) {
    sheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowCount, c: widths.length - 1 } }),
    };
  }
}

/** Exports a fresh, complete patient record directly from Supabase. */
export async function exportMedicalRecord(patient: Patient) {
  const [
    { data: visitRows, error: visitsError },
    { data: vaccinationRows, error: vaccinationsError },
    { data: labRows, error: labsError },
  ] = await Promise.all([
    supabase
      .from("medical_visits")
      .select("visit_date,vet_name,reason,diagnosis,treatment,notes,visit_type,urgency_level,chief_complaint,final_diagnosis,follow_up_required,follow_up_notes")
      .eq("pet_id", patient.id)
      .order("visit_date", { ascending: false }),
    supabase
      .from("vaccinations")
      .select("vaccine_name,vaccine_type,manufacturer,batch_number,barcode_value,given_date,next_due_date,expiry_date,administered_by,notes")
      .eq("pet_id", patient.id)
      .order("given_date", { ascending: false }),
    supabase
      .from("lab_orders")
      .select("test_name,category,status,ordered_date,test_date,ordered_by,results,normal_range,result_value,result_status,completed_date,notes,is_urgent")
      .eq("pet_id", patient.id)
      .order("ordered_date", { ascending: false }),
  ]);

  if (visitsError) throw visitsError;
  if (vaccinationsError) throw vaccinationsError;
  if (labsError) throw labsError;

  const visits = (visitRows || []) as ExportMedicalVisit[];
  const vaccinations = (vaccinationRows || []) as ExportVaccination[];
  const labOrders = (labRows || []) as ExportLabOrder[];
  const staffIds = [...new Set(labOrders.map((order) => order.ordered_by).filter(Boolean))] as string[];
  const staffNames = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows, error: staffError } = await supabase
      .from("staff")
      .select("staff_id,name,full_name")
      .in("staff_id", staffIds);
    if (!staffError) {
      (staffRows || []).forEach((staff) => {
        staffNames.set(
          String(staff.staff_id),
          String(staff.full_name || staff.name || "צוות המרפאה"),
        );
      });
    }
  }

  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString("he-IL");

  const metaRows = [
    ["מערכת", "MyVet - מערכת ניהול מרפאה וטרינרית"],
    ["גרסה", "2.0"],
    ["תאריך הפקה", today],
    ["מזהה מטופל", String(patient.id)],
    [""],
    ["הנחיות ייבוא", "קובץ זה ניתן לייבוא למערכת MyVet או כל מערכת וטרינרית תואמת"],
    ["פורמט", "MyVet-Export-v2"],
  ];
  const metaSheet = XLSX.utils.aoa_to_sheet(metaRows);
  metaSheet["!cols"] = [{ wch: 20 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, metaSheet, "מטא-דאטה");

  const petWithStatus = patient.pet as Patient["pet"] & { neuteredStatus?: string };
  const latestVisit = visits[0]?.visit_date ? dateOnly(visits[0].visit_date) : patient.lastVisit;
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
    ["עיקור / סירוס", neuteredStatusLabel(petWithStatus.neuteredStatus)],
    [""],
    ["═══ פרטי בעלים ═══", ""],
    ["שם בעלים", patient.owner.name],
    ["תעודת זהות", patient.owner.id],
    ["טלפון", patient.owner.phone],
    ["כתובת", patient.owner.address],
    [""],
    ["ביקור אחרון", latestVisit || "טרם נקבע"],
    ["תור הבא", patient.nextAppointment || "לא נקבע"],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
  infoSheet["!cols"] = [{ wch: 22 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, infoSheet, "פרטי מטופל");

  const historyHeader = [
    "#", "תאריך", "כותרת", "סוג טיפול", "קוד סוג טיפול", "תלונה עיקרית",
    "סיבת ביקור", "אבחנה", "טיפול", "הערות", "רופא מטפל", "דחיפות",
    "קוד דחיפות", "אבחנה סופית", "נדרש מעקב", "הערות מעקב",
  ];
  const historyRows = visits.map((visit, index) => [
    index + 1,
    dateOnly(visit.visit_date),
    visit.chief_complaint || visit.reason || "רשומה רפואית",
    VISIT_TYPE_LABELS[visit.visit_type || ""] || visit.visit_type || "בדיקה רפואית",
    visit.visit_type || "full_exam",
    visit.chief_complaint || "",
    visit.reason || "",
    visit.diagnosis || "",
    visit.treatment || "",
    visit.notes || "",
    visit.vet_name || "לא צוין",
    URGENCY_LABELS[visit.urgency_level || "normal"] || "רגיל",
    visit.urgency_level || "normal",
    visit.final_diagnosis || "",
    visit.follow_up_required ? "כן" : "לא",
    visit.follow_up_notes || "",
  ]);
  const historySheet = XLSX.utils.aoa_to_sheet([historyHeader, ...historyRows]);
  setSheetLayout(
    historySheet,
    [5, 14, 25, 18, 18, 28, 28, 30, 40, 35, 22, 12, 14, 30, 12, 35],
    historyRows.length,
  );
  XLSX.utils.book_append_sheet(wb, historySheet, "היסטוריה רפואית");

  const vaccinationHeader = [
    "#", "שם חיסון", "סוג חיסון", "יצרן", "מספר אצווה", "ברקוד",
    "תאריך מתן", "תאריך חיסון הבא", "תאריך תפוגה", "בוצע על ידי", "הערות",
  ];
  const vaccinationData = vaccinations.map((record, index) => [
    index + 1,
    record.vaccine_name,
    record.vaccine_type || "",
    record.manufacturer || "",
    record.batch_number || "",
    record.barcode_value || "",
    dateOnly(record.given_date),
    dateOnly(record.next_due_date),
    dateOnly(record.expiry_date),
    record.administered_by || "",
    record.notes || "",
  ]);
  const vaccinationsSheet = XLSX.utils.aoa_to_sheet([vaccinationHeader, ...vaccinationData]);
  setSheetLayout(
    vaccinationsSheet,
    [5, 22, 18, 18, 18, 20, 14, 18, 14, 22, 40],
    vaccinationData.length,
  );
  XLSX.utils.book_append_sheet(wb, vaccinationsSheet, "חיסונים");

  const labHeader = [
    "#", "שם הבדיקה", "קטגוריה", "קוד קטגוריה", "סטטוס", "קוד סטטוס",
    "דחוף", "תאריך הזמנה", "הוזמן ע״י", "תאריך בדיקה", "תאריך השלמה",
    "תוצאה כללית", "ערכים", "טווח נורמלי", "סיווג תוצאה",
    "קוד סיווג תוצאה", "הערות",
  ];
  const labData = labOrders.map((order, index) => [
    index + 1,
    order.test_name,
    LAB_CATEGORY_LABELS[order.category || "other"] || "אחר",
    order.category || "other",
    LAB_STATUS_LABELS[order.status || "ordered"] || "הוזמנה",
    order.status || "ordered",
    order.is_urgent ? "כן" : "לא",
    dateOnly(order.ordered_date),
    order.ordered_by ? staffNames.get(order.ordered_by) || "צוות המרפאה" : "צוות המרפאה",
    dateOnly(order.test_date),
    dateOnly(order.completed_date),
    order.results || "",
    order.result_value || "",
    order.normal_range || "",
    order.result_status
      ? LAB_RESULT_STATUS_LABELS[order.result_status] || order.result_status
      : "",
    order.result_status || "",
    order.notes || "",
  ]);
  const labSheet = XLSX.utils.aoa_to_sheet([labHeader, ...labData]);
  setSheetLayout(
    labSheet,
    [5, 28, 16, 16, 14, 16, 8, 14, 22, 14, 14, 40, 30, 30, 16, 20, 35],
    labData.length,
  );
  XLSX.utils.book_append_sheet(wb, labSheet, "בדיקות מעבדה");

  const typeCount: Record<string, number> = {};
  const vetCount: Record<string, number> = {};
  visits.forEach((visit) => {
    const typeLabel = VISIT_TYPE_LABELS[visit.visit_type || ""] || visit.visit_type || "בדיקה רפואית";
    const vetLabel = visit.vet_name || "לא צוין";
    typeCount[typeLabel] = (typeCount[typeLabel] || 0) + 1;
    vetCount[vetLabel] = (vetCount[vetLabel] || 0) + 1;
  });
  const labCategoryCount: Record<string, number> = {};
  labOrders.forEach((order) => {
    const label = LAB_CATEGORY_LABELS[order.category || "other"] || "אחר";
    labCategoryCount[label] = (labCategoryCount[label] || 0) + 1;
  });
  const summaryRows = [
    ["═══ סיכום סטטיסטי ═══", ""],
    ["סה״כ ביקורים", String(visits.length)],
    ["סה״כ חיסונים", String(vaccinations.length)],
    ["סה״כ בדיקות מעבדה", String(labOrders.length)],
    [""],
    ["── ביקורים לפי סוג טיפול ──", ""],
    ...Object.entries(typeCount).map(([key, value]) => [key, String(value)]),
    [""],
    ["── בדיקות לפי קטגוריה ──", ""],
    ...Object.entries(labCategoryCount).map(([key, value]) => [key, String(value)]),
    [""],
    ["── לפי רופא מטפל ──", ""],
    ...Object.entries(vetCount).map(([key, value]) => [key, String(value)]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 32 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "סיכום");

  const fileName = `תיק_רפואי_${patient.pet.name}_${patient.pet.microchip}_${today.replace(/\./g, "-")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
