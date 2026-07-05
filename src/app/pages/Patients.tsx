import { useState, useEffect, type ReactNode } from "react";
import { supabase } from '../../services/supabaseClient'; // הייבוא שלך
import {
  Users, UserPlus, Eye, Search, Cat, Dog, AlertTriangle,
  Calendar, AlertCircle, CalendarCheck, ChevronLeft, Stethoscope,
  ArrowRight, Phone, CreditCard, Download, Mail, Pencil, Trash2, X,
  ClipboardList, Activity, CheckCircle2, Pill, FileText,
} from "lucide-react";
import { useSearchParams } from "react-router";
import { TreatmentModal } from "../components/TreatmentModal";
import { AnesthesiaConsentModal } from "../components/AnesthesiaConsentModal";
import { PrescriptionDocumentModal } from "../components/PrescriptionDocumentModal";
import { HospitalizationModal, type HospitalizationRecord } from "../components/HospitalizationModal";
import { useMedicalStore } from "../data/MedicalStore";
import { exportMedicalRecord } from "../hooks/useExportMedicalRecord";
import { canEditMedicalRecords, canPerformTreatment } from "../data/staffAuth";
import { LabResultsPanel } from "../components/LabResultsPanel";
import { useSearchFilter } from "../hooks/useSearchFilter";
import { VISIT_TYPES } from "../data/categoryConfig";
import { MedicalRecordAssistant } from "../components/ai/PageAssistants";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

// ─── TypeScript Types ───────────────────────────────────────────────
// הגדרנו מחדש את הטייפ כאן במקום למשוך מקובץ הדמה, כדי שהממשק שלך לא יישבר
export type Patient = {
  id: number;
  pet: {
    name: string;
    speciesType: "cat" | "dog" | "other";
    species: string;
    speciesCode: string;
    breed: string;
    breedCode: string;
    customBreed: string;
    gender: string;
    neuteredStatus: "unknown" | "yes" | "no" | string;
    age: string | number;
    birthDate: string;
    microchip: string;
    microchipNumber: string;
    weight: string;
    weightValue: string;
    allergies?: string;
  };
  owner: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  lastVisit?: string;
  nextAppointment?: string;
};

// ─── Zod Schema for Validation ───────────────────────────────────────
const ISRAELI_PHONE = /^05\d-\d{7}$/;
const ISRAELI_ID = /^\d{9}$/;

const patientSchema = z.object({
  ownerId: z.string().regex(ISRAELI_ID, "תעודת זהות חייבת להכיל בדיוק 9 ספרות"),
  ownerName: z.string().min(2, "שם הבעלים חייב להכיל לפחות 2 אותיות"),
  address: z.string().min(2, "חובה להזין כתובת מגורים"),
  phone: z.string().regex(ISRAELI_PHONE, "פורמט טלפון לא תקין (לדוגמה: 050-1234567)"),
  email: z.string().email("כתובת אימייל לא תקינה").optional().or(z.literal("")),
  microchipNumber: z.string().optional(),
  petName: z.string().min(1, "חובה להזין את שם החיה"),
  species: z.enum(["dog", "cat", "bird", "rabbit", "hamster", "other"], {
    message: "חובה לבחור את סוג החיה",
  }),
  breed: z.string().min(1, "חובה לבחור גזע"),
  customBreed: z.string().optional(),
  gender: z.enum(["זכר", "נקבה", "לא ידוע"], {
    message: "חובה לבחור מין",
  }),
  neuteredStatus: z.enum(["unknown", "yes", "no"]).default("unknown"),
  birthDate: z.string().min(1, "חובה לבחור תאריך לידה"),
  weight: z
    .string()
    .min(1, "חובה להזין משקל")
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, "משקל חייב להיות מספר חיובי"),
  allergies: z.string().optional(),
});

type PatientFormValues = z.infer<typeof patientSchema>;

const editPetSchema = patientSchema.pick({
  microchipNumber: true,
  petName: true,
  species: true,
  breed: true,
  customBreed: true,
  gender: true,
  neuteredStatus: true,
  birthDate: true,
  weight: true,
  allergies: true,
});

type EditPetFormValues = z.infer<typeof editPetSchema>;

const allowedSpecies = ["dog", "cat", "bird", "rabbit", "hamster", "other"] as const;
const allowedGenders = ["זכר", "נקבה", "לא ידוע"] as const;

const neuteredOptions = [
  { value: "unknown", label: "לא ידוע" },
  { value: "yes", label: "כן" },
  { value: "no", label: "לא" },
] as const;

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

function normalizeNeuteredStatus(value?: string | null): "unknown" | "yes" | "no" {
  return value === "yes" || value === "no" || value === "unknown" ? value : "unknown";
}

function normalizeSpeciesForForm(species?: string | null): PatientFormValues["species"] {
  return allowedSpecies.includes(species as PatientFormValues["species"])
    ? (species as PatientFormValues["species"])
    : "other";
}

function normalizeGenderForForm(gender?: string | null): PatientFormValues["gender"] {
  return allowedGenders.includes(gender as PatientFormValues["gender"])
    ? (gender as PatientFormValues["gender"])
    : "לא ידוע";
}
// ─────────────────────────────────────────────────────────────────────

function splitOwnerFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || "";

  return {
    firstName,
    lastName,
  };
}

function getSpeciesType(species?: string | null): "cat" | "dog" | "other" {
  if (species === "cat" || species === "חתול") return "cat";
  if (species === "dog" || species === "כלב") return "dog";
  return "other";
}

function getSpeciesLabel(species?: string | null) {
  const labels: Record<string, string> = {
    dog: "כלב",
    cat: "חתול",
    bird: "ציפור",
    rabbit: "ארנב",
    hamster: "אוגר",
    other: "אחר",
  };

  if (!species) return "לא מוגדר";
  return labels[species] || species;
}

const breedLabels: Record<string, string> = {
  "golden-retriever": "גולדן רטריבר",
  labrador: "לברדור",
  "german-shepherd": "רועה גרמני",
  "persian-cat": "חתול פרסי",
  siamese: "סיאמי",
  mixed: "מעורב",
  other: "אחר",
};

function isKnownBreed(breed?: string | null) {
  return !!breed && Object.prototype.hasOwnProperty.call(breedLabels, breed);
}

function normalizeBreedForForm(breed?: string | null) {
  if (!breed) return "";
  return isKnownBreed(breed) ? breed : "other";
}

function getBreedLabel(breed?: string | null) {
  if (!breed) return "לא מוגדר";
  return breedLabels[breed] || breed;
}

function getCustomBreedValue(breed?: string | null) {
  if (!breed || isKnownBreed(breed)) return "";
  return breed;
}

function getBreedToSave(breed: string, customBreed?: string) {
  return breed === "other" ? customBreed?.trim() || "אחר" : breed;
}

function calculateAgeFromBirthDate(birthDate?: string | null) {
  if (!birthDate) return "לא מוגדר";

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "לא מוגדר";

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  if (age <= 0) return "פחות משנה";
  return age;
}

function severityLabel(value?: string | null) {
  switch (value) {
    case "critical": return "קריטי";
    case "serious": return "חמור";
    case "normal": return "רגיל";
    default: return "רגיל";
  }
}

function statusLabel(value?: string | null) {
  switch (value) {
    case "active": return "פעיל";
    case "improved": return "השתפר";
    case "resolved": return "נפתר";
    case "low": return "נמוכה";
    case "possible": return "אפשרית";
    case "likely": return "סבירה";
    case "critical": return "קריטי";
    case "serious": return "חמור";
    case "normal": return "רגיל";
    default: return value || "לא צוין";
  }
}

function severityClass(value?: string | null) {
  switch (value) {
    case "critical": return "bg-red-50 text-red-700 border-red-200";
    case "serious": return "bg-amber-50 text-amber-700 border-amber-200";
    default: return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
}

function getVisitDisplayConfig(visitType?: string | null) {
  const customTypes: Record<string, { label: string; icon: any; color: string }> = {
    full_exam: {
      label: "בדיקה רפואית מלאה",
      icon: Stethoscope,
      color: "bg-blue-50 text-blue-600 border-blue-200",
    },
    vaccination: {
      label: "חיסון",
      icon: CheckCircle2,
      color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    },
    weight_check: {
      label: "שקילה",
      icon: Activity,
      color: "bg-amber-50 text-amber-600 border-amber-200",
    },
    prescription_only: {
      label: "מרשם בלבד",
      icon: Pill,
      color: "bg-purple-50 text-purple-600 border-purple-200",
    },
    lab: {
      label: "בדיקת מעבדה",
      icon: ClipboardList,
      color: "bg-sky-50 text-sky-600 border-sky-200",
    },
    follow_up: {
      label: "מעקב קצר",
      icon: CalendarCheck,
      color: "bg-teal-50 text-teal-600 border-teal-200",
    },
    note: {
      label: "הערה רפואית",
      icon: FileText,
      color: "bg-gray-50 text-gray-600 border-gray-200",
    },
    hospitalization: {
      label: "אשפוז",
      icon: Activity,
      color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    },
    hospitalization_discharge: {
      label: "שחרור מאשפוז",
      icon: CheckCircle2,
      color: "bg-teal-50 text-teal-600 border-teal-200",
    },
  };

  if (visitType && customTypes[visitType]) return customTypes[visitType];
  if (visitType && Object.prototype.hasOwnProperty.call(VISIT_TYPES, visitType)) {
    return VISIT_TYPES[visitType as keyof typeof VISIT_TYPES];
  }
  return VISIT_TYPES.checkup;
}

function splitOwnerNameForDocument(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function mapPrescriptionForDocument(prescription: any) {
  return {
    prescription_id: prescription.id,
    visit_id: prescription.visitId ?? null,
    pet_id: prescription.patientId,
    medication: prescription.medication || null,
    dosage: prescription.dosage || null,
    frequency: prescription.frequency || null,
    duration: prescription.duration || null,
    start_date: prescription.startDate || null,
    prescribed_by: prescription.prescribedBy || null,
  };
}

function mapVisitForPrescriptionDocument(visit: any) {
  if (!visit) return null;
  return {
    visit_id: visit.id,
    visit_date: visit.date,
    vet_name: visit.vetName,
    chief_complaint: visit.chiefComplaint || visit.reason,
    reason: visit.reason,
    final_diagnosis: visit.finalDiagnosis || visit.diagnosis,
    diagnosis: visit.diagnosis,
  };
}

function MedicalDetailSection({ icon: Icon, title, children }: { icon: any; title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <h5 className="flex items-center gap-2 text-gray-900 font-bold text-[14px] mb-2">
        <Icon className="w-4 h-4 text-[#1e40af]" /> {title}
      </h5>
      <div className="text-gray-700 text-[13px] leading-7 whitespace-pre-wrap">{children}</div>
    </section>
  );
}

type TabKey = "list" | "register";

export function Patients() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  
  // States חדשים עבור הנתונים מהשרת
  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [isTreatmentOpen, setIsTreatmentOpen] = useState(false);
  const [isAnesthesiaOpen, setIsAnesthesiaOpen] = useState(false);
  const [isEditPetOpen, setIsEditPetOpen] = useState(false);
  const [isDeletingPet, setIsDeletingPet] = useState(false);
  const [expandedVisitId, setExpandedVisitId] = useState<number | null>(null);
  const [selectedPrescriptionForPrint, setSelectedPrescriptionForPrint] = useState<any | null>(null);
  const [selectedPrescriptionVisit, setSelectedPrescriptionVisit] = useState<any | null>(null);
  const [isHospitalizationOpen, setIsHospitalizationOpen] = useState(false);
  const [activeHospitalization, setActiveHospitalization] = useState<HospitalizationRecord | null>(null);
  const [isHospitalizationLoading, setIsHospitalizationLoading] = useState(false);
  const {
    loadMedicalData,
    getVisitsForPatient,
    getPrescriptionsForPatient,
    getPhysicalExamsForVisit,
    getMedicalProblemsForVisit,
    getDifferentialDiagnosesForVisit,
  } = useMedicalStore();

  // משיכת הנתונים האמיתיים מסופאבייס (Data Fetching)
  useEffect(() => {
    async function fetchPatients() {
      try {
        const { data, error } = await supabase
          .from('patients')
          .select(`
            pet_id,
            created_at,
            pet_name,
            species,
            breed,
            gender,
            birth_date,
            microchip,
            allergies,
            weight,
            neutered_status,
            owner_id,
            owner:owners (
              owner_id,
              owner_first_name,
              owner_last_name,
              phone,
              email,
              address
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
          // מיפוי הנתונים למבנה שהממשק שלך צריך
          const mappedData: Patient[] = data.map((row: any) => {
            const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
            const ownerFullName = `${owner?.owner_first_name || ""} ${owner?.owner_last_name || ""}`.trim();

            const speciesCode = normalizeSpeciesForForm(row.species);
            const breedCode = normalizeBreedForForm(row.breed);
            const gender = normalizeGenderForForm(row.gender);
            const weightValue = row.weight !== null && row.weight !== undefined ? String(row.weight) : "";
            const microchipNumber = row.microchip || "";

            return {
              id: row.pet_id,
              pet: {
                name: row.pet_name || "ללא שם",
                speciesType: getSpeciesType(speciesCode),
                species: getSpeciesLabel(speciesCode),
                speciesCode,
                breed: getBreedLabel(row.breed),
                breedCode,
                customBreed: getCustomBreedValue(row.breed),
                gender,
                neuteredStatus: normalizeNeuteredStatus(row.neutered_status),
                age: calculateAgeFromBirthDate(row.birth_date),
                birthDate: row.birth_date || "",
                microchip: microchipNumber || "אין שבב",
                microchipNumber,
                weight: weightValue ? `${weightValue} ק״ג` : "לא נשקל",
                weightValue,
                allergies: row.allergies || "",
              },
              owner: {
                id: owner?.owner_id || row.owner_id || "",
                name: ownerFullName || "ללא שם",
                phone: owner?.phone || "ללא טלפון",
                email: owner?.email || "",
                address: owner?.address || "",
              },
              lastVisit: "טרם נקבע",
              nextAppointment: "",
            };
          });
          
          setPatientsList(mappedData);
        }
      } catch (error) {
        console.error("Error fetching patients from Supabase:", error);
        toast.error("שגיאה בטעינת נתוני מטופלים מהשרת");
      } finally {
        setIsLoadingData(false);
      }
    }

    fetchPatients();
  }, []);

  // בחירת מטופל מה-URL רק אחרי שהרשימה נטענה
  useEffect(() => {
    const selectedId = searchParams.get("selected");
    if (selectedId && patientsList.length > 0) {
      const found = patientsList.find((p) => p.id === Number(selectedId));
      if (found) {
        setSelectedPatient(found);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, setSearchParams, patientsList]);

  const loadActiveHospitalization = async (patientId: number) => {
    setIsHospitalizationLoading(true);
    try {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("*")
        .eq("pet_id", patientId)
        .eq("status", "active")
        .order("admitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setActiveHospitalization((data as HospitalizationRecord | null) || null);
    } catch (error) {
      console.error("Error loading active hospitalization", error);
      setActiveHospitalization(null);
      toast.error("לא הצלחנו לטעון סטטוס אשפוז פעיל");
    } finally {
      setIsHospitalizationLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPatient) {
      setActiveHospitalization(null);
      return;
    }

    loadActiveHospitalization(selectedPatient.id);
  }, [selectedPatient?.id]);

  // עדכון מערכת הסינון (Search Filter) שתעבוד על הרשימה החדשה
  const filtered = useSearchFilter(patientsList, searchQuery, (p) => [
    p.pet.name, p.owner.name, p.owner.phone, p.owner.email || '',
    p.pet.microchip, p.owner.id,
  ]);

  const patientHistory = selectedPatient ? getVisitsForPatient(selectedPatient.id) : [];
  const patientPrescriptions = selectedPatient ? getPrescriptionsForPatient(selectedPatient.id) : [];

  // ─── React Hook Form Setup ──────────────────────────────────────────
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema) as any,
    mode: "onBlur",
  });

  const {
    register: registerEditPet,
    handleSubmit: handleEditPetSubmit,
    reset: resetEditPet,
    setError: setEditPetError,
    watch: watchEditPet,
    formState: { errors: editPetErrors, isSubmitting: isUpdatingPet },
  } = useForm<EditPetFormValues>({
    resolver: zodResolver(editPetSchema) as any,
    mode: "onBlur",
  });

  const selectedBreed = watch("breed");
  const selectedEditBreed = watchEditPet("breed");

  useEffect(() => {
    if (!selectedPatient || !isEditPetOpen) return;

    resetEditPet({
      petName: selectedPatient.pet.name,
      species: normalizeSpeciesForForm(selectedPatient.pet.speciesCode),
      breed: selectedPatient.pet.breedCode || "",
      customBreed: selectedPatient.pet.customBreed || "",
      gender: normalizeGenderForForm(selectedPatient.pet.gender),
      neuteredStatus: normalizeNeuteredStatus(selectedPatient.pet.neuteredStatus),
      birthDate: selectedPatient.pet.birthDate || "",
      weight: selectedPatient.pet.weightValue || "",
      microchipNumber: selectedPatient.pet.microchipNumber || "",
      allergies: selectedPatient.pet.allergies || "",
    });
  }, [selectedPatient, isEditPetOpen, resetEditPet]);

  // פונקציית השמירה למסד הנתונים ב-Supabase
  const onSubmit = async (data: PatientFormValues) => {
    try {
      if (data.breed === "other" && !data.customBreed?.trim()) {
        setError("customBreed", {
          type: "manual",
          message: "חובה להזין את הגזע כאשר בוחרים אחר",
        });
        return;
      }

      const breedToSave = getBreedToSave(data.breed, data.customBreed);
      const { firstName, lastName } = splitOwnerFullName(data.ownerName);

      const ownerPayload = {
        owner_id: data.ownerId,
        owner_first_name: firstName,
        owner_last_name: lastName,
        phone: data.phone,
        email: data.email || null,
        address: data.address,
      };

      // 1. בדיקה האם הבעלים כבר קיים לפי owner_id, שהוא המפתח הראשי בטבלת owners
      const { data: existingOwner, error: existingOwnerError } = await supabase
        .from('owners')
        .select('owner_id, owner_first_name, owner_last_name, phone, email, address')
        .eq('owner_id', data.ownerId)
        .maybeSingle();

      if (existingOwnerError) throw existingOwnerError;

      let ownerData = existingOwner;

      // אם הבעלים לא קיים — מוסיפים אותו לטבלת owners
      if (!ownerData) {
        const { data: insertedOwner, error: ownerError } = await supabase
          .from('owners')
          .insert([ownerPayload])
          .select('owner_id, owner_first_name, owner_last_name, phone, email, address')
          .single();

        if (ownerError) throw ownerError;
        ownerData = insertedOwner;
      }

      // 2. הוספת המטופל לטבלת patients ומקשרים אותו ל-owner_id
      const { error: patientError } = await supabase
        .from('patients')
        .insert([
          { 
            owner_id: ownerData.owner_id,
            pet_name: data.petName,
            species: data.species,
            breed: breedToSave,
            gender: data.gender,
            birth_date: data.birthDate,
            weight: Number(data.weight),
            neutered_status: data.neuteredStatus || "unknown",
            microchip: data.microchipNumber || null,
            allergies: data.allergies || null
          }
        ]);

      if (patientError) throw patientError;

      toast.success("המטופל נרשם למערכת בהצלחה!");
      reset();
      setActiveTab("list");
      window.location.reload();
    } catch (error) {
      console.error("Supabase Insert Error:", error);
      toast.error("אירעה שגיאה בעת שמירת הנתונים לענן");
    }
  };

  const onEditPetSubmit = async (data: EditPetFormValues) => {
    if (!selectedPatient) return;

    try {
      if (data.breed === "other" && !data.customBreed?.trim()) {
        setEditPetError("customBreed", {
          type: "manual",
          message: "חובה להזין את הגזע כאשר בוחרים אחר",
        });
        return;
      }

      const breedToSave = getBreedToSave(data.breed, data.customBreed);

      const petPayload = {
        pet_name: data.petName,
        species: data.species,
        breed: breedToSave,
        gender: data.gender,
        birth_date: data.birthDate,
        weight: Number(data.weight),
        neutered_status: data.neuteredStatus || "unknown",
        microchip: data.microchipNumber || null,
        allergies: data.allergies || null,
      };

      const { error } = await supabase
        .from('patients')
        .update(petPayload)
        .eq('pet_id', selectedPatient.id);

      if (error) throw error;

      const updatedPatient: Patient = {
        ...selectedPatient,
        pet: {
          ...selectedPatient.pet,
          name: data.petName,
          speciesType: getSpeciesType(data.species),
          species: getSpeciesLabel(data.species),
          speciesCode: data.species,
          breed: getBreedLabel(breedToSave),
          breedCode: normalizeBreedForForm(breedToSave),
          customBreed: getCustomBreedValue(breedToSave),
          gender: data.gender,
          neuteredStatus: data.neuteredStatus || "unknown",
          age: calculateAgeFromBirthDate(data.birthDate),
          birthDate: data.birthDate,
          microchip: data.microchipNumber || "אין שבב",
          microchipNumber: data.microchipNumber || "",
          weight: `${data.weight} ק״ג`,
          weightValue: data.weight,
          allergies: data.allergies || "",
        },
      };

      setSelectedPatient(updatedPatient);
      setPatientsList((currentPatients) =>
        currentPatients.map((patient) =>
          patient.id === updatedPatient.id ? updatedPatient : patient
        )
      );
      setIsEditPetOpen(false);
      toast.success("פרטי החיה עודכנו בהצלחה");
    } catch (error) {
      console.error("Supabase Update Pet Error:", error);
      toast.error("אירעה שגיאה בעת עדכון פרטי החיה");
    }
  };

  const handleDeletePatient = async () => {
    if (!selectedPatient || isDeletingPet) return;

    const confirmDelete = window.confirm(
      `האם למחוק את המטופל ${selectedPatient.pet.name}? פעולה זו תמחק את רשומת החיה מהמערכת.`
    );

    if (!confirmDelete) return;

    try {
      setIsDeletingPet(true);

      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('pet_id', selectedPatient.id);

      if (error) throw error;

      setPatientsList((currentPatients) =>
        currentPatients.filter((patient) => patient.id !== selectedPatient.id)
      );
      setSelectedPatient(null);
      toast.success("המטופל נמחק בהצלחה");
    } catch (error) {
      console.error("Supabase Delete Patient Error:", error);
      toast.error("אירעה שגיאה בעת מחיקת המטופל");
    } finally {
      setIsDeletingPet(false);
    }
  };
  if (selectedPatient) {
    const pet = selectedPatient.pet;
    const owner = selectedPatient.owner;
    const PetIcon = pet.speciesType === "cat" ? Cat : Dog;

    return (
      <main className="max-w-7xl mx-auto px-6 py-8">
        <button
          onClick={() => setSelectedPatient(null)}
          className="flex items-center gap-2 text-[#1e40af] hover:text-[#1e3a8a] mb-6 cursor-pointer transition-colors text-[15px] font-medium"
        >
          <ArrowRight className="w-4 h-4" /> חזרה לרשימת מטופלים
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="flex flex-wrap items-start gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl w-[88px] h-[88px] flex items-center justify-center shrink-0">
              <PetIcon className="w-11 h-11 text-[#1e40af]" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h2 className="text-gray-900 text-[24px] font-bold">{pet.name}</h2>
                <span className="text-gray-500 text-[15px]">
                  {pet.species}, {pet.gender}, בן {pet.age} · {getNeuteredLabel(pet.neuteredStatus, pet.gender)}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-8 gap-y-2 text-[14px] text-gray-500 mb-3">
                <span><span className="font-medium text-gray-700">גזע:</span> {pet.breed}</span>
                <span><span className="font-medium text-gray-700">משקל:</span> {pet.weight}</span>
                <span><span className="font-medium text-gray-700">שבב:</span> {pet.microchip}</span>
                <span><span className="font-medium text-gray-700">בעלים:</span> {owner.name} ({owner.phone})</span>
              </div>

              {pet.allergies && (
                <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-red-700 text-[14px] font-semibold">אלרגיות: {pet.allergies}</span>
                </div>
              )}

              <div className="shrink-0 flex flex-col gap-1 mr-auto mt-4 sm:mt-0">
                <button
                  onClick={() => setIsEditPetOpen(true)}
                  className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[12px] border border-transparent hover:border-blue-200 w-fit font-medium"
                >
                  <Pencil className="w-3.5 h-3.5" /> עריכת פרטי חיה
                </button>
                <button
                  onClick={handleDeletePatient}
                  disabled={isDeletingPet}
                  className={`flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors text-[12px] border border-transparent hover:border-red-200 w-fit font-medium ${isDeletingPet ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <Trash2 className="w-3.5 h-3.5" /> {isDeletingPet ? "מוחק מטופל..." : "מחיקת מטופל"}
                </button>
                <MedicalRecordAssistant patient={selectedPatient} visits={patientHistory} activeHospitalization={activeHospitalization} />
                <button
                  onClick={() => {
                    const formattedHistory = patientHistory.map(v => ({
                      id: v.id,
                      date: v.date,
                      title: v.reason,
                      description: v.treatment || v.diagnosis,
                      vet: v.vetName,
                      type: "טיפול רפואי"
                    }));
                    exportMedicalRecord(selectedPatient as any, formattedHistory as any);
                  }}
                  className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[12px] border border-transparent hover:border-emerald-200 w-fit font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> ייצוא תיק רפואי לאקסל
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
              <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-6 py-4 flex items-center gap-2.5">
                <CalendarCheck className="w-5 h-5 text-white/90" />
                <h3 className="text-white text-[17px] font-semibold">תיק רפואי</h3>
              </div>

              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center gap-3 text-[14px] text-gray-500 mb-5">
                  <span><span className="font-medium text-gray-700">תאריך:</span> {selectedPatient.lastVisit}</span>
                  <span className="text-gray-300">|</span>
                  <span><span className="font-medium text-gray-700">שעה:</span> 10:30</span>
                </div>

                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-5 mb-6">
                  <p className="text-gray-500 text-[13px] mb-1 font-medium">סיבת הגעה</p>
                  <p className="text-gray-900 text-[16px] font-semibold">הוספת רשומה חדשה לתיק הרפואי</p>
                </div>

                <div className="text-[14px] text-gray-500 mb-5">
                  <span className="font-medium text-gray-700">פעולות:</span> בדיקה מלאה, חיסון, שקילה, מרשם, מעבדה, מעקב, הערה או אשפוז
                </div>

                <div className={`rounded-xl border p-4 mb-5 ${activeHospitalization ? "border-emerald-200 bg-emerald-50/70" : "border-gray-100 bg-gray-50"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-gray-900 text-[14px] font-bold">סטטוס אשפוז</p>
                      {isHospitalizationLoading ? (
                        <p className="text-gray-500 text-[13px] mt-1">בודק אשפוז פעיל...</p>
                      ) : activeHospitalization ? (
                        <div className="text-gray-600 text-[13px] mt-1 leading-6">
                          <p>מאושפז/ת במחלקת {activeHospitalization.department || "לא צוין"}{activeHospitalization.cage_or_room ? ` · ${activeHospitalization.cage_or_room}` : ""}</p>
                          <p>סיבה: {activeHospitalization.reason || "לא צוינה"}</p>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-[13px] mt-1">אין אשפוז פעיל לחיה הזו.</p>
                      )}
                    </div>
                    {activeHospitalization && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[12px] font-bold">פעיל</span>
                    )}
                  </div>
                </div>

                <div className="mt-auto">
                  {canEditMedicalRecords() ? (
                    <div className="space-y-3">
                      {canPerformTreatment() && (
                        <button
                          className="w-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white py-3.5 rounded-xl transition-colors shadow-sm cursor-pointer text-[15px] flex items-center justify-center gap-2 font-semibold"
                          onClick={() => setIsTreatmentOpen(true)}
                        >
                          הוסף רשומה רפואית <ChevronLeft className="w-5 h-5" />
                        </button>
                      )}
                      {canPerformTreatment() && (
                        <button
                          className={`w-full py-3.5 rounded-xl transition-colors shadow-sm cursor-pointer text-[15px] flex items-center justify-center gap-2 font-semibold ${activeHospitalization ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
                          onClick={() => setIsHospitalizationOpen(true)}
                        >
                          {activeHospitalization ? "שחרר מאשפוז" : "פתח אשפוז"} <ChevronLeft className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3.5 rounded-xl transition-colors shadow-sm cursor-pointer text-[15px] flex items-center justify-center gap-2 font-semibold"
                        onClick={() => setIsAnesthesiaOpen(true)}
                      >
                        חתימת הסכמת הרדמה <ChevronLeft className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-full bg-gray-100 text-gray-500 font-medium py-3.5 rounded-xl text-[15px] flex items-center justify-center gap-2 border border-gray-200 font-medium">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      עדכון תיק רפואי — למורשים בלבד
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-gray-900 text-[17px] font-semibold">היסטוריה רפואית</h3>
                  <p className="text-gray-500 text-[12px] mt-1">לחיצה על ביקור פותחת את כל הפרטים: בעיות, בדיקה גופנית, טיפול, אבחנות ומרשמים</p>
                </div>
                <span className="text-gray-500 font-medium text-[13px]">{patientHistory.length} ביקורים</span>
              </div>

              <div className="p-6">
                {patientHistory.length > 0 ? (
                  <div className="space-y-4">
                    {patientHistory.map((visit) => {
                      const cfg = getVisitDisplayConfig((visit as any).visitType);
                      const IconComponent = cfg.icon;
                      const expanded = expandedVisitId === visit.id;
                      const visitProblems = getMedicalProblemsForVisit(visit.id);
                      const visitExams = getPhysicalExamsForVisit(visit.id);
                      const visitDifferentials = getDifferentialDiagnosesForVisit(visit.id);
                      const visitPrescriptions = patientPrescriptions.filter((prescription) => prescription.visitId === visit.id);

                      return (
                        <article key={visit.id} className={`rounded-2xl border transition-all overflow-hidden ${expanded ? "border-blue-200 shadow-sm" : "border-gray-100 hover:border-blue-100"}`}>
                          <button
                            type="button"
                            onClick={() => setExpandedVisitId(expanded ? null : visit.id)}
                            className="w-full p-4 text-right bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-start gap-4">
                              <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${cfg.color}`}>
                                <IconComponent className="w-5 h-5" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-gray-900 text-[15px] font-bold">{visit.chiefComplaint || visit.reason || "ביקור רפואי"}</span>
                                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${severityClass(visit.urgencyLevel)}`}>
                                    {severityLabel(visit.urgencyLevel)}
                                  </span>
                                  {visitPrescriptions.length > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">
                                      {visitPrescriptions.length} מרשמים
                                    </span>
                                  )}
                                  {visit.followUpRequired && (
                                    <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[11px] font-bold">
                                      נדרש מעקב
                                    </span>
                                  )}
                                </div>
                                <p className="text-gray-500 text-[13px] font-medium">{visit.date} · {visit.vetName || "צוות המרפאה"}</p>
                                <p className="text-gray-500 text-[13px] mt-1 line-clamp-1">{visit.treatment || visit.finalDiagnosis || visit.diagnosis || "לחץ לפתיחת פרטי הביקור"}</p>
                              </div>

                              <span className="text-blue-600 text-[12px] font-semibold shrink-0 mt-1">{expanded ? "סגור" : "פתח פרטים"}</span>
                            </div>
                          </button>

                          {expanded && (
                            <div className="border-t border-gray-100 p-5 bg-gray-50/60 space-y-4">
                              <MedicalDetailSection icon={ClipboardList} title="פרטי ביקור">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <p><b>תאריך:</b> {visit.date}</p>
                                  <p><b>רופא מטפל:</b> {visit.vetName || "לא צוין"}</p>
                                  <p><b>סוג רשומה:</b> {cfg.label}</p>
                                  <p><b>רמת דחיפות:</b> {severityLabel(visit.urgencyLevel)}</p>
                                </div>
                                <p className="mt-2"><b>סיבת ביקור:</b> {visit.chiefComplaint || visit.reason || "לא צוין"}</p>
                              </MedicalDetailSection>

                              {visitProblems.length > 0 && (
                                <MedicalDetailSection icon={AlertTriangle} title="בעיות / תלונות פעילות">
                                  <div className="space-y-2 whitespace-normal">
                                    {visitProblems.map((problem) => (
                                      <div key={problem.id} className="rounded-xl border border-gray-100 bg-white p-3">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                          <b className="text-gray-900">{problem.problemText}</b>
                                          <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${severityClass(problem.severity)}`}>{severityLabel(problem.severity)}</span>
                                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">{statusLabel(problem.status)}</span>
                                        </div>
                                        {problem.notes && <p className="text-gray-600 whitespace-pre-wrap">{problem.notes}</p>}
                                      </div>
                                    ))}
                                  </div>
                                </MedicalDetailSection>
                              )}

                              {visitExams.length > 0 && (
                                <MedicalDetailSection icon={Activity} title="בדיקה גופנית">
                                  <div className="space-y-2 whitespace-normal">
                                    {visitExams.map((exam) => (
                                      <div key={exam.id} className="rounded-xl border border-gray-100 bg-white p-3">
                                        <p className="text-gray-400 text-[12px] mb-1">{exam.examDate}</p>
                                        <p className="whitespace-pre-wrap leading-7">{exam.findings || "לא צוין"}</p>
                                      </div>
                                    ))}
                                  </div>
                                </MedicalDetailSection>
                              )}

                              <MedicalDetailSection icon={Stethoscope} title="טיפול שבוצע והנחיות">
                                {visit.treatment || "לא צוין"}
                              </MedicalDetailSection>

                              {visitDifferentials.length > 0 && (
                                <MedicalDetailSection icon={FileText} title="אבחנות מבדלות">
                                  <div className="space-y-2 whitespace-normal">
                                    {visitDifferentials.map((diagnosis) => (
                                      <div key={diagnosis.id} className="rounded-xl border border-gray-100 bg-white p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                          <b className="text-gray-900">{diagnosis.diagnosisText}</b>
                                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">{statusLabel(diagnosis.likelihood)}</span>
                                        </div>
                                        {diagnosis.notes && <p className="text-gray-600 whitespace-pre-wrap">{diagnosis.notes}</p>}
                                      </div>
                                    ))}
                                  </div>
                                </MedicalDetailSection>
                              )}

                              <MedicalDetailSection icon={CheckCircle2} title="אבחנה סופית">
                                {visit.finalDiagnosis || visit.diagnosis || "לא צוין"}
                              </MedicalDetailSection>

                              {visitPrescriptions.length > 0 && (
                                <MedicalDetailSection icon={Pill} title="מרשמים מהביקור">
                                  <div className="space-y-2 whitespace-normal">
                                    {visitPrescriptions.map((prescription) => (
                                      <div key={prescription.id} className="rounded-xl border border-gray-100 bg-white p-3 flex items-start justify-between gap-3">
                                        <div>
                                          <p className="font-bold text-gray-900">{prescription.medication || "תרופה"}</p>
                                          <p className="text-gray-600 text-[13px] mt-1">{[prescription.dosage, prescription.frequency, prescription.duration].filter(Boolean).join(" · ") || "אין פרטי מינון"}</p>
                                          <p className="text-gray-400 text-[12px] mt-1">תאריך התחלה: {prescription.startDate || "לא צוין"}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setSelectedPrescriptionForPrint(mapPrescriptionForDocument(prescription));
                                            setSelectedPrescriptionVisit(mapVisitForPrescriptionDocument(visit));
                                          }}
                                          className="shrink-0 flex items-center gap-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-2 rounded-lg text-[12px] font-bold cursor-pointer"
                                        >
                                          <FileText className="w-4 h-4" /> הצג מרשם
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </MedicalDetailSection>
                              )}

                              {(visit.notes || visit.followUpNotes) && (
                                <MedicalDetailSection icon={FileText} title="סיכום והערות">
                                  {visit.notes && <p>{visit.notes}</p>}
                                  {visit.followUpNotes && <p className="mt-2"><b>הערות מעקב:</b> {visit.followUpNotes}</p>}
                                </MedicalDetailSection>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-500 font-medium">
                    <Stethoscope className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p>אין היסטוריה רפואית</p>
                  </div>
                )}
              </div>
            </div>

            {patientPrescriptions.some((prescription) => !prescription.visitId) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-gray-900 text-[17px] font-semibold">מרשמים כלליים</h3>
                  <span className="text-gray-500 font-medium text-[13px]">{patientPrescriptions.filter((prescription) => !prescription.visitId).length} מרשמים</span>
                </div>
                <div className="p-6 space-y-3">
                  {patientPrescriptions.filter((prescription) => !prescription.visitId).map((prescription) => (
                    <div key={prescription.id} className="rounded-2xl border border-gray-100 p-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900">{prescription.medication || "תרופה"}</p>
                        <p className="text-gray-600 text-[13px] mt-1">{[prescription.dosage, prescription.frequency, prescription.duration].filter(Boolean).join(" · ") || "אין פרטי מינון"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPrescriptionForPrint(mapPrescriptionForDocument(prescription));
                          setSelectedPrescriptionVisit(null);
                        }}
                        className="shrink-0 flex items-center gap-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-2 rounded-lg text-[12px] font-bold cursor-pointer"
                      >
                        <FileText className="w-4 h-4" /> הצג מרשם
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8">
          <LabResultsPanel patientId={selectedPatient.id} petName={pet.name} />
        </div>

        {isEditPetOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div>
                  <h3 className="text-gray-900 text-[18px] font-bold">עריכת פרטי חיה</h3>
                  <p className="text-gray-500 text-[13px] mt-1">עדכון הפרטים יישמר ישירות בטבלת patients ב-Supabase</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditPetOpen(false)}
                  className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                  aria-label="סגור חלון עריכה"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditPetSubmit(onEditPetSubmit as any)} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="editPetName" className="block text-gray-700 text-[14px] mb-2 font-medium">שם החיה</label>
                    <input
                      type="text"
                      id="editPetName"
                      {...registerEditPet("petName")}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${editPetErrors.petName ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                      placeholder="שם החיה"
                    />
                    {editPetErrors.petName && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{editPetErrors.petName.message}</p>}
                  </div>

                  <div>
                    <label htmlFor="editSpecies" className="block text-gray-700 text-[14px] mb-2 font-medium">סוג</label>
                    <select
                      id="editSpecies"
                      {...registerEditPet("species")}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] bg-white ${editPetErrors.species ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                    >
                      <option value="dog">כלב</option>
                      <option value="cat">חתול</option>
                      <option value="bird">ציפור</option>
                      <option value="rabbit">ארנב</option>
                      <option value="hamster">אוגר</option>
                      <option value="other">אחר</option>
                    </select>
                    {editPetErrors.species && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{editPetErrors.species.message}</p>}
                  </div>

                  <div>
                    <label htmlFor="editBreed" className="block text-gray-700 text-[14px] mb-2 font-medium">גזע</label>
                    <select
                      id="editBreed"
                      {...registerEditPet("breed")}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] bg-white ${editPetErrors.breed ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                    >
                      <option value="">בחר גזע</option>
                      <option value="golden-retriever">גולדן רטריבר</option>
                      <option value="labrador">לברדור</option>
                      <option value="german-shepherd">רועה גרמני</option>
                      <option value="persian-cat">חתול פרסי</option>
                      <option value="siamese">סיאמי</option>
                      <option value="mixed">מעורב</option>
                      <option value="other">אחר</option>
                    </select>
                    {editPetErrors.breed && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{editPetErrors.breed.message}</p>}
                  </div>

                  {selectedEditBreed === "other" && (
                    <div>
                      <label htmlFor="editCustomBreed" className="block text-gray-700 text-[14px] mb-2 font-medium">ציין גזע</label>
                      <input
                        type="text"
                        id="editCustomBreed"
                        {...registerEditPet("customBreed")}
                        className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${editPetErrors.customBreed ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                        placeholder="לדוגמה: פודל / כנעני / אחר"
                      />
                      {editPetErrors.customBreed && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{editPetErrors.customBreed.message}</p>}
                    </div>
                  )}

                  <div>
                    <label htmlFor="editGender" className="block text-gray-700 text-[14px] mb-2 font-medium">מין</label>
                    <select
                      id="editGender"
                      {...registerEditPet("gender")}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] bg-white ${editPetErrors.gender ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                    >
                      <option value="זכר">זכר</option>
                      <option value="נקבה">נקבה</option>
                      <option value="לא ידוע">לא ידוע</option>
                    </select>
                    {editPetErrors.gender && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{editPetErrors.gender.message}</p>}
                  </div>

                  <div>
                    <label htmlFor="editNeuteredStatus" className="block text-gray-700 text-[14px] mb-2 font-medium">{getNeuteredQuestion(watchEditPet("gender"))}</label>
                    <select
                      id="editNeuteredStatus"
                      {...registerEditPet("neuteredStatus")}
                      className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] bg-white border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      {neuteredOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="editBirthDate" className="block text-gray-700 text-[14px] mb-2 font-medium">תאריך לידה</label>
                    <input
                      type="date"
                      id="editBirthDate"
                      {...registerEditPet("birthDate")}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${editPetErrors.birthDate ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                    />
                    {editPetErrors.birthDate && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{editPetErrors.birthDate.message}</p>}
                  </div>

                  <div>
                    <label htmlFor="editWeight" className="block text-gray-700 text-[14px] mb-2 font-medium">משקל</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      id="editWeight"
                      {...registerEditPet("weight")}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${editPetErrors.weight ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                      placeholder="משקל בק״ג"
                    />
                    {editPetErrors.weight && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{editPetErrors.weight.message}</p>}
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="editMicrochipNumber" className="block text-gray-700 text-[14px] mb-2 font-medium">מספר שבב</label>
                    <input
                      type="text"
                      id="editMicrochipNumber"
                      {...registerEditPet("microchipNumber")}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${editPetErrors.microchipNumber ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                      placeholder="מספר שבב"
                    />
                    {editPetErrors.microchipNumber && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{editPetErrors.microchipNumber.message}</p>}
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="editAllergies" className="flex items-center gap-2 text-gray-700 text-[14px] mb-2 font-medium">
                      <AlertCircle className="w-4 h-4 text-orange-500" />
                      <span>אלרגיות / רגישויות</span>
                    </label>
                    <textarea
                      id="editAllergies"
                      {...registerEditPet("allergies")}
                      rows={4}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px] resize-none"
                      placeholder="פרט כל אלרגיה או רגישות ידועה..."
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-5 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsEditPetOpen(false)}
                    className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] font-medium"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingPet}
                    className={`px-6 py-2.5 rounded-lg bg-[#1e40af] text-white hover:bg-[#1e3a8a] transition-colors cursor-pointer text-[14px] font-semibold ${isUpdatingPet ? "opacity-70 cursor-not-allowed" : ""}`}
                  >
                    {isUpdatingPet ? "שומר שינויים..." : "שמירת שינויים"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <TreatmentModal
          isOpen={isTreatmentOpen}
          onClose={() => setIsTreatmentOpen(false)}
          petName={pet.name}
          petSpecies={pet.speciesType}
          ownerName={owner.name}
          patientId={selectedPatient.id}
        />

        <HospitalizationModal
          isOpen={isHospitalizationOpen}
          onClose={() => setIsHospitalizationOpen(false)}
          patientId={selectedPatient.id}
          ownerId={owner.id}
          petName={pet.name}
          ownerName={owner.name}
          activeHospitalization={activeHospitalization}
          onSaved={async () => {
            await Promise.all([loadActiveHospitalization(selectedPatient.id), loadMedicalData()]);
          }}
        />

        {isAnesthesiaOpen && (
          <AnesthesiaConsentModal
            petName={pet.name}
            ownerName={owner.name}
            onClose={() => setIsAnesthesiaOpen(false)}
          />
        )}

        <PrescriptionDocumentModal
          isOpen={Boolean(selectedPrescriptionForPrint)}
          onClose={() => {
            setSelectedPrescriptionForPrint(null);
            setSelectedPrescriptionVisit(null);
          }}
          prescription={selectedPrescriptionForPrint}
          petName={pet.name}
          owner={{
            ownerId: owner.id,
            firstName: splitOwnerNameForDocument(owner.name).firstName,
            lastName: splitOwnerNameForDocument(owner.name).lastName,
            phone: owner.phone,
            email: owner.email,
            address: owner.address,
          }}
          visit={selectedPrescriptionVisit}
        />
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-blue-100 rounded-xl p-2.5">
          <Users className="w-6 h-6 text-[#1e40af]" />
        </div>
        <div>
          <h1 className="text-gray-900 text-[22px] font-bold">מטופלים</h1>
          <p className="text-gray-500 text-[14px]">ניהול מטופלים, רישום חדשים וצפייה בתיקים</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-8 w-fit">
        <button
          onClick={() => setActiveTab("list")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all cursor-pointer text-[14px] ${activeTab === "list" ? "bg-white text-[#1e40af] shadow-sm font-semibold" : "text-gray-500 hover:text-gray-700 font-normal"}`}
        >
          <Eye className="w-4 h-4" /> צפייה במטופלים
        </button>
        <button
          onClick={() => setActiveTab("register")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all cursor-pointer text-[14px] ${activeTab === "register" ? "bg-white text-[#1e40af] shadow-sm font-semibold" : "text-gray-500 hover:text-gray-700 font-normal"}`}
        >
          <UserPlus className="w-4 h-4" /> רישום מטופל חדש
        </button>
      </div>

      {activeTab === "list" ? (
        <>
          <div className="mb-6">
            <div className="relative max-w-lg">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
              <input
                type="text"
                placeholder="חיפוש לפי שם חיה, בעלים, טלפון או שבב..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-11 pl-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors text-[15px]"
              />
            </div>
          </div>

          {isLoadingData ? (
             <div className="flex flex-col items-center justify-center py-16">
               <svg className="animate-spin h-8 w-8 text-[#1e40af] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
               </svg>
               <p className="text-gray-500 font-medium text-[15px]">טוען נתונים מהשרת...</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((patient) => {
                const PetIcon = patient.pet.speciesType === "cat" ? Cat : Dog;
                return (
                  <div
                    key={patient.id}
                    onClick={() => setSelectedPatient(patient)}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl w-[52px] h-[52px] flex items-center justify-center shrink-0 group-hover:from-blue-100 group-hover:to-indigo-200 transition-colors">
                        <PetIcon className="w-6 h-6 text-[#1e40af]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-gray-900 text-[16px] truncate font-semibold">{patient.pet.name}</h3>
                          <span className="text-gray-500 font-medium text-[13px] shrink-0">{patient.pet.species}, {patient.pet.gender} · {getNeuteredLabel(patient.pet.neuteredStatus, patient.pet.gender)}</span>
                        </div>
                        <p className="text-gray-500 text-[13px]">{patient.pet.breed} · בן {patient.pet.age}</p>
                      </div>
                      {patient.pet.allergies && <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-1" />}
                    </div>

                    <div className="border-t border-gray-100 pt-3 space-y-2">
                      <div className="flex items-center gap-2 text-[13px] text-gray-500">
                        <CreditCard className="w-3.5 h-3.5 text-gray-500 font-medium" />
                        <span className="text-gray-600 font-medium">{patient.owner.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[13px] text-gray-500">
                        <Phone className="w-3.5 h-3.5 text-gray-500 font-medium" />
                        <span>{patient.owner.phone}</span>
                      </div>
                      {patient.owner.email && (
                        <div className="flex items-center gap-2 text-[13px] text-gray-500">
                          <Mail className="w-3.5 h-3.5 text-gray-500 font-medium" />
                          <span className="truncate">{patient.owner.email}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[13px] text-gray-500">
                          <Calendar className="w-3.5 h-3.5 text-gray-500 font-medium" />
                          <span>ביקור אחרון: {patient.lastVisit}</span>
                        </div>
                        {patient.nextAppointment && (
                          <span className="bg-blue-50 text-blue-600 text-[13px] px-2 py-0.5 rounded-full border border-blue-200 font-medium">
                            תור: {patient.nextAppointment}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isLoadingData && filtered.length === 0 && (
            <div className="text-center py-16">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium text-[15px]">לא נמצאו מטופלים תואמים</p>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={handleSubmit(onSubmit as any)}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              
              {/* פרטי בעלים */}
              <div className="space-y-6">
                <h2 className="text-gray-900 text-[19px] mb-6 pb-3 border-b border-gray-200 font-semibold">פרטי בעלים</h2>
                {[
                  { id: "ownerId", label: "תעודת זהות", type: "text", placeholder: "הזן מספר תעודת זהות" },
                  { id: "ownerName", label: "שם מלא", type: "text", placeholder: "הזן שם מלא" },
                  { id: "address", label: "כתובת", type: "text", placeholder: "רחוב, עיר, מיקוד" },
                  { id: "phone", label: "טלפון", type: "tel", placeholder: "050-1234567" },
                  { id: "email", label: 'כתובת דוא"ל', type: "email", placeholder: 'הזן כתובת דוא"ל (אופציונלי)' },
                ].map((field) => {
                  const fieldError = errors[field.id as keyof PatientFormValues];
                  return (
                    <div key={field.id}>
                      <label htmlFor={field.id} className="block text-gray-700 text-[14px] mb-2 font-medium">{field.label}</label>
                      <input
                        type={field.type} id={field.id}
                        {...register(field.id as keyof PatientFormValues)}
                        className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${
                          fieldError ? "border-red-400 focus:ring-red-500/20 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"
                        }`}
                        placeholder={field.placeholder}
                      />
                      {fieldError && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{fieldError.message}</p>}
                    </div>
                  );
                })}
              </div>

              {/* פרטי חיית מחמד */}
              <div className="space-y-6">
                <h2 className="text-gray-900 text-[19px] mb-6 pb-3 border-b border-gray-200 font-semibold">פרטי חיית מחמד</h2>
                
                <div>
                  <label htmlFor="microchipNumber" className="block text-gray-700 text-[14px] mb-2 font-medium">מספר שבב</label>
                  <input type="text" id="microchipNumber" {...register("microchipNumber")} className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${errors.microchipNumber ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`} placeholder="הזן מספר שבב (אופציונלי)" />
                  {errors.microchipNumber && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{errors.microchipNumber.message}</p>}
                </div>
                
                <div>
                  <label htmlFor="petName" className="block text-gray-700 text-[14px] mb-2 font-medium">שם החיה</label>
                  <input type="text" id="petName" {...register("petName")} className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${errors.petName ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`} placeholder="הזן שם החיה" />
                  {errors.petName && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{errors.petName.message}</p>}
                </div>
                
                <div>
                  <label htmlFor="species" className="block text-gray-700 text-[14px] mb-2 font-medium">סוג</label>
                  <select id="species" {...register("species")} className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] bg-white ${errors.species ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}>
                    <option value="">בחר סוג חיה</option>
                    <option value="dog">כלב</option>
                    <option value="cat">חתול</option>
                    <option value="bird">ציפור</option>
                    <option value="rabbit">ארנב</option>
                    <option value="hamster">אוגר</option>
                    <option value="other">אחר</option>
                  </select>
                  {errors.species && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{errors.species.message}</p>}
                </div>
                
                <div>
                  <label htmlFor="breed" className="block text-gray-700 text-[14px] mb-2 font-medium">גזע</label>
                  <select id="breed" {...register("breed")} className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] bg-white ${errors.breed ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}>
                    <option value="">בחר גזע</option>
                    <option value="golden-retriever">גולדן רטריבר</option>
                    <option value="labrador">לברדור</option>
                    <option value="german-shepherd">רועה גרמני</option>
                    <option value="persian-cat">חתול פרסי</option>
                    <option value="siamese">סיאמי</option>
                    <option value="mixed">מעורב</option>
                    <option value="other">אחר</option>
                  </select>
                  {errors.breed && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{errors.breed.message}</p>}
                </div>

                {selectedBreed === "other" && (
                  <div>
                    <label htmlFor="customBreed" className="block text-gray-700 text-[14px] mb-2 font-medium">ציין גזע</label>
                    <input
                      type="text"
                      id="customBreed"
                      {...register("customBreed")}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${errors.customBreed ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                      placeholder="לדוגמה: פודל / כנעני / אחר"
                    />
                    {errors.customBreed && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{errors.customBreed.message}</p>}
                  </div>
                )}

                <div>
                  <label htmlFor="gender" className="block text-gray-700 text-[14px] mb-2 font-medium">מין</label>
                  <select
                    id="gender"
                    {...register("gender")}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] bg-white ${errors.gender ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                  >
                    <option value="">בחר מין</option>
                    <option value="זכר">זכר</option>
                    <option value="נקבה">נקבה</option>
                    <option value="לא ידוע">לא ידוע</option>
                  </select>
                  {errors.gender && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{errors.gender.message}</p>}
                </div>
                
                <div>
                  <label htmlFor="neuteredStatus" className="block text-gray-700 text-[14px] mb-2 font-medium">מסורס/מעוקרת?</label>
                  <select
                    id="neuteredStatus"
                    {...register("neuteredStatus")}
                    className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] bg-white border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {neuteredOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="birthDate" className="block text-gray-700 text-[14px] mb-2 font-medium">תאריך לידה</label>
                  <div className="relative">
                    <input type="date" id="birthDate" {...register("birthDate")} className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${errors.birthDate ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`} />
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
                  </div>
                  {errors.birthDate && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{errors.birthDate.message}</p>}
                </div>

                <div>
                  <label htmlFor="weight" className="block text-gray-700 text-[14px] mb-2 font-medium">משקל</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    id="weight"
                    {...register("weight")}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors text-[15px] ${errors.weight ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:ring-blue-500/20 focus:border-blue-500"}`}
                    placeholder="הזן משקל בק״ג"
                  />
                  {errors.weight && <p className="text-red-500 text-[12px] mt-1.5 font-medium">{errors.weight.message}</p>}
                </div>
                
                <div>
                  <label htmlFor="allergies" className="flex items-center gap-2 text-gray-700 text-[14px] mb-2 font-medium">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <span>אלרגיות / רגישויות</span>
                  </label>
                  <textarea id="allergies" {...register("allergies")} rows={4} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px] resize-none" placeholder="פרט כל אלרגיה או רגישות ידועה..." />
                </div>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-gray-200">
              <button 
                type="submit" 
                disabled={isSubmitting}
                className={`bg-[#1e40af] text-white px-8 py-3 rounded-lg transition-colors shadow-sm text-[15px] font-semibold flex items-center justify-center gap-2 ${
                  isSubmitting ? "opacity-70 cursor-not-allowed" : "hover:bg-[#1e3a8a] cursor-pointer"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    שומר נתונים...
                  </>
                ) : "שמור נתונים במערכת"}
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}