import { useState, useCallback } from "react";
import { useAppointmentStore, type CalendarAppointment, type AppointmentMode } from "../data/AppointmentStore";
import { addMinutes, type ActionMode, type DateOption } from "../data/calendar-constants";

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

  const closeModal = useCallback(() => {
    setSelectedAppt(null);
    setActionMode("view");
  }, []);

  const openAction = useCallback((appt: CalendarAppointment, mode: ActionMode) => {
    setSelectedAppt(appt);
    setActionMode(mode);
    setRescheduleDate(null);
    setRescheduleTime("");
    setRescheduleSuccess(false);
    setEditSuccess(false);
    setDeleteSuccess(false);
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
  }, []);

  const handleReschedule = useCallback(async () => {
    if (!selectedAppt || !rescheduleDate || !rescheduleTime) return;
    try {
      await store.rescheduleAppointment(
        selectedAppt.id, rescheduleDate.day, rescheduleDate.month,
        rescheduleDate.year, rescheduleTime, addMinutes(rescheduleTime, 30), "staff"
      );
      setRescheduleSuccess(true);
      setTimeout(closeModal, 1800);
    } catch (error) {
      console.error("Failed to reschedule appointment", error);
    }
  }, [selectedAppt, rescheduleDate, rescheduleTime, store, closeModal]);

  const handleEdit = useCallback(async () => {
    if (!selectedAppt) return;
    try {
      await store.editAppointment(selectedAppt.id, { ...editForm }, "staff");
      setEditSuccess(true);
      setTimeout(closeModal, 1800);
    } catch (error) {
      console.error("Failed to edit appointment", error);
    }
  }, [selectedAppt, editForm, store, closeModal]);

  const handleDelete = useCallback(async () => {
    if (!selectedAppt) return;
    try {
      await store.deleteAppointment(selectedAppt.id, "staff");
      setDeleteSuccess(true);
      setTimeout(closeModal, 1800);
    } catch (error) {
      console.error("Failed to delete appointment", error);
    }
  }, [selectedAppt, store, closeModal]);

  return {
    selectedAppt, actionMode, setActionMode, openAction, closeModal,
    // Reschedule
    rescheduleDate, setRescheduleDate, rescheduleTime, setRescheduleTime,
    rescheduleSuccess, handleReschedule,
    // Edit
    editForm, setEditForm, editSuccess, handleEdit,
    // Delete
    deleteSuccess, handleDelete,
  };
}
