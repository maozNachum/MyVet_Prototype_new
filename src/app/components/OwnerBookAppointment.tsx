import { useState } from "react";
import {
  Calendar,
  Clock,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Dog,
  Cat,
} from "lucide-react";
import { VISIT_TYPES, BOOKING_VISIT_TYPE_KEYS } from "../data/categoryConfig";

interface TimeSlot {
  time: string;
  available: boolean;
}

interface DaySlots {
  date: string;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  slots: TimeSlot[];
}

// ── Derived from central VISIT_TYPES config ──
const treatmentTypes = BOOKING_VISIT_TYPE_KEYS.map((id) => ({ id, ...VISIT_TYPES[id] }));

const pets = [
  { id: 1, name: "רקס", type: "dog" as const, breed: "גולדן רטריבר" },
  { id: 2, name: "ניקו", type: "cat" as const, breed: "מעורב" },
];

// Generate next 7 days with mock availability
function generateWeek(): DaySlots[] {
  const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const result: DaySlots[] = [];
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    const dayOfWeek = date.getDay();

    // Friday short, Saturday closed
    const isFriday = dayOfWeek === 5;
    const isSaturday = dayOfWeek === 6;

    const slots: TimeSlot[] = [];

    if (!isSaturday) {
      const hours = isFriday
        ? ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00"]
        : ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];

      hours.forEach((time) => {
        // Randomize availability - more slots available for further days
        const available = Math.random() > (i === 0 ? 0.6 : 0.3);
        slots.push({ time, available });
      });
    }

    result.push({
      date: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
      dayName: days[dayOfWeek],
      dayNumber: date.getDate(),
      isToday: i === 0,
      slots,
    });
  }
  return result;
}

interface OwnerBookAppointmentProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OwnerBookAppointment({ isOpen, onClose }: OwnerBookAppointmentProps) {
  const [step, setStep] = useState(1);
  const [selectedPet, setSelectedPet] = useState<number | null>(null);
  const [selectedTreatment, setSelectedTreatment] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [week] = useState<DaySlots[]>(generateWeek);

  if (!isOpen) return null;

  const handleSubmit = () => {
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setStep(1);
      setSelectedPet(null);
      setSelectedTreatment(null);
      setSelectedDay(0);
      setSelectedTime(null);
      setNotes("");
      onClose();
    }, 2500);
  };

  const canProceedStep1 = selectedPet !== null && selectedTreatment !== null;
  const canProceedStep2 = selectedTime !== null;
  const selectedPetData = pets.find((p) => p.id === selectedPet);
  const selectedTreatmentData = treatmentTypes.find((t) => t.id === selectedTreatment);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        dir="rtl"
        style={{ fontFamily: "'Heebo', sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-white/80" />
            <div>
              <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>
                קביעת תור חדש
              </h3>
              <p className="text-white/60 text-[12px]">
                {!isSubmitted && `שלב ${step} מתוך 3`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white cursor-pointer p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        {!isSubmitted && (
          <div className="h-1 bg-gray-100 shrink-0">
            <div
              className="h-full bg-[#1e40af] transition-all duration-300"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isSubmitted ? (
            /* Success State */
            <div className="flex flex-col items-center justify-center py-10">
              <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
                <Check className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-gray-900 text-[20px] mb-2" style={{ fontWeight: 700 }}>
                התור נקבע בהצלחה!
              </h3>
              <p className="text-gray-500 text-[14px] text-center" style={{ lineHeight: 1.6 }}>
                נשלחה אליכם הודעת אישור עם פרטי התור.
                <br />
                תקבלו תזכורת יום לפני הביקור.
              </p>
            </div>
          ) : step === 1 ? (
            /* Step 1: Pet & Treatment */
            <div className="space-y-6">
              {/* Select Pet */}
              <div>
                <h4 className="text-gray-900 text-[15px] mb-3" style={{ fontWeight: 600 }}>
                  בחרו חיה
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {pets.map((pet) => {
                    const PIcon = pet.type === "dog" ? Dog : Cat;
                    const isSelected = selectedPet === pet.id;
                    return (
                      <button
                        key={pet.id}
                        onClick={() => setSelectedPet(pet.id)}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                          isSelected
                            ? "border-[#1e40af] bg-blue-50/50 shadow-sm"
                            : "border-gray-100 hover:border-gray-200 bg-white"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            isSelected
                              ? "bg-[#1e40af] text-white"
                              : "bg-gray-100 text-gray-500 font-medium"
                          }`}
                        >
                          <PIcon className="w-5 h-5" />
                        </div>
                        <div className="text-right">
                          <p
                            className="text-gray-900 text-[14px]"
                            style={{ fontWeight: 600 }}
                          >
                            {pet.name}
                          </p>
                          <p className="text-gray-500 font-medium text-[13px]">{pet.breed}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Select Treatment */}
              <div>
                <h4 className="text-gray-900 text-[15px] mb-3" style={{ fontWeight: 600 }}>
                  סוג הטיפול
                </h4>
                <div className="grid grid-cols-2 gap-2.5">
                  {treatmentTypes.map((tt) => {
                    const TIcon = tt.icon;
                    const isSelected = selectedTreatment === tt.id;
                    return (
                      <button
                        key={tt.id}
                        onClick={() => setSelectedTreatment(tt.id)}
                        className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-2.5 ${
                          isSelected
                            ? "border-[#1e40af] bg-blue-50/50 shadow-sm"
                            : "border-gray-100 hover:border-gray-200 bg-white"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center border ${tt.color}`}
                        >
                          <TIcon className="w-4 h-4" />
                        </div>
                        <span
                          className="text-gray-700 text-[13px]"
                          style={{ fontWeight: 500 }}
                        >
                          {tt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : step === 2 ? (
            /* Step 2: Date & Time */
            <div className="space-y-5">
              {/* Day Selector */}
              <div>
                <h4 className="text-gray-900 text-[15px] mb-3" style={{ fontWeight: 600 }}>
                  בחרו יום
                </h4>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {week.map((day, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDay(idx);
                        setSelectedTime(null);
                      }}
                      disabled={day.slots.length === 0}
                      className={`flex flex-col items-center min-w-[64px] py-3 px-2 rounded-xl border-2 transition-all cursor-pointer ${
                        selectedDay === idx
                          ? "border-[#1e40af] bg-blue-50/50 shadow-sm"
                          : day.slots.length === 0
                          ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                          : "border-gray-100 hover:border-gray-200"
                      }`}
                    >
                      <span className="text-gray-500 font-medium text-[13px]" style={{ fontWeight: 500 }}>
                        {day.dayName}
                      </span>
                      <span
                        className={`text-[18px] my-0.5 ${
                          selectedDay === idx ? "text-[#1e40af]" : "text-gray-900"
                        }`}
                        style={{ fontWeight: 700 }}
                      >
                        {day.dayNumber}
                      </span>
                      <span className="text-[10px] text-gray-500 font-medium">
                        {day.isToday ? "היום" : day.date}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Slots */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>
                    שעות פנויות
                  </h4>
                  <span className="text-gray-500 font-medium text-[12px]">
                    {week[selectedDay].slots.filter((s) => s.available).length} תורים פנויים
                  </span>
                </div>
                {week[selectedDay].slots.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 font-medium text-[14px]">סגור — אין תורים ביום זה</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {week[selectedDay].slots.map((slot) => (
                      <button
                        key={slot.time}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`py-2.5 rounded-lg text-[13px] transition-all cursor-pointer border ${
                          selectedTime === slot.time
                            ? "bg-[#1e40af] text-white border-[#1e40af] shadow-sm"
                            : slot.available
                            ? "bg-white text-gray-700 border-gray-200 hover:border-[#1e40af] hover:text-[#1e40af]"
                            : "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed line-through"
                        }`}
                        style={{ fontWeight: 500 }}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Step 3: Review & Notes */
            <div className="space-y-5">
              <h4 className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>
                סיכום התור
              </h4>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-500 font-medium text-[13px] mb-1" style={{ fontWeight: 500 }}>
                    חיה
                  </p>
                  <div className="flex items-center gap-2">
                    {selectedPetData?.type === "dog" ? (
                      <Dog className="w-4 h-4 text-[#1e40af]" />
                    ) : (
                      <Cat className="w-4 h-4 text-[#1e40af]" />
                    )}
                    <span className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>
                      {selectedPetData?.name}
                    </span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-500 font-medium text-[13px] mb-1" style={{ fontWeight: 500 }}>
                    סוג טיפול
                  </p>
                  <span className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>
                    {selectedTreatmentData?.label}
                  </span>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-500 font-medium text-[13px] mb-1" style={{ fontWeight: 500 }}>
                    יום
                  </p>
                  <span className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>
                    {week[selectedDay].dayName} {week[selectedDay].date}
                  </span>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-500 font-medium text-[13px] mb-1" style={{ fontWeight: 500 }}>
                    שעה
                  </p>
                  <span className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>
                    {selectedTime}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-gray-600 text-[13px] mb-2 block" style={{ fontWeight: 500 }}>
                  הערות (אופציונלי)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="תארו את הבעיה או הוסיפו מידע חשוב..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-gray-50/50 transition-all resize-none"
                />
              </div>

              {/* Info box */}
              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4">
                <p className="text-blue-700 text-[12px]" style={{ lineHeight: 1.7 }}>
                  <span style={{ fontWeight: 600 }}>שימו לב:</span> תקבלו הודעת
                  אישור לנייד עם פרטי התור. במקרה של ביטול, נא להודיע לפחות 24 שעות
                  מראש.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        {!isSubmitted && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]"
                style={{ fontWeight: 500 }}
              >
                הקודם
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
                className="flex-1 bg-[#1e40af] hover:bg-[#1e3a8a] disabled:bg-gray-200 disabled:text-gray-500 font-medium text-white py-2.5 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm"
                style={{ fontWeight: 600 }}
              >
                המשך
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2"
                style={{ fontWeight: 600 }}
              >
                <Check className="w-4 h-4" />
                אישור וקביעת תור
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}