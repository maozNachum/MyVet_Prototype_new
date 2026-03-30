import {
  Cat,
  AlertTriangle,
  Clipboard,
  CalendarCheck,
  Syringe,
  Scissors,
  Stethoscope,
  ChevronLeft,
} from "lucide-react";

const pet = {
  name: "ניקו",
  species: "חתול",
  gender: "זכר",
  age: 3,
  breed: "בריטי קצר שיער",
  microchip: "985120032847561",
  ownerId: "316548920",
  ownerName: "שרה לוי",
  ownerPhone: "054-7891234",
  ownerEmail: "sharahlevi@example.com",
  allergies: "רגישות לפניצילין",
  weight: "4.8 ק״ג",
};

const currentVisit = {
  date: "02/03/2026",
  reason: "חיסון שנתי ובדיקה כללית",
  vet: 'ד"ר יוסי כהן',
  time: "10:30",
};

const medicalHistory = [
  {
    id: 1,
    date: "12/08/2025",
    title: "דלקת אוזניים",
    description: "טופל בטיפות אוזניים - Otomax, טיפול למשך 10 ימים",
    vet: 'ד"ר שרה לוי',
    icon: Stethoscope,
    color: "bg-amber-50 text-amber-600 border-amber-200",
  },
  {
    id: 2,
    date: "01/01/2025",
    title: "סירוס",
    description: "ניתוח סירוס שגרתי, החלמה תקינה",
    vet: 'ד"ר דוד מזרחי',
    icon: Scissors,
    color: "bg-purple-50 text-purple-600 border-purple-200",
  },
  {
    id: 3,
    date: "15/05/2024",
    title: "חיסון משושה",
    description: "חיסון FVRCP - מנת חיזוק שנתית",
    vet: 'ד"ר יוסי כהן',
    icon: Syringe,
    color: "bg-blue-50 text-blue-600 border-blue-200",
  },
];

export function PetProfile() {
  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      {/* Page Title */}
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-blue-100 rounded-xl p-2.5">
          <Clipboard className="w-6 h-6 text-[#1e40af]" />
        </div>
        <div>
          <h1
            className="text-gray-900 text-[22px]"
            style={{ fontWeight: 700 }}
          >
            תיק מטופל
          </h1>
          <p className="text-gray-500 text-[14px]">
            צפייה בפרטי מטופל והיסטוריה רפואית
          </p>
        </div>
      </div>

      {/* Pet Identity Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
        <div className="flex flex-wrap items-start gap-6">
          {/* Pet Avatar */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl w-[88px] h-[88px] flex items-center justify-center shrink-0">
            <Cat className="w-11 h-11 text-[#1e40af]" />
          </div>

          {/* Pet Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h2
                className="text-gray-900 text-[24px]"
                style={{ fontWeight: 700 }}
              >
                {pet.name}
              </h2>
              <span className="text-gray-500 text-[15px]">
                {pet.species}, {pet.gender}, בן {pet.age}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-2 text-[14px] text-gray-500 mb-3">
              <span>
                <span style={{ fontWeight: 500 }} className="text-gray-700">
                  גזע:
                </span>{" "}
                {pet.breed}
              </span>
              <span>
                <span style={{ fontWeight: 500 }} className="text-gray-700">
                  משקל:
                </span>{" "}
                {pet.weight}
              </span>
              <span>
                <span style={{ fontWeight: 500 }} className="text-gray-700">
                  שבב:
                </span>{" "}
                {pet.microchip}
              </span>
              <span>
                <span style={{ fontWeight: 500 }} className="text-gray-700">
                  בעלים:
                </span>{" "}
                {pet.ownerName} ({pet.ownerPhone})
              </span>
              <span>
                <span style={{ fontWeight: 500 }} className="text-gray-700">
                  אימייל:
                </span>{" "}
                {pet.ownerEmail}
              </span>
            </div>

            {/* Allergy Warning */}
            <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span
                className="text-red-700 text-[14px]"
                style={{ fontWeight: 600 }}
              >
                אלרגיות: {pet.allergies}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Right Column - Current Visit (3 cols) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
            <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-6 py-4">
              <div className="flex items-center gap-2.5">
                <CalendarCheck className="w-5 h-5 text-white/90" />
                <h3
                  className="text-white text-[17px]"
                  style={{ fontWeight: 600 }}
                >
                  ביקור נוכחי
                </h3>
              </div>
            </div>

            <div className="p-6 flex flex-col flex-1">
              <div className="flex items-center gap-3 text-[14px] text-gray-500 mb-5">
                <span>
                  <span style={{ fontWeight: 500 }} className="text-gray-700">
                    תאריך:
                  </span>{" "}
                  {currentVisit.date}
                </span>
                <span className="text-gray-300">|</span>
                <span>
                  <span style={{ fontWeight: 500 }} className="text-gray-700">
                    שעה:
                  </span>{" "}
                  {currentVisit.time}
                </span>
              </div>

              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-5 mb-6">
                <p
                  className="text-gray-500 text-[13px] mb-1"
                  style={{ fontWeight: 500 }}
                >
                  סיבת הגעה
                </p>
                <p
                  className="text-gray-900 text-[16px]"
                  style={{ fontWeight: 600 }}
                >
                  {currentVisit.reason}
                </p>
              </div>

              <div className="text-[14px] text-gray-500 mb-6">
                <span style={{ fontWeight: 500 }} className="text-gray-700">
                  רופא מטפל:
                </span>{" "}
                {currentVisit.vet}
              </div>

              <div className="mt-auto">
                <button className="w-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white py-3.5 rounded-xl transition-colors shadow-sm cursor-pointer text-[15px] flex items-center justify-center gap-2"
                  style={{ fontWeight: 600 }}
                >
                  התחל טיפול בתיק רפואי
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Left Column - Medical History (2 cols) */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3
                className="text-gray-900 text-[17px]"
                style={{ fontWeight: 600 }}
              >
                היסטוריה רפואית
              </h3>
              <span className="text-gray-500 font-medium text-[13px]">
                {medicalHistory.length} ביקורים
              </span>
            </div>

            <div className="p-6">
              {/* Timeline */}
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute right-[19px] top-4 bottom-4 w-px bg-gray-200" />

                <div className="space-y-0">
                  {medicalHistory.map((visit, index) => {
                    const IconComponent = visit.icon;
                    return (
                      <div key={visit.id} className="relative flex gap-5">
                        {/* Timeline dot */}
                        <div
                          className={`relative z-10 w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${visit.color}`}
                        >
                          <IconComponent className="w-5 h-5" />
                        </div>

                        {/* Content */}
                        <div
                          className={`flex-1 pb-7 ${
                            index === medicalHistory.length - 1 ? "pb-0" : ""
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-1">
                            <span
                              className="text-gray-900 text-[15px]"
                              style={{ fontWeight: 600 }}
                            >
                              {visit.title}
                            </span>
                            <span className="text-gray-500 font-medium text-[13px]">
                              {visit.date}
                            </span>
                          </div>
                          <p className="text-gray-500 text-[14px] mb-1">
                            {visit.description}
                          </p>
                          <p className="text-gray-500 font-medium text-[13px]">
                            {visit.vet}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}