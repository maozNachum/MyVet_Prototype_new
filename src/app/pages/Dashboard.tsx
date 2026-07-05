import { useEffect, useMemo, useState } from "react";
import { KpiCards } from "../components/KpiCards";
import { DashboardAssistant } from "../components/ai/PageAssistants";
import { AppointmentsTable } from "../components/AppointmentsTable";
import { Zap, Search, Dog, Cat, Phone, X, UserPlus, ArrowRight, PawPrint, Check, Loader2, AlertCircle } from "lucide-react";
import { TreatmentModal } from "../components/TreatmentModal";
import { getStaffName, canEditMedicalRecords } from "../data/staffAuth";
import { supabase } from "../../services/supabaseClient";

type SpeciesType = "dog" | "cat" | "bird" | "rabbit" | "hamster" | "other";

type PatientListItem = {
  id: number;
  petName: string;
  petSpecies: SpeciesType;
  speciesLabel: string;
  breed: string;
  microchip: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
};

type PatientRow = {
  pet_id: number | string;
  pet_name: string | null;
  species: string | null;
  breed: string | null;
  microchip: string | null;
  owner_id: string | null;
};

type OwnerRow = {
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

const speciesOptions = [
  { value: "dog", label: "כלב", species: "כלב", icon: Dog },
  { value: "cat", label: "חתול", species: "חתול", icon: Cat },
  { value: "bird", label: "ציפור", species: "ציפור", icon: PawPrint },
  { value: "rabbit", label: "ארנב", species: "ארנב", icon: PawPrint },
  { value: "hamster", label: "אוגר", species: "אוגר", icon: PawPrint },
  { value: "other", label: "אחר", species: "אחר", icon: PawPrint },
] as const;

const genderOptions = [
  { value: "זכר", label: "זכר" },
  { value: "נקבה", label: "נקבה" },
];

const neuteredOptions = [
  { value: "unknown", label: "לא ידוע" },
  { value: "yes", label: "כן" },
  { value: "no", label: "לא" },
];

interface NewPatientForm {
  petName: string;
  speciesType: string;
  gender: string;
  breed: string;
  birthDate: string;
  weight: string;
  microchip: string;
  allergies: string;
  neuteredStatus: "unknown" | "yes" | "no";
  ownerFirstName: string;
  ownerLastName: string;
  ownerId: string;
  ownerPhone: string;
  ownerEmail: string;
  ownerAddress: string;
}

const emptyForm: NewPatientForm = {
  petName: "",
  speciesType: "dog",
  gender: "זכר",
  breed: "",
  birthDate: "",
  weight: "",
  microchip: "",
  allergies: "",
  neuteredStatus: "unknown",
  ownerFirstName: "",
  ownerLastName: "",
  ownerId: "",
  ownerPhone: "",
  ownerEmail: "",
  ownerAddress: "",
};

function normalizeSpecies(species?: string | null): SpeciesType {
  const value = (species || "").trim().toLowerCase();
  if (value === "dog" || value === "כלב") return "dog";
  if (value === "cat" || value === "חתול") return "cat";
  if (value === "bird" || value === "ציפור") return "bird";
  if (value === "rabbit" || value === "ארנב") return "rabbit";
  if (value === "hamster" || value === "אוגר") return "hamster";
  return "other";
}

function speciesLabel(species?: string | null) {
  const normalized = normalizeSpecies(species);
  const option = speciesOptions.find((item) => item.value === normalized);
  return option?.label || species || "אחר";
}

function fullName(first?: string | null, last?: string | null) {
  return `${first || ""} ${last || ""}`.trim();
}

function ownerNameParts(fullNameValue: string) {
  const parts = fullNameValue.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || fullNameValue.trim(),
    lastName: parts.slice(1).join(" "),
  };
}

function matchesPatient(item: PatientListItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    item.petName,
    item.ownerName,
    item.ownerPhone,
    item.ownerEmail,
    item.ownerId,
    item.microchip,
    item.breed,
    item.speciesLabel,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

export function Dashboard() {
  const [showWalkInPicker, setShowWalkInPicker] = useState(false);
  const [walkInSearch, setWalkInSearch] = useState("");
  const [modalView, setModalView] = useState<"list" | "new-patient">("list");
  const [newForm, setNewForm] = useState<NewPatientForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewPatientForm, string>>>({});
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [treatmentPatient, setTreatmentPatient] = useState<{ id: number; petName: string; petSpecies: string; ownerName: string } | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const canTreat = canEditMedicalRecords();

  const filteredPatients = useMemo(
    () => patients.filter((patient) => matchesPatient(patient, walkInSearch)).slice(0, 50),
    [patients, walkInSearch]
  );

  async function loadPatients() {
    setIsLoadingPatients(true);
    setLoadError(null);

    try {
      const { data: patientRows, error: patientsError } = await supabase
        .from("patients")
        .select("pet_id, pet_name, species, breed, microchip, owner_id")
        .order("pet_name", { ascending: true });

      if (patientsError) throw patientsError;

      const typedPatients = (patientRows || []) as PatientRow[];
      const ownerIds = Array.from(new Set(typedPatients.map((row) => row.owner_id).filter(Boolean) as string[]));
      const ownersById = new Map<string, OwnerRow>();

      if (ownerIds.length > 0) {
        const { data: ownerRows, error: ownersError } = await supabase
          .from("owners")
          .select("owner_id, owner_first_name, owner_last_name, phone, email, address")
          .in("owner_id", ownerIds);

        if (ownersError) throw ownersError;
        for (const owner of (ownerRows || []) as OwnerRow[]) {
          ownersById.set(String(owner.owner_id), owner);
        }
      }

      setPatients(
        typedPatients.map((row) => {
          const owner = row.owner_id ? ownersById.get(String(row.owner_id)) : undefined;
          return {
            id: Number(row.pet_id),
            petName: row.pet_name || "ללא שם חיה",
            petSpecies: normalizeSpecies(row.species),
            speciesLabel: speciesLabel(row.species),
            breed: row.breed || "",
            microchip: row.microchip || "",
            ownerId: row.owner_id || "",
            ownerName: owner ? fullName(owner.owner_first_name, owner.owner_last_name) || "ללא שם בעלים" : "ללא בעלים",
            ownerPhone: owner?.phone || "",
            ownerEmail: owner?.email || "",
          };
        })
      );
    } catch (error) {
      console.error("Failed to load walk-in patients", error);
      setLoadError("לא הצלחנו לטעון מטופלים מ-Supabase");
      setPatients([]);
    } finally {
      setIsLoadingPatients(false);
    }
  }

  useEffect(() => {
    loadPatients();
  }, []);

  const closeModal = () => {
    setShowWalkInPicker(false);
    setWalkInSearch("");
    setModalView("list");
    setNewForm(emptyForm);
    setFormErrors({});
  };

  const handleSelectPatient = (patient: PatientListItem) => {
    closeModal();
    if (canTreat) {
      setTreatmentPatient({ id: patient.id, petName: patient.petName, petSpecies: patient.petSpecies, ownerName: patient.ownerName });
    } else {
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    }
  };

  const updateField = (field: keyof NewPatientForm, value: string) => {
    setNewForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validateForm = () => {
    const errors: Partial<Record<keyof NewPatientForm, string>> = {};
    if (!newForm.petName.trim()) errors.petName = "חובה להזין שם חיה";
    if (!newForm.speciesType.trim()) errors.speciesType = "חובה לבחור סוג חיה";
    if (!newForm.breed.trim()) errors.breed = "חובה להזין גזע או אחר";
    if (!newForm.ownerFirstName.trim()) errors.ownerFirstName = "חובה להזין שם פרטי של בעלים";
    if (!newForm.ownerPhone.trim()) errors.ownerPhone = "חובה להזין טלפון בעלים";
    if (newForm.weight && Number.isNaN(Number(newForm.weight))) errors.weight = "משקל חייב להיות מספר";
    return errors;
  };

  const validateAndSave = async () => {
    const errors = validateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSavingPatient(true);
    try {
      const ownerId = newForm.ownerId.trim() || `owner-${Date.now()}`;

      const ownerPayload = {
        owner_id: ownerId,
        owner_first_name: newForm.ownerFirstName.trim(),
        owner_last_name: newForm.ownerLastName.trim(),
        phone: newForm.ownerPhone.trim(),
        email: newForm.ownerEmail.trim() || null,
        address: newForm.ownerAddress.trim() || null,
      };

      const { error: ownerError } = await supabase.from("owners").upsert(ownerPayload, { onConflict: "owner_id" });
      if (ownerError) throw ownerError;

      const specOpt = speciesOptions.find((s) => s.value === newForm.speciesType);
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .insert([
          {
            pet_name: newForm.petName.trim(),
            species: specOpt?.species || newForm.speciesType,
            breed: newForm.breed.trim(),
            gender: newForm.gender,
            birth_date: newForm.birthDate || null,
            microchip: newForm.microchip.trim() || null,
            allergies: newForm.allergies.trim() || null,
            weight: newForm.weight ? Number(newForm.weight) : null,
            neutered_status: newForm.neuteredStatus,
            owner_id: ownerId,
          },
        ])
        .select("pet_id, pet_name, species, breed, microchip, owner_id")
        .single();

      if (patientError) throw patientError;

      await loadPatients();

      const newPatient: PatientListItem = {
        id: Number(patientData.pet_id),
        petName: patientData.pet_name || newForm.petName,
        petSpecies: normalizeSpecies(patientData.species),
        speciesLabel: speciesLabel(patientData.species),
        breed: patientData.breed || newForm.breed,
        microchip: patientData.microchip || "",
        ownerId,
        ownerName: fullName(ownerPayload.owner_first_name, ownerPayload.owner_last_name) || ownerPayload.owner_first_name,
        ownerPhone: ownerPayload.phone,
        ownerEmail: ownerPayload.email || "",
      };

      handleSelectPatient(newPatient);
    } catch (error) {
      console.error("Failed to create walk-in patient", error);
      setLoadError("לא הצלחנו לשמור את המטופל החדש ב-Supabase");
    } finally {
      setIsSavingPatient(false);
    }
  };

  const inputClass = (field: keyof NewPatientForm) =>
    `w-full px-3.5 py-2.5 border rounded-xl text-[14px] focus:outline-none focus:ring-2 transition-all ${
      formErrors[field]
        ? "border-red-300 bg-red-50/50 focus:ring-red-500/20"
        : "border-gray-200 bg-white focus:ring-orange-500/20"
    }`;

  const renderError = (field: keyof NewPatientForm) =>
    formErrors[field] ? <p className="mt-1 text-[12px] text-red-500 font-medium">{formErrors[field]}</p> : null;

  const renderInput = (label: string, field: keyof NewPatientForm, placeholder: string, required = false, type = "text") => (
    <div>
      <label className="block text-gray-600 text-[12px] mb-1.5 font-medium">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input type={type} placeholder={placeholder} value={newForm[field]} onChange={(e) => updateField(field, e.target.value)} className={inputClass(field)} />
      {renderError(field)}
    </div>
  );

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-8 relative">
      {showSuccessToast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[300] bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-3 rounded-2xl shadow-lg flex items-center gap-3 animate-in slide-in-from-top-5">
          <Check className="w-5 h-5 text-emerald-500" />
          <span className="font-bold text-[15px]">הפעולה עודכנה בהצלחה</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900 text-[26px] font-bold">ברוך הבא, {getStaffName()}</h1>
          <p className="text-gray-500 mt-1 text-[15px]">סקירה כללית של פעילות המרפאה היום</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardAssistant />
          <button
            onClick={() => {
              setShowWalkInPicker(true);
              loadPatients();
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all text-[14px] font-semibold bg-gradient-to-l from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white cursor-pointer shadow-md shadow-orange-500/20"
          >
            <Zap className="w-4 h-4" /> טיפול ללא תור
          </button>
        </div>
      </div>
      <KpiCards />
      <AppointmentsTable />

      {showWalkInPicker && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-l from-orange-500 to-amber-500 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {modalView === "new-patient" ? (
                  <button onClick={() => { setModalView("list"); setNewForm(emptyForm); setFormErrors({}); }} className="text-white/70 hover:text-white cursor-pointer p-1"><ArrowRight className="w-5 h-5" /></button>
                ) : <Zap className="w-5 h-5 text-white/80" />}
                <div>
                  <h3 className="text-white text-[17px] font-semibold">{modalView === "list" ? "טיפול ללא תור" : "רישום מטופל חדש"}</h3>
                  <p className="text-white/70 text-[12px]">{modalView === "list" ? "בחרו חיה אמיתית מ-Supabase או הוסיפו מטופל חדש" : "הפרטים יישמרו בטבלאות owners ו-patients"}</p>
                </div>
              </div>
              <button onClick={closeModal} className="text-white/60 hover:text-white cursor-pointer p-1"><X className="w-5 h-5" /></button>
            </div>

            {modalView === "list" && (
              <div className="flex flex-col overflow-hidden">
                <div className="px-5 pt-5 pb-3 space-y-3 shrink-0">
                  <div className="relative">
                    <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500 pointer-events-none" />
                    {walkInSearch && <button onClick={() => setWalkInSearch("")} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 cursor-pointer"><X className="w-4 h-4" /></button>}
                    <input type="text" placeholder="חיפוש לפי שם חיה, בעלים, טלפון, שבב..." value={walkInSearch} onChange={(e) => setWalkInSearch(e.target.value)} className="w-full pr-11 pl-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300" autoFocus />
                  </div>
                  {loadError && <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-red-600 text-[13px]"><AlertCircle className="w-4 h-4" />{loadError}</div>}
                  <button onClick={() => setModalView("new-patient")} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer text-[14px] font-semibold">
                    <UserPlus className="w-4 h-4" /> מטופל חדש שלא קיים במערכת
                  </button>
                </div>

                <div className="overflow-y-auto px-5 pb-5 max-h-[50vh] space-y-2">
                  {isLoadingPatients ? (
                    <div className="py-10 text-center text-gray-500 text-[14px]"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />טוען מטופלים...</div>
                  ) : filteredPatients.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-[14px]">לא נמצאו מטופלים מתאימים במסד.</div>
                  ) : (
                    filteredPatients.map((patient) => {
                      const Icon = patient.petSpecies === "dog" ? Dog : patient.petSpecies === "cat" ? Cat : PawPrint;
                      return (
                        <button key={patient.id} onClick={() => handleSelectPatient(patient)} className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 transition-all text-right cursor-pointer group">
                          <div className="w-11 h-11 rounded-xl bg-gray-50 group-hover:bg-orange-50 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-orange-500" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-900 text-[15px] font-semibold truncate">{patient.petName} <span className="text-gray-400 font-normal">· {patient.speciesLabel}</span></p>
                            <p className="text-gray-500 text-[13px] truncate">{patient.ownerName}</p>
                            <p className="text-gray-400 text-[12px] flex items-center gap-1"><Phone className="w-3 h-3" /> {patient.ownerPhone || "אין טלפון"}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {modalView === "new-patient" && (
              <div className="overflow-y-auto p-5 space-y-5">
                {loadError && <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-red-600 text-[13px]"><AlertCircle className="w-4 h-4" />{loadError}</div>}

                <section className="space-y-3">
                  <h4 className="text-gray-800 text-[14px] font-bold">פרטי החיה</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {renderInput("שם חיה", "petName", "למשל: לונה", true)}
                    <div>
                      <label className="block text-gray-600 text-[12px] mb-1.5 font-medium">סוג חיה</label>
                      <select value={newForm.speciesType} onChange={(e) => updateField("speciesType", e.target.value)} className={inputClass("speciesType")}> 
                        {speciesOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      {renderError("speciesType")}
                    </div>
                    <div>
                      <label className="block text-gray-600 text-[12px] mb-1.5 font-medium">מין</label>
                      <select value={newForm.gender} onChange={(e) => updateField("gender", e.target.value)} className={inputClass("gender")}> 
                        {genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    {renderInput("גזע", "breed", "למשל: לברדור", true)}
                    {renderInput("תאריך לידה", "birthDate", "", false, "date")}
                    {renderInput("משקל", "weight", "ק״ג", false, "number")}
                    {renderInput("שבב", "microchip", "מספר שבב")}
                    <div>
                      <label className="block text-gray-600 text-[12px] mb-1.5 font-medium">מסורס / מעוקרת</label>
                      <select value={newForm.neuteredStatus} onChange={(e) => updateField("neuteredStatus", e.target.value)} className={inputClass("neuteredStatus")}> 
                        {neuteredOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">{renderInput("אלרגיות", "allergies", "אם אין — להשאיר ריק")}</div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="text-gray-800 text-[14px] font-bold">פרטי בעלים</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {renderInput("שם פרטי", "ownerFirstName", "שם פרטי", true)}
                    {renderInput("שם משפחה", "ownerLastName", "שם משפחה")}
                    {renderInput("תעודת זהות", "ownerId", "אפשר להשאיר ריק")}
                    {renderInput("טלפון", "ownerPhone", "05X-XXXXXXX", true)}
                    {renderInput("אימייל", "ownerEmail", "name@email.com", false, "email")}
                    {renderInput("כתובת", "ownerAddress", "כתובת")}
                  </div>
                </section>

                <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-1">
                  <button onClick={validateAndSave} disabled={isSavingPatient} className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white transition-colors cursor-pointer text-[14px] font-semibold flex items-center justify-center gap-2">
                    {isSavingPatient ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    שמור והתחל רשומה רפואית
                  </button>
                  <button onClick={() => setModalView("list")} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] font-medium">חזרה</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {treatmentPatient && (
        <TreatmentModal
          isOpen={!!treatmentPatient}
          onClose={() => setTreatmentPatient(null)}
          patientId={treatmentPatient.id}
          petName={treatmentPatient.petName}
          petSpecies={treatmentPatient.petSpecies}
          ownerName={treatmentPatient.ownerName}
          onSave={() => {
            setTreatmentPatient(null);
            setShowSuccessToast(true);
            setTimeout(() => setShowSuccessToast(false), 3000);
          }}
        />
      )}
    </main>
  );
}
