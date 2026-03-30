import { useState } from "react";
import { KpiCards } from "../components/KpiCards";
import { AppointmentsTable } from "../components/AppointmentsTable";
import { Zap, Search, Dog, Cat, Phone, X, UserPlus, ArrowRight, PawPrint, User, ChevronDown, Check } from "lucide-react";
import { patients, type Patient } from "../data/patients";
import { TreatmentModal } from "../components/TreatmentModal";
import { getStaffName, canEditMedicalRecords } from "../data/staffAuth"; 
import { useSearchFilter } from "../hooks/useSearchFilter";

const speciesOptions = [
  { value: "dog", label: "כלב", species: "כלב", icon: Dog },
  { value: "cat", label: "חתול", species: "חתול", icon: Cat },
  { value: "bird", label: "ציפור", species: "ציפור", icon: PawPrint },
  { value: "rabbit", label: "ארנב", species: "ארנב", icon: PawPrint },
  { value: "hamster", label: "אוגר", species: "אוגר", icon: PawPrint },
  { value: "other", label: "אחר", species: "אחר", icon: PawPrint },
] as const;

const genderOptions = [{ value: "זכר", label: "זכר" }, { value: "נקבה", label: "נקבה" }];

interface NewPatientForm {
  petName: string; speciesType: string; gender: string; breed: string; age: string;
  weight: string; microchip: string; allergies: string; ownerName: string;
  ownerId: string; ownerPhone: string; ownerEmail: string; ownerAddress: string;
}

const emptyForm: NewPatientForm = {
  petName: "", speciesType: "dog", gender: "זכר", breed: "", age: "", weight: "",
  microchip: "", allergies: "", ownerName: "", ownerId: "", ownerPhone: "", ownerEmail: "", ownerAddress: "",
};

export function Dashboard() {
  const [showWalkInPicker, setShowWalkInPicker] = useState(false);
  const [walkInSearch, setWalkInSearch] = useState("");
  const [modalView, setModalView] = useState<"list" | "new-patient">("list");
  const [newForm, setNewForm] = useState<NewPatientForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewPatientForm, boolean>>>({});
  const [treatmentPatient, setTreatmentPatient] = useState<{ id: number; petName: string; petSpecies: string; ownerName: string; } | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const canTreat = canEditMedicalRecords(); 

  const filteredPatients = useSearchFilter(patients, walkInSearch, (p) => [
    p.pet.name, p.owner.name, p.owner.phone, p.owner.email, p.pet.microchip,
  ]);

  const closeModal = () => {
    setShowWalkInPicker(false); setWalkInSearch(""); setModalView("list");
    setNewForm(emptyForm); setFormErrors({});
  };

  const handleSelectPatient = (p: Patient) => {
    closeModal();
    if (canTreat) {
      setTreatmentPatient({ id: p.id, petName: p.pet.name, petSpecies: p.pet.speciesType, ownerName: p.owner.name });
    } else {
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    }
  };

  const updateField = (field: keyof NewPatientForm, value: string) => {
    setNewForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: false }));
  };

  const validateAndSave = () => {
    const required: (keyof NewPatientForm)[] = ["petName", "speciesType", "breed", "ownerName", "ownerPhone"];
    const errors: Partial<Record<keyof NewPatientForm, boolean>> = {};
    required.forEach((key) => { if (!newForm[key].trim()) errors[key] = true; });
    
    if (Object.keys(errors).length > 0) return setFormErrors(errors);

    const newId = Math.max(...(patients || []).map((p) => p.id), 0) + 1;
    const specOpt = speciesOptions.find((s) => s.value === newForm.speciesType);
    
    const newPatient: Patient = {
      id: newId,
      pet: {
        id: newId, name: newForm.petName, species: specOpt?.species || newForm.speciesType,
        speciesType: newForm.speciesType as Patient["pet"]["speciesType"], gender: newForm.gender,
        age: parseInt(newForm.age) || 0, breed: newForm.breed, microchip: newForm.microchip || "",
        weight: newForm.weight ? `${newForm.weight} ק״ג` : "", allergies: newForm.allergies || "ללא",
      },
      owner: {
        id: newForm.ownerId || String(Date.now()).slice(-9), name: newForm.ownerName,
        phone: newForm.ownerPhone, address: newForm.ownerAddress || "", email: newForm.ownerEmail || "",
      },
      lastVisit: new Date().toLocaleDateString("he-IL"),
    };

    patients.push(newPatient);
    handleSelectPatient(newPatient);
  };

  const inputClass = (field: keyof NewPatientForm) =>
    `w-full px-3.5 py-2.5 border rounded-xl text-[14px] focus:outline-none focus:ring-2 transition-all ${
      formErrors[field] ? "border-red-300 bg-red-50/50 focus:ring-red-500/20" : "border-gray-200 bg-white focus:ring-orange-500/20"
    }`;

  const renderInput = (label: string, field: keyof NewPatientForm, placeholder: string, required = false, type = "text", extraProps = {}) => (
    <div>
      <label className="block text-gray-600 text-[12px] mb-1.5 font-medium">{label} {required && <span className="text-red-400">*</span>}</label>
      <input type={type} placeholder={placeholder} value={newForm[field]} onChange={(e) => updateField(field, e.target.value)} className={inputClass(field)} {...extraProps} />
    </div>
  );

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-8 relative">
      
      {showSuccessToast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[300] bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-3 rounded-2xl shadow-lg flex items-center gap-3 animate-in slide-in-from-top-5">
          <Check className="w-5 h-5 text-emerald-500" />
          <span className="font-bold text-[15px]">המטופל נרשם והתווסף לתור בהצלחה!</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900 text-[26px] font-bold">ברוך הבא, {getStaffName()} </h1>
          <p className="text-gray-500 mt-1 text-[15px]">סקירה כללית של פעילות המרפאה היום</p>
        </div>
        <button
          onClick={() => setShowWalkInPicker(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all text-[14px] font-semibold bg-gradient-to-l from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white cursor-pointer shadow-md shadow-orange-500/20"
        >
          <Zap className="w-4 h-4" /> טיפול ללא תור
        </button>
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
                  <p className="text-white/70 text-[12px]">{modalView === "list" ? "מזדמן / דחוף — בחרו מטופל להתחלת טיפול" : "מלאו את הפרטים ועברו ישירות לטיפול"}</p>
                </div>
              </div>
              <button onClick={closeModal} className="text-white/60 hover:text-white cursor-pointer p-1"><X className="w-5 h-5" /></button>
            </div>

            {modalView === "list" && (
              <div className="flex flex-col overflow-hidden">
                <div className="px-5 pt-5 pb-3 space-y-3 shrink-0">
                  <div className="relative">
                    <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500 font-medium pointer-events-none" />
                    {walkInSearch && <button onClick={() => setWalkInSearch("")} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-medium hover:text-gray-600 cursor-pointer"><X className="w-4 h-4" /></button>}
                    <input type="text" placeholder="חיפוש לפי שם חיה, בעלים, טלפון..." value={walkInSearch} onChange={(e) => setWalkInSearch(e.target.value)} autoFocus className="w-full pr-11 pl-10 py-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all text-[14px]" />
                  </div>
                  <button onClick={() => setModalView("new-patient")} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-orange-300 bg-orange-50/50 hover:bg-orange-50 hover:border-orange-400 rounded-xl transition-all cursor-pointer text-orange-600 text-[14px] font-semibold group">
                    <UserPlus className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" /> הכנסת מטופל חדש
                  </button>
                </div>

                <div className="overflow-y-auto px-3 pb-4">
                  {filteredPatients.length > 0 ? (
                    <div className="space-y-1">
                      {filteredPatients.map((patient) => {
                        const PetIcon = patient.pet.speciesType === "cat" ? Cat : Dog;
                        return (
                          <button key={patient.id} onClick={() => handleSelectPatient(patient)} className="w-full px-4 py-3.5 flex items-center gap-3.5 hover:bg-orange-50 rounded-xl transition-colors cursor-pointer text-right group">
                            <div className="bg-orange-50 group-hover:bg-orange-100 rounded-xl w-11 h-11 flex items-center justify-center shrink-0 transition-colors"><PetIcon className="w-5 h-5 text-orange-600" /></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5"><span className="text-gray-900 text-[15px] font-semibold">{patient.pet.name}</span><span className="text-gray-500 font-medium text-[12px]">{patient.pet.species} · {patient.pet.breed}</span></div>
                              <div className="flex items-center gap-3 text-[12px] text-gray-500"><span>{patient.owner.name}</span><span className="flex items-center gap-1"><Phone className="w-3 h-3" />{patient.owner.phone}</span></div>
                            </div>
                            <div className="bg-orange-100 text-orange-600 text-[13px] px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 font-semibold transition-opacity shrink-0">
                              {canTreat ? "התחל טיפול" : "הכנס ליומן"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 font-medium text-[14px]">לא נמצאו מטופלים עבור "{walkInSearch}"</p>
                      <button onClick={() => { setModalView("new-patient"); updateField("petName", walkInSearch); }} className="mt-3 text-orange-500 hover:text-orange-600 text-[13px] hover:underline font-semibold cursor-pointer"><UserPlus className="w-3.5 h-3.5 inline-block ml-1 -mt-0.5" /> רשמו מטופל חדש במקום</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {modalView === "new-patient" && (
              <div className="overflow-y-auto px-6 py-5">
                <div className="flex items-center gap-2 mb-4"><PawPrint className="w-4 h-4 text-orange-500" /><span className="text-gray-800 text-[15px] font-semibold">פרטי החיה</span></div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {renderInput("שם החיה", "petName", 'לדוגמה: "רקסי"', true)}
                  <div>
                    <label className="block text-gray-600 text-[12px] mb-1.5 font-medium">סוג חיה <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <select value={newForm.speciesType} onChange={(e) => updateField("speciesType", e.target.value)} className={`${inputClass("speciesType")} appearance-none cursor-pointer`}>
                        {speciesOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 font-medium pointer-events-none" />
                    </div>
                  </div>
                  {renderInput("גזע", "breed", "לדוגמה: גולדן רטריבר", true)}
                  <div>
                    <label className="block text-gray-600 text-[12px] mb-1.5 font-medium">מין</label>
                    <div className="flex gap-2">
                      {genderOptions.map((g) => (
                        <button key={g.value} onClick={() => updateField("gender", g.value)} className={`flex-1 py-2.5 rounded-xl text-[13px] border font-medium cursor-pointer ${newForm.gender === g.value ? "bg-orange-50 border-orange-300 text-orange-700" : "bg-white border-gray-200 text-gray-500"}`}>{g.label}</button>
                      ))}
                    </div>
                  </div>
                  {renderInput("גיל (שנים)", "age", "0", false, "number", { min: "0" })}
                  {renderInput("משקל (ק״ג)", "weight", "0.0", false, "number", { min: "0", step: "0.1" })}
                  <div className="col-span-2">{renderInput("מספר שבב", "microchip", "מספר מיקרוצ׳יפ (אופציונלי)", false, "text", { className: `${inputClass("microchip")} font-mono` })}</div>
                  <div className="col-span-2">{renderInput("אלרגיות / הערות", "allergies", "לדוגמה: רגישות לפניצילין (אופציונלי)")}</div>
                </div>

                <div className="border-t border-gray-100 my-5" />

                <div className="flex items-center gap-2 mb-4"><User className="w-4 h-4 text-orange-500" /><span className="text-gray-800 text-[15px] font-semibold">פרטי הבעלים</span></div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {renderInput("שם הבעלים", "ownerName", "שם מלא", true)}
                  {renderInput("טלפון", "ownerPhone", "05X-XXXXXXX", true, "tel", { dir: "ltr", style: { textAlign: "right" } })}
                  {renderInput("ת.ז.", "ownerId", "מספר זהות (אופציונלי)")}
                  {renderInput("אימייל", "ownerEmail", "כתובת אימייל (אופציונלי)", false, "email", { dir: "ltr", style: { textAlign: "right" } })}
                  <div className="col-span-2">{renderInput("כתובת", "ownerAddress", "כתובת מגורים (אופציונלי)")}</div>
                </div>

                <div className="flex items-center gap-3 pt-2 pb-1">
                  <button onClick={validateAndSave} className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-l from-orange-500 to-amber-500 hover:from-orange-600 text-white py-3 rounded-xl cursor-pointer shadow-md font-semibold text-[15px]">
                    {canTreat ? <><Zap className="w-4.5 h-4.5" /> שמור והתחל טיפול</> : "שמור והכנס ליומן הממתינים"}
                  </button>
                  <button onClick={() => { setModalView("list"); setNewForm(emptyForm); setFormErrors({}); }} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 font-medium cursor-pointer text-[14px]">ביטול</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {treatmentPatient && (
        <TreatmentModal
          isOpen={true} onClose={() => setTreatmentPatient(null)}
          petName={treatmentPatient.petName} petSpecies={treatmentPatient.petSpecies}
          ownerName={treatmentPatient.ownerName} patientId={treatmentPatient.id} onSave={() => setTreatmentPatient(null)}
        />
      )}
    </main>
  );
}