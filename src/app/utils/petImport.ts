import * as XLSX from "xlsx";

export type PetImportField =
  | "pet_name"
  | "species"
  | "breed"
  | "gender"
  | "birth_date"
  | "weight"
  | "microchip"
  | "allergies"
  | "neutered_status";

export type PetColumnMapping = Partial<Record<PetImportField, string>>;

export type PetImportDraft = {
  pet_name: string;
  species: string;
  breed: string;
  custom_breed: string;
  gender: string;
  birth_date: string;
  microchip: string;
  allergies: string;
  weight: string;
  neutered_status: "unknown" | "yes" | "no";
};

export type PetSpreadsheetData = {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  medicalHistory: PetImportMedicalVisit[];
  vaccinations: PetImportVaccination[];
};

export type PetImportMedicalVisit = {
  visit_date: string;
  title: string;
  visit_type: string;
  description: string;
  vet_name: string;
};

export type PetImportVaccination = {
  vaccine_name: string;
  vaccine_type: string;
  manufacturer: string;
  batch_number: string;
  barcode_value: string;
  given_date: string;
  next_due_date: string;
  expiry_date: string;
  administered_by: string;
  notes: string;
};

export const PET_IMPORT_FIELD_LABELS: Record<PetImportField, string> = {
  pet_name: "שם החיה",
  species: "סוג החיה",
  breed: "גזע",
  gender: "מין",
  birth_date: "תאריך לידה",
  weight: "משקל",
  microchip: "מספר שבב",
  allergies: "אלרגיות",
  neutered_status: "עיקור / סירוס",
};

export const REQUIRED_PET_IMPORT_FIELDS: PetImportField[] = [
  "pet_name",
  "species",
  "breed",
  "gender",
  "birth_date",
  "weight",
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 25;
const SUPPORTED_FILE_PATTERN = /\.(csv|xlsx|xls)$/i;

const HEADER_ALIASES: Record<PetImportField, string[]> = {
  pet_name: [
    "שם החיה",
    "שם חיה",
    "שם בעל החיים",
    "שם בעח",
    "pet name",
    "animal name",
    "pet_name",
    "name",
  ],
  species: [
    "סוג החיה",
    "סוג חיה",
    "סוג בעל החיים",
    "מין בעל חיים",
    "species",
    "animal type",
    "pet type",
    "type",
  ],
  breed: ["גזע", "breed", "pet breed", "animal breed"],
  gender: ["מין", "מגדר", "sex", "gender", "pet gender"],
  birth_date: [
    "תאריך לידה",
    "תאריך הלידה",
    "לידה",
    "birth date",
    "date of birth",
    "dob",
    "birth_date",
  ],
  weight: ["משקל", "משקל בקג", "משקל קג", "weight", "weight kg", "kg"],
  microchip: [
    "מספר שבב",
    "שבב",
    "מיקרוציפ",
    "microchip",
    "chip",
    "chip number",
  ],
  allergies: [
    "אלרגיות",
    "רגישויות",
    "אלרגיה",
    "allergies",
    "allergy",
    "sensitivities",
  ],
  neutered_status: [
    "מסורס",
    "מעוקרת",
    "עיקור",
    "סירוס",
    "מסורס מעוקרת",
    "neutered",
    "spayed",
    "neutered status",
  ],
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/["'`׳״()[\]{}]/g, "")
    .replace(/[_./\\-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isSupportedFile(file: File) {
  return SUPPORTED_FILE_PATTERN.test(file.name);
}

function createUniqueHeaders(values: unknown[]) {
  const counts = new Map<string, number>();
  return values.map((value, index) => {
    const base = String(value ?? "").trim() || `עמודה ${index + 1}`;
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function headerRecognitionScore(row: unknown[]) {
  const normalizedAliases = Object.values(HEADER_ALIASES)
    .flat()
    .map(normalizeHeader);
  const cells = row.map(normalizeHeader).filter(Boolean);
  const recognized = cells.filter((cell) => normalizedAliases.includes(cell)).length;
  return recognized * 10 + cells.length;
}

function findHeaderRowIndex(rows: unknown[][]) {
  const candidates = rows.slice(0, 10);
  let bestIndex = 0;
  let bestScore = -1;

  candidates.forEach((row, index) => {
    const score = headerRecognitionScore(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export function extractMyVetPetDetails(
  matrix: unknown[][],
): { headers: string[]; row: Record<string, unknown> } | null {
  const petSectionIndex = matrix.findIndex((row) =>
    normalizeHeader(row[0]).includes("פרטי חיית מחמד"),
  );
  if (petSectionIndex < 0) return null;

  const ownerSectionIndex = matrix.findIndex(
    (row, index) =>
      index > petSectionIndex &&
      normalizeHeader(row[0]).includes("פרטי בעלים"),
  );
  const petRows = matrix.slice(
    petSectionIndex + 1,
    ownerSectionIndex > petSectionIndex ? ownerSectionIndex : matrix.length,
  );
  const valuesByLabel = new Map(
    petRows
      .filter((row) => normalizeHeader(row[0]))
      .map((row) => [normalizeHeader(row[0]), row[1] ?? ""]),
  );
  const valueFor = (...labels: string[]) => {
    for (const label of labels) {
      const value = valuesByLabel.get(normalizeHeader(label));
      if (String(value ?? "").trim()) return value;
    }
    return "";
  };

  const canonicalRow: Record<string, unknown> = {
    "שם החיה": valueFor("שם", "שם החיה"),
    "סוג החיה": valueFor("סוג", "מין", "סוג החיה"),
    גזע: valueFor("גזע"),
    מין: valueFor("מגדר", "מין החיה"),
    "תאריך לידה": valueFor("תאריך לידה"),
    "משקל בק״ג": valueFor("משקל", "משקל בק״ג"),
    "מספר שבב": valueFor("מספר שבב", "שבב"),
    אלרגיות: valueFor("אלרגיות", "רגישויות"),
    "עיקור / סירוס": valueFor(
      "עיקור / סירוס",
      "מסורס",
      "מעוקרת",
      "סטטוס עיקור",
    ),
  };
  const headers = Object.keys(canonicalRow).filter((header) =>
    String(canonicalRow[header] ?? "").trim(),
  );

  if (!String(canonicalRow["שם החיה"] ?? "").trim()) return null;
  return {
    headers,
    row: Object.fromEntries(headers.map((header) => [header, canonicalRow[header]])),
  };
}

function getSheetMatrix(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
}

function findColumnIndex(headers: unknown[], ...aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) =>
    normalizedAliases.includes(normalizeHeader(header)),
  );
}

function cellAt(row: unknown[], index: number) {
  return index >= 0 ? row[index] : "";
}

export function extractMedicalHistory(
  matrix: unknown[][],
): PetImportMedicalVisit[] {
  const headerIndex = matrix.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.includes("תאריך") && (
      normalized.includes("כותרת") ||
      normalized.includes("סוג טיפול / אירוע") ||
      normalized.includes("סוג טיפול")
    );
  });
  if (headerIndex < 0) return [];

  const headers = matrix[headerIndex];
  const dateIndex = findColumnIndex(headers, "תאריך", "visit date", "date");
  const titleIndex = findColumnIndex(
    headers,
    "כותרת",
    "סיבת ביקור",
    "סוג טיפול / אירוע",
    "reason",
    "title",
  );
  const typeIndex = findColumnIndex(headers, "סוג טיפול", "visit type", "type");
  const descriptionIndex = findColumnIndex(
    headers,
    "תיאור",
    "טיפול",
    "description",
    "treatment",
  );
  const vetIndex = findColumnIndex(
    headers,
    "רופא מטפל",
    "רופא/ה",
    "וטרינר",
    "vet",
  );

  return matrix
    .slice(headerIndex + 1)
    .map((row) => ({
      visit_date: normalizeBirthDate(cellAt(row, dateIndex)),
      title: cleanValue(cellAt(row, titleIndex)),
      visit_type: cleanValue(cellAt(row, typeIndex)),
      description: cleanValue(cellAt(row, descriptionIndex)),
      vet_name: cleanValue(cellAt(row, vetIndex)),
    }))
    .filter((visit) =>
      Boolean(visit.visit_date && (visit.title || visit.description)),
    );
}

export function extractVaccinations(
  matrix: unknown[][],
): PetImportVaccination[] {
  const headerIndex = matrix.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.includes("שם חיסון") && (
      normalized.includes("תאריך מתן") ||
      normalized.includes("given date")
    );
  });
  if (headerIndex < 0) return [];

  const headers = matrix[headerIndex];
  const index = (...aliases: string[]) => findColumnIndex(headers, ...aliases);
  const vaccineNameIndex = index("שם חיסון", "vaccine name");
  const vaccineTypeIndex = index("סוג חיסון", "vaccine type");
  const manufacturerIndex = index("יצרן", "manufacturer");
  const batchIndex = index("מספר אצווה", "אצווה", "batch number", "batch");
  const barcodeIndex = index("ברקוד", "barcode");
  const givenDateIndex = index("תאריך מתן", "given date");
  const nextDueIndex = index("תאריך חיסון הבא", "תאריך הבא", "next due date");
  const expiryIndex = index("תאריך תפוגה", "תוקף", "expiry date");
  const administeredByIndex = index("בוצע על ידי", "administered by");
  const notesIndex = index("הערות", "notes");

  return matrix
    .slice(headerIndex + 1)
    .map((row) => ({
      vaccine_name: cleanValue(cellAt(row, vaccineNameIndex)),
      vaccine_type: cleanValue(cellAt(row, vaccineTypeIndex)),
      manufacturer: cleanValue(cellAt(row, manufacturerIndex)),
      batch_number: cleanValue(cellAt(row, batchIndex)),
      barcode_value: cleanValue(cellAt(row, barcodeIndex)),
      given_date: normalizeBirthDate(cellAt(row, givenDateIndex)),
      next_due_date: normalizeBirthDate(cellAt(row, nextDueIndex)),
      expiry_date: normalizeBirthDate(cellAt(row, expiryIndex)),
      administered_by: cleanValue(cellAt(row, administeredByIndex)),
      notes: cleanValue(cellAt(row, notesIndex)),
    }))
    .filter((vaccination) =>
      Boolean(vaccination.vaccine_name && vaccination.given_date),
    );
}

export async function readPetSpreadsheet(file: File): Promise<PetSpreadsheetData> {
  if (!isSupportedFile(file)) {
    throw new Error("אפשר להעלות קובץ CSV, XLS או XLSX בלבד.");
  }
  if (file.size <= 0) {
    throw new Error("הקובץ ריק ולא ניתן לקריאה.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("הקובץ גדול מדי. הגודל המרבי הוא 5MB.");
  }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    throw new Error("לא הצלחנו לקרוא את הקובץ. בדקו שהוא קובץ CSV או Excel תקין.");
  }

  const historySheetName = workbook.SheetNames.find((name) =>
    normalizeHeader(name).includes("היסטוריה רפואית"),
  );
  const vaccinationsSheetName = workbook.SheetNames.find((name) =>
    normalizeHeader(name).includes("חיסונים"),
  );
  const medicalHistory = historySheetName
    ? extractMedicalHistory(getSheetMatrix(workbook, historySheetName))
    : [];
  const vaccinations = vaccinationsSheetName
    ? extractVaccinations(getSheetMatrix(workbook, vaccinationsSheetName))
    : [];

  const myVetSheetName = workbook.SheetNames.find((name) =>
    normalizeHeader(name).includes("פרטי מטופל"),
  );
  if (myVetSheetName) {
    const myVetSheet = workbook.Sheets[myVetSheetName];
    const myVetMatrix = XLSX.utils.sheet_to_json<unknown[]>(myVetSheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    const extracted = extractMyVetPetDetails(myVetMatrix);
    if (extracted) {
      return {
        fileName: file.name,
        sheetName: myVetSheetName,
        headers: extracted.headers,
        rows: [extracted.row],
        medicalHistory,
        vaccinations,
      };
    }
  }

  const sheetCandidates = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    const nonEmptyRows = matrix.filter((row) =>
      row.some((cell) => String(cell ?? "").trim()),
    );
    if (nonEmptyRows.length < 2) return [];
    const headerRowIndex = findHeaderRowIndex(nonEmptyRows);
    return [{
      sheetName,
      nonEmptyRows,
      headerRowIndex,
      score: headerRecognitionScore(nonEmptyRows[headerRowIndex]),
    }];
  });
  const bestSheet = sheetCandidates.sort((a, b) => b.score - a.score)[0];
  if (!bestSheet) throw new Error("לא נמצא גיליון נתונים בקובץ.");

  const { sheetName, nonEmptyRows, headerRowIndex } = bestSheet;
  const headers = createUniqueHeaders(nonEmptyRows[headerRowIndex]);
  const rows = nonEmptyRows
    .slice(headerRowIndex + 1)
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
    )
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()))
    .slice(0, MAX_IMPORT_ROWS);

  if (rows.length === 0) {
    throw new Error("לא נמצאו רשומות חיה מתחת לשורת הכותרות.");
  }

  return {
    fileName: file.name,
    sheetName,
    headers,
    rows,
    medicalHistory,
    vaccinations,
  };
}

export function inferLocalPetColumnMapping(headers: string[]): PetColumnMapping {
  const mapping: PetColumnMapping = {};
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  (Object.keys(HEADER_ALIASES) as PetImportField[]).forEach((field) => {
    const aliases = HEADER_ALIASES[field].map(normalizeHeader);
    const exact = normalizedHeaders.find((header) => aliases.includes(header.normalized));
    if (exact) {
      mapping[field] = exact.original;
      return;
    }

    const partial = normalizedHeaders.find((header) =>
      aliases.some(
        (alias) =>
          alias.length >= 4 &&
          (header.normalized.includes(alias) || alias.includes(header.normalized)),
      ),
    );
    if (partial) mapping[field] = partial.original;
  });

  return mapping;
}

export function parseAiPetColumnMapping(
  answer: string,
  headers: string[],
): PetColumnMapping {
  const jsonCandidate =
    answer.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ||
    answer.match(/\{[\s\S]*\}/)?.[0] ||
    "";
  if (!jsonCandidate) return {};

  try {
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
    const allowedHeaders = new Set(headers);
    const mapping: PetColumnMapping = {};

    (Object.keys(PET_IMPORT_FIELD_LABELS) as PetImportField[]).forEach((field) => {
      const header = typeof parsed[field] === "string" ? parsed[field].trim() : "";
      if (allowedHeaders.has(header)) mapping[field] = header;
    });

    return mapping;
  } catch {
    return {};
  }
}

function cleanValue(value: unknown) {
  return String(value ?? "").trim();
}

function cleanOptionalValue(value: unknown) {
  const text = cleanValue(value);
  const normalized = normalizeHeader(text);
  if (
    [
      "אין",
      "אין שבב",
      "ללא",
      "לא קיים",
      "לא קיימת",
      "לא ידוע",
      "לא ידועה",
      "n a",
      "none",
      "unknown",
      "—",
      "-",
    ].includes(normalized)
  ) {
    return "";
  }
  return text;
}

function normalizeSpecies(value: unknown) {
  const normalized = normalizeHeader(value);
  if (["dog", "canine", "כלב", "כלבה"].includes(normalized)) return "dog";
  if (["cat", "feline", "חתול", "חתולה"].includes(normalized)) return "cat";
  if (["bird", "avian", "ציפור", "תוכי"].includes(normalized)) return "bird";
  if (["rabbit", "ארנב", "ארנבת"].includes(normalized)) return "rabbit";
  if (["hamster", "אוגר"].includes(normalized)) return "hamster";
  if (normalized) return "other";
  return "";
}

function normalizeGender(value: unknown) {
  const normalized = normalizeHeader(value);
  if (["male", "m", "זכר"].includes(normalized)) return "זכר";
  if (["female", "f", "נקבה"].includes(normalized)) return "נקבה";
  if (["unknown", "לא ידוע", "לא ידועה"].includes(normalized)) return "לא ידוע";
  return "";
}

function normalizeNeuteredStatus(value: unknown): "unknown" | "yes" | "no" {
  const normalized = normalizeHeader(value);
  if (
    ["yes", "true", "1", "כן", "מסורס", "מעוקרת", "spayed", "neutered"].includes(
      normalized,
    )
  ) {
    return "yes";
  }
  if (["no", "false", "0", "לא"].includes(normalized)) return "no";
  return "unknown";
}

function normalizeBirthDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = cleanValue(value);
  if (!text) return "";
  const isoMatch = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const localMatch = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (localMatch) {
    return `${localMatch[3]}-${localMatch[2].padStart(2, "0")}-${localMatch[1].padStart(2, "0")}`;
  }

  return "";
}

function normalizeWeight(value: unknown) {
  const match = cleanValue(value).replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? match[0] : "";
}

function normalizeBreed(value: unknown) {
  const raw = cleanValue(value);
  const normalized = normalizeHeader(value);
  const knownBreeds: Array<{ value: string; aliases: string[] }> = [
    { value: "golden-retriever", aliases: ["golden retriever", "גולדן רטריבר"] },
    { value: "labrador", aliases: ["labrador", "לברדור"] },
    { value: "german-shepherd", aliases: ["german shepherd", "רועה גרמני"] },
    { value: "persian-cat", aliases: ["persian cat", "חתול פרסי", "פרסי"] },
    { value: "siamese", aliases: ["siamese", "סיאמי"] },
    { value: "mixed", aliases: ["mixed", "mix", "מעורב", "מעורבת"] },
  ];
  const known = knownBreeds.find((breed) =>
    breed.aliases.map(normalizeHeader).includes(normalized),
  );
  if (known) return { breed: known.value, custom_breed: "" };
  if (raw) return { breed: "other", custom_breed: raw };
  return { breed: "", custom_breed: "" };
}

export function buildPetImportDrafts(
  rows: Record<string, unknown>[],
  mapping: PetColumnMapping,
): PetImportDraft[] {
  const valueFor = (
    row: Record<string, unknown>,
    field: PetImportField,
  ): unknown => {
    const header = mapping[field];
    return header ? row[header] : "";
  };

  return rows
    .map((row) => {
      const breed = normalizeBreed(valueFor(row, "breed"));
      return {
        pet_name: cleanValue(valueFor(row, "pet_name")),
        species: normalizeSpecies(valueFor(row, "species")),
        breed: breed.breed,
        custom_breed: breed.custom_breed,
        gender: normalizeGender(valueFor(row, "gender")),
        birth_date: normalizeBirthDate(valueFor(row, "birth_date")),
        microchip: cleanOptionalValue(valueFor(row, "microchip")),
        allergies: cleanOptionalValue(valueFor(row, "allergies")),
        weight: normalizeWeight(valueFor(row, "weight")),
        neutered_status: normalizeNeuteredStatus(valueFor(row, "neutered_status")),
      };
    })
    .filter((draft) =>
      Object.entries(draft).some(
        ([field, value]) => field !== "neutered_status" && Boolean(value),
      ),
    );
}

export function getMissingPetImportFields(draft: PetImportDraft) {
  return REQUIRED_PET_IMPORT_FIELDS.filter((field) => {
    if (field === "breed") {
      return !draft.breed || (draft.breed === "other" && !draft.custom_breed.trim());
    }
    return !String(draft[field] ?? "").trim();
  });
}
