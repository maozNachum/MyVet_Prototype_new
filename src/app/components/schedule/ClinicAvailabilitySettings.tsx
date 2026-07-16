import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Clock3, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addClinicBookingBlock,
  CLINIC_DAY_NAMES,
  deleteClinicBookingBlock,
  loadClinicBookingBlocks,
  loadClinicBookingHours,
  saveClinicBookingHours,
  type ClinicBookingBlock,
  type ClinicBookingHour,
} from "../../../services/clinicAvailability";

type Props = { isOpen: boolean; onClose: () => void };

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ClinicAvailabilitySettings({ isOpen, onClose }: Props) {
  const [hours, setHours] = useState<ClinicBookingHour[]>([]);
  const [blocks, setBlocks] = useState<ClinicBookingBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [blockDate, setBlockDate] = useState(localDateValue);
  const [allDay, setAllDay] = useState(true);
  const [blockStart, setBlockStart] = useState("08:00");
  const [blockEnd, setBlockEnd] = useState("10:00");
  const [blockReason, setBlockReason] = useState("");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextHours, nextBlocks] = await Promise.all([loadClinicBookingHours(), loadClinicBookingBlocks()]);
      setHours(nextHours);
      setBlocks(nextBlocks);
    } catch (error) {
      console.error("Failed to load clinic availability", error);
      toast.error("לא הצלחנו לטעון את זמינות המרפאה");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  const updateDay = (weekday: number, patch: Partial<ClinicBookingHour>) => {
    setHours((current) => current.map((day) => day.weekday === weekday ? { ...day, ...patch } : day));
  };

  const handleSaveHours = async () => {
    const invalid = hours.find((day) => day.is_open && (day.closes_at <= day.opens_at || day.max_bookings < 1));
    if (invalid) {
      toast.error(`בדקו את שעות הפעילות והמכסה ביום ${CLINIC_DAY_NAMES[invalid.weekday]}`);
      return;
    }
    setIsSaving(true);
    try {
      await saveClinicBookingHours(hours);
      toast.success("שעות הפעילות ומכסות התורים נשמרו");
    } catch (error) {
      console.error("Failed to save clinic hours", error);
      toast.error("לא הצלחנו לשמור את שעות הפעילות");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddBlock = async () => {
    if (!blockDate) return toast.error("בחרו תאריך לחסימה");
    if (!allDay && blockEnd <= blockStart) return toast.error("שעת הסיום חייבת להיות אחרי שעת ההתחלה");
    setIsSaving(true);
    try {
      await addClinicBookingBlock({
        block_date: blockDate,
        is_all_day: allDay,
        starts_at: allDay ? null : blockStart,
        ends_at: allDay ? null : blockEnd,
        reason: blockReason || null,
      });
      setBlockReason("");
      await refresh();
      toast.success("החסימה נוספה לזמינות הלקוחות");
    } catch (error) {
      console.error("Failed to add clinic booking block", error);
      toast.error("לא הצלחנו להוסיף את החסימה");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBlock = async (blockId: number) => {
    try {
      await deleteClinicBookingBlock(blockId);
      setBlocks((current) => current.filter((block) => block.block_id !== blockId));
      toast.success("החסימה הוסרה");
    } catch (error) {
      console.error("Failed to remove clinic booking block", error);
      toast.error("לא הצלחנו להסיר את החסימה");
    }
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-4" dir="rtl" onClick={onClose} role="dialog" aria-modal="true" aria-label="ניהול זמינות תורים ללקוחות">
      <section className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between bg-gradient-to-l from-blue-600 to-[#1e40af] px-5 py-4 text-white sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15"><Clock3 className="h-5 w-5" /></span>
            <div><h2 className="text-[18px] font-extrabold">זמינות תורים ללקוחות</h2><p className="mt-0.5 text-[12.5px] text-blue-100">שעות, מכסה יומית וחסימות נקודתיות</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
          {isLoading && hours.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> טוען זמינות...</div>
          ) : (
            <div className="space-y-5">
              <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/60 px-4 py-3">
                  <div><h3 className="text-[15px] font-extrabold text-slate-950">שעות ומכסה לפי יום</h3><p className="text-[12px] text-slate-500">המכסה קובעת כמה לקוחות יכולים להזמין באותו יום.</p></div>
                  <button type="button" onClick={handleSaveHours} disabled={isSaving} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#1e40af] px-3 text-[13px] font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" /> שמירה</button>
                </div>
                <div className="divide-y divide-slate-100">
                  {hours.map((day) => (
                    <div key={day.weekday} className="grid grid-cols-2 items-center gap-3 px-4 py-3 sm:grid-cols-[110px_110px_1fr_1fr_130px]">
                      <div className="font-extrabold text-slate-900">{CLINIC_DAY_NAMES[day.weekday]}</div>
                      <label className="inline-flex items-center gap-2 text-[13px] font-bold text-slate-700">
                        <input type="checkbox" checked={day.is_open} onChange={(event) => updateDay(day.weekday, { is_open: event.target.checked, max_bookings: event.target.checked ? Math.max(day.max_bookings, 1) : 0 })} className="h-4 w-4 accent-blue-700" />
                        {day.is_open ? "פתוח" : "סגור"}
                      </label>
                      <label className="text-[11px] font-bold text-slate-500">משעה<input type="time" value={day.opens_at} disabled={!day.is_open} onChange={(event) => updateDay(day.weekday, { opens_at: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-slate-800 disabled:bg-slate-100" /></label>
                      <label className="text-[11px] font-bold text-slate-500">עד שעה<input type="time" value={day.closes_at} disabled={!day.is_open} onChange={(event) => updateDay(day.weekday, { closes_at: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-slate-800 disabled:bg-slate-100" /></label>
                      <label className="text-[11px] font-bold text-slate-500">מקסימום תורים<input type="number" min={day.is_open ? 1 : 0} max={200} value={day.max_bookings} disabled={!day.is_open} onChange={(event) => updateDay(day.weekday, { max_bookings: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-slate-800 disabled:bg-slate-100" /></label>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center gap-2"><CalendarOff className="h-5 w-5 text-blue-700" /><div><h3 className="text-[15px] font-extrabold text-slate-950">חסימה נקודתית</h3><p className="text-[12px] text-slate-500">סגרו יום מלא או שעות מסוימות בלי לשנות את השבוע הקבוע.</p></div></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <label className="text-[11px] font-bold text-slate-500">תאריך<input type="date" min={localDateValue()} value={blockDate} onChange={(event) => setBlockDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]" /></label>
                  <label className="flex h-[66px] items-end gap-2 pb-2.5 text-[13px] font-bold text-slate-700"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} className="h-4 w-4 accent-blue-700" /> יום מלא</label>
                  <label className="text-[11px] font-bold text-slate-500">משעה<input type="time" value={blockStart} disabled={allDay} onChange={(event) => setBlockStart(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] disabled:bg-slate-100" /></label>
                  <label className="text-[11px] font-bold text-slate-500">עד שעה<input type="time" value={blockEnd} disabled={allDay} onChange={(event) => setBlockEnd(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] disabled:bg-slate-100" /></label>
                  <button type="button" onClick={handleAddBlock} disabled={isSaving} className="mt-auto inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-blue-50 text-[13px] font-extrabold text-blue-800 ring-1 ring-blue-100 hover:bg-blue-100 disabled:opacity-60"><Plus className="h-4 w-4" /> הוסף חסימה</button>
                </div>
                <input value={blockReason} onChange={(event) => setBlockReason(event.target.value)} maxLength={200} aria-label="סיבה פנימית לחסימה" placeholder="סיבה פנימית (לא מוצגת ללקוחות)" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]" />
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-[14px] font-extrabold text-slate-950">חסימות קרובות</h3>
                {blocks.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-[13px] text-slate-500">אין חסימות עתידיות.</p> : (
                  <div className="divide-y divide-slate-100">{blocks.map((block) => <div key={block.block_id} className="flex items-center gap-3 py-2.5"><span className="flex-1 text-[13px] font-bold text-slate-800">{block.block_date} · {block.is_all_day ? "יום מלא" : `${block.starts_at}–${block.ends_at}`}</span>{block.reason && <span className="hidden max-w-[260px] truncate text-[12px] text-slate-500 sm:block">{block.reason}</span>}<button type="button" onClick={() => handleDeleteBlock(block.block_id)} aria-label="הסרת חסימה" className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div>)}</div>
                )}
              </section>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
