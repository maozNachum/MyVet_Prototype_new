import { supabase } from "./supabaseClient";

interface StaffAppointmentInput {
  petId: number;
  startTime: string;
  endTime: string;
  department: string;
  vetName: string;
  room: string;
  appointmentType: string;
  appointmentMode: "physical" | "video";
  color: string;
  notes?: string | null;
}

interface StaffAppointmentUpdate extends Omit<StaffAppointmentInput, "petId"> {
  appointmentId: number;
}

const ERROR_MESSAGES: Array<[string, string]> = [
  ["VET_ALREADY_BOOKED", "הרופא או הרופאה כבר משובצים בזמן הזה"],
  ["ROOM_ALREADY_BOOKED", "החדר כבר תפוס בזמן הזה"],
  ["SLOT_NOT_AVAILABLE", "השעה שנבחרה כבר אינה פנויה"],
  ["INVALID_APPOINTMENT_WINDOW", "מועד התור אינו תקין"],
  ["INVALID_APPOINTMENT_MODE", "סוג התור שנבחר אינו תקין"],
  ["INVALID_APPOINTMENT_TYPE", "יש להזין סוג תור תקין"],
  ["INVALID_APPOINTMENT_DETAILS", "אחד מפרטי התור ארוך מדי או אינו תקין"],
  ["APPOINTMENT_NOT_RESCHEDULABLE", "לא ניתן להזיז את התור במצב הנוכחי"],
  ["APPOINTMENT_NOT_CANCELLABLE", "לא ניתן לבטל את התור במצב הנוכחי"],
  ["APPOINTMENT_NOT_EDITABLE", "לא ניתן לערוך תור שהושלם או בוטל"],
  ["COMPLETED_APPOINTMENT_CANNOT_BE_CANCELLED", "לא ניתן לבטל תור שכבר הושלם"],
  ["APPOINTMENT_NOT_FOUND", "התור לא נמצא או שאין הרשאה לעדכן אותו"],
  ["PET_NOT_FOUND", "בעל החיים לא נמצא במרפאה הנוכחית"],
  ["STAFF_REQUIRED", "הפעולה זמינה לצוות המרפאה בלבד"],
  ["AUTH_REQUIRED", "החיבור למערכת פג. התחברו מחדש ונסו שוב"],
];

export function appointmentMutationError(error: unknown, fallback: string) {
  const raw = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : String(error || "");
  const match = ERROR_MESSAGES.find(([code]) => raw.includes(code));
  return new Error(match?.[1] || fallback);
}

function requireAppointmentId(value: unknown) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("לא התקבל מזהה תור תקין מהשרת");
  return id;
}

export async function bookStaffAppointment(input: StaffAppointmentInput) {
  const { data, error } = await supabase.rpc("myvet_staff_book_appointment", {
    requested_pet_id: input.petId,
    requested_start: input.startTime,
    requested_end: input.endTime,
    requested_department: input.department,
    requested_vet_name: input.vetName,
    requested_room: input.room,
    requested_type: input.appointmentType,
    requested_mode: input.appointmentMode,
    requested_color: input.color,
    requested_notes: input.notes || null,
  });
  if (error) throw appointmentMutationError(error, "לא הצלחנו לקבוע את התור");
  return requireAppointmentId(data);
}

export async function rescheduleAppointment(
  actor: "owner" | "staff",
  appointmentId: number,
  startTime: string,
  endTime: string,
) {
  const rpcName = actor === "owner"
    ? "myvet_owner_reschedule_appointment"
    : "myvet_staff_reschedule_appointment";
  const { data, error } = await supabase.rpc(rpcName, {
    requested_appointment_id: appointmentId,
    requested_start: startTime,
    requested_end: endTime,
  });
  if (error) throw appointmentMutationError(error, "לא הצלחנו להזיז את התור");
  return requireAppointmentId(data);
}

export async function cancelAppointment(actor: "owner" | "staff", appointmentId: number) {
  const rpcName = actor === "owner"
    ? "myvet_owner_cancel_appointment"
    : "myvet_staff_cancel_appointment";
  const { data, error } = await supabase.rpc(rpcName, {
    requested_appointment_id: appointmentId,
  });
  if (error) throw appointmentMutationError(error, "לא הצלחנו לבטל את התור");
  return requireAppointmentId(data);
}

export async function updateStaffAppointment(input: StaffAppointmentUpdate) {
  const { data, error } = await supabase.rpc("myvet_staff_update_appointment", {
    requested_appointment_id: input.appointmentId,
    requested_start: input.startTime,
    requested_end: input.endTime,
    requested_department: input.department,
    requested_vet_name: input.vetName,
    requested_room: input.room,
    requested_type: input.appointmentType,
    requested_mode: input.appointmentMode,
    requested_color: input.color,
    requested_notes: input.notes || null,
  });
  if (error) throw appointmentMutationError(error, "לא הצלחנו לשמור את פרטי התור");
  return requireAppointmentId(data);
}
