import { Clock, ChevronLeft, X, Dog, Cat, Stethoscope, Calendar, Building2 } from "lucide-react";
import { useState } from "react";
import { TreatmentModal } from "./TreatmentModal";
import { patients } from "../data/patients";
import { canEditMedicalRecords } from "../data/staffAuth";
import { useAppointmentStore } from "../data/AppointmentStore"; // חיבור לחנות המשודרגת

// רכיב פנימי להצגת שורת טעינה (Skeleton)
const TableSkeletonRow = () => (
  <tr className="animate-pulse border-b border-gray-50">
    <td className="px-6 py-5"><div className="h-4 w-12 bg-gray-100 rounded-md"></div></td>
    <td className="px-6 py-5"><div className="h-4 w-24 bg-gray-100 rounded-md"></div></td>
    <td className="px-6 py-5">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-gray-100 rounded-full"></div>
        <div className="h-4 w-20 bg-gray-100 rounded-md"></div>
      </div>
    </td>
    <td className="px-6 py-5"><div className="h-4 w-28 bg-gray-100 rounded-md"></div></td>
    <td className="px-6 py-5"><div className="h-6 w-24 bg-gray-100 rounded-full"></div></td>
    <td className="px-6 py-5"><div className="h-4 w-16 bg-gray-100 rounded-md ml-auto"></div></td>
  </tr>
);

export function AppointmentsTable() {
  const { calendarAppointments, isLoading } = useAppointmentStore(); // משיכת נתונים ומצב טעינה
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [treatmentAppt, setTreatmentAppt] = useState<any | null>(null);

  // סינון תורים להיום (כאן אפשר להוסיף לוגיקה שבודקת התאמה לתאריך הנוכחי)
  const todayAppointments = calendarAppointments.slice(0, 6); 

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 rounded-lg p-2">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-gray-900" style={{ fontWeight: 600 }}>
              תורים להיום
            </h2>
          </div>
          <span className="text-gray-400 text-[14px]">
            {isLoading ? "טוען..." : `${todayAppointments.length} תורים`}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="text-right px-6 py-3.5 text-gray-500 text-[13px]" style={{ fontWeight: 600 }}>שעה</th>
                <th className="text-right px-6 py-3.5 text-gray-500 text-[13px]" style={{ fontWeight: 600 }}>שם בעלים</th>
                <th className="text-right px-6 py-3.5 text-gray-500 text-[13px]" style={{ fontWeight: 600 }}>שם חיית מחמד</th>
                <th className="text-right px-6 py-3.5 text-gray-500 text-[13px]" style={{ fontWeight: 600 }}>סוג טיפול</th>
                <th className="text-right px-6 py-3.5 text-gray-500 text-[13px]" style={{ fontWeight: 600 }}>מחלקה / יעד</th>
                <th className="text-right px-6 py-3.5 text-gray-500 text-[13px]" style={{ fontWeight: 600 }}>פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                // הצגת Skeletons בזמן טעינה
                <>
                  <TableSkeletonRow />
                  <TableSkeletonRow />
                  <TableSkeletonRow />
                  <TableSkeletonRow />
                </>
              ) : (
                todayAppointments.map((appt) => (
                  <tr
                    key={appt.id}
                    onClick={() => setSelectedAppt(appt)}
                    className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 text-gray-900" style={{ fontWeight: 500 }}>{appt.time}</td>
                    <td className="px-6 py-4 text-gray-700">{appt.ownerName}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="flex items-center gap-2">
                        {appt.petSpecies === "dog" ? <Dog className="w-4 h-4 text-gray-400" /> : <Cat className="w-4 h-4 text-gray-400" />}
                        {appt.petName}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{appt.type}</td>
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
                      <span className="inline-flex items-center gap-1 text-[#1e40af] text-[13px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontWeight: 500 }}>
                        צפה בפרטים <ChevronLeft className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Appointment Detail Modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4" onClick={() => setSelectedAppt(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-white/80" />
                <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>פרטי תור</h3>
              </div>
              <button onClick={() => setSelectedAppt(null)} className="text-white/60 hover:text-white cursor-pointer p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl flex items-center justify-center">
                  {selectedAppt.petSpecies === "dog" ? <Dog className="w-7 h-7 text-[#1e40af]" /> : <Cat className="w-7 h-7 text-[#1e40af]" />}
                </div>
                <div>
                  <h4 className="text-gray-900 text-[20px]" style={{ fontWeight: 700 }}>{selectedAppt.petName}</h4>
                  <p className="text-gray-500 text-[14px]">{selectedAppt.type || selectedAppt.treatmentType}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-xl p-4"><p className="text-gray-400 text-[12px] mb-1">שעה</p><p className="text-gray-900 text-[16px]" style={{ fontWeight: 600 }}>{selectedAppt.time}</p></div>
                <div className="bg-gray-50 rounded-xl p-4"><p className="text-gray-400 text-[12px] mb-1">חדר</p><p className="text-gray-900 text-[16px]" style={{ fontWeight: 600 }}>{selectedAppt.room || "—"}</p></div>
                <div className="bg-gray-50 rounded-xl p-4"><p className="text-gray-400 text-[12px] mb-1">בעלים</p><p className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{selectedAppt.ownerName}</p></div>
                <div className="bg-gray-50 rounded-xl p-4"><p className="text-gray-400 text-[12px] mb-1">רופא מטפל</p><p className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{selectedAppt.vet}</p></div>
              </div>
              <div className="flex gap-3">
                <button
                  className={`flex-1 py-3 rounded-xl transition-colors text-[14px] shadow-sm ${canEditMedicalRecords() ? "bg-[#1e40af] hover:bg-[#1e3a8a] text-white cursor-pointer" : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"}`}
                  style={{ fontWeight: 600 }}
                  onClick={() => {
                    if (canEditMedicalRecords()) {
                      setTreatmentAppt(selectedAppt);
                      setSelectedAppt(null);
                    }
                  }}
                  disabled={!canEditMedicalRecords()}
                >
                  {canEditMedicalRecords() ? "התחל טיפול" : "🔒 מורשים בלבד"}
                </button>
                <button onClick={() => setSelectedAppt(null)} className="px-6 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-[14px]">סגור</button>
              </div>
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
          patientId={patients.find((p) => p.pet.name === treatmentAppt.petName)?.id}
        />
      )}
    </>
  );
}