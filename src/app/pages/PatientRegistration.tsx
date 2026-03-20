import { Calendar, AlertCircle } from "lucide-react";
import { useFormData } from "../hooks/useFormData";

const initialValues = {
  ownerId: "",
  ownerName: "",
  address: "",
  phone: "",
  email: "",
  microchipNumber: "",
  petName: "",
  species: "",
  breed: "",
  birthDate: "",
  allergies: "",
};

export function PatientRegistration() {
  const { formData, handleChange } = useFormData(initialValues);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted:", formData);
    // Here you would typically send the data to your backend
    alert("הנתונים נשמרו בהצלחה!");
  };

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-gray-900" style={{ fontWeight: 700 }}>
          רישום לקוח וחיה חדשה
        </h1>
        <p className="text-gray-500 mt-1 text-[15px]">
          מלא את הפרטים המלאים עבור בעל החיה והחיית מחמד
        </p>
      </div>

      {/* Registration Form Card */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Right Column - Owner Details */}
            <div className="space-y-6">
              <h2
                className="text-gray-900 text-[19px] mb-6 pb-3 border-b border-gray-200"
                style={{ fontWeight: 600 }}
              >
                פרטי בעלים
              </h2>

              {/* ID Number */}
              <div>
                <label
                  htmlFor="ownerId"
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  תעודת זהות
                </label>
                <input
                  type="text"
                  id="ownerId"
                  name="ownerId"
                  value={formData.ownerId}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]"
                  placeholder="הזן מספר תעודת זהות"
                  required
                />
              </div>

              {/* Full Name */}
              <div>
                <label
                  htmlFor="ownerName"
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  שם מלא
                </label>
                <input
                  type="text"
                  id="ownerName"
                  name="ownerName"
                  value={formData.ownerName}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]"
                  placeholder="הזן שם מלא"
                  required
                />
              </div>

              {/* Address */}
              <div>
                <label
                  htmlFor="address"
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  כתובת
                </label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]"
                  placeholder="רחוב, עיר, מיקוד"
                  required
                />
              </div>

              {/* Phone */}
              <div>
                <label
                  htmlFor="phone"
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  טלפון
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]"
                  placeholder="050-1234567"
                  required
                />
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  אימייל
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]"
                  placeholder="example@example.com"
                />
              </div>
            </div>

            {/* Left Column - Pet Details */}
            <div className="space-y-6">
              <h2
                className="text-gray-900 text-[19px] mb-6 pb-3 border-b border-gray-200"
                style={{ fontWeight: 600 }}
              >
                פרטי חיית מחמד
              </h2>

              {/* Microchip Number */}
              <div>
                <label
                  htmlFor="microchipNumber"
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  מספר שבב
                </label>
                <input
                  type="text"
                  id="microchipNumber"
                  name="microchipNumber"
                  value={formData.microchipNumber}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]"
                  placeholder="הזן מספר שבב"
                />
              </div>

              {/* Pet Name */}
              <div>
                <label
                  htmlFor="petName"
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  שם החיה
                </label>
                <input
                  type="text"
                  id="petName"
                  name="petName"
                  value={formData.petName}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]"
                  placeholder="הזן שם החיה"
                  required
                />
              </div>

              {/* Species */}
              <div>
                <label
                  htmlFor="species"
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  סוג
                </label>
                <select
                  id="species"
                  name="species"
                  value={formData.species}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px] bg-white"
                  required
                >
                  <option value="">בחר סוג חיה</option>
                  <option value="dog">כלב</option>
                  <option value="cat">חתול</option>
                  <option value="bird">ציפור</option>
                  <option value="rabbit">ארנב</option>
                  <option value="hamster">אוגר</option>
                  <option value="other">אחר</option>
                </select>
              </div>

              {/* Breed */}
              <div>
                <label
                  htmlFor="breed"
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  גזע
                </label>
                <select
                  id="breed"
                  name="breed"
                  value={formData.breed}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px] bg-white"
                  required
                >
                  <option value="">בחר גזע</option>
                  <option value="golden-retriever">גולדן רטריבר</option>
                  <option value="labrador">לברדור</option>
                  <option value="german-shepherd">רועה גרמני</option>
                  <option value="persian-cat">חתול פרסי</option>
                  <option value="siamese">סיאמי</option>
                  <option value="mixed">מעורב</option>
                  <option value="other">אחר</option>
                </select>
              </div>

              {/* Birth Date */}
              <div>
                <label
                  htmlFor="birthDate"
                  className="block text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  תאריך לידה
                </label>
                <div className="relative">
                  <input
                    type="date"
                    id="birthDate"
                    name="birthDate"
                    value={formData.birthDate}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px]"
                    required
                  />
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Allergies */}
              <div>
                <label
                  htmlFor="allergies"
                  className="flex items-center gap-2 text-gray-700 text-[14px] mb-2"
                  style={{ fontWeight: 500 }}
                >
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  <span>אלרגיות / רגישויות</span>
                </label>
                <textarea
                  id="allergies"
                  name="allergies"
                  value={formData.allergies}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-[15px] resize-none"
                  placeholder="פרט כל אלרגיה או רגישות ידועה..."
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="mt-10 pt-6 border-t border-gray-200">
            <button
              type="submit"
              className="bg-[#1e40af] text-white px-8 py-3 rounded-lg hover:bg-[#1e3a8a] transition-colors shadow-sm text-[15px] cursor-pointer"
              style={{ fontWeight: 600 }}
            >
              שמור נתונים במערכת
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
