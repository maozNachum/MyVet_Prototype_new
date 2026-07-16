export interface Pet {
  id: number;
  name: string;
  species: string;
  speciesType: "dog" | "cat" | "bird" | "rabbit" | "hamster" | "other";
  gender: string;
  age: number;
  birthDate?: string;
  breed: string;
  microchip: string;
  weight: string;
  allergies: string;
}

export interface MedicalVisit {
  id: number;
  patientId: number;
  date: string;
  title: string;
  description: string;
  vet: string;
  type: "checkup" | "surgery" | "vaccination" | "emergency" | "dental";
  cost: number;
  paymentStatus: "paid" | "unpaid";
}

export interface Patient {
  id: number;
  pet: Pet;
  owner: { id: string; name: string; phone: string; email: string; address: string };
  lastVisit: string;
  nextAppointment?: string;
}

// קובץ זה נשאר רק עבור טיפוסים ישנים / export לאקסל.
// נתוני מטופלים אמיתיים נטענים ישירות מ-Supabase.
export const patients: Patient[] = [];
export const medicalHistory: MedicalVisit[] = [];
