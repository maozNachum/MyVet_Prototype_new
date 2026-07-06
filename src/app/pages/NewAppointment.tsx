import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useForm, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  useAppointmentStore,
  type AppointmentMode,
  type PetSpecies,
} from "../data/AppointmentStore";
import { addMinutes, DEPARTMENTS, ROOMS } from "../data/calendar-constants";
import { useStaffMembers, uniqueNames } from "../data/staffDirectory";
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
  Building2,
  Video,
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
  appointmentMode: z.enum(["physical", "video"]),
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

const MODE_OPTIONS: Array<{
  value: AppointmentMode;
  title: string;
  subtitle: string;
  icon: typeof Building2;
}> = [
  {
    value: "physical",
    title: "תור פיזי במרפאה",
    subtitle: "הגעה לחדר/מחלקה במרפאה",
    icon: Building2,
  },
  {
    value: "video",
    title: "תור וידאו",
    subtitle: "ניהול המשך דרך מרפאה דיגיטלית",
    icon: Video,
  },
];

const FIELD_LABELS: Partial<Record<keyof AppointmentFormValues, string>> = {
  patient: "לקוח / חיה",
  ownerPhone: "טלפון בעלים",
  date: "תאריך",
  time: "שעה",
  reason: "סיבת ביקור",
  urgency: "רמת דחיפות",
  vet: "רופא מטפל",
  department: "מחלקה",
  room: "חדר / מיקום",
  appointmentMode: "סוג תור",
};

function collectFormErrors(errors: FieldErrors<AppointmentFormValues>) {
  return Object.entries(errors)
    .map(([key, value]) => {
      const fieldName = FIELD_LABELS[key as keyof AppointmentFormValues] || key;
      const message =
        typeof value?.message === "string"
          ? value.message
          : `חובה להשלים ${fieldName}`;
      return { fieldName, message };
    })
    .slice(0, 6);
}

export function NewAppointment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledDate = searchParams.get("date") || "";
  const prefilledTime = searchParams.get("time") || "";
  const prefilledVet = searchParams.get("vet") || "";
  const { addAppointment } = useAppointmentStore();
  const { members: vetStaff, isLoading: isLoadingStaff } = useStaffMembers([
    "vet",
  ]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    mode: "onChange",
    defaultValues: {
      patient: "",
      date: prefilledDate,
      time: prefilledTime,
      reason: "",
      vet: prefilledVet || "",
      department: "פנימית",
      room: "חדר 1",
      appointmentMode: "physical",
      notes: "",
      ownerPhone: "",
      urgency: "normal",
    },
  });

  const vetOptions = useMemo(
    () => uniqueNames([...vetStaff.map((member) => member.name), prefilledVet]),
    [vetStaff, prefilledVet],
  );

  const selectedPatientId = watch("patient");
  const selectedAppointmentMode = watch("appointmentMode");
  const selectedRoom = watch("room");
  const selectedPatient = useMemo(
    () => patients.find((p) => String(p.petId) === selectedPatientId),
    [patients, selectedPatientId],
  );

  useEffect(() => {
    if (prefilledDate) {
      setValue("date", prefilledDate, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    if (prefilledTime) {
      setValue("time", prefilledTime, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    if (prefilledVet) {
      setValue("vet", prefilledVet, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [prefilledDate, prefilledTime, prefilledVet, setValue]);

  useEffect(() => {
    async function loadPatients() {
      try {
        setIsLoadingPatients(true);

        const { data: patientRows, error: patientError } = await supabase
          .from("patients")
          .select("pet_id, pet_name, species, breed, owner_id")
          .order("pet_name", { ascending: true });

        if (patientError) throw patientError;

        const ownerIds = Array.from(
          new Set(
            (patientRows || [])
              .map((p: any) => String(p.owner_id))
              .filter(Boolean),
          ),
        );
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
            ownerName: owner
              ? fullName(owner.owner_first_name, owner.owner_last_name) ||
                "ללא שם"
              : "בעלים לא ידוע",
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
      setValue("ownerPhone", selectedPatient.ownerPhone || "", {
        shouldValidate: true,
      });
    }
  }, [selectedPatient, setValue]);

  useEffect(() => {
    if (selectedAppointmentMode === "video") {
      setValue("room", "דיגיטל", { shouldValidate: true, shouldDirty: true });
    } else if (selectedRoom === "דיגיטל") {
      setValue("room", "חדר 1", { shouldValidate: true, shouldDirty: true });
    }
  }, [selectedAppointmentMode, selectedRoom, setValue]);

  const onSubmit = async (data: AppointmentFormValues) => {
    setSubmitAttempted(false);
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
        room: data.appointmentMode === "video" ? "דיגיטל" : data.room || "—",
        type: data.reason,
        appointmentMode: data.appointmentMode,
        color: urgencyToColor(data.urgency),
        notes: data.notes || "",
      });

      navigate("/appointments");
    } catch (error) {
      // errors are already shown by AppointmentStore
    }
  };

  const onInvalid = (formErrors: FieldErrors<AppointmentFormValues>) => {
    setSubmitAttempted(true);
    const messages = collectFormErrors(formErrors);
    const firstMessage = messages[0]?.message || "חסרים פרטים לקביעת התור";
    toast.error(firstMessage);
  };

  const validationMessages = collectFormErrors(errors);

  const handleCancel = () => {
    navigate("/appointments");
  };

  return (
    <main
      className="max-w-4xl mx-auto px-6 py-10"
      dir="rtl"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
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
              <h1
                className="text-white text-[22px]"
                style={{ fontWeight: 700 }}
              >
                קביעת תור חדש
              </h1>
              <p className="text-white/60 mt-1 text-[14px]">
                התור נשמר ישירות בטבלת appointments בענן
              </p>
            </div>
          </div>
        </div>

        <div className="p-10">
          {(prefilledDate || prefilledTime || prefilledVet) && (
            <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-[14px] text-blue-900">
              <div className="flex items-center gap-2 font-semibold">
                <Calendar className="h-4 w-4" />
                נבחר מקום ביומן
              </div>
              <p className="mt-1 text-blue-800/80">
                התאריך, השעה והרופא מולאו אוטומטית לפי המקום שלחצת עליו ביומן.
                אפשר לשנות אותם לפני שמירה.
              </p>
              {prefilledVet && (
                <p className="mt-1 text-blue-900 font-semibold">
                  יומן נבחר: {prefilledVet}
                </p>
              )}
            </div>
          )}

          <form
            onSubmit={handleSubmit(onSubmit, onInvalid)}
            className="space-y-8"
            noValidate
          >
            {submitAttempted && validationMessages.length > 0 && (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-[14px] text-red-700">
                <p className="font-semibold text-red-800 mb-2">
                  אי אפשר לקבוע את התור עדיין. צריך להשלים:
                </p>
                <ul className="space-y-1 list-disc list-inside">
                  {validationMessages.map((item) => (
                    <li key={`${item.fieldName}-${item.message}`}>
                      {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h2
                className="text-gray-900 text-[17px] mb-5 pb-3 border-b border-gray-200 flex items-center gap-2"
                style={{ fontWeight: 600 }}
              >
                <User className="w-5 h-5 text-[#1e40af]" />
                פרטי לקוח וחיה
              </h2>

              <div className="mb-5">
                <label
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  חיפוש לקוח / חיה
                </label>
                <div className="relative">
                  <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
                  <select
                    {...register("patient")}
                    disabled={isLoadingPatients}
                    className={`w-full pr-12 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      errors.patient
                        ? "border-red-500 focus:ring-red-500/20"
                        : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  >
                    <option value="">
                      {isLoadingPatients
                        ? "טוען לקוחות וחיות..."
                        : "בחר לקוח או חיה"}
                    </option>
                    {patients.map((p) => (
                      <option key={p.petId} value={p.petId}>
                        {p.petName} ({speciesLabel(p.species)}) - {p.ownerName}{" "}
                        - {p.ownerId}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.patient && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.patient.message}
                  </p>
                )}
              </div>

              {selectedPatient && (
                <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-[14px] text-gray-700">
                  <p className="font-semibold text-gray-900 mb-1">
                    {selectedPatient.petName} — {selectedPatient.breed}
                  </p>
                  <p>בעלים: {selectedPatient.ownerName}</p>
                  <p>תעודת זהות: {selectedPatient.ownerId}</p>
                </div>
              )}

              <div>
                <label
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  טלפון בעלים
                </label>
                <div className="relative">
                  <Phone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
                  <input
                    type="tel"
                    {...register("ownerPhone")}
                    placeholder="050-0000000"
                    className={`w-full pr-12 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white ${
                      errors.ownerPhone
                        ? "border-red-500 focus:ring-red-500/20"
                        : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  />
                </div>
                {errors.ownerPhone && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.ownerPhone.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <h2
                className="text-gray-900 text-[17px] mb-5 pb-3 border-b border-gray-200 flex items-center gap-2"
                style={{ fontWeight: 600 }}
              >
                <Clock className="w-5 h-5 text-[#1e40af]" />
                פרטי התור
              </h2>

              <div className="mb-5">
                <label
                  className="block text-gray-700 text-[14px] mb-3"
                  style={{ fontWeight: 600 }}
                >
                  סוג תור
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {MODE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const selected = selectedAppointmentMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setValue("appointmentMode", option.value, {
                            shouldValidate: true,
                            shouldDirty: true,
                          })
                        }
                        className={`rounded-2xl border-2 p-4 text-right transition-all cursor-pointer ${
                          selected
                            ? "border-[#1e40af] bg-blue-50 shadow-sm"
                            : "border-gray-100 bg-white hover:border-blue-100 hover:bg-blue-50/40"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center ${selected ? "bg-[#1e40af] text-white" : "bg-gray-50 text-gray-500"}`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <p
                              className="text-gray-900 text-[14px]"
                              style={{ fontWeight: 700 }}
                            >
                              {option.title}
                            </p>
                            <p className="text-gray-500 text-[12.5px] mt-1">
                              {option.subtitle}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div>
                  <label
                    className="block text-gray-700 text-[14px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    תאריך
                  </label>
                  <input
                    type="date"
                    {...register("date")}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white ${
                      errors.date
                        ? "border-red-500 focus:ring-red-500/20"
                        : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  />
                  {errors.date && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.date.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    className="block text-gray-700 text-[14px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    שעה
                  </label>
                  <input
                    type="time"
                    {...register("time")}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white ${
                      errors.time
                        ? "border-red-500 focus:ring-red-500/20"
                        : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  />
                  {errors.time && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.time.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div>
                  <label
                    className="block text-gray-700 text-[14px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    סיבת ביקור
                  </label>
                  <select
                    {...register("reason")}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                      errors.reason
                        ? "border-red-500 focus:ring-red-500/20"
                        : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
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
                  {errors.reason && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.reason.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    className="block text-gray-700 text-[14px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    רמת דחיפות
                  </label>
                  <select
                    {...register("urgency")}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                      errors.urgency
                        ? "border-red-500 focus:ring-red-500/20"
                        : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  >
                    <option value="normal">רגיל</option>
                    <option value="high">גבוה</option>
                    <option value="urgent">דחוף</option>
                  </select>
                  {errors.urgency && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.urgency.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
                <div>
                  <label
                    className="block text-gray-700 text-[14px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    רופא מטפל
                  </label>
                  <div className="relative">
                    <Stethoscope className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
                    <select
                      {...register("vet")}
                      className={`w-full pr-12 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                        errors.vet
                          ? "border-red-500 focus:ring-red-500/20"
                          : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                      }`}
                    >
                      <option value="">בחר רופא</option>
                      {vetOptions.map((vet) => (
                        <option key={vet} value={vet}>
                          {vet}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.vet && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.vet.message}
                    </p>
                  )}
                  {!isLoadingStaff && vetOptions.length === 0 && (
                    <p className="text-amber-600 text-sm mt-1">
                      לא נמצאו וטרינרים בטבלת staff. הוסף איש צוות מסוג vet כדי
                      לקבוע תור לרופא.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    className="block text-gray-700 text-[14px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    מחלקה
                  </label>
                  <select
                    {...register("department")}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                      errors.department
                        ? "border-red-500 focus:ring-red-500/20"
                        : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                  {errors.department && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.department.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    className="block text-gray-700 text-[14px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    {selectedAppointmentMode === "video" ? "מיקום" : "חדר"}
                  </label>
                  <div className="relative">
                    <MapPin className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
                    {selectedAppointmentMode === "video" ? (
                      <input
                        value="דיגיטל"
                        readOnly
                        className="w-full pr-12 pl-4 py-3 border border-gray-200 rounded-xl text-[15px] bg-gray-100 text-gray-600"
                      />
                    ) : (
                      <select
                        {...register("room")}
                        className={`w-full pr-12 pl-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-[15px] bg-gray-50/50 focus:bg-white appearance-none cursor-pointer ${
                          errors.room
                            ? "border-red-500 focus:ring-red-500/20"
                            : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                        }`}
                      >
                        {ROOMS.map((room) => (
                          <option key={room} value={room}>
                            {room}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {errors.room && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.room.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
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

            {(vetOptions.length === 0 || isLoadingPatients) && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-[14px] text-amber-800">
                {isLoadingPatients
                  ? "רשימת הלקוחות והחיות עדיין נטענת. המתן כמה שניות ונסה שוב."
                  : "לא נמצאו וטרינרים זמינים בטבלת הצוות. צריך להוסיף איש צוות מסוג vet לפני קביעת תור."}
              </div>
            )}

            <div className="flex gap-3 pt-6 border-t border-gray-200">
              <button
                type="submit"
                disabled={
                  isSubmitting || vetOptions.length === 0 || isLoadingPatients
                }
                className={`flex-1 py-3.5 rounded-xl transition-colors text-[15px] shadow-sm flex items-center justify-center gap-2 ${
                  isSubmitting || vetOptions.length === 0 || isLoadingPatients
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
