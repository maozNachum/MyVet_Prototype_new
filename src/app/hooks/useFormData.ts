import { useState } from "react";

/**
 * Generic form-state manager.
 *
 * Replaces the repetitive `useState` + `handleChange` pattern that was
 * duplicated across NewAppointment, PatientRegistration, and Dashboard.
 *
 * Usage:
 *   const { formData, handleChange, reset } = useFormData({ name: "", age: "" });
 */
export function useFormData<T extends Record<string, string>>(initialValues: T) {
  const [formData, setFormData] = useState<T>(initialValues);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const reset = () => setFormData(initialValues);

  return { formData, setFormData, handleChange, reset };
}
