import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useAppointmentStore, type PetSpecies } from "../data/AppointmentStore";
import { addMinutes, DEPARTMENTS, ROOMS, VETS } from "../data/calendar-constants";
import { supabase } from "../../services/supabaseClient";
import {
  ArrowRight,
  Calendar,
  Clock,
  User,
  Search,
  Phone,
  Stethoscope,
  MapPin,
  FileText,
  Loader2,
} from "lucide-react";

const appointmentSchema = z.object({
  patient: z.string().min(1, "חובה לבחור לקוח/חיה"),
  ownerPhone: z.string().min(1, "חובה להזין טלפון בעלים"),
  date: z.string().min(1, "חובה לבחור תאריך"),
  time: z.string().min(1, "חובה לבחור שעה"),
  reason: z.string().min(1, "חובה לבחור סיבת ביקור"),
  urgency: z.string().min(1, "חובה לבחור רמת דחיפות"),
  vet: z.string().min(1, "חובה לבחור רופא מטפל"),
  department: z.string().min(1, "חובה לבחור מחלקה"),
  room: z.string().min(1, "חובה לבחור חדר"),
  notes: z.string().optional(),
});

type AppointmentFormValues = z.infer<typeof appointmentSchema>;

interface PatientOption {
  petId: number;
  petName: string;
  species: PetSpecies;
  breed: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
}

function normalizeSpecies(species?: string | null): PetSpecies {
  const value = (species || "").toLowerCase().trim();
  if (value === "cat" || value === "חתול") return "cat";
  if (value === "dog" || value === "כלב") return "dog";
  return "other";
}

function fullName(first?: string | null, last?: string | null) {
  return `${first || ""} ${last || ""}`.trim();
}

function urgencyToColor(urgency: string) {
  if (urgency === "urgent") return "red";
  if (urgency === "high") return "amber";
  return "blue";
}

function speciesLabel(species: PetSpecies) {
  if (species === "dog") return "כלב";
  if (species === "cat") return "חתול";
  return "אחר";
}

export function NewAppointment() {
  const navigate = useNavigate();
  const { addAppointment } = useAppointmentStore();
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    mode: "onChange",
    defaultValues: {
      patient: "",
      date: "",
      time: "",
      reason: "",
      vet: "",
      department: "פנימית",
      room: "חדר 1",
      notes: "",
      ownerPhone: "",
      urgency: "normal",
    },
  });

  const selectedPatientId = watch("patient");
  const selectedPatient = useMemo(
    () => patients.find((p) => String(p.petId) === selectedPatientId),
    [patients, selectedPatientId]
  );

  useEffect(() => {
    async function loadPatients() {
      try {
        setIsLoadingPatients(true);

        const { data: patientRows, error: patientError } = await supabase
          .from("patients")
          .select("pet_id, pet_name, species, breed, owner_id")
          .order("pet_name", { ascending: true });

        if (patientError) throw patientError;

        const ownerIds = Array.from(new Set((patientRows || []).map((p: any) => String(p.owner_id)).filter(Boolean)));
        const ownerById = new Map<string, any>();

        if (ownerIds.length > 0) {
          const { data: ownerRows, error: ownerError } = await supabase
            .from("owners")
            .select("owner_id, owner_first_name, owner_last_name, phone, email")
            .in("owner_id", ownerIds);

          if (ownerError) throw ownerError;

          for (const owner of ownerRows || []) {
            ownerById.set(String(owner.owner_id), owner);
          }
        }

        const mapped: PatientOption[] = (patientRows || []).map((row: any) => {
          const owner = ownerById.get(String(row.owner_id));
          return {
            petId: Number(row.pet_id),
            petName: row.pet_name || "ללא שם",
            species: normalizeSpecies(row.species),
            breed: row.breed || "לא מוגדר",
            ownerId: row.owner_id ? String(row.owner_id) : "",
            ownerName: owner ? fullName(owner.owner_first_name, owner.owner_last_name) || "ללא שם" : "בעלים לא ידוע",
            ownerPhone: owner?.phone || "",
            ownerEmail: owner?.email || "",
          };
        });

        setPatients(mapped);
      } catch (error) {
        console.error("Error loading patients for appointment form:", error);
        toast.error("שגיאה בטעינת רשימת לקוחות וחיות");
      } finally {
        setIsLoadingPatients(false);
      }
    }

    loadPatients();
  }, []);

  useEffect(() => {
    if (selectedPatient) {
      setValue("ownerPhone", selectedPatient.ownerPhone || "", { shouldValidate: true });
    }
  }, [selectedPatient, setValue]);

  const onSubmit = async (data: AppointmentFormValues) => {
    try {
      const patient = patients.find((p) => String(p.petId) === data.patient);
      if (!patient) {
        toast.error("לא נמצאה חיה תקינה לתור");
        return;
      }

      const [year, month, day] = data.date.split("-").map(Number);
      if (!year || !month || !day) {
        toast.error("תאריך לא תקין");
        return;
      }

      await addAppointment({
        petId: patient.petId,
        ownerId: patient.ownerId,
        day,
        month: month - 1,
        year,
        time: data.time,
        endTime: addMinutes(data.time, 30),
        petName: patient.petName,
        petSpecies: patient.species,
        ownerName: patient.ownerName,
        ownerPhone: data.ownerPhone,
        ownerEmail: patient.ownerEmail,
        department: data.department || "כללי",
        vet: data.vet,
        room: data.room || "—",
        type: data.reason,
        color: urgencyToColor(data.urgency),
        notes: data.notes || "",
      });

      navigate("/appointments");
    } catch (error) {
      // errors are already shown by AppointmentStore
    }
  };

  const handleCancel = () => {
    navigate("/appointments");
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <button
        onClick={handleCancel}
        className="flex items-center gap-2 text-[#1e40af] hover:text-[#1e3a8a] mb-6 cursor-pointer transition-colors text-[14px]"
        style={{ fontWeight: 500 }}
      >
        <ArrowRight className="w-4 h-4" />
        חזרה ליומן תורים
      </button>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-10 py-6">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 rounded-xl p-2.5">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white text-[22px]" style={{ fontWeight: 700 }}>
                קביעת תור חדש
              </h1>
              <p className="text-white/60 mt-1 text-[14px]">
                התור נשמר ישירות בטבלת appointments בענן
              </p>
            </div>
          </div>
        </div>

        <div className="p-10">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <div>
              <h2 className="text-gray-900 text-[17px] mb-5 pb-3 border-b border-gray-200 flex items-center gap-2" style={{ fontWeight: 600 }}>
                <User className="w-5 h-5 text-[#1e40af]" />
                פרטי לקוח וחיה
              </h2>

              <div className="mb-5">
                <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                  חיפוש לקוח / חיה
                </label>
                <div className="relative">
                  <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
                  <select
                    {...register("patient")}
                    disabled={isLoadingPatients}
                    className={`w-full pr-12 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      errors.patient ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  >
                    <option value="">{isLoadingPatients ? "טוען לקוחות וחיות..." : "בחר לקוח או חיה"}</option>
                    {patients.map((p) => (
                      <option key={p.petId} value={p.petId}>
                        {p.petName} ({speciesLabel(p.species)}) - {p.ownerName} - {p.ownerId}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.patient && <p className="text-red-500 text-sm mt-1">{errors.patient.message}</p>}
              </div>

              {selectedPatient && (
                <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-[14px] text-gray-700">
                  <p className="font-semibold text-gray-900 mb-1">{selectedPatient.petName} — {selectedPatient.breed}</p>
                  <p>בעלים: {selectedPatient.ownerName}</p>
                  <p>תעודת זהות: {selectedPatient.ownerId}</p>
                </div>
              )}

              <div>
                <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                  טלפון בעלים
                </label>
                <div className="relative">
                  <Phone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
                  <input
                    type="tel"
                    {...register("ownerPhone")}
                    placeholder="050-0000000"
                    className={`w-full pr-12 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white ${
                      errors.ownerPhone ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  />
                </div>
                {errors.ownerPhone && <p className="text-red-500 text-sm mt-1">{errors.ownerPhone.message}</p>}
              </div>
            </div>

            <div>
              <h2 className="text-gray-900 text-[17px] mb-5 pb-3 border-b border-gray-200 flex items-center gap-2" style={{ fontWeight: 600 }}>
                <Clock className="w-5 h-5 text-[#1e40af]" />
                פרטי התור
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div>
                  <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    תאריך
                  </label>
                  <input
                    type="date"
                    {...register("date")}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white ${
                      errors.date ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  />
                  {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date.message}</p>}
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    שעה
                  </label>
                  <input
                    type="time"
                    {...register("time")}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white ${
                      errors.time ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  />
                  {errors.time && <p className="text-red-500 text-sm mt-1">{errors.time.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div>
                  <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    סיבת ביקור
                  </label>
                  <select
                    {...register("reason")}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                      errors.reason ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  >
                    <option value="">בחר סיבת ביקור</option>
                    <option value="חיסון">חיסון</option>
                    <option value="בדיקה שגרתית">בדיקה שגרתית</option>
                    <option value="מעקב רפואי">מעקב רפואי</option>
                    <option value="בדיקת דם">בדיקת דם</option>
                    <option value="טיפול שיניים">טיפול שיניים</option>
                    <option value="חירום">חירום</option>
                    <option value="אחר">אחר</option>
                  </select>
                  {errors.reason && <p className="text-red-500 text-sm mt-1">{errors.reason.message}</p>}
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    רמת דחיפות
                  </label>
                  <select
                    {...register("urgency")}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                      errors.urgency ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  >
                    <option value="normal">רגיל</option>
                    <option value="high">גבוה</option>
                    <option value="urgent">דחוף</option>
                  </select>
                  {errors.urgency && <p className="text-red-500 text-sm mt-1">{errors.urgency.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
                <div>
                  <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    רופא מטפל
                  </label>
                  <div className="relative">
                    <Stethoscope className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
                    <select
                      {...register("vet")}
                      className={`w-full pr-12 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                        errors.vet ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                      }`}
                    >
                      <option value="">בחר רופא</option>
                      {VETS.map((vet) => <option key={vet} value={vet}>{vet}</option>)}
                    </select>
                  </div>
                  {errors.vet && <p className="text-red-500 text-sm mt-1">{errors.vet.message}</p>}
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    מחלקה
                  </label>
                  <select
                    {...register("department")}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                      errors.department ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  >
                    {DEPARTMENTS.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                  </select>
                  {errors.department && <p className="text-red-500 text-sm mt-1">{errors.department.message}</p>}
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    חדר
                  </label>
                  <div className="relative">
                    <MapPin className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
                    <select
                      {...register("room")}
                      className={`w-full pr-12 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                        errors.room ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                      }`}
                    >
                      {ROOMS.map((room) => <option key={room} value={room}>{room}</option>)}
                    </select>
                  </div>
                  {errors.room && <p className="text-red-500 text-sm mt-1">{errors.room.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                  הערות נוספות
                </label>
                <div className="relative">
                  <FileText className="absolute right-3.5 top-3.5 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
                  <textarea
                    {...register("notes")}
                    rows={4}
                    placeholder="פרטים נוספים, תסמינים, בקשות מיוחדות..."
                    className="w-full pr-12 pl-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-[15px] bg-gray-50/50 focus:bg-white resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-6 border-t border-gray-200">
              <button
                type="submit"
                disabled={isSubmitting || !isValid || isLoadingPatients}
                className={`flex-1 py-3.5 rounded-xl transition-colors text-[15px] shadow-sm flex items-center justify-center gap-2 ${
                  isSubmitting || !isValid || isLoadingPatients
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-[#1e40af] hover:bg-[#1e3a8a] text-white cursor-pointer"
                }`}
                style={{ fontWeight: 600 }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    שומר תור בענן...
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4" />
                    קבע תור
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-8 py-3.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[15px]"
                style={{ fontWeight: 500 }}
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
