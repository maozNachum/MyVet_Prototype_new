import { supabase } from "./supabaseClient";

export type ClinicBookingHour = {
  weekday: number;
  is_open: boolean;
  opens_at: string;
  closes_at: string;
  slot_minutes: number;
  max_bookings: number;
};

export type ClinicBookingBlock = {
  block_id: number;
  block_date: string;
  is_all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  reason: string | null;
};

export const CLINIC_DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export const DEFAULT_CLINIC_HOURS: ClinicBookingHour[] = CLINIC_DAY_NAMES.map((_, weekday) => ({
  weekday,
  is_open: weekday !== 6,
  opens_at: "08:00",
  closes_at: weekday === 5 ? "14:00" : weekday === 6 ? "08:00" : "17:00",
  slot_minutes: 30,
  max_bookings: weekday < 5 ? 18 : weekday === 5 ? 12 : 0,
}));

function shortTime(value: string | null | undefined, fallback: string) {
  return value ? value.slice(0, 5) : fallback;
}

export async function loadClinicBookingHours(): Promise<ClinicBookingHour[]> {
  const { data, error } = await supabase
    .from("clinic_booking_hours")
    .select("weekday,is_open,opens_at,closes_at,slot_minutes,max_bookings")
    .order("weekday");
  if (error) throw error;

  const byDay = new Map((data || []).map((row: any) => [Number(row.weekday), row]));
  return DEFAULT_CLINIC_HOURS.map((fallback) => {
    const row: any = byDay.get(fallback.weekday);
    return row ? {
      weekday: fallback.weekday,
      is_open: Boolean(row.is_open),
      opens_at: shortTime(row.opens_at, fallback.opens_at),
      closes_at: shortTime(row.closes_at, fallback.closes_at),
      slot_minutes: Number(row.slot_minutes || 30),
      max_bookings: Number(row.max_bookings ?? fallback.max_bookings),
    } : fallback;
  });
}

export async function saveClinicBookingHours(hours: ClinicBookingHour[]) {
  const { data: authData } = await supabase.auth.getUser();
  const rows = hours.map((day) => ({
    ...day,
    max_bookings: day.is_open ? Math.max(1, day.max_bookings) : 0,
    updated_at: new Date().toISOString(),
    updated_by: authData.user?.id || null,
  }));
  // clinic_id is assigned by the database from the authenticated membership.
  // The composite conflict target prevents one clinic from overwriting another.
  const { error } = await supabase.from("clinic_booking_hours").upsert(rows, { onConflict: "clinic_id,weekday" });
  if (error) throw error;
}

export async function loadClinicBookingBlocks(): Promise<ClinicBookingBlock[]> {
  const today = new Date();
  const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("clinic_booking_blocks")
    .select("block_id,block_date,is_all_day,starts_at,ends_at,reason")
    .gte("block_date", start)
    .order("block_date")
    .order("starts_at");
  if (error) throw error;
  return (data || []).map((row: any) => ({
    block_id: Number(row.block_id),
    block_date: row.block_date,
    is_all_day: Boolean(row.is_all_day),
    starts_at: row.starts_at ? shortTime(row.starts_at, "") : null,
    ends_at: row.ends_at ? shortTime(row.ends_at, "") : null,
    reason: row.reason || null,
  }));
}

export async function addClinicBookingBlock(input: Omit<ClinicBookingBlock, "block_id">) {
  const { data: authData } = await supabase.auth.getUser();
  const { error } = await supabase.from("clinic_booking_blocks").insert([{
    block_date: input.block_date,
    is_all_day: input.is_all_day,
    starts_at: input.is_all_day ? null : input.starts_at,
    ends_at: input.is_all_day ? null : input.ends_at,
    reason: input.reason?.trim() || null,
    created_by: authData.user?.id || null,
  }]);
  if (error) throw error;
}

export async function deleteClinicBookingBlock(blockId: number) {
  const { error } = await supabase.from("clinic_booking_blocks").delete().eq("block_id", blockId);
  if (error) throw error;
}
