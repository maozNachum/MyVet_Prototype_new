import { Clock, X, Dog, Cat, Calendar, Building2, Stethoscope, AlertTriangle, Activity, Pill, ClipboardList } from "lucide-react";
import { useState } from "react";
import { TreatmentModal } from "./TreatmentModal";
import { patients } from "../data/patients";
import { canEditMedicalRecords } from "../data/staffAuth";
import { useAppointmentStore } from "../data/AppointmentStore";

const TableSkeletonRow = () => (
  <tr className="animate-pulse border-b border-gray-50">
    <td className="px-6 py-5"><div className="h-4 w-12 bg-gray-100 rounded-md"></div></td>
    <td className="px-6 py-5"><div className="h-6 w-20 bg-gray-100 rounded-full"></div></td>
    <td className="px-6 py-5"><div className="h-4 w-24 bg-gray-100 rounded-md"></div></td>
    <td className="px-6 py-5">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-gray-100 rounded-full"></div>
        <div className="h-4 w-20 bg-gray-100 rounded-md"></div>
      </div>
    </td>
    <td className="px-6 py-5"><div className="h-4 w-28 bg-gray-100 rounded-md"></div></td>
    <td className="px-6 py-5"><div className="h-6 w-24 bg-gray-100 rounded-full"></div></td>
    <td className="px-6 py-5"><div className="h-8 w-24 bg-gray-100 rounded-lg ml-auto"></div></td>
  </tr>
);

const getStatusUI = (idx: number) => {
  switch(idx) {
    case 0:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 text-[12px]" style={{fontWeight: 600}}><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> ממתין בקבלה</span>;
    case 1:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 text-[12px]" style={{fontWeight: 600}}><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span> בטיפול</span>;
    case 2:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 text-[12px]" style={{fontWeight: 600}}><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> באיחור</span>;
    default:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-200 text-[12px]" style={{fontWeight: 600}}><span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span> טרם הגיע</span>;
  }
};

const getMedicalAlerts = (idx: number) => {
  if (idx === 1) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100 text-[10px] font-bold" title="אלרגי לפניצילין"><AlertTriangle className="w-3 h-3" /> אלרגי</span>;
  if (idx === 2) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 text-[10px] font-bold" title="זקוק למחסום פה">⚠️ מחסום פה</span>;
  return null;
};

// נתוני דמה לתקציר הרפואי שיקפוץ במודל
const mockMedicalSnapshot = {
  chronic: ["אי ספיקת כליות כרונית (CKD)", "דלקת מפרקים ניוונית"],
  meds: ["Semintra 4mg", "Rimadyl 25mg (לפי צורך)"],
  allergies: ["פניצילין", "רגישות לחיסון משושה (נפיחות)"],
  lastVitals: { temp: "38.5", weight: "12.4", date: "15/02/2026" }
};

export function AppointmentsTable() {
  const { calendarAppointments, isLoading } = useAppointmentStore();
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [treatmentAppt, setTreatmentAppt] = useState<any | null>(null);

  // הגנה מפני קריסה במקרה והנתונים ריקים
  const todayAppointments = calendarAppointments?.slice(0, 6) || []; 
  const canTreat = canEditMedicalRecords(); 

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-8">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 rounded-lg p-2">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-gray-900 text-[18px]" style={{ fontWeight: 600 }}>תקציר תורים להיום</h2>
          </div>
          <span className="text-gray-500 font-medium text-[14px]">
            {isLoading ? "טוען..." : `${todayAppointments.length} תורים`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100/60 border-b border-gray-200">
                <th className="text-right px-6 py-3.5 text-gray-700 text-[14px]" style={{ fontWeight: 700 }}>שעה</th>
                <th className="text-right px-6 py-3.5 text-gray-700 text-[14px]" style={{ fontWeight: 700 }}>סטטוס</th>
                <th className="text-right px-6 py-3.5 text-gray-700 text-[14px]" style={{ fontWeight: 700 }}>שם בעלים</th>
                <th className="text-right px-6 py-3.5 text-gray-700 text-[14px]" style={{ fontWeight: 700 }}>שם חיית מחמד</th>
                <th className="text-right px-6 py-3.5 text-gray-700 text-[14px]" style={{ fontWeight: 700 }}>סוג טיפול</th>
                <th className="text-right px-6 py-3.5 text-gray-700 text-[14px]" style={{ fontWeight: 700 }}>מחלקה / יעד</th>
                <th className="text-right px-6 py-3.5 text-gray-700 text-[14px] w-32" style={{ fontWeight: 700 }}>פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <><TableSkeletonRow /><TableSkeletonRow /><TableSkeletonRow /><TableSkeletonRow /></>
              ) : (
                todayAppointments.map((appt, idx) => (
                  <tr key={appt.id} onClick={() => setSelectedAppt(appt)} className="hover:bg-blue-50/30 transition-colors cursor-pointer group">
                    <td className="px-6 py-4 text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{appt.time}</td>
                    <td className="px-6 py-4">{getStatusUI(idx)}</td>
                    <td className="px-6 py-4 text-gray-600 text-[14px]">{appt.ownerName}</td>
                    <td className="px-6 py-4 text-gray-600 text-[14px]">
                      <div className="flex items-center gap-2">
                        {appt.petSpecies === "dog" ? <Dog className="w-4 h-4 text-gray-500 font-medium shrink-0" /> : <Cat className="w-4 h-4 text-gray-500 font-medium shrink-0" />}
                        <span className="whitespace-nowrap">{appt.petName}</span>
                        {getMedicalAlerts(idx)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-[14px]">{appt.type}</td>
                    <td className="px-6 py-4">
                      {appt.department === "וטרינר פרטי" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[12px]" style={{ fontWeight: 500 }}>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> וטרינר פרטי
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[12px]" style={{ fontWeight: 500 }}>
                          <Building2 className="w-3 h-3" /> {appt.department}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end">
                        {canTreat && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setTreatmentAppt(appt); }}
                            className="flex items-center gap-1.5 border border-blue-200 bg-transparent text-blue-700 hover:bg-blue-50/70 hover:border-blue-300 px-3.5 py-1.5 rounded-full text-[13px] transition-all cursor-pointer font-medium"
                          >
                            <Stethoscope className="w-3.5 h-3.5 opacity-80" /> התחל טיפול
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Medical Snapshot Modal (תקציר רפואי חכם) */}
      {selectedAppt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4" onClick={() => setSelectedAppt(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  {selectedAppt.petSpecies === "dog" ? <Dog className="w-6 h-6 text-white" /> : <Cat className="w-6 h-6 text-white" />}
                </div>
                <div>
                  <h3 className="text-white text-[20px]" style={{ fontWeight: 700 }}>{selectedAppt.petName}</h3>
                  <p className="text-white/80 text-[13px]">{selectedAppt.ownerName} | {selectedAppt.petSpecies === "dog" ? "כלב" : "חתול"} מעורב, בן 4</p>
                </div>
              </div>
              <button onClick={() => setSelectedAppt(null)} className="text-white/60 hover:text-white cursor-pointer p-1"><X className="w-6 h-6" /></button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-5">
                <div>
                  <h4 className="flex items-center gap-2 text-gray-800 text-[14px] mb-2" style={{ fontWeight: 700 }}>
                    <AlertTriangle className="w-4 h-4 text-red-500" /> רגישויות ואזהרות
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {mockMedicalSnapshot.allergies.map((a, i) => (
                      <span key={i} className="bg-red-50 text-red-700 border border-red-100 px-2.5 py-1 rounded-lg text-[12px] font-semibold">{a}</span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="flex items-center gap-2 text-gray-800 text-[14px] mb-2" style={{ fontWeight: 700 }}>
                    <ClipboardList className="w-4 h-4 text-blue-500" /> רקע רפואי כרוני
                  </h4>
                  <ul className="space-y-1.5">
                    {mockMedicalSnapshot.chronic.map((c, i) => (
                      <li key={i} className="text-gray-600 text-[13px] bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">{c}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="flex items-center gap-2 text-gray-800 text-[14px] mb-2" style={{ fontWeight: 700 }}>
                    <Pill className="w-4 h-4 text-indigo-500" /> תרופות קבועות
                  </h4>
                  <ul className="space-y-1.5">
                    {mockMedicalSnapshot.meds.map((m, i) => (
                      <li key={i} className="text-gray-600 text-[13px] bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">{m}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-5">
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                  <h4 className="flex items-center gap-2 text-blue-800 text-[14px] mb-3" style={{ fontWeight: 700 }}>
                    <Calendar className="w-4 h-4 text-blue-500" /> פרטי הביקור להיום
                  </h4>
                  <div className="space-y-3">
                    <div><p className="text-gray-500 text-[11px] font-semibold">סוג טיפול</p><p className="text-gray-900 text-[14px] font-bold">{selectedAppt.type}</p></div>
                    <div className="flex justify-between">
                      <div><p className="text-gray-500 text-[11px] font-semibold">שעה</p><p className="text-gray-900 text-[14px] font-bold">{selectedAppt.time}</p></div>
                      <div><p className="text-gray-500 text-[11px] font-semibold">רופא מטפל</p><p className="text-gray-900 text-[14px] font-bold">{selectedAppt.vet}</p></div>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="flex items-center gap-2 text-emerald-800 text-[14px]" style={{ fontWeight: 700 }}>
                      <Activity className="w-4 h-4 text-emerald-500" /> מדדים אחרונים
                    </h4>
                    <span className="text-emerald-600 text-[10px] font-bold">{mockMedicalSnapshot.lastVitals.date}</span>
                  </div>
                  <div className="flex gap-4">
                    <div><p className="text-gray-500 text-[11px] font-semibold">משקל</p><p className="text-gray-900 text-[15px] font-bold">{mockMedicalSnapshot.lastVitals.weight} ק״ג</p></div>
                    <div><p className="text-gray-500 text-[11px] font-semibold">חום</p><p className="text-gray-900 text-[15px] font-bold">{mockMedicalSnapshot.lastVitals.temp}°C</p></div>
                  </div>
                </div>
              </div>

            </div>

            <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 flex gap-3">
              <button
                className={`flex-1 py-3 rounded-xl transition-colors text-[14px] shadow-sm ${canTreat ? "bg-[#1e40af] hover:bg-[#1e3a8a] text-white cursor-pointer" : "bg-gray-200 text-gray-500 font-medium cursor-not-allowed"}`}
                style={{ fontWeight: 600 }}
                onClick={() => {
                  if (canTreat) {
                    setTreatmentAppt(selectedAppt);
                    setSelectedAppt(null);
                  }
                }}
                disabled={!canTreat}
              >
                {canTreat ? "התחל טיפול בתיק" : "🔒 מורשים בלבד"}
              </button>
              <button onClick={() => setSelectedAppt(null)} className="px-6 py-3 border border-gray-200 bg-white rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-[14px] font-bold cursor-pointer">
                סגור תצוגה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Treatment Modal */}
      {treatmentAppt && (
        <TreatmentModal
          isOpen={true}
          onClose={() => setTreatmentAppt(null)}
          petName={treatmentAppt.petName}
          petSpecies={treatmentAppt.petSpecies}
          ownerName={treatmentAppt.ownerName}
          patientId={patients?.find((p) => p.pet.name === treatmentAppt.petName)?.id}
        />
      )}
    </>
  );
}