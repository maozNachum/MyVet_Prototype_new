import * as XLSX from "xlsx";

interface PetMedicalEntry {
  id: number;
  date: string;
  title: string;
  vet: string;
}

interface ExportablePet {
  name: string;
  type: "dog" | "cat";
  breed: string;
  age: number;
  gender: string;
  weight: string;
  lastVisit: string;
  nextVaccine: string;
  medicalHistory: PetMedicalEntry[];
}

interface FutureAppt {
  petName: string;
  date: string;
  time: string;
  type: string;
  vet: string;
  room: string;
  notes: string;
}

/**
 * Exports a pet's full medical record from the owner portal as a structured Excel file
 * compatible with MyVet import or any veterinary system.
 */
export function exportOwnerMedicalRecord(
  pet: ExportablePet,
  ownerName: string,
  futureAppointments: FutureAppt[]
) {
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
  const species = pet.type === "dog" ? "כלב" : "חתול";
  const infoRows = [
    ["═══ פרטי חיית מחמד ═══", ""],
    ["שם", pet.name],
    ["מין (Species)", species],
    ["מגדר", pet.gender],
    ["גזע", pet.breed],
    ["גיל", String(pet.age)],
    ["משקל", pet.weight],
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
  const histHeader = ["#", "תאריך", "סוג טיפול / אירוע", "רופא מטפל"];
  const histRows = pet.medicalHistory.map((v, i) => [
    i + 1,
    v.date,
    v.title,
    v.vet,
  ]);
  const histSheet = XLSX.utils.aoa_to_sheet([histHeader, ...histRows]);
  histSheet["!cols"] = [{ wch: 5 }, { wch: 14 }, { wch: 30 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, histSheet, "היסטוריה רפואית");

  // ── Sheet 4: Future Appointments ──
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

  // ── Sheet 5: Summary ──
  const vetCount: Record<string, number> = {};
  for (const v of pet.medicalHistory) {
    vetCount[v.vet] = (vetCount[v.vet] || 0) + 1;
  }
  const summaryRows = [
    ["═══ סיכום ═══", ""],
    ["סה״כ ביקורים", String(pet.medicalHistory.length)],
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
