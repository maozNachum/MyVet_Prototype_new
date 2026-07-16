import * as XLSX from "xlsx";
import { supabase } from "../../services/supabaseClient";

interface PetMedicalEntry {
  id: number;
  date: string;
  title: string;
  vet: string;
  type?: string;
  description?: string;
}

interface ExportablePet {
  id: number;
  name: string;
  type: "dog" | "cat" | "other";
  breed: string;
  age: number | string;
  birthDate?: string;
  gender: string;
  weight: string;
  microchip?: string;
  allergies?: string;
  lastVisit: string;
  nextVaccine: string;
  medicalHistory: PetMedicalEntry[];
}

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

interface FutureAppt {
  petName: string;
  date: string;
  time: string;
  type: string;
  vet: string;
  room: string;
  notes: string;
}

function getSpeciesLabel(type: ExportablePet["type"]) {
  if (type === "dog") return "כלב";
  if (type === "cat") return "חתול";
  return "אחר";
}

/**
 * Exports a pet's full medical record from the owner portal as a structured Excel file
 * compatible with MyVet import or any veterinary system.
 */
export async function exportOwnerMedicalRecord(
  pet: ExportablePet,
  ownerName: string,
  futureAppointments: FutureAppt[]
) {
  const { data: vaccinationRows, error: vaccinationsError } = await supabase
    .from("vaccinations")
    .select("vaccine_name,vaccine_type,manufacturer,batch_number,barcode_value,given_date,next_due_date,expiry_date,administered_by,notes")
    .eq("pet_id", pet.id)
    .order("given_date", { ascending: false });
  if (vaccinationsError) throw vaccinationsError;
  const vaccinations = (vaccinationRows || []) as ExportVaccination[];

  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString("he-IL");

  // ── Sheet 1: Metadata ──
  const metaRows = [
    ["מערכת", "MyVet - מערכת ניהול מרפאה וטרינרית"],
    ["גרסה", "1.0"],
    ["פורמט", "MyVet-Export-v1"],
    ["תאריך הפקה", today],
    [""],
    ["הנחיות", "קובץ זה ניתן לייבוא למערכת MyVet או כל מערכת וטרינרית תואמת."],
    ["", "יש לשמור על מבנה הגיליונות ושמות העמודות."],
  ];
  const metaSheet = XLSX.utils.aoa_to_sheet(metaRows);
  metaSheet["!cols"] = [{ wch: 18 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, metaSheet, "מטא-דאטה");

  // ── Sheet 2: Pet Info ──
  const species = getSpeciesLabel(pet.type);
  const infoRows = [
    ["═══ פרטי חיית מחמד ═══", ""],
    ["שם", pet.name],
    ["מין (Species)", species],
    ["מגדר", pet.gender],
    ["גזע", pet.breed],
    ["גיל", String(pet.age)],
    ["תאריך לידה", pet.birthDate || ""],
    ["משקל", pet.weight],
    ["מספר שבב", pet.microchip || ""],
    ["אלרגיות", pet.allergies || ""],
    [""],
    ["═══ פרטי בעלים ═══", ""],
    ["שם בעלים", ownerName],
    [""],
    ["ביקור אחרון", pet.lastVisit],
    ["חיסון הבא", pet.nextVaccine],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
  infoSheet["!cols"] = [{ wch: 22 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, infoSheet, "פרטי מטופל");

  // ── Sheet 3: Medical History ──
  const histHeader = ["#", "תאריך", "כותרת", "סוג טיפול", "תיאור", "רופא מטפל"];
  const histRows = pet.medicalHistory.map((v, i) => [
    i + 1,
    v.date,
    v.title,
    v.type || "",
    v.description || "",
    v.vet,
  ]);
  const histSheet = XLSX.utils.aoa_to_sheet([histHeader, ...histRows]);
  histSheet["!cols"] = [
    { wch: 5 }, { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 45 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, histSheet, "היסטוריה רפואית");

  // ── Sheet 4: Vaccinations ──
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

  // ── Sheet 5: Future Appointments ──
  const petAppts = futureAppointments.filter((a) => a.petName === pet.name);
  if (petAppts.length > 0) {
    const apptHeader = ["#", "תאריך", "שעה", "סוג תור", "רופא/ה", "חדר", "הערות"];
    const apptRows = petAppts.map((a, i) => [
      i + 1, a.date, a.time, a.type, a.vet, a.room, a.notes,
    ]);
    const apptSheet = XLSX.utils.aoa_to_sheet([apptHeader, ...apptRows]);
    apptSheet["!cols"] = [
      { wch: 5 }, { wch: 14 }, { wch: 8 }, { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(wb, apptSheet, "תורים עתידיים");
  }

  // ── Sheet 6: Summary ──
  const vetCount: Record<string, number> = {};
  for (const v of pet.medicalHistory) {
    vetCount[v.vet] = (vetCount[v.vet] || 0) + 1;
  }
  const summaryRows = [
    ["═══ סיכום ═══", ""],
    ["סה״כ ביקורים", String(pet.medicalHistory.length)],
    ["סה״כ חיסונים", String(vaccinations.length)],
    ["תורים עתידיים", String(petAppts.length)],
    [""],
    ["── לפי רופא מטפל ──", ""],
    ...Object.entries(vetCount).map(([k, v]) => [k, String(v)]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 25 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "סיכום");

  // ── Download ──
  const fileName = `תיק_רפואי_${pet.name}_${today.replace(/\./g, "-")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
