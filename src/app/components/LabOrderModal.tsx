import { useState } from "react";
import {
  X,
  TestTube,
  Plus,
  Trash2,
  AlertTriangle,
  Check,
  Zap,
} from "lucide-react";
import { useLabStore, type LabOrder } from "../data/LabStore";
import { getStaffLabel } from "../data/staffAuth";
import { LAB_CATEGORIES } from "../data/categoryConfig";

interface LabOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: number;
  petName: string;
}

interface PendingTest {
  id: number;
  testName: string;
  category: LabOrder["category"];
  urgent: boolean;
  notes: string;
}

// Derived array from the central LAB_CATEGORIES config
const categories = (Object.entries(LAB_CATEGORIES) as [LabOrder["category"], (typeof LAB_CATEGORIES)[keyof typeof LAB_CATEGORIES]][]).map(
  ([id, cfg]) => ({ id, ...cfg })
);

const commonTests: { name: string; category: LabOrder["category"] }[] = [
  { name: "ספירת דם מלאה (CBC)", category: "blood" },
  { name: "פאנל ביוכימי", category: "blood" },
  { name: "פאנל כבד", category: "blood" },
  { name: "פאנל כליות", category: "blood" },
  { name: "פאנל תריס (T4)", category: "blood" },
  { name: "פאנל קרישה", category: "blood" },
  { name: "בדיקת סוכר", category: "blood" },
  { name: "בדיקת שתן כללית", category: "urine" },
  { name: "תרבית שתן", category: "urine" },
  { name: "צילום חזה", category: "imaging" },
  { name: "צילום בטן", category: "imaging" },
  { name: "אולטרסאונד בטני", category: "imaging" },
  { name: "אקו לב", category: "imaging" },
  { name: "בדיקת שריטת עור", category: "biopsy" },
  { name: "ביופסיית עור", category: "biopsy" },
  { name: "ציטולוגיה", category: "biopsy" },
];

export function LabOrderModal({ isOpen, onClose, patientId, petName }: LabOrderModalProps) {
  const { addLabOrder } = useLabStore();
  const currentUser = getStaffLabel();

  const [pendingTests, setPendingTests] = useState<PendingTest[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<LabOrder["category"] | "all">("all");
  const [customTestName, setCustomTestName] = useState("");
  const [customCategory, setCustomCategory] = useState<LabOrder["category"]>("blood");
  const [showCustom, setShowCustom] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const filteredCommonTests =
    selectedCategory === "all"
      ? commonTests
      : commonTests.filter((t) => t.category === selectedCategory);

  const addTest = (testName: string, category: LabOrder["category"]) => {
    if (pendingTests.some((t) => t.testName === testName)) return;
    setPendingTests((prev) => [
      ...prev,
      { id: Date.now(), testName, category, urgent: false, notes: "" },
    ]);
    setError("");
  };

  const removeTest = (id: number) =>
    setPendingTests((prev) => prev.filter((t) => t.id !== id));

  const toggleUrgent = (id: number) =>
    setPendingTests((prev) =>
      prev.map((t) => (t.id === id ? { ...t, urgent: !t.urgent } : t))
    );

  const updateNotes = (id: number, notes: string) =>
    setPendingTests((prev) =>
      prev.map((t) => (t.id === id ? { ...t, notes } : t))
    );

  const addCustomTest = () => {
    if (!customTestName.trim()) return;
    addTest(customTestName.trim(), customCategory);
    setCustomTestName("");
    setShowCustom(false);
  };

  const handleSubmit = () => {
    if (pendingTests.length === 0) {
      setError("יש לבחור לפחות בדיקה אחת");
      return;
    }
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    for (const test of pendingTests) {
      addLabOrder({
        patientId,
        petName,
        testName: test.testName,
        category: test.category,
        status: "ordered",
        orderedDate: dateStr,
        orderedBy: currentUser,
        urgent: test.urgent,
        notes: test.notes || undefined,
      });
    }
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      setPendingTests([]);
      onClose();
    }, 1800);
  };

  const inputCls =
    "w-full px-3.5 py-2.5 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-[14px]";

  const isTestSelected = (name: string) =>
    pendingTests.some((t) => t.testName === name);

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh", fontFamily: "'Heebo', sans-serif" }}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-teal-600 to-teal-700 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 rounded-xl p-2">
              <TestTube className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>
                הזמנת בדיקות מעבדה
              </h3>
              <p className="text-white/60 text-[12px]">
                {petName} • מזמין/ה: {currentUser}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white cursor-pointer p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isSaved ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
                <Check className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-gray-900 text-[20px] mb-2" style={{ fontWeight: 700 }}>
                הבדיקות הוזמנו בהצלחה!
              </h3>
              <p className="text-gray-500 text-[14px]">
                {pendingTests.length} בדיקות הוזמנו עבור {petName}
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-[13px]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Category Filter — uses LAB_CATEGORIES */}
              <div className="mb-5">
                <p className="text-gray-600 text-[13px] mb-2" style={{ fontWeight: 500 }}>
                  סינון לפי קטגוריה:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className={`px-3 py-1.5 rounded-lg text-[12px] border transition-all cursor-pointer ${
                      selectedCategory === "all"
                        ? "bg-gray-800 text-white border-gray-800"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                    }`}
                    style={{ fontWeight: selectedCategory === "all" ? 600 : 400 }}
                  >
                    הכל
                  </button>
                  {categories.map((cat) => {
                    const CIcon = cat.icon;
                    const active = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border transition-all cursor-pointer ${
                          active ? `${cat.color} shadow-sm` : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}
                        style={{ fontWeight: active ? 600 : 400 }}
                      >
                        <CIcon className="w-3.5 h-3.5" />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Common Tests Grid */}
              <div className="mb-5">
                <p className="text-gray-600 text-[13px] mb-2" style={{ fontWeight: 500 }}>
                  בחרו בדיקות (לחיצה להוספה):
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {filteredCommonTests.map((test) => {
                    const cat = categories.find((c) => c.id === test.category)!;
                    const CIcon = cat.icon;
                    const selected = isTestSelected(test.name);
                    return (
                      <button
                        key={test.name}
                        onClick={() =>
                          selected
                            ? removeTest(pendingTests.find((t) => t.testName === test.name)!.id)
                            : addTest(test.name, test.category)
                        }
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-right ${
                          selected
                            ? "bg-teal-50 border-teal-300 ring-1 ring-teal-200 shadow-sm"
                            : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            selected
                              ? "bg-teal-100"
                              : cat.color.split(" ").slice(0, 1).join(" ")
                          }`}
                        >
                          {selected ? (
                            <Check className="w-4 h-4 text-teal-600" />
                          ) : (
                            <CIcon className={`w-4 h-4 ${cat.color.split(" ")[1]}`} />
                          )}
                        </div>
                        <span
                          className={`text-[13px] ${selected ? "text-teal-700" : "text-gray-700"}`}
                          style={{ fontWeight: selected ? 600 : 400 }}
                        >
                          {test.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Test */}
              <div className="mb-6">
                {showCustom ? (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                    <p className="text-gray-700 text-[13px]" style={{ fontWeight: 600 }}>
                      בדיקה מותאמת אישית
                    </p>
                    <input
                      type="text"
                      value={customTestName}
                      onChange={(e) => setCustomTestName(e.target.value)}
                      className={inputCls}
                      placeholder="שם הבדיקה..."
                      onKeyDown={(e) => e.key === "Enter" && addCustomTest()}
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={customCategory}
                        onChange={(e) =>
                          setCustomCategory(e.target.value as LabOrder["category"])
                        }
                        className="px-3 py-2 border border-gray-200 rounded-lg text-[13px] bg-white focus:outline-none cursor-pointer"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={addCustomTest}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[13px] cursor-pointer transition-colors"
                        style={{ fontWeight: 500 }}
                      >
                        הוסף
                      </button>
                      <button
                        onClick={() => { setShowCustom(false); setCustomTestName(""); }}
                        className="px-4 py-2 border border-gray-200 rounded-lg text-gray-500 text-[13px] cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        ביטול
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCustom(true)}
                    className="flex items-center gap-1.5 text-teal-600 hover:text-teal-700 text-[13px] cursor-pointer transition-colors"
                    style={{ fontWeight: 500 }}
                  >
                    <Plus className="w-4 h-4" />
                    הוסף בדיקה מותאמת אישית
                  </button>
                )}
              </div>

              {/* Selected Tests Summary */}
              {pendingTests.length > 0 && (
                <div className="border-t border-gray-100 pt-5">
                  <p className="text-gray-800 text-[14px] mb-3" style={{ fontWeight: 600 }}>
                    בדיקות שנבחרו ({pendingTests.length}):
                  </p>
                  <div className="space-y-3">
                    {pendingTests.map((test) => {
                      const cat = categories.find((c) => c.id === test.category)!;
                      const CIcon = cat.icon;
                      return (
                        <div
                          key={test.id}
                          className="bg-gray-50/70 border border-gray-100 rounded-xl p-3.5"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                  cat.color.split(" ").slice(0, 1).join(" ")
                                }`}
                              >
                                <CIcon className={`w-3.5 h-3.5 ${cat.color.split(" ")[1]}`} />
                              </div>
                              <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>
                                {test.testName}
                              </span>
                              <span
                                className={`text-[13px] px-2 py-0.5 rounded-md border ${cat.color}`}
                                style={{ fontWeight: 500 }}
                              >
                                {cat.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleUrgent(test.id)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[13px] border transition-all cursor-pointer ${
                                  test.urgent
                                    ? "bg-red-50 text-red-600 border-red-200"
                                    : "bg-white text-gray-500 font-medium border-gray-200 hover:border-gray-300"
                                }`}
                                style={{ fontWeight: test.urgent ? 600 : 400 }}
                              >
                                <Zap className="w-3 h-3" />
                                דחוף
                              </button>
                              <button
                                onClick={() => removeTest(test.id)}
                                className="text-gray-300 hover:text-red-400 cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={test.notes}
                            onChange={(e) => updateNotes(test.id, e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-300 transition-all"
                            placeholder="הערות (אופציונלי)..."
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isSaved && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0 bg-gray-50/30">
            <button
              onClick={handleSubmit}
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2"
              style={{ fontWeight: 600 }}
            >
              <TestTube className="w-4 h-4" />
              שלח הזמנה ({pendingTests.length} בדיקות)
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]"
              style={{ fontWeight: 500 }}
            >
              ביטול
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
