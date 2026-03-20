import { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Eye,
  Search,
  Cat,
  Dog,
  AlertTriangle,
  Calendar,
  AlertCircle,
  CalendarCheck,
  ChevronLeft,
  Stethoscope,
  ArrowRight,
  Phone,
  CreditCard,
  Download,
  Mail,
} from "lucide-react";
import { patients } from "../data/patients";
import type { Patient } from "../data/patients";
import { useSearchParams } from "react-router";
import { TreatmentModal } from "../components/TreatmentModal";
import { useMedicalStore } from "../data/MedicalStore";
import { exportMedicalRecord } from "../hooks/useExportMedicalRecord";
import { canEditMedicalRecords } from "../data/staffAuth";
import { LabResultsPanel } from "../components/LabResultsPanel";
import { useSearchFilter } from "../hooks/useSearchFilter";
import { VISIT_TYPES } from "../data/categoryConfig";

type TabKey = "list" | "register";

export function Patients() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isTreatmentOpen, setIsTreatmentOpen] = useState(false);
  const { getVisitsForPatient } = useMedicalStore();

  useEffect(() => {
    const selectedId = searchParams.get("selected");
    if (selectedId) {
      const found = patients.find((p) => p.id === Number(selectedId));
      if (found) {
        setSelectedPatient(found);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, setSearchParams]);

  const [formData, setFormData] = useState({
    ownerId: "",
    ownerName: "",
    address: "",
    phone: "",
    email: "",
    microchipNumber: "",
    petName: "",
    species: "",
    breed: "",
    birthDate: "",
    allergies: "",
  });

  // ── Centralised search via shared hook ──
  const filtered = useSearchFilter(patients, searchQuery, (p) => [
    p.pet.name,
    p.owner.name,
    p.owner.phone,
    p.owner.email,
    p.pet.microchip,
    p.owner.id,
  ]);

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("הנתונים נשמרו בהצלחה!");
  };

  const patientHistory = selectedPatient
    ? getVisitsForPatient(selectedPatient.id)
    : [];

  // ── Patient Profile View ──
  if (selectedPatient) {
    const pet = selectedPatient.pet;
    const owner = selectedPatient.owner;
    const PetIcon = pet.speciesType === "cat" ? Cat : Dog;

    return (
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Back Button */}
        <button
          onClick={() => setSelectedPatient(null)}
          className="flex items-center gap-2 text-[#1e40af] hover:text-[#1e3a8a] mb-6 cursor-pointer transition-colors text-[15px]"
          style={{ fontWeight: 500 }}
        >
          <ArrowRight className="w-4 h-4" />
          חזרה לרשימת מטופלים
        </button>

        {/* Pet Identity Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="flex flex-wrap items-start gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl w-[88px] h-[88px] flex items-center justify-center shrink-0">
              <PetIcon className="w-11 h-11 text-[#1e40af]" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h2 className="text-gray-900 text-[24px]" style={{ fontWeight: 700 }}>
                  {pet.name}
                </h2>
                <span className="text-gray-500 text-[15px]">
                  {pet.species}, {pet.gender}, בן {pet.age}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-8 gap-y-2 text-[14px] text-gray-500 mb-3">
                <span>
                  <span style={{ fontWeight: 500 }} className="text-gray-700">גזע:</span>{" "}
                  {pet.breed}
                </span>
                <span>
                  <span style={{ fontWeight: 500 }} className="text-gray-700">משקל:</span>{" "}
                  {pet.weight}
                </span>
                <span>
                  <span style={{ fontWeight: 500 }} className="text-gray-700">שבב:</span>{" "}
                  {pet.microchip}
                </span>
                <span>
                  <span style={{ fontWeight: 500 }} className="text-gray-700">בעלים:</span>{" "}
                  {owner.name} ({owner.phone})
                </span>
              </div>

              {pet.allergies && (
                <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-red-700 text-[14px]" style={{ fontWeight: 600 }}>
                    אלרגיות: {pet.allergies}
                  </span>
                </div>
              )}

              <div className="shrink-0 flex flex-col gap-1 mr-auto">
                <button
                  onClick={() => exportMedicalRecord(selectedPatient, patientHistory)}
                  className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[12px] border border-transparent hover:border-emerald-200 w-fit"
                  style={{ fontWeight: 500 }}
                >
                  <Download className="w-3.5 h-3.5" />
                  ייצוא תיק רפואי לאקסל
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Current Visit Card */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
              <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <CalendarCheck className="w-5 h-5 text-white/90" />
                  <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>
                    ביקור נוכחי
                  </h3>
                </div>
              </div>

              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center gap-3 text-[14px] text-gray-500 mb-5">
                  <span>
                    <span style={{ fontWeight: 500 }} className="text-gray-700">תאריך:</span>{" "}
                    {selectedPatient.lastVisit}
                  </span>
                  <span className="text-gray-300">|</span>
                  <span>
                    <span style={{ fontWeight: 500 }} className="text-gray-700">שעה:</span>{" "}
                    10:30
                  </span>
                </div>

                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-5 mb-6">
                  <p className="text-gray-500 text-[13px] mb-1" style={{ fontWeight: 500 }}>
                    סיבת הגעה
                  </p>
                  <p className="text-gray-900 text-[16px]" style={{ fontWeight: 600 }}>
                    חיסון שנתי ובדיקה כללית
                  </p>
                </div>

                <div className="text-[14px] text-gray-500 mb-6">
                  <span style={{ fontWeight: 500 }} className="text-gray-700">
                    רופא מטפל:
                  </span>{" "}
                  ד"ר יוסי כהן
                </div>

                <div className="mt-auto">
                  {canEditMedicalRecords() ? (
                    <button
                      className="w-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white py-3.5 rounded-xl transition-colors shadow-sm cursor-pointer text-[15px] flex items-center justify-center gap-2"
                      style={{ fontWeight: 600 }}
                      onClick={() => setIsTreatmentOpen(true)}
                    >
                      התחל טיפול בתיק רפואי
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  ) : (
                    <div
                      className="w-full bg-gray-100 text-gray-400 py-3.5 rounded-xl text-[15px] flex items-center justify-center gap-2 border border-gray-200"
                      style={{ fontWeight: 500 }}
                    >
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

          {/* Medical History — uses VISIT_TYPES from centralised config */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>
                  היסטוריה רפואית
                </h3>
                <span className="text-gray-400 text-[13px]">
                  {patientHistory.length} ביקורים
                </span>
              </div>

              <div className="p-6">
                {patientHistory.length > 0 ? (
                  <div className="relative">
                    <div className="absolute right-[19px] top-4 bottom-4 w-px bg-gray-200" />
                    <div className="space-y-0">
                      {patientHistory.map((visit, index) => {
                        const cfg =
                          VISIT_TYPES[visit.type as keyof typeof VISIT_TYPES] ??
                          VISIT_TYPES.checkup;
                        const IconComponent = cfg.icon;
                        return (
                          <div key={visit.id} className="relative flex gap-5">
                            <div
                              className={`relative z-10 w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${cfg.color}`}
                            >
                              <IconComponent className="w-5 h-5" />
                            </div>
                            <div
                              className={`flex-1 ${
                                index === patientHistory.length - 1 ? "pb-0" : "pb-7"
                              }`}
                            >
                              <div className="flex items-center gap-3 mb-1">
                                <span className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>
                                  {visit.title}
                                </span>
                                <span className="text-gray-400 text-[13px]">{visit.date}</span>
                              </div>
                              <p className="text-gray-500 text-[14px] mb-1">{visit.description}</p>
                              <p className="text-gray-400 text-[13px]">{visit.vet}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-400">
                    <Stethoscope className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p>אין היסטוריה רפואית</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Lab Results */}
        <div className="mt-8">
          <LabResultsPanel patientId={selectedPatient.id} petName={pet.name} />
        </div>

        {/* Treatment Modal */}
        <TreatmentModal
          isOpen={isTreatmentOpen}
          onClose={() => setIsTreatmentOpen(false)}
          petName={pet.name}
          petSpecies={pet.speciesType}
          ownerName={owner.name}
          patientId={selectedPatient.id}
        />
      </main>
    );
  }

  // ── Patient List & Registration ──
  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-blue-100 rounded-xl p-2.5">
          <Users className="w-6 h-6 text-[#1e40af]" />
        </div>
        <div>
          <h1 className="text-gray-900 text-[22px]" style={{ fontWeight: 700 }}>
            מטופלים
          </h1>
          <p className="text-gray-500 text-[14px]">ניהול מטופלים, רישום חדשים וצפייה בתיקים</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-8 w-fit">
        <button
          onClick={() => setActiveTab("list")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all cursor-pointer text-[14px] ${
            activeTab === "list"
              ? "bg-white text-[#1e40af] shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
          style={{ fontWeight: activeTab === "list" ? 600 : 400 }}
        >
          <Eye className="w-4 h-4" />
          צפייה במטופלים
        </button>
        <button
          onClick={() => setActiveTab("register")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all cursor-pointer text-[14px] ${
            activeTab === "register"
              ? "bg-white text-[#1e40af] shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
          style={{ fontWeight: activeTab === "register" ? 600 : 400 }}
        >
          <UserPlus className="w-4 h-4" />
          רישום מטופל חדש
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "list" ? (
        <>
          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-lg">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="חיפוש לפי שם חיה, בעלים, טלפון או שבב..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-11 pl-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors text-[15px]"
              />
            </div>
          </div>

          {/* Patient Cards Grid */}
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
                        <h3 className="text-gray-900 text-[16px] truncate" style={{ fontWeight: 600 }}>
                          {patient.pet.name}
                        </h3>
                        <span className="text-gray-400 text-[13px] shrink-0">
                          {patient.pet.species}, {patient.pet.gender}
                        </span>
                      </div>
                      <p className="text-gray-500 text-[13px]">
                        {patient.pet.breed} · בן {patient.pet.age}
                      </p>
                    </div>
                    {patient.pet.allergies && (
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-1" />
                    )}
                  </div>

                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <div className="flex items-center gap-2 text-[13px] text-gray-500">
                      <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                      <span style={{ fontWeight: 500 }} className="text-gray-600">
                        {patient.owner.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-gray-500">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <span>{patient.owner.phone}</span>
                    </div>
                    {patient.owner.email && (
                      <div className="flex items-center gap-2 text-[13px] text-gray-500">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        <span className="truncate">{patient.owner.email}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[13px] text-gray-500">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>ביקור אחרון: {patient.lastVisit}</span>
                      </div>
                      {patient.nextAppointment && (
                        <span
                          className="bg-blue-50 text-blue-600 text-[11px] px-2 py-0.5 rounded-full border border-blue-200"
                          style={{ fontWeight: 500 }}
                        >
                          תור: {patient.nextAppointment}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-[15px]">לא נמצאו מטופלים תואמים</p>
            </div>
          )}
        </>
      ) : (
        /* Registration Form */
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Owner Details */}
              <div className="space-y-6">
                <h2
                  className="text-gray-900 text-[19px] mb-6 pb-3 border-b border-gray-200"
                  style={{ fontWeight: 600 }}
                >
                  פרטי בעלים
                </h2>
                {[
                  { id: "ownerId", label: "תעודת זהות", type: "text", placeholder: "הזן מספר תעודת זהות", required: true },
                  { id: "ownerName", label: "שם מלא", type: "text", placeholder: "הזן שם מלא", required: true },
                  { id: "address", label: "כתובת", type: "text", placeholder: "רחוב, עיר, מיקוד", required: true },
                  { id: "phone", label: "טלפון", type: "tel", placeholder: "050-1234567", required: true },
                  { id: "email", label: 'כתובת דוא"ל', type: "email", placeholder: 'הזן כתובת דוא"ל', required: false },
                ].map((field) => (
                  <div key={field.id}>
                    <label htmlFor={field.id} className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      id={field.id}
                      name={field.id}
                      value={formData[field.id as keyof typeof formData]}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]"
                      placeholder={field.placeholder}
                      required={field.required}
                    />
                  </div>
                ))}
              </div>

              {/* Pet Details */}
              <div className="space-y-6">
                <h2
                  className="text-gray-900 text-[19px] mb-6 pb-3 border-b border-gray-200"
                  style={{ fontWeight: 600 }}
                >
                  פרטי חיית מחמד
                </h2>
                <div>
                  <label htmlFor="microchipNumber" className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>מספר שבב</label>
                  <input type="text" id="microchipNumber" name="microchipNumber" value={formData.microchipNumber} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]" placeholder="הזן מספר שבב" />
                </div>
                <div>
                  <label htmlFor="petName" className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>שם החיה</label>
                  <input type="text" id="petName" name="petName" value={formData.petName} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]" placeholder="הזן שם החיה" required />
                </div>
                <div>
                  <label htmlFor="species" className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>סוג</label>
                  <select id="species" name="species" value={formData.species} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px] bg-white" required>
                    <option value="">בחר סוג חיה</option>
                    <option value="dog">כלב</option>
                    <option value="cat">חתול</option>
                    <option value="bird">ציפור</option>
                    <option value="rabbit">ארנב</option>
                    <option value="hamster">אוגר</option>
                    <option value="other">אחר</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="breed" className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>גזע</label>
                  <select id="breed" name="breed" value={formData.breed} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px] bg-white" required>
                    <option value="">בחר גזע</option>
                    <option value="golden-retriever">גולדן רטריבר</option>
                    <option value="labrador">לברדור</option>
                    <option value="german-shepherd">רועה גרמני</option>
                    <option value="persian-cat">חתול פרסי</option>
                    <option value="siamese">סיאמי</option>
                    <option value="mixed">מעורב</option>
                    <option value="other">אחר</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="birthDate" className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>תאריך לידה</label>
                  <div className="relative">
                    <input type="date" id="birthDate" name="birthDate" value={formData.birthDate} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]" required />
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label htmlFor="allergies" className="flex items-center gap-2 text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <span>אלרגיות / רגישויות</span>
                  </label>
                  <textarea id="allergies" name="allergies" value={formData.allergies} onChange={handleFormChange} rows={4} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px] resize-none" placeholder="פרט כל אלרגיה או רגישות ידועה..." />
                </div>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-gray-200">
              <button
                type="submit"
                className="bg-[#1e40af] text-white px-8 py-3 rounded-lg hover:bg-[#1e3a8a] transition-colors shadow-sm text-[15px] cursor-pointer"
                style={{ fontWeight: 600 }}
              >
                שמור נתונים במערכת
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
