import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useAppointmentStore } from "../data/AppointmentStore"; // 1. חיבור למקור הנתונים
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
  ownerPhone: z.string().regex(/^05\d-[0-9]{7}$/, "פורמט לא תקין (לדוגמה: 050-1234567)"),
  date: z.string().min(1, "חובה לבחור תאריך"),
  time: z.string().min(1, "חובה לבחור שעה"),
  reason: z.string().min(1, "חובה לבחור סיבת ביקור"),
  urgency: z.string().min(1, "חובה לבחור רמת דחיפות"),
  vet: z.string().min(1, "חובה לבחור רופא מטפל"),
  department: z.string().optional(),
  room: z.string().optional(),
  notes: z.string().optional(),
});

type AppointmentFormValues = z.infer<typeof appointmentSchema>;

export function NewAppointment() {
  const navigate = useNavigate();
  const { addAppointment } = useAppointmentStore(); // 2. משיכת פונקציית ההוספה מה-Store

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    mode: "onChange",
    defaultValues: {
      patient: "", date: "", time: "", reason: "", vet: "", 
      department: "", room: "", notes: "", ownerPhone: "", urgency: "",
    },
  });

  // 3. עדכון פונקציית השמירה שתשלח נתונים ל-Store
  const onSubmit = async (data: AppointmentFormValues) => {
    try {
      const apptDate = new Date(data.date);
      
      // שליחת נתונים אמיתית ל-Store
      await addAppointment({
        day: apptDate.getDate(),
        month: apptDate.getMonth(),
        year: apptDate.getFullYear(),
        time: data.time,
        endTime: data.time, 
        // מיפוי זמני של שמות לפי האופציות הקיימות בטופס
        petName: data.patient === "1" ? "ניקו" : "רקס",
        petSpecies: data.patient === "1" ? "cat" : "dog",
        ownerName: data.patient === "1" ? "שרה לוי" : "יוסי כהן",
        ownerPhone: data.ownerPhone,
        ownerEmail: "",
        department: data.department || "כללי",
        vet: data.vet,
        room: data.room || "—",
        type: data.reason,
        color: "blue",
        notes: data.notes || "",
      });

      // הצלחה וניווט לדף הבית (היכן שהדשבורד נמצא)
      navigate("/"); 
    } catch (error) {
      // השגיאה כבר מטופלת ב-Store (מופיע Toast אדום)
    }
  };

  const handleCancel = () => {
    navigate("/"); // חזרה לדשבורד
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <button
        onClick={handleCancel}
        className="flex items-center gap-2 text-[#1e40af] hover:text-[#1e3a8a] mb-6 cursor-pointer transition-colors text-[14px]"
        style={{ fontWeight: 500 }}
      >
        <ArrowRight className="w-4 h-4" />
        חזרה ללוח בקרה
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
                מלאו את הפרטים הבאים כדי לקבוע תור במרפאה
              </p>
            </div>
          </div>
        </div>

        <div className="p-10">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            
            {/* ── Section 1: Patient Details ── */}
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
                  <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <select
                    {...register("patient")}
                    className={`w-full pr-12 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                      errors.patient ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  >
                    <option value="">בחר לקוח או חיה</option>
                    <option value="1">ניקו (חתול) - שרה לוי</option>
                    <option value="2">רקס (כלב) - יוסי כהן</option>
                  </select>
                </div>
                {errors.patient && <p className="text-red-500 text-sm mt-1">{errors.patient.message}</p>}
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                  טלפון בעלים (לאישור)
                </label>
                <div className="relative">
                  <Phone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
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

            {/* ── Section 2: Appointment Details ── */}
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
                  <div className="relative">
                    <input
                      type="date"
                      {...register("date")}
                      className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white ${
                        errors.date ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                      }`}
                    />
                  </div>
                  {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date.message}</p>}
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    שעה
                  </label>
                  <div className="relative">
                    <input
                      type="time"
                      {...register("time")}
                      className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white ${
                        errors.time ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                      }`}
                    />
                  </div>
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
                    <option value="vaccination">חיסון</option>
                    <option value="checkup">בדיקה שגרתית</option>
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
                    <option value="">בחר רמת דחיפות</option>
                    <option value="normal">רגיל</option>
                    <option value="urgent">דחוף</option>
                  </select>
                  {errors.urgency && <p className="text-red-500 text-sm mt-1">{errors.urgency.message}</p>}
                </div>
              </div>
            </div>

            {/* ── Section 3: Medical Assignment ── */}
            <div>
              <h2 className="text-gray-900 text-[17px] mb-5 pb-3 border-b border-gray-200 flex items-center gap-2" style={{ fontWeight: 600 }}>
                <Stethoscope className="w-5 h-5 text-[#1e40af]" />
                שיבוץ רפואי
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div>
                  <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    רופא מטפל
                  </label>
                  <div className="relative">
                    <Stethoscope className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    <select
                      {...register("vet")}
                      className={`w-full pr-12 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                        errors.vet ? "border-red-500 focus:ring-red-500/20" : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                      }`}
                    >
                      <option value="">בחר רופא מטפל</option>
                      <option value="dr-cohen">ד"ר יוסי כהן</option>
                    </select>
                  </div>
                  {errors.vet && <p className="text-red-500 text-sm mt-1">{errors.vet.message}</p>}
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                    מחלקה (רשות)
                  </label>
                  <div className="relative">
                    <MapPin className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    <select
                      {...register("department")}
                      className="w-full pr-12 pl-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
                    >
                      <option value="">בחר מחלקה</option>
                      <option value="internal">פנימית</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 4: Notes ── */}
            <div>
              <h2 className="text-gray-900 text-[17px] mb-5 pb-3 border-b border-gray-200 flex items-center gap-2" style={{ fontWeight: 600 }}>
                <FileText className="w-5 h-5 text-[#1e40af]" />
                הערות נוספות
              </h2>

              <div>
                <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 500 }}>
                  הערות / הנחיות מיוחדות (רשות)
                </label>
                <textarea
                  {...register("notes")}
                  rows={4}
                  placeholder="פרטים נוספים, הנחיות מיוחדות, אלרגיות..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-[15px] bg-gray-50/50 focus:bg-white resize-none"
                />
              </div>
            </div>

            {/* ── Action Buttons ── */}
            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="px-8 py-3 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors text-[15px] cursor-pointer border border-gray-200 disabled:opacity-50"
                style={{ fontWeight: 500 }}
              >
                ביטול
              </button>

              <button
                type="submit"
                disabled={!isValid || isSubmitting}
                className="bg-[#1e40af] text-white px-10 py-3 rounded-xl hover:bg-[#1e3a8a] transition-all shadow-lg shadow-blue-500/15 text-[15px] cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontWeight: 600 }}
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Calendar className="w-5 h-5" />
                )}
                {isSubmitting ? "קובע תור..." : "קבע תור"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}