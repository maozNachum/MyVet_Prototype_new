import { useEffect, useState } from "react";
import { Calendar, Clock, X, Check, Dog, Cat, PawPrint, Loader2, AlertCircle, Building2, Video } from "lucide-react";
import { VISIT_TYPES, BOOKING_VISIT_TYPE_KEYS } from "../data/categoryConfig";
import { addMinutes } from "../data/calendar-constants";
import { supabase } from "../../services/supabaseClient";

interface TimeSlot {
  time: string;
  available: boolean;
}

interface DaySlots {
  date: string;
  fullDateISO: string;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  slots: TimeSlot[];
}

interface OwnerPortalPet {
  id: number;
  name: string;
  type: "dog" | "cat" | "other";
  breed: string;
}

interface OwnerBookAppointmentProps {
  isOpen: boolean;
  onClose: () => void;
  pets?: OwnerPortalPet[];
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  onAppointmentCreated?: () => Promise<void> | void;
}

type AppointmentRow = {
  start_time: string | null;
  end_time: string | null;
};

type AppointmentMode = "physical" | "video";

const treatmentTypes = BOOKING_VISIT_TYPE_KEYS.map((id) => ({ id, ...VISIT_TYPES[id] }));
const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const APPOINTMENT_MODE_OPTIONS: Array<{ value: AppointmentMode; title: string; subtitle: string; icon: typeof Building2 }> = [
  { value: "physical", title: "תור פיזי", subtitle: "הגעה למרפאה", icon: Building2 },
  { value: "video", title: "תור וידאו", subtitle: "המשך טיפול במרפאה הדיגיטלית", icon: Video },
];

function pad(num: number) {
  return String(num).padStart(2, "0");
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatShortDate(date: Date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

function buildSlotDateTime(dateISO: string, time: string) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
}

function getOpeningHours(date: Date) {
  const day = date.getDay();
  if (day === 6) return [];
  if (day === 5) return ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00"];
  return ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];
}

function overlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function createBaseWeek(): DaySlots[] {
  const now = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
    return {
      date: formatShortDate(date),
      fullDateISO: formatLocalDate(date),
      dayName: DAY_NAMES[date.getDay()],
      dayNumber: date.getDate(),
      isToday: index === 0,
      slots: getOpeningHours(date).map((time) => ({ time, available: true })),
    };
  });
}

async function loadRealAvailability(): Promise<DaySlots[]> {
  const week = createBaseWeek();
  const rangeStart = buildSlotDateTime(week[0].fullDateISO, "00:00");
  const lastDay = week[week.length - 1];
  const rangeEnd = buildSlotDateTime(lastDay.fullDateISO, "23:59");

  const { data, error } = await supabase.rpc("myvet_booked_slots", {
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
  });

  if (error) throw error;

  const appointments = ((data || []) as Array<{ slot_start: string; slot_end: string | null }>).map((row) => {
    const start = row.slot_start ? new Date(row.slot_start) : null;
    const end = row.slot_end ? new Date(row.slot_end) : start ? new Date(start.getTime() + 30 * 60 * 1000) : null;
    return { start, end };
  });

  const now = new Date();

  return week.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => {
      const slotStart = buildSlotDateTime(day.fullDateISO, slot.time);
      const slotEnd = buildSlotDateTime(day.fullDateISO, addMinutes(slot.time, 30));
      const isPast = slotStart <= now;
      const isTaken = appointments.some((appt) => appt.start && appt.end && overlap(slotStart, slotEnd, appt.start, appt.end));
      return { ...slot, available: !isPast && !isTaken };
    }),
  }));
}

export function OwnerBookAppointment({
  isOpen,
  onClose,
  pets = [],
  ownerName = "",
  ownerPhone = "",
  ownerEmail = "",
  onAppointmentCreated,
}: OwnerBookAppointmentProps) {
  const [step, setStep] = useState(1);
  const [selectedPet, setSelectedPet] = useState<number | null>(null);
  const [selectedTreatment, setSelectedTreatment] = useState<string | null>(null);
  const [selectedAppointmentMode, setSelectedAppointmentMode] = useState<AppointmentMode>("physical");
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [week, setWeek] = useState<DaySlots[]>(createBaseWeek);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const displayPets = pets;
  const selectedPetData = displayPets.find((p) => p.id === selectedPet);
  const selectedTreatmentData = treatmentTypes.find((t) => t.id === selectedTreatment);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;

    async function loadSlots() {
      setIsLoadingSlots(true);
      setSlotError(null);
      try {
        const nextWeek = await loadRealAvailability();
        if (mounted) setWeek(nextWeek);
      } catch (error) {
        console.error("Failed to load appointment availability", error);
        if (mounted) {
          setSlotError("לא הצלחנו לטעון זמינות אמיתית מיומן התורים");
          setWeek(createBaseWeek().map((day) => ({ ...day, slots: day.slots.map((slot) => ({ ...slot, available: false })) })));
        }
      } finally {
        if (mounted) setIsLoadingSlots(false);
      }
    }

    loadSlots();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  const handleClose = () => {
    setStep(1);
    setSelectedPet(null);
    setSelectedTreatment(null);
    setSelectedAppointmentMode("physical");
    setSelectedDay(0);
    setSelectedTime(null);
    setNotes("");
    setValidationError(null);
    onClose();
  };

  if (!isOpen) return null;

  const goToStep2 = () => {
    if (!selectedPet) return setValidationError("בחרו חיה לפני שממשיכים");
    if (!selectedTreatment) return setValidationError("בחרו סיבת ביקור לפני שממשיכים");
    setValidationError(null);
    setStep(2);
  };

  const goToStep3 = () => {
    if (!selectedTime) return setValidationError("בחרו שעה פנויה לפני שממשיכים");
    setValidationError(null);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!selectedPet || !selectedTreatment || !selectedTime) {
      setValidationError("חסר מידע לקביעת התור. בדקו חיה, סיבת ביקור ושעה.");
      return;
    }

    try {
      setIsSaving(true);
      const selectedDate = week[selectedDay];
      const startDate = buildSlotDateTime(selectedDate.fullDateISO, selectedTime);
      const endDate = buildSlotDateTime(selectedDate.fullDateISO, addMinutes(selectedTime, 30));

      const notesToSave = [
        notes,
        `סוג תור: ${selectedAppointmentMode === "video" ? "וידאו" : "פיזי"}`,
        "נקבע דרך פורטל לקוחות",
      ]
        .filter(Boolean)
        .join("\n");

      const { error } = await supabase.from("appointments").insert([
        {
          pet_id: selectedPet,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          department: "כללי",
          vet_name: "טרם שובץ",
          room: selectedAppointmentMode === "video" ? "דיגיטל" : "טרם שובץ",
          appointment_type: selectedTreatmentData?.label || selectedTreatment,
          appointment_mode: selectedAppointmentMode,
          color: "blue",
          notes: notesToSave || null,
        },
      ]);

      if (error) throw error;

      await onAppointmentCreated?.();
      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        handleClose();
      }, 2200);
    } catch (error) {
      console.error("Supabase appointment insert error:", error);
      setValidationError("לא הצלחנו לקבוע את התור כרגע. נסה שוב בעוד רגע או פנה לצוות המרפאה.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 sm:items-center sm:px-4" onClick={handleClose}>
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-gray-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl" dir="rtl" style={{ fontFamily: "'Heebo', sans-serif" }} onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-4 py-4 sm:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-white/80" />
            <div>
              <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>קביעת תור חדש</h3>
              <p className="text-white/60 text-[12px]">{!isSubmitted && `שלב ${step} מתוך 3`}</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="סגור חלון" className="text-white/60 hover:text-white cursor-pointer p-1 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {!isSubmitted && (
          <div className="h-1 bg-gray-100 shrink-0"><div className="h-full bg-[#1e40af] transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} /></div>
        )}

        <div className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
          {isSubmitted ? (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-5"><Check className="w-10 h-10 text-emerald-500" /></div>
              <h3 className="text-gray-900 text-[20px] mb-2" style={{ fontWeight: 700 }}>התור נקבע בהצלחה!</h3>
              <p className="text-gray-500 text-[14px] text-center" style={{ lineHeight: 1.6 }}>התור נשמר ביומן המרפאה וממתין לשיבוץ צוות.</p>
            </div>
          ) : (
            <>
              {(validationError || slotError) && (
                <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-red-600 text-[13px] font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {validationError || slotError}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-gray-900 text-[15px] mb-3" style={{ fontWeight: 600 }}>בחרו חיה</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {displayPets.length === 0 && <div className="col-span-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center text-gray-500 text-[14px] font-medium">לא נמצאו חיות מחוברות לבעלים במסד הנתונים.</div>}
                      {displayPets.map((pet) => {
                        const Icon = pet.type === "dog" ? Dog : pet.type === "cat" ? Cat : PawPrint;
                        const selected = selectedPet === pet.id;
                        return (
                          <button key={pet.id} onClick={() => { setSelectedPet(pet.id); setValidationError(null); }} className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3 ${selected ? "border-[#1e40af] bg-blue-50/50 shadow-sm" : "border-gray-100 hover:border-gray-200 bg-white"}`}>
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selected ? "bg-[#1e40af]" : "bg-gray-50"}`}><Icon className={`w-5 h-5 ${selected ? "text-white" : "text-gray-500"}`} /></div>
                            <div className="text-right"><p className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{pet.name}</p><p className="text-gray-500 text-[12px]">{pet.breed}</p></div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-gray-900 text-[15px] mb-3" style={{ fontWeight: 600 }}>סיבת ביקור</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {treatmentTypes.map((type) => {
                        const selected = selectedTreatment === type.id;
                        const Icon = type.icon;
                        return (
                          <button key={type.id} onClick={() => { setSelectedTreatment(type.id); setValidationError(null); }} className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer text-right ${selected ? "border-[#1e40af] bg-blue-50/50 shadow-sm" : "border-gray-100 hover:border-gray-200 bg-white"}`}>
                            <div className="flex items-center gap-2.5"><Icon className={`w-4.5 h-4.5 ${selected ? "text-[#1e40af]" : "text-gray-500"}`} /><span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{type.label}</span></div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-gray-900 text-[15px] mb-3" style={{ fontWeight: 600 }}>סוג תור</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {APPOINTMENT_MODE_OPTIONS.map((mode) => {
                        const selected = selectedAppointmentMode === mode.value;
                        const Icon = mode.icon;
                        return (
                          <button
                            key={mode.value}
                            type="button"
                            onClick={() => setSelectedAppointmentMode(mode.value)}
                            className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer text-right ${selected ? "border-[#1e40af] bg-blue-50/50 shadow-sm" : "border-gray-100 hover:border-gray-200 bg-white"}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <Icon className={`w-4.5 h-4.5 ${selected ? "text-[#1e40af]" : "text-gray-500"}`} />
                              <div>
                                <span className="block text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{mode.title}</span>
                                <span className="block text-gray-500 text-[11.5px] mt-0.5">{mode.subtitle}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h4 className="text-gray-900 text-[15px] mb-3" style={{ fontWeight: 600 }}>בחרו מועד פנוי</h4>
                  {isLoadingSlots ? (
                    <div className="py-12 text-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />טוען זמינות אמיתית מהיומן...</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {week.map((day, index) => (
                          <button key={day.fullDateISO} onClick={() => { setSelectedDay(index); setSelectedTime(null); setValidationError(null); }} className={`min-w-[74px] p-3 rounded-xl border-2 transition-all cursor-pointer text-center ${selectedDay === index ? "border-[#1e40af] bg-blue-50" : "border-gray-100 bg-white hover:border-gray-200"}`}>
                            <p className="text-[12px] text-gray-500">{day.isToday ? "היום" : day.dayName}</p>
                            <p className="text-gray-900 text-[18px]" style={{ fontWeight: 700 }}>{day.dayNumber}</p>
                            <p className="text-[11px] text-gray-400">{day.date}</p>
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {week[selectedDay]?.slots.length === 0 && <div className="col-span-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center text-gray-500 text-[14px]">המרפאה סגורה ביום זה.</div>}
                        {week[selectedDay]?.slots.map((slot) => (
                          <button key={slot.time} disabled={!slot.available} onClick={() => { setSelectedTime(slot.time); setValidationError(null); }} className={`py-2.5 rounded-xl border transition-all text-[13px] flex items-center justify-center gap-1.5 ${selectedTime === slot.time ? "border-[#1e40af] bg-[#1e40af] text-white" : slot.available ? "border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700 cursor-pointer" : "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed line-through"}`}>
                            <Clock className="w-3.5 h-3.5" />{slot.time}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                    <h4 className="text-blue-900 text-[15px] mb-2" style={{ fontWeight: 700 }}>סיכום התור</h4>
                    <div className="space-y-1 text-[14px] text-blue-900/80">
                      <p>חיה: <strong>{selectedPetData?.name}</strong></p>
                      <p>סיבה: <strong>{selectedTreatmentData?.label}</strong></p>
                      <p>סוג תור: <strong>{selectedAppointmentMode === "video" ? "וידאו" : "פיזי"}</strong></p>
                      <p>מועד: <strong>{week[selectedDay]?.date} בשעה {selectedTime}</strong></p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-700 text-[14px] mb-2" style={{ fontWeight: 600 }}>הערות לצוות המרפאה</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="אפשר לתאר בקצרה את סיבת הפנייה..." className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!isSubmitted && (
          <div className="border-t border-gray-100 p-4 flex gap-3 shrink-0">
            {step > 1 && <button onClick={() => setStep((prev) => prev - 1)} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 600 }}>חזרה</button>}
            {step === 1 && <button onClick={goToStep2} className="flex-1 py-3 rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 600 }}>המשך לבחירת מועד</button>}
            {step === 2 && <button onClick={goToStep3} className="flex-1 py-3 rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 600 }}>המשך לסיכום</button>}
            {step === 3 && <button onClick={handleSubmit} disabled={isSaving} className="flex-1 py-3 rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] disabled:bg-blue-300 text-white transition-colors cursor-pointer text-[14px] flex items-center justify-center gap-2" style={{ fontWeight: 600 }}>{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} קבע תור</button>}
          </div>
        )}
      </div>
    </div>
  );
}
