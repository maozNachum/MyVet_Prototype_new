import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPetImportDrafts,
  extractLabOrders,
  extractMedicalHistory,
  normalizeImportedVisitType,
  extractMyVetPetDetails,
  extractVaccinations,
  getMissingPetImportFields,
  inferLocalPetColumnMapping,
  parseAiPetColumnMapping,
} from "../src/app/utils/petImport.ts";

test("pet import reads the vertical MyVet-Export-v1 patient details format", () => {
  const extracted = extractMyVetPetDetails([
    ["═══ פרטי חיית מחמד ═══", ""],
    ["שם", "אוסקר"],
    ["מין", "חתול"],
    ["סוג", "cat"],
    ["מגדר", "זכר"],
    ["גיל", "9"],
    ["גזע", "רחוב"],
    ["משקל", "3.6 ק״ג"],
    ["מספר שבב", "אין שבב"],
    ["אלרגיות", "אין"],
    ["", ""],
    ["═══ פרטי בעלים ═══", ""],
    ["שם בעלים", "פרטים שלא צריכים להיכלל"],
  ]);

  assert.ok(extracted);
  assert.doesNotMatch(JSON.stringify(extracted), /פרטים שלא צריכים להיכלל/);

  const mapping = inferLocalPetColumnMapping(extracted.headers);
  const [draft] = buildPetImportDrafts([extracted.row], mapping);

  assert.equal(draft.pet_name, "אוסקר");
  assert.equal(draft.species, "cat");
  assert.equal(draft.gender, "זכר");
  assert.equal(draft.breed, "other");
  assert.equal(draft.custom_breed, "רחוב");
  assert.equal(draft.weight, "3.6");
  assert.equal(draft.microchip, "");
  assert.equal(draft.allergies, "");
  assert.deepEqual(getMissingPetImportFields(draft), ["birth_date"]);
});

test("pet import maps common Hebrew columns into a reviewable draft", () => {
  const headers = [
    "שם החיה",
    "סוג חיה",
    "גזע",
    "מין",
    "תאריך לידה",
    "משקל בק״ג",
    "מספר שבב",
  ];
  const mapping = inferLocalPetColumnMapping(headers);
  const [draft] = buildPetImportDrafts(
    [
      {
        "שם החיה": "בוני",
        "סוג חיה": "כלבה",
        גזע: "לברדור",
        מין: "נקבה",
        "תאריך לידה": "14/03/2022",
        "משקל בק״ג": "18.4 ק״ג",
        "מספר שבב": "123456789012345",
      },
    ],
    mapping,
  );

  assert.equal(draft.pet_name, "בוני");
  assert.equal(draft.species, "dog");
  assert.equal(draft.breed, "labrador");
  assert.equal(draft.gender, "נקבה");
  assert.equal(draft.birth_date, "2022-03-14");
  assert.equal(draft.weight, "18.4");
  assert.equal(draft.microchip, "123456789012345");
  assert.deepEqual(getMissingPetImportFields(draft), []);
});

test("pet import keeps unknown breeds as custom values and reports missing required data", () => {
  const headers = ["Pet Name", "Species", "Breed"];
  const mapping = inferLocalPetColumnMapping(headers);
  const [draft] = buildPetImportDrafts(
    [{ "Pet Name": "Milo", Species: "cat", Breed: "British Shorthair" }],
    mapping,
  );

  assert.equal(draft.species, "cat");
  assert.equal(draft.breed, "other");
  assert.equal(draft.custom_breed, "British Shorthair");
  assert.deepEqual(getMissingPetImportFields(draft), [
    "gender",
    "birth_date",
    "weight",
  ]);
});

test("VetBot column mapping accepts only exact headers from the uploaded sheet", () => {
  const headers = ["Animal DOB", "Body Mass", "Unrelated"];
  const mapping = parseAiPetColumnMapping(
    JSON.stringify({
      birth_date: "Animal DOB",
      weight: "Body Mass",
      pet_name: "Invented Header",
      owner_id: "Unrelated",
    }),
    headers,
  );

  assert.deepEqual(mapping, {
    birth_date: "Animal DOB",
    weight: "Body Mass",
  });
});

test("pet import reads every valid row from the medical history sheet", () => {
  const visits = extractMedicalHistory([
    ["#", "תאריך", "כותרת", "סוג טיפול", "תיאור", "רופא מטפל"],
    [1, "16/07/2026", "בדיקה שנתית", "בדיקה", "בדיקה תקינה", "ד״ר כהן"],
    [2, new Date("2026-06-03T00:00:00.000Z"), "טיפול שיניים", "שיניים", "ניקוי אבנית", "ד״ר לוי"],
    [3, "", "שורה ללא תאריך", "", "", ""],
  ]);

  assert.deepEqual(visits, [
    {
      visit_date: "2026-07-16",
      title: "בדיקה שנתית",
      visit_type: "בדיקה",
      description: "בדיקה תקינה",
      vet_name: "ד״ר כהן",
      diagnosis: "",
      notes: "",
      urgency_level: "normal",
      chief_complaint: "",
      final_diagnosis: "",
      follow_up_required: false,
      follow_up_notes: "",
    },
    {
      visit_date: "2026-06-03",
      title: "טיפול שיניים",
      visit_type: "שיניים",
      description: "ניקוי אבנית",
      vet_name: "ד״ר לוי",
      diagnosis: "",
      notes: "",
      urgency_level: "normal",
      chief_complaint: "",
      final_diagnosis: "",
      follow_up_required: false,
      follow_up_notes: "",
    },
  ]);
});

test("pet import converts exported Hebrew visit labels to schema-safe codes", () => {
  assert.equal(normalizeImportedVisitType("טיפול רפואי"), "full_exam");
  assert.equal(normalizeImportedVisitType("בדיקה"), "full_exam");
  assert.equal(normalizeImportedVisitType("שיניים"), "full_exam");
  assert.equal(normalizeImportedVisitType("חיסון"), "vaccination");
  assert.equal(normalizeImportedVisitType("שיחת וידאו"), "video_consultation");
  assert.equal(normalizeImportedVisitType("video_consultation"), "video_consultation");
  assert.equal(normalizeImportedVisitType("סוג ישן ולא מוכר"), "full_exam");
});

test("pet import preserves full visit details from MyVet-Export-v2", () => {
  const [visit] = extractMedicalHistory([
    [
      "#", "תאריך", "כותרת", "סוג טיפול", "קוד סוג טיפול",
      "תלונה עיקרית", "סיבת ביקור", "אבחנה", "טיפול", "הערות",
      "רופא מטפל", "דחיפות", "קוד דחיפות", "אבחנה סופית",
      "נדרש מעקב", "הערות מעקב",
    ],
    [
      1, "2026-07-18", "צליעה", "בדיקה רפואית", "full_exam",
      "צליעה ברגל ימין", "בדיקה", "חשד לנקע", "מנוחה", "ללא חום",
      "ד״ר כהן", "חמור", "serious", "נקע", "כן", "ביקורת בעוד שבוע",
    ],
  ]);

  assert.deepEqual(visit, {
    visit_date: "2026-07-18",
    title: "צליעה",
    visit_type: "full_exam",
    description: "מנוחה",
    vet_name: "ד״ר כהן",
    diagnosis: "חשד לנקע",
    notes: "ללא חום",
    urgency_level: "serious",
    chief_complaint: "צליעה ברגל ימין",
    final_diagnosis: "נקע",
    follow_up_required: true,
    follow_up_notes: "ביקורת בעוד שבוע",
  });
});

test("pet import reads laboratory classification, result status and values", () => {
  const orders = extractLabOrders([
    [
      "#", "שם הבדיקה", "קטגוריה", "קוד קטגוריה", "סטטוס",
      "קוד סטטוס", "דחוף", "תאריך הזמנה", "הוזמן ע״י",
      "תאריך בדיקה", "תאריך השלמה", "תוצאה כללית", "ערכים",
      "טווח נורמלי", "סיווג תוצאה", "קוד סיווג תוצאה", "הערות",
    ],
    [
      1, "בדיקת שתן כללית", "בדיקת שתן", "urine", "הושלמה",
      "completed", "כן", "2026-07-10", "ד״ר כהן", "2026-07-11",
      "2026-07-11", "חלבון מוגבר", "Protein 2+", "Negative",
      "חריג", "abnormal", "נדרש מעקב",
    ],
  ]);

  assert.deepEqual(orders, [
    {
      test_name: "בדיקת שתן כללית",
      category: "urine",
      status: "completed",
      urgent: true,
      ordered_date: "2026-07-10",
      ordered_by_name: "ד״ר כהן",
      test_date: "2026-07-11",
      completed_date: "2026-07-11",
      results: "חלבון מוגבר",
      result_value: "Protein 2+",
      normal_range: "Negative",
      result_status: "abnormal",
      notes: "נדרש מעקב",
    },
  ]);
});

test("pet import reads vaccinations from the dedicated sheet", () => {
  const vaccinations = extractVaccinations([
    [
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
    ],
    [
      1,
      "כלבת",
      "חובה",
      "VetPharma",
      "LOT-42",
      "7290001234567",
      "01.07.2026",
      "01.07.2027",
      "31.12.2027",
      "ד״ר כהן",
      "ללא תגובה חריגה",
    ],
    [2, "", "", "", "", "", "02.07.2026", "", "", "", ""],
  ]);

  assert.deepEqual(vaccinations, [
    {
      vaccine_name: "כלבת",
      vaccine_type: "חובה",
      manufacturer: "VetPharma",
      batch_number: "LOT-42",
      barcode_value: "7290001234567",
      given_date: "2026-07-01",
      next_due_date: "2027-07-01",
      expiry_date: "2027-12-31",
      administered_by: "ד״ר כהן",
      notes: "ללא תגובה חריגה",
    },
  ]);
});
