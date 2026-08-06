import { useState, useCallback, useEffect, useRef } from "react";
import { useAppointmentStore, type CalendarAppointment, type AppointmentMode } from "../data/AppointmentStore";
import { addMinutes, type ActionMode, type AppointmentStatus, type DateOption } from "../data/calendar-constants";

interface EditFormState {
  type: string;
  department: string;
  vet: string;
  room: string;
  time: string;
  endTime: string;
  notes: string;
  appointmentMode: AppointmentMode;
}

const EMPTY_EDIT: EditFormState = {
  type: "",
  department: "",
  vet: "",
  room: "",
  time: "",
  endTime: "",
  notes: "",
  appointmentMode: "physical",
};

/** Manages the appointment action modal (view/reschedule/edit/delete). */
export function useAppointmentActions() {
  const store = useAppointmentStore();

  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>("view");

  // Reschedule
  const [rescheduleDate, setRescheduleDate] = useState<DateOption | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleSuccess, setRescheduleSuccess] = useState(false);

  // Edit
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT);
  const [editSuccess, setEditSuccess] = useState(false);

  // Delete
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [statusUpdatePending, setStatusUpdatePending] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeModal = useCallback(() => {
    clearCloseTimer();
    setSelectedAppt(null);
    setActionMode("view");
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setSelectedAppt(null);
      setActionMode("view");
    }, 1800);
  }, [clearCloseTimer]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const openAction = useCallback((appt: CalendarAppointment, mode: ActionMode) => {
    clearCloseTimer();
    setSelectedAppt(appt);
    setActionMode(mode);
    setRescheduleDate(null);
    setRescheduleTime("");
    setRescheduleSuccess(false);
    setEditSuccess(false);
    setDeleteSuccess(false);
    setActionPending(false);
    if (mode === "edit") {
      setEditForm({
        type: appt.type,
        department: appt.department,
        vet: appt.vet,
        room: appt.room,
        time: appt.time,
        endTime: appt.endTime,
        notes: appt.notes,
        appointmentMode: appt.appointmentMode || "physical",
      });
    }
  }, [clearCloseTimer]);

  const handleReschedule = useCallback(async () => {
    if (!selectedAppt || !rescheduleDate || !rescheduleTime || actionPending) return;
    setActionPending(true);
    try {
      await store.rescheduleAppointment(
        selectedAppt.id, rescheduleDate.day, rescheduleDate.month,
        rescheduleDate.year, rescheduleTime, addMinutes(rescheduleTime, 30), "staff"
      );
      setRescheduleSuccess(true);
      scheduleClose();
    } catch (error) {
      console.error("Failed to reschedule appointment", error);
    } finally {
      setActionPending(false);
    }
  }, [selectedAppt, rescheduleDate, rescheduleTime, actionPending, store, scheduleClose]);

  const handleEdit = useCallback(async () => {
    if (!selectedAppt || actionPending) return;
    setActionPending(true);
    try {
      await store.editAppointment(selectedAppt.id, { ...editForm }, "staff");
      setEditSuccess(true);
      scheduleClose();
    } catch (error) {
      console.error("Failed to edit appointment", error);
    } finally {
      setActionPending(false);
    }
  }, [selectedAppt, editForm, actionPending, store, scheduleClose]);

  const handleDelete = useCallback(async () => {
    if (!selectedAppt || actionPending) return;
    setActionPending(true);
    try {
      await store.deleteAppointment(selectedAppt.id, "staff");
      setDeleteSuccess(true);
      scheduleClose();
    } catch (error) {
      console.error("Failed to delete appointment", error);
    } finally {
      setActionPending(false);
    }
  }, [selectedAppt, actionPending, store, scheduleClose]);

  const handleStatusChange = useCallback(async (status: AppointmentStatus) => {
    if (!selectedAppt || selectedAppt.status === status) return;
    setStatusUpdatePending(true);
    try {
      await store.updateAppointmentStatus(selectedAppt.id, status);
      setSelectedAppt((current) => current ? { ...current, status } : current);
    } catch (error) {
      console.error("Failed to update appointment status", error);
    } finally {
      setStatusUpdatePending(false);
    }
  }, [selectedAppt, store]);

  return {
    selectedAppt, actionMode, setActionMode, openAction, closeModal,
    // Reschedule
    rescheduleDate, setRescheduleDate, rescheduleTime, setRescheduleTime,
    rescheduleSuccess, handleReschedule,
    // Edit
    editForm, setEditForm, editSuccess, handleEdit,
    // Delete
    deleteSuccess, handleDelete, actionPending,
    statusUpdatePending, handleStatusChange,
  };
}
