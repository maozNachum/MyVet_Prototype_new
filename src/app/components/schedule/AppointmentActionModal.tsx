import {
  Calendar, Stethoscope, Trash2, CalendarClock,
  Check, Pencil, ChevronDown, AlertTriangle, User, Video, Building2, Loader2,
} from "lucide-react";
import { useNavigate } from "react-router";
import { ModalOverlay, ModalHeader } from "../shared/ModalOverlay";
import { SuccessMessage } from "../shared/SuccessMessage";
import { PillPicker } from "../shared/PillPicker";
import { PetIcon } from "../shared/PetIcon";
import {
  AVAILABLE_DATES, AVAILABLE_TIMES,
  DEPARTMENTS, ROOMS,
  APPOINTMENT_STATUS_OPTIONS, addMinutes, getApptStatus,
  type ActionMode, type AppointmentStatus, type DateOption,
} from "../../data/calendar-constants";
import { useStaffMembers, uniqueNames } from "../../data/staffDirectory";
import { appointmentModeLabel, type AppointmentMode, type CalendarAppointment } from "../../data/AppointmentStore";

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
  delete:     { icon: Trash2,        title: "ביטול תור", gradient: "bg-gradient-to-l from-red-500 to-red-600" },
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
  editForm: { type: string; department: string; vet: string; room: string; time: string; endTime: string; notes: string; appointmentMode: AppointmentMode };
  setEditForm: (f: any) => void;
  editSuccess: boolean;
  onEdit: () => void;
  // Delete
  deleteSuccess: boolean;
  onDelete: () => void;
  actionPending: boolean;
  supportsAppointmentStatus: boolean;
  statusUpdatePending: boolean;
  onStatusChange: (status: AppointmentStatus) => void;
  // Open in a specific mode
  openAction: (appt: CalendarAppointment, mode: ActionMode) => void;
}

export function AppointmentActionModal({
  appt, mode, setMode, onClose,
  rescheduleDate, setRescheduleDate, rescheduleTime, setRescheduleTime,
  rescheduleSuccess, onReschedule,
  editForm, setEditForm, editSuccess, onEdit,
  deleteSuccess, onDelete, actionPending,
  supportsAppointmentStatus, statusUpdatePending, onStatusChange,
  openAction,
}: Props) {
  const navigate = useNavigate();
  const { members: vetStaff } = useStaffMembers(["vet"]);
  const vetOptions = uniqueNames([editForm.vet, appt.vet, ...vetStaff.map((member) => member.name), "טרם שובץ"]);
  const cfg = MODE_CONFIG[mode];
  const Icon = cfg.icon;

  const datePills = AVAILABLE_DATES.map((d) => ({ key: d.label, label: d.label }));
  const timePills = AVAILABLE_TIMES.map((t) => ({ key: t, label: t }));
  const isVideo = appt.appointmentMode === "video";
  const status = getApptStatus(appt.status);
  const openDigitalCare = () => {
    const params = new URLSearchParams();
    params.set("appointment_id", String(appt.appointmentId || appt.id));
    if (appt.petId) params.set("pet_id", String(appt.petId));
    if (appt.ownerId) params.set("owner_id", appt.ownerId);
    onClose();
    navigate(`/digital-care?${params.toString()}`);
  };

  const handleActionButtonClick = (btnMode: ActionMode | "digital" | null) => {
    if (btnMode === "digital") {
      openDigitalCare();
      return;
    }

    if (btnMode === "edit") {
      openAction(appt, "edit");
      return;
    }

    if (btnMode) {
      setMode(btnMode);
      return;
    }

    onClose();
    if (!appt.petId) {
      navigate("/patients");
      return;
    }

    const params = new URLSearchParams({
      selected: String(appt.petId),
      appointment_id: String(appt.appointmentId || appt.id),
    });
    navigate(`/patients?${params.toString()}`);
  };

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
                <span className={`inline-flex items-center gap-1 mt-2 rounded-full px-2.5 py-1 text-[12px] font-semibold ${isVideo ? "bg-purple-50 text-purple-700 border border-purple-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"}`}>
                  {isVideo ? <Video className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                  {appointmentModeLabel(appt.appointmentMode)}
                </span>
              </div>
            </div>

            <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4" aria-labelledby="appointment-status-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h5 id="appointment-status-heading" className="text-[13px] font-bold text-slate-800">סטטוס תפעולי</h5>
                  <p className="text-[11px] text-slate-500">עדכון קצר ששומר את כל הצוות מסונכרן</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold ${status.badgeClass}`}>
                  <span className={`h-2 w-2 rounded-full ${status.dotColor}`} />
                  {status.label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {APPOINTMENT_STATUS_OPTIONS.filter((option) => option.key !== "cancelled").map((option) => {
                  const isActive = appt.status === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={isActive}
                      disabled={!supportsAppointmentStatus || statusUpdatePending}
                      onClick={() => onStatusChange(option.key)}
                      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                        isActive ? option.badgeClass : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {statusUpdatePending && !isActive ? null : <span className={`h-2 w-2 rounded-full ${option.dotColor}`} />}
                      {statusUpdatePending && isActive && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {!supportsAppointmentStatus && (
                <p className="mt-2 text-[11px] font-medium text-amber-700">יש להחיל את עדכון בסיס הנתונים כדי לאפשר שינוי סטטוס.</p>
              )}
            </section>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: "שעה", value: `${appt.time} - ${appt.endTime}`, big: true },
                { label: "מיקום", value: isVideo ? "מרפאה דיגיטלית" : appt.room, big: true },
                { label: "סוג תור", value: appointmentModeLabel(appt.appointmentMode), big: false },
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

            <div className={`mb-3 grid ${isVideo ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
              {([
                { mode: null, icon: User, label: "פתיחת התיק הרפואי", cls: "border-[#1e40af] bg-[#1e40af] hover:bg-[#1e3a8a] text-white" },
                ...(isVideo ? [{ mode: "digital" as const, icon: Video, label: "פתיחת השיחה הדיגיטלית", cls: "border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700" }] : []),
              ] as const).map((btn) => {
                const BtnIcon = btn.icon;
                return (
                  <button
                    key={btn.label}
                    onClick={() => handleActionButtonClick(btn.mode)}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-3 ${btn.cls} cursor-pointer transition-colors`}
                  >
                    <BtnIcon className="w-5 h-5" />
                    <span className="text-[13px]" style={{ fontWeight: 600 }}>{btn.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {([
                { mode: "reschedule" as ActionMode, icon: CalendarClock, label: "הזזה", cls: "border-blue-200 bg-white hover:bg-blue-50 text-blue-700" },
                { mode: "edit" as ActionMode, icon: Pencil, label: "עריכה", cls: "border-amber-200 bg-white hover:bg-amber-50 text-amber-700" },
                { mode: "delete" as ActionMode, icon: Trash2, label: "ביטול", cls: "border-red-200 bg-white hover:bg-red-50 text-red-600" },
              ] as const).map((btn) => {
                const BtnIcon = btn.icon;
                return (
                  <button key={btn.label} type="button" onClick={() => handleActionButtonClick(btn.mode)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-[13px] font-semibold transition-colors ${btn.cls}`}>
                    <BtnIcon className="h-4 w-4" /> {btn.label}
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
              {(!rescheduleDate || !rescheduleTime) && (
                <p className="text-blue-600 text-[12px] font-semibold mt-1">בחרו תאריך ושעה חדשים כדי להזיז את התור.</p>
              )}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={onReschedule}
                  disabled={!rescheduleDate || !rescheduleTime || actionPending}
                  className={`flex-1 py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2 ${
                    rescheduleDate && rescheduleTime && !actionPending ? "bg-[#1e40af] hover:bg-[#1e3a8a] text-white" : "bg-gray-200 text-gray-500 font-medium cursor-not-allowed"
                  }`}
                  style={{ fontWeight: 600 }}
                >
                  {actionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} {actionPending ? "מעדכן את התור..." : "אישור הזזת תור"}
                </button>
                <button onClick={() => setMode("view")} disabled={actionPending} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] disabled:cursor-not-allowed disabled:opacity-50" style={{ fontWeight: 500 }}>
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
                <div>
                  <label className="block text-gray-600 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>סוג תור</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, appointmentMode: "physical", room: editForm.room === "דיגיטל" ? "חדר 1" : editForm.room })}
                      className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${editForm.appointmentMode === "physical" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      פיזי
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, appointmentMode: "video", room: "דיגיטל" })}
                      className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${editForm.appointmentMode === "video" ? "border-purple-200 bg-purple-50 text-purple-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      וידאו
                    </button>
                  </div>
                </div>
                <SelectField label="מחלקה" value={editForm.department} options={DEPARTMENTS} onChange={(v) => setEditForm({ ...editForm, department: v })} />
                <SelectField label="רופא/ה" value={editForm.vet} options={vetOptions} onChange={(v) => setEditForm({ ...editForm, vet: v })} />
                {editForm.appointmentMode === "video" ? (
                  <div>
                    <label className="block text-gray-600 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>מיקום</label>
                    <input type="text" value="דיגיטל" readOnly className={`${INPUT_CLS} bg-gray-100 text-gray-600`} />
                  </div>
                ) : (
                  <SelectField label="חדר" value={editForm.room} options={ROOMS} onChange={(v) => setEditForm({ ...editForm, room: v })} />
                )}
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
                <button onClick={onEdit} disabled={actionPending} className="flex-1 py-3 rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60" style={{ fontWeight: 600 }}>
                  {actionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="w-4 h-4" />} {actionPending ? "שומר שינויים..." : "שמור שינויים"}
                </button>
                <button onClick={() => setMode("view")} disabled={actionPending} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] disabled:cursor-not-allowed disabled:opacity-50" style={{ fontWeight: 500 }}>
                  חזרה
                </button>
              </div>
            </>
          )
        )}

        {/* ── DELETE ── */}
        {mode === "delete" && (
          deleteSuccess ? (
            <SuccessMessage title="התור בוטל בהצלחה" subtitle="הבעלים יקבלו התראה על הביטול" />
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>ביטול תור</h4>
                <p className="text-gray-500 text-[13px]">התור יוסר מהיומן והבעלים יקבלו הודעת ביטול</p>
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
                <button onClick={onDelete} disabled={actionPending} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60" style={{ fontWeight: 600 }}>
                  {actionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} {actionPending ? "מבטל את התור..." : "כן, בטלו את התור"}
                </button>
                <button onClick={() => setMode("view")} disabled={actionPending} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] disabled:cursor-not-allowed disabled:opacity-50" style={{ fontWeight: 500 }}>
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
