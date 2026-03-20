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

export interface Owner {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
}

export interface Patient {
  id: number;
  pet: Pet;
  owner: Owner;
  lastVisit: string;
  nextAppointment?: string;
}

export interface MedicalVisit {
  id: number;
  patientId: number;
  date: string;
  title: string;
  description: string;
  vet: string;
  type: "checkup" | "surgery" | "vaccination" | "emergency" | "dental";
}

export const patients: Patient[] = [
  {
    id: 1,
    pet: {
      id: 1,
      name: "ניקו",
      species: "חתול",
      speciesType: "cat",
      gender: "זכר",
      age: 3,
      breed: "בריטי קצר שיער",
      microchip: "985120032847561",
      weight: "4.8 ק״ג",
      allergies: "רגישות לפניצילין",
    },
    owner: {
      id: "316548920",
      name: "שרה לוי",
      phone: "054-7891234",
      email: "sharahlevi@example.com",
      address: "הרצל 15, תל אביב",
    },
    lastVisit: "02/03/2026",
    nextAppointment: "15/04/2026",
  },
  {
    id: 2,
    pet: {
      id: 2,
      name: "רקס",
      species: "כלב",
      speciesType: "dog",
      gender: "זכר",
      age: 5,
      breed: "גולדן רטריבר",
      microchip: "985120045632187",
      weight: "32 ק״ג",
      allergies: "",
    },
    owner: {
      id: "204567891",
      name: "יוסי כהן",
      phone: "052-3456789",
      email: "yosikahan@example.com",
      address: "ויצמן 42, חיפה",
    },
    lastVisit: "25/02/2026",
    nextAppointment: "02/03/2026",
  },
  {
    id: 3,
    pet: {
      id: 3,
      name: "לונה",
      species: "כלב",
      speciesType: "dog",
      gender: "נקבה",
      age: 2,
      breed: "לברדור",
      microchip: "985120078956321",
      weight: "28 ק״ג",
      allergies: "רגישות לחיטה",
    },
    owner: {
      id: "301234567",
      name: "מיכל לוי",
      phone: "050-9876543",
      email: "michallevi@example.com",
      address: "בן גוריון 8, רמת גן",
    },
    lastVisit: "18/02/2026",
  },
  {
    id: 4,
    pet: {
      id: 4,
      name: "מקס",
      species: "כלב",
      speciesType: "dog",
      gender: "זכר",
      age: 7,
      breed: "רועה גרמני",
      microchip: "985120012345678",
      weight: "38 ק״ג",
      allergies: "",
    },
    owner: {
      id: "209876543",
      name: "דני אברהם",
      phone: "053-1112233",
      email: "daniahav@example.com",
      address: "הנביאים 22, ירושלים",
    },
    lastVisit: "10/02/2026",
    nextAppointment: "10/03/2026",
  },
  {
    id: 5,
    pet: {
      id: 5,
      name: "מיאו",
      species: "חתול",
      speciesType: "cat",
      gender: "נקבה",
      age: 4,
      breed: "פרסי",
      microchip: "985120098765432",
      weight: "3.5 ק״ג",
      allergies: "",
    },
    owner: {
      id: "312345678",
      name: "שרה גולדברג",
      phone: "058-4445566",
      email: "sharahgoldeberg@example.com",
      address: "סוקולוב 10, הרצליה",
    },
    lastVisit: "01/03/2026",
  },
  {
    id: 6,
    pet: {
      id: 6,
      name: "באדי",
      species: "כלב",
      speciesType: "dog",
      gender: "זכר",
      age: 1,
      breed: "פודל",
      microchip: "985120065478932",
      weight: "8 ק״ג",
      allergies: "רגישות לעוף",
    },
    owner: {
      id: "207654321",
      name: "רונית שמש",
      phone: "054-2223344",
      email: "ronitshamash@example.com",
      address: "אלנבי 55, תל אביב",
    },
    lastVisit: "28/02/2026",
    nextAppointment: "28/03/2026",
  },
];

export const medicalHistory: MedicalVisit[] = [
  {
    id: 1,
    patientId: 1,
    date: "12/08/2025",
    title: "דלקת אוזניים",
    description: "טופל בטיפות אוזניים - Otomax, טיפול למשך 10 ימים",
    vet: 'ד"ר שרה לוי',
    type: "checkup",
  },
  {
    id: 2,
    patientId: 1,
    date: "01/01/2025",
    title: "סירוס",
    description: "ניתוח סירוס שגרתי, החלמה תקינה",
    vet: 'ד"ר דוד מזרחי',
    type: "surgery",
  },
  {
    id: 3,
    patientId: 1,
    date: "15/05/2024",
    title: "חיסון משושה",
    description: "חיסון FVRCP - מנת חיזוק שנתית",
    vet: 'ד"ר יוסי כהן',
    type: "vaccination",
  },
  {
    id: 4,
    patientId: 2,
    date: "25/02/2026",
    title: "חיסון שנתי",
    description: "חיסון כלבת + משושה שנתי",
    vet: 'ד"ר יוסי כהן',
    type: "vaccination",
  },
  {
    id: 5,
    patientId: 3,
    date: "18/02/2026",
    title: "בדיקה כללית",
    description: "בדיקה שגרתית, ממצאים תקינים",
    vet: 'ד"ר שרה לוי',
    type: "checkup",
  },
  {
    id: 6,
    patientId: 4,
    date: "10/02/2026",
    title: "ניתוח חירום",
    description: "ניתוח הסרת גוף זר ממערכת העיכול",
    vet: 'ד"ר דוד מזרחי',
    type: "emergency",
  },
];