export interface Pet {
  id: number;
  name: string;
  species: string;
  speciesType: "dog" | "cat" | "bird" | "rabbit" | "hamster" | "other";
  gender: string;
  age: number;
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
  owner: { id: string; name: string; phone: string; email: string; address: string; };
  lastVisit: string;
  nextAppointment?: string;
}

export const patients: Patient[] = [
  { id: 1, pet: { id: 1, name: "ניקו", species: "חתול", speciesType: "cat", gender: "זכר", age: 3, breed: "בריטי", microchip: "9851", weight: "4.8 ק״ג", allergies: "פניצילין" }, owner: { id: "316", name: "שרה לוי", phone: "054-7891234", email: "sharah@ex.com", address: "תל אביב" }, lastVisit: "13/03/2026" },
  { id: 2, pet: { id: 2, name: "רקס", species: "כלב", speciesType: "dog", gender: "זכר", age: 5, breed: "גולדן", microchip: "9852", weight: "32 ק״ג", allergies: "" }, owner: { id: "204", name: "יוסי כהן", phone: "052-3456789", email: "yosi@ex.com", address: "חיפה" }, lastVisit: "15/03/2026" },
  { id: 3, pet: { id: 3, name: "לונה", species: "כלב", speciesType: "dog", gender: "נקבה", age: 2, breed: "לברדור", microchip: "9853", weight: "28 ק״ג", allergies: "חיטה" }, owner: { id: "301", name: "מיכל לוי", phone: "050-9876543", email: "michal@ex.com", address: "רמת גן" }, lastVisit: "14/03/2026" },
  { id: 4, pet: { id: 4, name: "מקס", species: "כלב", speciesType: "dog", gender: "זכר", age: 7, breed: "רועה גרמני", microchip: "9854", weight: "38 ק״ג", allergies: "" }, owner: { id: "209", name: "דני אברהם", phone: "053-1112233", email: "dani@ex.com", address: "ירושלים" }, lastVisit: "10/02/2026" },
  { id: 5, pet: { id: 5, name: "מיאו", species: "חתול", speciesType: "cat", gender: "נקבה", age: 4, breed: "פרסי", microchip: "9855", weight: "3.5 ק״ג", allergies: "" }, owner: { id: "312", name: "שרה גולדברג", phone: "058-4445566", email: "sarahg@ex.com", address: "הרצליה" }, lastVisit: "01/03/2026" },
  { id: 6, pet: { id: 6, name: "באדי", species: "כלב", speciesType: "dog", gender: "זכר", age: 1, breed: "פודל", microchip: "9856", weight: "8 ק״ג", allergies: "עוף" }, owner: { id: "207", name: "רונית שמש", phone: "054-2223344", email: "ronit@ex.com", address: "תל אביב" }, lastVisit: "28/02/2026" },
];

export const medicalHistory: MedicalVisit[] = [
  { id: 1, patientId: 2, date: "15/03/2026", title: "ניקוי אוזניים", description: "טיפול מקומי", vet: 'ד"ר שרה לוי', type: "checkup", cost: 85, paymentStatus: "unpaid" },
  { id: 2, patientId: 3, date: "14/03/2026", title: "צילום רנטגן", description: "צילום בטן", vet: 'ד"ר דוד מזרחי', type: "emergency", cost: 220, paymentStatus: "unpaid" },
  { id: 3, patientId: 1, date: "13/03/2026", title: "משחת Surolan", description: "טיפול בעור", vet: 'ד"ר יוסי כהן', type: "checkup", cost: 65, paymentStatus: "unpaid" },
  { id: 4, patientId: 6, date: "10/03/2026", title: "בדיקת צואה", description: "מעבדה", vet: 'ד"ר דוד מזרחי', type: "checkup", cost: 120, paymentStatus: "unpaid" },
  { id: 5, patientId: 6, date: "10/03/2026", title: "טיפול תולעים", description: "Drontal", vet: 'ד"ר דוד מזרחי', type: "checkup", cost: 45, paymentStatus: "unpaid" },
  { id: 6, patientId: 2, date: "25/02/2026", title: "חיסון שנתי", description: "כלבת + משושה", vet: 'ד"ר יוסי כהן', type: "vaccination", cost: 165, paymentStatus: "paid" },
];