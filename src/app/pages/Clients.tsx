import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Cat,
  CreditCard,
  Dog,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";
import { OwnerDebtPanel } from "../components/OwnerDebtPanel";
import { askAiAssistant } from "../components/ai/aiClient";
import { ClientsAssistant } from "../components/ai/PageAssistants";
import { getStaffId, getStaffType } from "../data/staffAuth";
import {
  buildPetImportDrafts,
  getMissingPetImportFields,
  inferLocalPetColumnMapping,
  normalizeImportedVisitType,
  parseAiPetColumnMapping,
  PET_IMPORT_FIELD_LABELS,
  readPetSpreadsheet,
  type PetImportDraft,
  type PetImportLabOrder,
  type PetImportMedicalVisit,
  type PetImportVaccination,
} from "../utils/petImport";

type SpeciesType = "dog" | "cat" | "other";

type OwnerRow = {
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  auth_user_id?: string | null;
  created_at?: string | null;
};

type PatientRow = {
  pet_id: number;
  pet_name: string | null;
  species: string | null;
  breed: string | null;
  gender: string | null;
  birth_date: string | null;
  microchip: string | null;
  allergies: string | null;
  weight: number | string | null;
  neutered_status?: "unknown" | "yes" | "no" | string | null;
  owner_id: string | null;
  created_at?: string | null;
};

type Client = OwnerRow & {
  fullName: string;
  pets: PatientRow[];
  openDebt: number;
};

type PaymentRow = {
  owner_id: string | null;
  amount: number | string | null;
  status: string | null;
};

type OwnerEditForm = {
  owner_first_name: string;
  owner_last_name: string;
  phone: string;
  email: string;
  address: string;
};

type OwnerCreateForm = {
  owner_id: string;
  owner_first_name: string;
  owner_last_name: string;
  phone: string;
  email: string;
  address: string;
};

type PetCreateForm = {
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

type AddPetMode = "choice" | "manual" | "file";

const INITIAL_OWNER_CREATE_FORM: OwnerCreateForm = {
  owner_id: "",
  owner_first_name: "",
  owner_last_name: "",
  phone: "",
  email: "",
  address: "",
};

const INITIAL_PET_CREATE_FORM: PetCreateForm = {
  pet_name: "",
  species: "dog",
  breed: "",
  custom_breed: "",
  gender: "",
  birth_date: "",
  microchip: "",
  allergies: "",
  weight: "",
  neutered_status: "unknown",
};

const SPECIES_OPTIONS = [
  { value: "dog", label: "כלב" },
  { value: "cat", label: "חתול" },
  { value: "bird", label: "ציפור" },
  { value: "rabbit", label: "ארנב" },
  { value: "hamster", label: "אוגר" },
  { value: "other", label: "אחר" },
];

const BREED_OPTIONS = [
  { value: "golden-retriever", label: "גולדן רטריבר" },
  { value: "labrador", label: "לברדור" },
  { value: "german-shepherd", label: "רועה גרמני" },
  { value: "persian-cat", label: "חתול פרסי" },
  { value: "siamese", label: "סיאמי" },
  { value: "mixed", label: "מעורב" },
  { value: "other", label: "אחר" },
];

const GENDER_OPTIONS = [
  { value: "זכר", label: "זכר" },
  { value: "נקבה", label: "נקבה" },
  { value: "לא ידוע", label: "לא ידוע" },
];

const NEUTERED_OPTIONS = [
  { value: "unknown", label: "לא ידוע" },
  { value: "yes", label: "כן" },
  { value: "no", label: "לא" },
];

function getNeuteredQuestion(gender?: string | null) {
  if (gender === "זכר") return "מסורס?";
  if (gender === "נקבה") return "מעוקרת?";
  return "מסורס/מעוקרת?";
}

function getNeuteredLabel(status?: string | null, gender?: string | null) {
  if (status === "yes") return gender === "נקבה" ? "מעוקרת" : gender === "זכר" ? "מסורס" : "כן";
  if (status === "no") return "לא";
  return "לא ידוע";
}


function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function buildFullName(owner: Pick<OwnerRow, "owner_first_name" | "owner_last_name" | "owner_id">) {
  const name = `${owner.owner_first_name ?? ""} ${owner.owner_last_name ?? ""}`.trim();
  return name || `לקוח ${owner.owner_id}`;
}

function getSpeciesType(species: string | null): SpeciesType {
  const value = normalize(species).toLowerCase();
  if (value === "dog" || value === "כלב") return "dog";
  if (value === "cat" || value === "חתול") return "cat";
  return "other";
}

function getSpeciesLabel(species: string | null) {
  const value = normalize(species).toLowerCase();
  if (value === "dog") return "כלב";
  if (value === "cat") return "חתול";
  if (value === "bird") return "ציפור";
  if (value === "rabbit") return "ארנב";
  if (value === "hamster") return "אוגר";
  if (value === "other") return "אחר";
  return species || "לא מוגדר";
}

function calculateAgeFromBirthDate(birthDate: string | null) {
  if (!birthDate) return "לא ידוע";

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "לא ידוע";

  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();

  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0) {
    return months <= 1 ? "פחות מחודשיים" : `${months} חודשים`;
  }

  return years === 1 ? "שנה" : `${years} שנים`;
}

function formatDate(dateValue: string | null | undefined) {
  if (!dateValue) return "לא ידוע";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "לא ידוע";
  return date.toLocaleDateString("he-IL");
}

function isClientMatchingSearch(client: Client, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const values = [
    client.owner_id,
    client.fullName,
    client.phone,
    client.email,
    client.address,
    ...client.pets.flatMap((pet) => [pet.pet_name, pet.microchip, pet.breed, pet.species]),
  ];

  return values.some((value) => normalize(value).toLowerCase().includes(q));
}

export function Clients() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showDebtOnly = searchParams.get("filter") === "debt";

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState<OwnerEditForm>({
    owner_first_name: "",
    owner_last_name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [createForm, setCreateForm] = useState<OwnerCreateForm>(INITIAL_OWNER_CREATE_FORM);
  const [isAddPetOpen, setIsAddPetOpen] = useState(false);
  const [isAddingPet, setIsAddingPet] = useState(false);
  const [petForm, setPetForm] = useState<PetCreateForm>(INITIAL_PET_CREATE_FORM);
  const [addPetMode, setAddPetMode] = useState<AddPetMode>("choice");
  const [isReadingPetFile, setIsReadingPetFile] = useState(false);
  const [petImportDrafts, setPetImportDrafts] = useState<PetImportDraft[]>([]);
  const [petImportMedicalHistory, setPetImportMedicalHistory] = useState<PetImportMedicalVisit[]>([]);
  const [petImportVaccinations, setPetImportVaccinations] = useState<PetImportVaccination[]>([]);
  const [petImportLabOrders, setPetImportLabOrders] = useState<PetImportLabOrder[]>([]);
  const [selectedPetImportIndex, setSelectedPetImportIndex] = useState(0);
  const [petImportError, setPetImportError] = useState<string | null>(null);
  const [petImportSummary, setPetImportSummary] = useState<{
    fileName: string;
    missingLabels: string[];
    aiUsed: boolean;
    medicalVisitCount: number;
    vaccinationCount: number;
    labOrderCount: number;
    warning?: string;
  } | null>(null);
  const petFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const ownerIdFromUrl = searchParams.get("owner_id") || searchParams.get("ownerId");
    setSelectedOwnerId(ownerIdFromUrl);
  }, [searchParams]);

  const fetchClients = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const [
        { data: ownersData, error: ownersError },
        { data: patientsData, error: patientsError },
        { data: paymentsData, error: paymentsError },
      ] = await Promise.all([
        supabase
          .from("owners")
          .select("owner_id, owner_first_name, owner_last_name, phone, email, address, auth_user_id, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("patients")
          .select("pet_id, pet_name, species, breed, gender, birth_date, microchip, allergies, weight, neutered_status, owner_id, created_at")
          .order("pet_name", { ascending: true }),
        supabase
          .from("payments")
          .select("owner_id, amount, status")
          .in("status", ["unpaid", "partial"]),
      ]);

      if (ownersError) throw ownersError;
      if (patientsError) throw patientsError;
      if (paymentsError) throw paymentsError;

      const petsByOwnerId = new Map<string, PatientRow[]>();

      (patientsData ?? []).forEach((pet) => {
        const ownerId = normalize(pet.owner_id);
        if (!ownerId) return;
        const pets = petsByOwnerId.get(ownerId) ?? [];
        pets.push(pet as PatientRow);
        petsByOwnerId.set(ownerId, pets);
      });

      const debtByOwnerId = new Map<string, number>();
      ((paymentsData ?? []) as PaymentRow[]).forEach((payment) => {
        const ownerId = normalize(payment.owner_id);
        if (!ownerId) return;
        debtByOwnerId.set(ownerId, (debtByOwnerId.get(ownerId) || 0) + Number(payment.amount || 0));
      });

      const mappedClients: Client[] = (ownersData ?? []).map((owner) => {
        const row = owner as OwnerRow;
        return {
          ...row,
          fullName: buildFullName(row),
          pets: petsByOwnerId.get(row.owner_id) ?? [],
          openDebt: debtByOwnerId.get(row.owner_id) || 0,
        };
      });

      setClients(mappedClients);
    } catch (error) {
      console.error("Error loading clients:", error);
      setErrorMessage("אירעה שגיאה בטעינת הלקוחות מ-Supabase");
      toast.error("שגיאה בטעינת לקוחות");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const selectedClient = useMemo(
    () => clients.find((client) => client.owner_id === selectedOwnerId) ?? null,
    [clients, selectedOwnerId]
  );

  const filteredClients = useMemo(
    () => clients.filter((client) => (!showDebtOnly || client.openDebt > 0) && isClientMatchingSearch(client, searchQuery)),
    [clients, searchQuery, showDebtOnly]
  );

  const totalPets = useMemo(
    () => clients.reduce((sum, client) => sum + client.pets.length, 0),
    [clients]
  );

  const openClient = (ownerId: string) => {
    setSelectedOwnerId(ownerId);
    setSearchParams({ owner_id: ownerId });
  };

  const backToList = () => {
    setSelectedOwnerId(null);
    setSearchParams({});
  };

  const openEditModal = (client: Client) => {
    setEditForm({
      owner_first_name: client.owner_first_name ?? "",
      owner_last_name: client.owner_last_name ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
      address: client.address ?? "",
    });
    setIsEditOpen(true);
  };

  const openCreateClientModal = () => {
    setCreateForm(INITIAL_OWNER_CREATE_FORM);
    setIsCreateClientOpen(true);
  };

  const openAddPetModal = () => {
    setPetForm(INITIAL_PET_CREATE_FORM);
    setAddPetMode("choice");
    setPetImportDrafts([]);
    setPetImportMedicalHistory([]);
    setPetImportVaccinations([]);
    setPetImportLabOrders([]);
    setSelectedPetImportIndex(0);
    setPetImportError(null);
    setPetImportSummary(null);
    setIsAddPetOpen(true);
  };

  const closeAddPetModal = () => {
    if (isAddingPet || isReadingPetFile) return;
    setIsAddPetOpen(false);
    setAddPetMode("choice");
    setPetImportDrafts([]);
    setPetImportMedicalHistory([]);
    setPetImportVaccinations([]);
    setPetImportLabOrders([]);
    setPetImportError(null);
    setPetImportSummary(null);
  };

  const openManualPetEntry = () => {
    setPetForm(INITIAL_PET_CREATE_FORM);
    setPetImportMedicalHistory([]);
    setPetImportVaccinations([]);
    setPetImportLabOrders([]);
    setPetImportSummary(null);
    setPetImportError(null);
    setAddPetMode("manual");
  };

  const applyImportedPetDraft = (
    draft: PetImportDraft,
    fileName: string,
    aiUsed: boolean,
    medicalVisitCount = petImportMedicalHistory.length,
    vaccinationCount = petImportVaccinations.length,
    labOrderCount = petImportLabOrders.length,
    warning?: string,
  ) => {
    const missingLabels = getMissingPetImportFields(draft).map(
      (field) => PET_IMPORT_FIELD_LABELS[field],
    );
    setPetForm(draft);
    setPetImportSummary({
      fileName,
      missingLabels,
      aiUsed,
      medicalVisitCount,
      vaccinationCount,
      labOrderCount,
      warning,
    });
    setPetImportError(null);
    setAddPetMode("manual");
  };

  const mapHeadersWithVetBot = async (headers: string[]) => {
    const result = await askAiAssistant({
      mode: "clients",
      userRole: getStaffType(),
      question: [
        "מפה את שמות העמודות הבאים לשדות של כרטיס חיה.",
        "החזר בתוך answer אך ורק אובייקט JSON, ללא הסבר וללא Markdown.",
        'המפתחות המותרים: "pet_name", "species", "breed", "gender", "birth_date", "weight", "microchip", "allergies", "neutered_status".',
        "הערך של כל מפתח חייב להיות שם עמודה מדויק מהרשימה. השמט שדה שאין לו התאמה.",
        `שמות העמודות: ${JSON.stringify(headers)}`,
      ].join("\n"),
      context: {
        task: "pet-spreadsheet-column-mapping",
        columnHeaders: headers,
        privacy: "Only column headers are supplied. Spreadsheet row values stay in the browser.",
      },
    });

    return parseAiPetColumnMapping(result.answer, headers);
  };

  const handlePetFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsReadingPetFile(true);
    setPetImportError(null);
    setPetImportDrafts([]);
    setPetImportMedicalHistory([]);
    setPetImportVaccinations([]);
    setPetImportLabOrders([]);
    setPetImportSummary(null);

    try {
      const spreadsheet = await readPetSpreadsheet(file);
      setPetImportMedicalHistory(spreadsheet.medicalHistory);
      setPetImportVaccinations(spreadsheet.vaccinations);
      setPetImportLabOrders(spreadsheet.labOrders);
      const localMapping = inferLocalPetColumnMapping(spreadsheet.headers);
      let aiMapping = {};
      let aiUsed = false;
      let warning: string | undefined;

      try {
        aiMapping = await mapHeadersWithVetBot(spreadsheet.headers);
        aiUsed = Object.keys(aiMapping).length > 0;
        if (!aiUsed) {
          warning = "VetBot לא זיהה התאמות נוספות; המיפוי המקומי שימש לקריאת הקובץ.";
        }
      } catch (error) {
        console.warn("VetBot pet import mapping was unavailable", error);
        warning = "VetBot לא היה זמין, לכן בוצע מיפוי מקומי של כותרות הקובץ.";
      }

      const mapping = { ...aiMapping, ...localMapping };
      const drafts = buildPetImportDrafts(spreadsheet.rows, mapping);
      if (drafts.length === 0) {
        throw new Error(
          "לא הצלחנו לחלץ מהקובץ נתוני חיה. בדקו שכותרות העמודות והשורה הראשונה מכילות פרטי חיה.",
        );
      }

      setPetImportDrafts(drafts);
      setSelectedPetImportIndex(0);

      if (drafts.length === 1) {
        applyImportedPetDraft(
          drafts[0],
          spreadsheet.fileName,
          aiUsed,
          spreadsheet.medicalHistory.length,
          spreadsheet.vaccinations.length,
          spreadsheet.labOrders.length,
          warning,
        );
      } else {
        setPetImportSummary({
          fileName: spreadsheet.fileName,
          missingLabels: [],
          aiUsed,
          medicalVisitCount: spreadsheet.medicalHistory.length,
          vaccinationCount: spreadsheet.vaccinations.length,
          labOrderCount: spreadsheet.labOrders.length,
          warning,
        });
      }
    } catch (error) {
      console.error("Failed reading pet import file", error);
      setPetImportError(
        error instanceof Error
          ? error.message
          : "לא הצלחנו לקרוא או לנתח את הקובץ.",
      );
    } finally {
      setIsReadingPetFile(false);
    }
  };

  const createClient = async () => {
    const ownerId = createForm.owner_id.trim();
    const firstName = createForm.owner_first_name.trim();
    const lastName = createForm.owner_last_name.trim();

    if (!ownerId || !firstName || !lastName) {
      toast.error("חובה להזין תעודת זהות, שם פרטי ושם משפחה");
      return;
    }

    try {
      setIsCreatingClient(true);

      const { error } = await supabase
        .from("owners")
        .insert([
          {
            owner_id: ownerId,
            owner_first_name: firstName,
            owner_last_name: lastName,
            phone: createForm.phone.trim() || null,
            email: createForm.email.trim() || null,
            address: createForm.address.trim() || null,
          },
        ]);

      if (error) throw error;

      toast.success("הלקוח נוסף בהצלחה");
      setIsCreateClientOpen(false);
      setSelectedOwnerId(ownerId);
      setSearchParams({ owner_id: ownerId });
      await fetchClients();
      openAddPetModal();
    } catch (error) {
      console.error("Error creating owner:", error);
      toast.error("אירעה שגיאה בהוספת הלקוח. בדוק אם תעודת הזהות כבר קיימת.");
    } finally {
      setIsCreatingClient(false);
    }
  };

  const addPetToSelectedClient = async () => {
    if (!selectedClient) return;

    const petName = petForm.pet_name.trim();
    const weight = Number(petForm.weight);
    const breed = petForm.breed === "other" ? petForm.custom_breed.trim() : petForm.breed.trim();

    if (!petName || !petForm.species || !breed || !petForm.gender || !petForm.birth_date || !petForm.weight) {
      toast.error("חובה למלא שם חיה, סוג, גזע, מין, תאריך לידה ומשקל");
      return;
    }

    if (Number.isNaN(weight) || weight <= 0) {
      toast.error("משקל חייב להיות מספר גדול מ-0");
      return;
    }

    let createdPetId: number | null = null;
    let createdVisitIds: number[] = [];
    let createdVaccinationIds: string[] = [];
    let createdLabOrderIds: number[] = [];
    let importStage = "שמירת פרטי החיה";

    try {
      setIsAddingPet(true);

      const { data: createdPet, error } = await supabase
        .from("patients")
        .insert([
          {
            owner_id: selectedClient.owner_id,
            pet_name: petName,
            species: petForm.species,
            breed,
            gender: petForm.gender,
            birth_date: petForm.birth_date,
            microchip: petForm.microchip.trim() || null,
            allergies: petForm.allergies.trim() || null,
            weight,
            neutered_status: petForm.neutered_status,
          },
        ])
        .select("pet_id")
        .single();

      if (error) throw error;
      createdPetId = Number(createdPet.pet_id);

      if (petImportMedicalHistory.length > 0) {
        importStage = "שמירת ההיסטוריה הרפואית";
        const { data: createdVisits, error: visitsError } = await supabase
          .from("medical_visits")
          .insert(
            petImportMedicalHistory.map((visit) => ({
              appointment_id: null,
              pet_id: createdPetId,
              visit_date: visit.visit_date,
              vet_name: visit.vet_name || "לא צוין",
              reason:
                visit.title ||
                visit.chief_complaint ||
                visit.description ||
                "רשומה רפואית מיובאת",
              diagnosis: visit.diagnosis || null,
              treatment: visit.description || null,
              notes: [
                visit.notes,
                "יובא מקובץ תיק רפואי לאחר אישור איש צוות.",
              ].filter(Boolean).join("\n"),
              attachments: "0",
              visit_type: normalizeImportedVisitType(visit.visit_type),
              urgency_level: visit.urgency_level,
              chief_complaint:
                visit.chief_complaint ||
                visit.title ||
                "רשומה רפואית מיובאת",
              final_diagnosis: visit.final_diagnosis || null,
              follow_up_required: visit.follow_up_required,
              follow_up_notes: visit.follow_up_notes || null,
              entry_data: {
                entryType: normalizeImportedVisitType(visit.visit_type),
                source: "medical-record-import",
                sourceVisitType: visit.visit_type || null,
                importedAt: new Date().toISOString(),
              },
            })),
          )
          .select("visit_id");
        if (visitsError) throw visitsError;
        createdVisitIds = (createdVisits || []).map((visit) => Number(visit.visit_id));
      }

      if (petImportVaccinations.length > 0) {
        importStage = "שמירת החיסונים";
        const { data: createdVaccinations, error: vaccinationsError } = await supabase
          .from("vaccinations")
          .insert(
            petImportVaccinations.map((vaccination) => ({
              pet_id: createdPetId,
              owner_id: selectedClient.owner_id,
              visit_id: null,
              vaccine_name: vaccination.vaccine_name,
              vaccine_type: vaccination.vaccine_type || null,
              manufacturer: vaccination.manufacturer || null,
              batch_number: vaccination.batch_number || null,
              barcode_value: vaccination.barcode_value || null,
              given_date: vaccination.given_date,
              next_due_date: vaccination.next_due_date || null,
              expiry_date: vaccination.expiry_date || null,
              administered_by: vaccination.administered_by || null,
              // The live schema and VaccinationBook recognize manual, barcode
              // and photo. The human-reviewed spreadsheet flow is recorded as
              // manual, while notes preserve the import provenance.
              entry_method: "manual",
              sticker_image_path: null,
              sticker_image_url: null,
              notes: [
                vaccination.notes,
                "יובא מקובץ תיק רפואי לאחר אישור איש צוות.",
              ].filter(Boolean).join("\n"),
            })),
          )
          .select("vaccination_id");
        if (vaccinationsError) throw vaccinationsError;
        createdVaccinationIds = (createdVaccinations || []).map((record) =>
          String(record.vaccination_id),
        );
      }

      if (petImportLabOrders.length > 0) {
        importStage = "שמירת בדיקות המעבדה";
        const { data: createdLabOrders, error: labOrdersError } = await supabase
          .from("lab_orders")
          .insert(
            petImportLabOrders.map((order) => ({
              pet_id: createdPetId,
              visit_id: null,
              test_name: order.test_name,
              category: order.category,
              status: order.status,
              ordered_date: order.ordered_date,
              test_date: order.test_date || null,
              ordered_by: getStaffId(),
              results: order.results || null,
              normal_range: order.normal_range || null,
              result_value: order.result_value || null,
              result_status: order.result_status || null,
              completed_date: order.completed_date || null,
              notes: [
                order.notes,
                order.ordered_by_name
                  ? `הוזמן במקור על ידי: ${order.ordered_by_name}`
                  : "",
                "יובא מקובץ תיק רפואי לאחר אישור איש צוות.",
              ].filter(Boolean).join("\n"),
              is_urgent: order.urgent,
            })),
          )
          .select("lab_order_id");
        if (labOrdersError) throw labOrdersError;
        createdLabOrderIds = (createdLabOrders || []).map((record) =>
          Number(record.lab_order_id),
        );
      }

      const importedDetails = [
        petImportMedicalHistory.length
          ? `${petImportMedicalHistory.length} רשומות רפואיות`
          : "",
        petImportVaccinations.length
          ? `${petImportVaccinations.length} חיסונים`
          : "",
        petImportLabOrders.length
          ? `${petImportLabOrders.length} בדיקות מעבדה`
          : "",
      ].filter(Boolean);
      toast.success(
        importedDetails.length
          ? `החיה נוספה יחד עם ${importedDetails.join(" ו־")}`
          : "החיה נוספה ללקוח בהצלחה",
      );
      setIsAddPetOpen(false);
      setAddPetMode("choice");
      setPetImportDrafts([]);
      setPetImportMedicalHistory([]);
      setPetImportVaccinations([]);
      setPetImportLabOrders([]);
      setPetImportError(null);
      setPetImportSummary(null);
      await fetchClients();
    } catch (error) {
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "";
      console.error("Error importing pet record", {
        stage: importStage,
        code: errorCode || "unknown",
        message: error instanceof Error ? error.message : "Unknown import error",
      });
      let rollbackFailed = false;
      if (createdLabOrderIds.length > 0) {
        const { error: rollbackError } = await supabase
          .from("lab_orders")
          .delete()
          .in("lab_order_id", createdLabOrderIds);
        rollbackFailed = rollbackFailed || Boolean(rollbackError);
      }
      if (createdVaccinationIds.length > 0) {
        const { error: rollbackError } = await supabase
          .from("vaccinations")
          .delete()
          .in("vaccination_id", createdVaccinationIds);
        rollbackFailed = rollbackFailed || Boolean(rollbackError);
      }
      if (createdVisitIds.length > 0) {
        const { error: rollbackError } = await supabase
          .from("medical_visits")
          .delete()
          .in("visit_id", createdVisitIds);
        rollbackFailed = rollbackFailed || Boolean(rollbackError);
      }
      if (createdPetId) {
        const { error: rollbackError } = await supabase
          .from("patients")
          .delete()
          .eq("pet_id", createdPetId);
        rollbackFailed = rollbackFailed || Boolean(rollbackError);
      }
      toast.error(
        rollbackFailed
          ? "הייבוא נשמר חלקית. יש לבדוק את תיק החיה לפני ניסיון נוסף."
          : `${importStage} נכשלה. החיה והרשומות לא נשמרו${
              errorCode ? ` (קוד ${errorCode})` : ""
            }.`,
      );
    } finally {
      setIsAddingPet(false);
    }
  };

  const saveOwnerDetails = async () => {
    if (!selectedClient) return;

    try {
      setIsSaving(true);

      const { error } = await supabase
        .from("owners")
        .update({
          owner_first_name: editForm.owner_first_name.trim(),
          owner_last_name: editForm.owner_last_name.trim(),
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          address: editForm.address.trim() || null,
        })
        .eq("owner_id", selectedClient.owner_id);

      if (error) throw error;

      toast.success("פרטי הלקוח עודכנו בהצלחה");
      setIsEditOpen(false);
      await fetchClients();
    } catch (error) {
      console.error("Error updating owner:", error);
      toast.error("אירעה שגיאה בעדכון פרטי הלקוח");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteClient = async () => {
    if (!selectedClient) return;

    if (selectedClient.pets.length > 0) {
      toast.error("לא ניתן למחוק לקוח שיש לו חיות משויכות. קודם צריך להעביר או למחוק את החיות.");
      return;
    }

    try {
      setIsDeleting(true);

      const { error } = await supabase
        .from("owners")
        .delete()
        .eq("owner_id", selectedClient.owner_id);

      if (error) throw error;

      toast.success("הלקוח נמחק בהצלחה");
      setIsDeleteOpen(false);
      setSelectedOwnerId(null);
      setSearchParams({});
      await fetchClients();
    } catch (error) {
      console.error("Error deleting owner:", error);
      toast.error("אירעה שגיאה במחיקת הלקוח");
    } finally {
      setIsDeleting(false);
    }
  };

  if (selectedClient) {
    return (
      <main className="w-full px-4 py-7 sm:px-6 sm:py-8">
        <button
          onClick={backToList}
          className="flex items-center gap-2 text-[#1e40af] hover:text-[#1e3a8a] mb-6 cursor-pointer transition-colors text-[15px] font-medium"
        >
          <ArrowRight className="w-4 h-4" /> חזרה לרשימת לקוחות
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl w-[88px] h-[88px] flex items-center justify-center shrink-0">
              <User className="w-11 h-11 text-[#1e40af]" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-gray-900 text-[25px] font-bold">{selectedClient.fullName}</h1>
                <span className="bg-blue-50 text-[#1e40af] text-[13px] px-3 py-1 rounded-full border border-blue-200 font-semibold">
                  {selectedClient.pets.length} חיות
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-[14px] text-gray-600 mt-4">
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                  <CreditCard className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">{selectedClient.owner_id}</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                  <Phone className="w-4 h-4 text-gray-500" />
                  <span>{selectedClient.phone || "ללא טלפון"}</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span className="truncate">{selectedClient.email || "ללא אימייל"}</span>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span className="truncate">{selectedClient.address || "ללא כתובת"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap lg:flex-col gap-2 shrink-0">
              <button
                onClick={() => openEditModal(selectedClient)}
                className="flex items-center justify-center gap-2 bg-[#1e40af] hover:bg-[#1e3a8a] text-white px-4 py-2.5 rounded-xl transition-colors cursor-pointer text-[13px] font-semibold shadow-sm"
              >
                <Save className="w-4 h-4" /> עריכת פרטי לקוח
              </button>
              <button
                onClick={() => navigate(`/owner-preview?owner_id=${selectedClient.owner_id}`)}
                className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2.5 rounded-xl transition-colors cursor-pointer text-[13px] font-semibold border border-emerald-200"
              >
                <ExternalLink className="w-4 h-4" /> פתיחת פורטל לקוח
              </button>
              <button
                onClick={() => setIsDeleteOpen(true)}
                className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2.5 rounded-xl transition-colors cursor-pointer text-[13px] font-semibold border border-red-200"
              >
                <Trash2 className="w-4 h-4" /> מחיקת לקוח
              </button>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <OwnerDebtPanel ownerId={selectedClient.owner_id} ownerName={selectedClient.fullName} />
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="pr-5">
            <h2 className="text-gray-900 text-[20px] font-bold">החיות של הלקוח</h2>
            <p className="text-gray-500 text-[14px]">כל החיות המשויכות ללקוח</p>
          </div>
          <button
            onClick={openAddPetModal}
            className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-[#1e40af] border border-blue-200 px-4 py-2.5 rounded-xl transition-colors cursor-pointer text-[13px] font-semibold"
          >
            <Plus className="w-4 h-4" /> הוספת חיה ללקוח
          </button>
        </div>

        {selectedClient.pets.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-gray-900 text-[17px] font-semibold mb-1">אין חיות משויכות ללקוח הזה</h3>
            <button
              onClick={openAddPetModal}
              className="inline-flex items-center justify-center gap-2 bg-[#1e40af] hover:bg-[#1e3a8a] text-white px-5 py-2.5 rounded-xl transition-colors cursor-pointer text-[13px] font-semibold"
            >
              <Plus className="w-4 h-4" /> הוספת חיה ראשונה
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {selectedClient.pets.map((pet) => {
              const speciesType = getSpeciesType(pet.species);
              const PetIcon = speciesType === "cat" ? Cat : Dog;

              return (
                <div key={pet.pet_id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-blue-200 transition-all">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl w-[52px] h-[52px] flex items-center justify-center shrink-0">
                      <PetIcon className="w-6 h-6 text-[#1e40af]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-gray-900 text-[17px] truncate font-semibold">{pet.pet_name || "ללא שם"}</h3>
                        {pet.allergies && <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
                      </div>
                      <p className="text-gray-500 text-[13px]">
                        {getSpeciesLabel(pet.species)} · {pet.breed || "גזע לא מוגדר"} · {pet.gender || "מין לא מוגדר"}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-3 space-y-2 text-[13px] text-gray-500">
                    <div className="flex items-center justify-between gap-3">
                      <span>גיל:</span>
                      <span className="font-medium text-gray-700">{calculateAgeFromBirthDate(pet.birth_date)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>משקל:</span>
                      <span className="font-medium text-gray-700">{pet.weight ? `${pet.weight} ק״ג` : "לא נשקל"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>{getNeuteredQuestion(pet.gender)}</span>
                      <span className="font-medium text-gray-700">{getNeuteredLabel(pet.neutered_status, pet.gender)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>שבב:</span>
                      <span className="font-medium text-gray-700 truncate">{pet.microchip || "אין שבב"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>נרשם:</span>
                      <span className="font-medium text-gray-700">{formatDate(pet.created_at)}</span>
                    </div>
                  </div>

                  {pet.allergies && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-700 text-[13px] font-medium">
                      אלרגיות: {pet.allergies}
                    </div>
                  )}

                  <button
                    onClick={() => navigate(`/patients?selected=${pet.pet_id}`)}
                    className="mt-4 w-full flex items-center justify-center gap-2 bg-[#1e40af] hover:bg-[#1e3a8a] text-white py-2.5 rounded-xl transition-colors cursor-pointer text-[13px] font-semibold"
                  >
                    <Eye className="w-4 h-4" /> פתיחת תיק רפואי
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {isAddPetOpen && (
          <div className="fixed inset-0 bg-black/40 z-[200] flex items-end justify-center sm:items-center sm:px-4">
            <div className="bg-white rounded-t-[28px] sm:rounded-2xl shadow-xl max-w-3xl w-full overflow-hidden max-h-[94dvh] sm:max-h-[90vh] overflow-y-auto">
              <div className="bg-[#1e40af] px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-white text-[18px] font-bold">
                    {addPetMode === "choice"
                      ? "איך תרצו להוסיף חיה?"
                      : addPetMode === "file"
                        ? "ייבוא חיה מקובץ"
                        : "הוספת חיה ללקוח"}
                  </h3>
                  <p className="text-white/80 text-[13px] mt-0.5">
                    החיה תתווסף לרשימת החיות של {selectedClient.fullName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAddPetModal}
                  aria-label="סגור חלון"
                  className="text-white/80 hover:text-white cursor-pointer disabled:cursor-wait disabled:opacity-50"
                  disabled={isAddingPet || isReadingPetFile}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {addPetMode === "choice" && (
                <div className="p-5 sm:p-6">
                  <p className="mb-5 text-[14px] leading-6 text-slate-600">
                    אפשר להזין את פרטי החיה ידנית, או לייבא אותם מקובץ קיים
                    ולבדוק את הנתונים לפני השמירה.
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={openManualPetEntry}
                      className="group rounded-2xl border-2 border-slate-100 bg-white p-5 text-right transition hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md"
                    >
                      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#1e40af] transition group-hover:bg-blue-100">
                        <Plus className="h-6 w-6" />
                      </span>
                      <span className="block text-[16px] font-bold text-slate-900">
                        הזנה ידנית
                      </span>
                      <span className="mt-1 block text-[13px] leading-6 text-slate-500">
                        פתיחת הטופס הקיים ומילוי פרטי החיה שדה אחר שדה.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAddPetMode("file");
                        setPetImportError(null);
                      }}
                      className="group rounded-2xl border-2 border-slate-100 bg-white p-5 text-right transition hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-md"
                    >
                      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 transition group-hover:bg-indigo-100">
                        <FileSpreadsheet className="h-6 w-6" />
                      </span>
                      <span className="flex items-center gap-2 text-[16px] font-bold text-slate-900">
                        ייבוא CSV / Excel
                        <Sparkles className="h-4 w-4 text-indigo-500" />
                      </span>
                      <span className="mt-1 block text-[13px] leading-6 text-slate-500">
                        VetBot ימפה את כותרות הקובץ והטופס יתמלא אוטומטית.
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {addPetMode === "file" && (
                <div className="p-5 sm:p-6">
                  <button
                    type="button"
                    onClick={() => {
                      setAddPetMode("choice");
                      setPetImportDrafts([]);
                      setPetImportMedicalHistory([]);
                      setPetImportVaccinations([]);
                      setPetImportLabOrders([]);
                      setPetImportError(null);
                    }}
                    disabled={isReadingPetFile}
                    className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-[#1e40af] disabled:opacity-50"
                  >
                    <ArrowRight className="h-4 w-4" /> חזרה לאפשרויות
                  </button>

                  <input
                    ref={petFileInputRef}
                    type="file"
                    accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => void handlePetFileSelected(event)}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => petFileInputRef.current?.click()}
                    disabled={isReadingPetFile}
                    className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 px-5 py-8 text-center transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70"
                  >
                    {isReadingPetFile ? (
                      <>
                        <Loader2 className="mb-3 h-9 w-9 animate-spin text-[#1e40af]" />
                        <span className="text-[15px] font-bold text-slate-800">
                          קורא את הקובץ וממפה עמודות עם VetBot...
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="mb-3 h-9 w-9 text-[#1e40af]" />
                        <span className="text-[15px] font-bold text-slate-800">
                          בחירת קובץ מהמחשב
                        </span>
                        <span className="mt-1 text-[12px] text-slate-500">
                          CSV, XLS או XLSX · עד 5MB
                        </span>
                      </>
                    )}
                  </button>

                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[12px] leading-5 text-emerald-800">
                    תוכן הקובץ נקרא מקומית בדפדפן. רק שמות העמודות נשלחים
                    ל־VetBot לצורך מיפוי, ללא שורות הנתונים או פרטי הלקוח.
                  </div>

                  {petImportError && (
                    <div
                      role="alert"
                      className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold leading-6 text-red-700"
                    >
                      {petImportError}
                    </div>
                  )}

                  {petImportDrafts.length > 1 && petImportSummary && (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="mb-3">
                        <p className="text-[14px] font-bold text-slate-900">
                          נמצאו {petImportDrafts.length} רשומות בקובץ
                        </p>
                        <p className="mt-1 text-[12px] text-slate-500">
                          בחרו את החיה שתרצו להוסיף ללקוח הנוכחי.
                        </p>
                      </div>
                      <select
                        value={selectedPetImportIndex}
                        onChange={(event) =>
                          setSelectedPetImportIndex(Number(event.target.value))
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[14px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        {petImportDrafts.map((draft, index) => (
                          <option key={`${draft.pet_name}-${index}`} value={index}>
                            {draft.pet_name || `רשומה ${index + 1}`}
                            {draft.species
                              ? ` · ${getSpeciesLabel(draft.species)}`
                              : ""}
                          </option>
                        ))}
                      </select>
                      {petImportSummary.warning && (
                        <p className="mt-3 text-[12px] leading-5 text-amber-700">
                          {petImportSummary.warning}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          applyImportedPetDraft(
                            petImportDrafts[selectedPetImportIndex],
                            petImportSummary.fileName,
                            petImportSummary.aiUsed,
                            petImportSummary.medicalVisitCount,
                            petImportSummary.vaccinationCount,
                            petImportSummary.labOrderCount,
                            petImportSummary.warning,
                          )
                        }
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e40af] px-5 py-3 text-[14px] font-bold text-white hover:bg-[#1e3a8a]"
                      >
                        <Sparkles className="h-4 w-4" /> המשך לבדיקה והשלמת
                        פרטים
                      </button>
                    </div>
                  )}
                </div>
              )}

              {addPetMode === "manual" && (
                <>
                  <div className="p-5 sm:p-6">
                    <button
                      type="button"
                      onClick={() => {
                        setAddPetMode("choice");
                        setPetImportSummary(null);
                        setPetImportMedicalHistory([]);
                        setPetImportVaccinations([]);
                        setPetImportLabOrders([]);
                        setPetForm(INITIAL_PET_CREATE_FORM);
                      }}
                      className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-[#1e40af]"
                    >
                      <ArrowRight className="h-4 w-4" /> חזרה לאפשרויות
                    </button>

                    {petImportSummary && (
                      <div
                        className={`mb-5 rounded-xl border px-4 py-3 text-[13px] leading-6 ${
                          petImportSummary.missingLabels.length > 0
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Sparkles className="mt-1 h-4 w-4 shrink-0" />
                          <div>
                            <p className="font-bold">
                              הנתונים חולצו מהקובץ {petImportSummary.fileName}
                            </p>
                            <p>
                              {petImportSummary.missingLabels.length > 0
                                ? `נדרשת השלמה של: ${petImportSummary.missingLabels.join(", ")}.`
                                : "כל שדות החובה זוהו. בדקו את הנתונים לפני השמירה."}
                            </p>
                            <p className="mt-1 font-semibold">
                              לייבוא עם החיה:{" "}
                              {petImportSummary.medicalVisitCount} רשומות רפואיות
                              {" · "}
                              {petImportSummary.vaccinationCount} חיסונים
                              {" · "}
                              {petImportSummary.labOrderCount} בדיקות מעבדה
                            </p>
                            {petImportSummary.warning && (
                              <p className="mt-1">{petImportSummary.warning}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-gray-700 text-[14px] mb-2 font-medium">שם החיה</label>
                        <input
                          value={petForm.pet_name}
                          onChange={(e) => setPetForm((prev) => ({ ...prev, pet_name: e.target.value }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                          placeholder="לדוגמה: בוני"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-700 text-[14px] mb-2 font-medium">סוג</label>
                        <select
                          value={petForm.species}
                          onChange={(e) => setPetForm((prev) => ({ ...prev, species: e.target.value }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] bg-white"
                        >
                          <option value="">בחר סוג חיה</option>
                          {SPECIES_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-gray-700 text-[14px] mb-2 font-medium">גזע</label>
                        <select
                          value={petForm.breed}
                          onChange={(e) => setPetForm((prev) => ({ ...prev, breed: e.target.value, custom_breed: e.target.value === "other" ? prev.custom_breed : "" }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] bg-white"
                        >
                          <option value="">בחר גזע</option>
                          {BREED_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>

                      {petForm.breed === "other" && (
                        <div>
                          <label className="block text-gray-700 text-[14px] mb-2 font-medium">ציין גזע</label>
                          <input
                            value={petForm.custom_breed}
                            onChange={(e) => setPetForm((prev) => ({ ...prev, custom_breed: e.target.value }))}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                            placeholder="הקלד את הגזע"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-gray-700 text-[14px] mb-2 font-medium">מין</label>
                        <select
                          value={petForm.gender}
                          onChange={(e) => setPetForm((prev) => ({ ...prev, gender: e.target.value }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] bg-white"
                        >
                          <option value="">בחר מין</option>
                          {GENDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-gray-700 text-[14px] mb-2 font-medium">{getNeuteredQuestion(petForm.gender)}</label>
                        <select
                          value={petForm.neutered_status}
                          onChange={(e) => setPetForm((prev) => ({ ...prev, neutered_status: e.target.value as "unknown" | "yes" | "no" }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] bg-white"
                        >
                          {NEUTERED_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-gray-700 text-[14px] mb-2 font-medium">תאריך לידה</label>
                        <input
                          type="date"
                          value={petForm.birth_date}
                          onChange={(e) => setPetForm((prev) => ({ ...prev, birth_date: e.target.value }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-700 text-[14px] mb-2 font-medium">משקל בק״ג</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={petForm.weight}
                          onChange={(e) => setPetForm((prev) => ({ ...prev, weight: e.target.value }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                          placeholder="לדוגמה: 12.5"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-700 text-[14px] mb-2 font-medium">מספר שבב</label>
                        <input
                          value={petForm.microchip}
                          onChange={(e) => setPetForm((prev) => ({ ...prev, microchip: e.target.value }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                          placeholder="אופציונלי"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-gray-700 text-[14px] mb-2 font-medium">אלרגיות / רגישויות</label>
                        <textarea
                          value={petForm.allergies}
                          onChange={(e) => setPetForm((prev) => ({ ...prev, allergies: e.target.value }))}
                          rows={3}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
                          placeholder="אופציונלי"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeAddPetModal}
                      disabled={isAddingPet}
                      className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] font-medium disabled:opacity-50"
                    >
                      ביטול
                    </button>
                    <button
                      type="button"
                      onClick={addPetToSelectedClient}
                      disabled={isAddingPet}
                      className="px-5 py-2.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white rounded-xl transition-colors cursor-pointer text-[14px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isAddingPet ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      {isAddingPet
                        ? "מוסיף..."
                        : petImportMedicalHistory.length > 0 ||
                            petImportVaccinations.length > 0 ||
                            petImportLabOrders.length > 0
                          ? "הוספת חיה וכל הרשומות"
                          : "הוספת חיה"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {isEditOpen && (
          <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden">
              <div className="bg-[#1e40af] px-6 py-4 flex items-center justify-between">
                <h3 className="text-white text-[18px] font-bold">עריכת פרטי לקוח</h3>
                <button onClick={() => setIsEditOpen(false)} className="text-white/80 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-[14px] mb-2 font-medium">שם פרטי</label>
                  <input
                    value={editForm.owner_first_name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, owner_first_name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-[14px] mb-2 font-medium">שם משפחה</label>
                  <input
                    value={editForm.owner_last_name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, owner_last_name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-[14px] mb-2 font-medium">טלפון</label>
                  <input
                    value={editForm.phone}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-[14px] mb-2 font-medium">אימייל</label>
                  <input
                    value={editForm.email}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-700 text-[14px] mb-2 font-medium">כתובת</label>
                  <input
                    value={editForm.address}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditOpen(false)}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] font-medium"
                >
                  ביטול
                </button>
                <button
                  onClick={saveOwnerDetails}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white rounded-xl transition-colors cursor-pointer text-[14px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSaving ? "שומר..." : "שמירה"}
                </button>
              </div>
            </div>
          </div>
        )}

        {isDeleteOpen && (
          <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
              <div className="bg-red-50 px-6 py-5 flex flex-col items-center text-center border-b border-red-100">
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-3">
                  <Trash2 className="w-7 h-7 text-red-500" />
                </div>
                <h3 className="text-gray-900 text-[18px] font-bold mb-1">מחיקת לקוח</h3>
                <p className="text-gray-500 text-[13px]">האם למחוק את {selectedClient.fullName}?</p>
              </div>

              <div className="p-6">
                {selectedClient.pets.length > 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5 text-orange-800 text-[14px] leading-6">
                    לא ניתן למחוק לקוח שיש לו חיות משויכות. קודם צריך להעביר את החיות לבעלים אחר או למחוק אותן ממסך המטופלים.
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 mb-5 text-gray-700 text-[14px] leading-6">
                    פעולה זו תמחק את הלקוח מטבלת owners. לא ניתן לבטל את הפעולה מתוך המערכת.
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={deleteClient}
                    disabled={isDeleting || selectedClient.pets.length > 0}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> {isDeleting ? "מוחק..." : "כן, למחוק"}
                  </button>
                  <button
                    onClick={() => setIsDeleteOpen(false)}
                    className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] font-medium"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="w-full px-4 py-7 sm:px-6 sm:py-8">
      <ClientsAssistant clients={clients} />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 rounded-xl p-2.5">
            <Users className="w-6 h-6 text-[#1e40af]" />
          </div>
          <div>
            <h1 className="text-gray-900 text-[26px] font-bold">לקוחות</h1>
            <p className="text-gray-500 text-[15px]">ניהול בעלי חיות וצפייה בחיות המשויכות לכל לקוח</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={openCreateClientModal}
            className="flex items-center justify-center gap-2 bg-[#1e40af] hover:bg-[#1e3a8a] text-white px-4 py-2.5 rounded-xl transition-colors cursor-pointer text-[13px] font-semibold w-fit shadow-sm"
          >
            <Plus className="w-4 h-4" /> הוספת לקוח
          </button>
          <button
            onClick={() => navigate("/patients")}
            className="flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-[#1e40af] border border-blue-200 px-4 py-2.5 rounded-xl transition-colors cursor-pointer text-[13px] font-semibold w-fit"
          >
            <Search className="w-4 h-4" /> חיפוש מטופל / כל החיות
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-gray-500 text-[13px] font-medium mb-1">סה״כ לקוחות</p>
          <p className="text-gray-900 text-[28px] font-bold">{clients.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-gray-500 text-[13px] font-medium mb-1">סה״כ חיות משויכות</p>
          <p className="text-gray-900 text-[28px] font-bold">{totalPets}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-gray-500 text-[13px] font-medium mb-1">לקוחות ללא חיות</p>
          <p className="text-gray-900 text-[28px] font-bold">{clients.filter((client) => client.pets.length === 0).length}</p>
        </div>
      </div>

      <div className="mb-6">
        {showDebtOnly && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
            <span className="font-semibold">מוצגים רק לקוחות עם יתרה פתוחה ({clients.filter((client) => client.openDebt > 0).length})</span>
            <button type="button" onClick={() => setSearchParams({})} className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 font-bold hover:bg-amber-100">הצג את כולם</button>
          </div>
        )}
        <div className="relative max-w-xl">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
          <input
            type="text"
            placeholder="חיפוש לפי שם לקוח, תעודת זהות, טלפון, אימייל, שם חיה או שבב..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-11 pl-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors text-[15px]"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-100 border-t-[#1e40af] rounded-full mx-auto mb-4" />
          <p className="text-gray-500 font-medium text-[15px]">טוען לקוחות מהשרת...</p>
        </div>
      ) : errorMessage ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 font-medium">
          {errorMessage}
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium text-[15px]">לא נמצאו לקוחות תואמים</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredClients.map((client) => (
            <button
              key={client.owner_id}
              onClick={() => openClient(client.owner_id)}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer text-right group"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl w-[52px] h-[52px] flex items-center justify-center shrink-0 group-hover:from-blue-100 group-hover:to-indigo-200 transition-colors">
                  <User className="w-6 h-6 text-[#1e40af]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-gray-900 text-[17px] truncate font-semibold mb-0.5">{client.fullName}</h3>
                  <p className="text-gray-500 text-[13px]">ת.ז: {client.owner_id}</p>
                </div>
                <span className="bg-blue-50 text-[#1e40af] text-[13px] px-2.5 py-1 rounded-full border border-blue-200 font-semibold shrink-0">
                  {client.pets.length} חיות
                </span>
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-2 text-[13px] text-gray-500">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{client.phone || "ללא טלפון"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5" />
                  <span className="truncate">{client.email || "ללא אימייל"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="truncate">{client.address || "ללא כתובת"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>נוצר: {formatDate(client.created_at)}</span>
                </div>
              </div>

              {client.openDebt > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">
                  <span>יתרה פתוחה</span>
                  <span>₪{client.openDebt.toLocaleString("he-IL")}</span>
                </div>
              )}

              {client.pets.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {client.pets.slice(0, 3).map((pet) => (
                    <span key={pet.pet_id} className="bg-gray-50 text-gray-600 border border-gray-200 text-[12px] px-2 py-1 rounded-lg font-medium">
                      {pet.pet_name || "ללא שם"}
                    </span>
                  ))}
                  {client.pets.length > 3 && (
                    <span className="bg-gray-50 text-gray-500 border border-gray-200 text-[12px] px-2 py-1 rounded-lg font-medium">
                      +{client.pets.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {isCreateClientOpen && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-[#1e40af] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white text-[18px] font-bold">הוספת לקוח חדש</h3>
                <p className="text-white/80 text-[13px] mt-0.5">לאחר שמירת הלקוח תוכל להוסיף לו חיות</p>
              </div>
              <button onClick={() => setIsCreateClientOpen(false)} className="text-white/80 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 text-[14px] mb-2 font-medium">תעודת זהות</label>
                <input
                  value={createForm.owner_id}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, owner_id: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  placeholder="לדוגמה: 207442012"
                />
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] mb-2 font-medium">טלפון</label>
                <input
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  placeholder="050-1234567"
                />
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] mb-2 font-medium">שם פרטי</label>
                <input
                  value={createForm.owner_first_name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, owner_first_name: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  placeholder="שם פרטי"
                />
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] mb-2 font-medium">שם משפחה</label>
                <input
                  value={createForm.owner_last_name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, owner_last_name: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  placeholder="שם משפחה"
                />
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] mb-2 font-medium">אימייל</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  placeholder="אופציונלי"
                />
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] mb-2 font-medium">כתובת</label>
                <input
                  value={createForm.address}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, address: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  placeholder="רחוב, עיר"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setIsCreateClientOpen(false)}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] font-medium"
              >
                ביטול
              </button>
              <button
                onClick={createClient}
                disabled={isCreatingClient}
                className="px-5 py-2.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white rounded-xl transition-colors cursor-pointer text-[14px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> {isCreatingClient ? "מוסיף..." : "שמירה והוספת חיות"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
