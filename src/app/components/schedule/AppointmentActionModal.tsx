import {
  Calendar, X, Stethoscope, Trash2, CalendarClock,
  Check, Pencil, ChevronDown, AlertTriangle, User,
} from "lucide-react";
import { useNavigate } from "react-router";
import { ModalOverlay, ModalHeader } from "../shared/ModalOverlay";
import { SuccessMessage } from "../shared/SuccessMessage";
import { PillPicker } from "../shared/PillPicker";
import { PetIcon } from "../shared/PetIcon";
import {
  AVAILABLE_DATES, AVAILABLE_TIMES,
  DEPARTMENTS, ROOMS, VETS,
  addMinutes, type ActionMode, type DateOption,
} from "../../data/calendar-constants";
import type { CalendarAppointment } from "../../data/AppointmentStore";

// ─── Sub-components ─────────────────────────────────────────────────
function ApptSummaryCard({ appt, bgColor }: { appt: CalendarAppointment; bgColor: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 mb-5 flex items-center gap-3">
      <div className={`w-12 h-12 ${bgColor} rounded-xl flex items-center justify-center`}>
        <PetIcon species={appt.petSpecies} className={`w-6 h-6 ${bgColor.includes("red") ? "text-red-500" : bgColor.includes("amber") ? "text-amber-600" : "text-blue-600"}`} />
      </div>
      <div>
        <p className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>{appt.petName} — {appt.type}</p>
        <p className="text-gray-500 text-[13px]">תור נוכחי: {appt.day}/{appt.month + 1}/{appt.year} בשעה {appt.time}</p>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-gray-600 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 bg-white appearance-none cursor-pointer"
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 font-medium pointer-events-none" />
      </div>
    </div>
  );
}

const INPUT_CLS = "w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 bg-white";

// ─── Modal Config ───────────────────────────────────────────────────
const MODE_CONFIG: Record<ActionMode, { icon: typeof Calendar; title: string; gradient?: string }> = {
  view:       { icon: Calendar,      title: "פרטי תור" },
  reschedule: { icon: CalendarClock, title: "הזזת תור" },
  edit:       { icon: Pencil,        title: "עריכת תור" },
  delete:     { icon: Trash2,        title: "מחיקת תור", gradient: "bg-gradient-to-l from-red-500 to-red-600" },
};

// ─── Main Component ─────────────────────────────────────────────────
interface Props {
  appt: CalendarAppointment;
  mode: ActionMode;
  setMode: (m: ActionMode) => void;
  onClose: () => void;
  // Reschedule
  rescheduleDate: DateOption | null;
  setRescheduleDate: (d: DateOption | null) => void;
  rescheduleTime: string;
  setRescheduleTime: (t: string) => void;
  rescheduleSuccess: boolean;
  onReschedule: () => void;
  // Edit
  editForm: { type: string; department: string; vet: string; room: string; time: string; endTime: string; notes: string };
  setEditForm: (f: any) => void;
  editSuccess: boolean;
  onEdit: () => void;
  // Delete
  deleteSuccess: boolean;
  onDelete: () => void;
  // Open in a specific mode
  openAction: (appt: CalendarAppointment, mode: ActionMode) => void;
}

export function AppointmentActionModal({
  appt, mode, setMode, onClose,
  rescheduleDate, setRescheduleDate, rescheduleTime, setRescheduleTime,
  rescheduleSuccess, onReschedule,
  editForm, setEditForm, editSuccess, onEdit,
  deleteSuccess, onDelete,
  openAction,
}: Props) {
  const navigate = useNavigate();
  const cfg = MODE_CONFIG[mode];
  const Icon = cfg.icon;

  const datePills = AVAILABLE_DATES.map((d) => ({ key: d.label, label: d.label }));
  const timePills = AVAILABLE_TIMES.map((t) => ({ key: t, label: t }));

  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader
        title={cfg.title}
        icon={<Icon className="w-5 h-5 text-white/80" />}
        onClose={onClose}
        gradient={cfg.gradient}
      />
      <div className="p-6">
        {/* ── VIEW ── */}
        {mode === "view" && (
          <>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl flex items-center justify-center">
                <PetIcon species={appt.petSpecies} className="w-7 h-7 text-[#1e40af]" />
              </div>
              <div>
                <h4 className="text-gray-900 text-[20px]" style={{ fontWeight: 700 }}>{appt.petName}</h4>
                <p className="text-gray-500 text-[14px]">{appt.type}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: "שעה", value: `${appt.time} - ${appt.endTime}`, big: true },
                { label: "חדר", value: appt.room, big: true },
                { label: "בעלים", value: appt.ownerName, sub: `${appt.ownerPhone}${appt.ownerEmail ? ` · ${appt.ownerEmail}` : ""}` },
                { label: "רופא / מחלקה", value: appt.vet, sub: appt.department },
              ].map((item, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-gray-500 font-medium text-[12px] mb-1" style={{ fontWeight: 500 }}>{item.label}</p>
                  <p className={`text-gray-900 ${item.big ? "text-[16px]" : "text-[14px]"}`} style={{ fontWeight: 600 }}>{item.value}</p>
                  {item.sub && <p className="text-gray-500 text-[13px]">{item.sub}</p>}
                </div>
              ))}
            </div>

            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-1.5">
                <Stethoscope className="w-4 h-4 text-blue-500" />
                <p className="text-blue-700 text-[13px]" style={{ fontWeight: 600 }}>הערות</p>
              </div>
              <p className="text-gray-700 text-[14px]">{appt.notes}</p>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {([
                { mode: "reschedule" as ActionMode, icon: CalendarClock, label: "הזז תור", cls: "border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600" },
                { mode: "edit" as ActionMode, icon: Pencil, label: "ערוך", cls: "border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-600" },
                { mode: "delete" as ActionMode, icon: Trash2, label: "מחק", cls: "border-red-200 bg-red-50 hover:bg-red-100 text-red-500" },
                { mode: null, icon: User, label: "תיק רפואי", cls: "border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600" },
              ] as const).map((btn) => {
                const BtnIcon = btn.icon;
                return (
                  <button
                    key={btn.label}
                    onClick={() => btn.mode ? (btn.mode === "edit" ? openAction(appt, "edit") : setMode(btn.mode)) : (() => { onClose(); navigate("/patients?selected=1"); })()}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border ${btn.cls} transition-colors cursor-pointer`}
                  >
                    <BtnIcon className="w-5 h-5" />
                    <span className="text-[13px]" style={{ fontWeight: 600 }}>{btn.label}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={onClose} className="w-full py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 500 }}>
              סגור
            </button>
          </>
        )}

        {/* ── RESCHEDULE ── */}
        {mode === "reschedule" && (
          rescheduleSuccess ? (
            <SuccessMessage title="התור הוזז בהצלחה!" subtitle="הבעלים יקבלו התראה על השינוי" />
          ) : (
            <>
              <ApptSummaryCard appt={appt} bgColor="bg-blue-50" />
              <PillPicker
                label="בחרו תאריך חדש"
                items={datePills}
                selected={rescheduleDate?.label ?? null}
                onSelect={(label) => setRescheduleDate(AVAILABLE_DATES.find((d) => d.label === label) || null)}
              />
              <PillPicker
                label="בחרו שעה חדשה"
                items={timePills}
                selected={rescheduleTime || null}
                onSelect={setRescheduleTime}
              />
              <div className="flex gap-3 mt-2">
                <button
                  onClick={onReschedule}
                  disabled={!rescheduleDate || !rescheduleTime}
                  className={`flex-1 py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2 ${
                    rescheduleDate && rescheduleTime ? "bg-[#1e40af] hover:bg-[#1e3a8a] text-white" : "bg-gray-200 text-gray-500 font-medium cursor-not-allowed"
                  }`}
                  style={{ fontWeight: 600 }}
                >
                  <CalendarClock className="w-4 h-4" /> אישור הזזת תור
                </button>
                <button onClick={() => setMode("view")} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 500 }}>
                  חזרה
                </button>
              </div>
            </>
          )
        )}

        {/* ── EDIT ── */}
        {mode === "edit" && (
          editSuccess ? (
            <SuccessMessage title="התור עודכן בהצלחה!" subtitle="הבעלים יקבלו התראה על העדכון" />
          ) : (
            <>
              <div className="bg-gray-50 rounded-xl p-4 mb-5 flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                  <PetIcon species={appt.petSpecies} className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>{appt.petName} — {appt.ownerName}</p>
                  <p className="text-gray-500 text-[13px]">{appt.day}/{appt.month + 1}/{appt.year} בשעה {appt.time}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-gray-600 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>סוג טיפול</label>
                  <input type="text" value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} className={INPUT_CLS} />
                </div>
                <SelectField label="מחלקה" value={editForm.department} options={DEPARTMENTS} onChange={(v) => setEditForm({ ...editForm, department: v })} />
                <SelectField label="רופא/ה" value={editForm.vet} options={VETS} onChange={(v) => setEditForm({ ...editForm, vet: v })} />
                <SelectField label="חדר" value={editForm.room} options={ROOMS} onChange={(v) => setEditForm({ ...editForm, room: v })} />
                <SelectField
                  label="שעת התחלה" value={editForm.time} options={AVAILABLE_TIMES}
                  onChange={(v) => setEditForm({ ...editForm, time: v, endTime: addMinutes(v, 30) })}
                />
                <div>
                  <label className="block text-gray-600 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>שעת סיום</label>
                  <input type="text" value={editForm.endTime} onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-gray-600 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>הערות</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} className={`${INPUT_CLS} resize-none`} />
              </div>

              <div className="flex gap-3">
                <button onClick={onEdit} className="flex-1 py-3 rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2" style={{ fontWeight: 600 }}>
                  <Check className="w-4 h-4" /> שמור שינויים
                </button>
                <button onClick={() => setMode("view")} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 500 }}>
                  חזרה
                </button>
              </div>
            </>
          )
        )}

        {/* ── DELETE ── */}
        {mode === "delete" && (
          deleteSuccess ? (
            <SuccessMessage title="התור נמחק בהצלחה" subtitle="הבעלים יקבלו התראה על הביטול" />
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>מחיקת תור</h4>
                <p className="text-gray-500 text-[13px]">פעולה זו לא ניתנת לביטול — הבעלים יקבלו התראה</p>
              </div>

              <div className="bg-red-50/60 rounded-xl border border-red-100 p-4 mb-6 flex items-center gap-3">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                  <PetIcon species={appt.petSpecies} className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <p className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{appt.petName} — {appt.type}</p>
                  <p className="text-gray-500 text-[12px]">{appt.day}/{appt.month + 1}/{appt.year} | {appt.time} | {appt.vet}</p>
                  <p className="text-gray-500 font-medium text-[12px]">בעלים: {appt.ownerName}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={onDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2" style={{ fontWeight: 600 }}>
                  <Trash2 className="w-4 h-4" /> כן, מחקו את התור
                </button>
                <button onClick={() => setMode("view")} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 500 }}>
                  חזרה
                </button>
              </div>
            </>
          )
        )}
      </div>
    </ModalOverlay>
  );
}