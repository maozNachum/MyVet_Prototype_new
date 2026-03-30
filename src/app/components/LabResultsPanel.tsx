import { useState } from "react";
import {
  TestTube,
  Clock,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
  FileText,
  Plus,
  Download,
  Save,
  ArrowLeftRight,
  Check,
} from "lucide-react";
import { useLabStore, categoryLabels, type LabOrder } from "../data/LabStore";
import { LabOrderModal } from "./LabOrderModal";
import { canEditMedicalRecords } from "../data/staffAuth";
import { exportLabResults } from "../hooks/useExportLabResults";
import { LAB_CATEGORIES } from "../data/categoryConfig";

interface LabResultsPanelProps {
  patientId: number;
  petName: string;
}

const statusConfig: Record<
  LabOrder["status"],
  { label: string; color: string; icon: typeof Clock }
> = {
  ordered: { label: "הוזמנה", color: "bg-blue-50 text-blue-600 border-blue-200", icon: Clock },
  "in-progress": { label: "בביצוע", color: "bg-amber-50 text-amber-600 border-amber-200", icon: Loader2 },
  completed: { label: "הושלמה", color: "bg-emerald-50 text-emerald-600 border-emerald-200", icon: CheckCircle2 },
};

const resultStatusConfig: Record<string, { label: string; color: string }> = {
  normal: { label: "תקין", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  abnormal: { label: "חריג", color: "bg-amber-50 text-amber-700 border-amber-200" },
  critical: { label: "קריטי", color: "bg-red-50 text-red-700 border-red-200" },
};

type FilterStatus = "all" | LabOrder["status"];

interface UpdateFormState {
  results: string;
  resultValue: string;
  normalRange: string;
  resultStatus: "normal" | "abnormal" | "critical";
  notes: string;
}

const emptyUpdateForm: UpdateFormState = {
  results: "",
  resultValue: "",
  normalRange: "",
  resultStatus: "normal",
  notes: "",
};

export function LabResultsPanel({ patientId, petName }: LabResultsPanelProps) {
  const { getLabOrdersForPatient, updateLabOrder } = useLabStore();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [updateForm, setUpdateForm] = useState<UpdateFormState>(emptyUpdateForm);
  const [savedId, setSavedId] = useState<number | null>(null);

  const allOrders = getLabOrdersForPatient(patientId);
  const filteredOrders =
    filterStatus === "all"
      ? allOrders
      : allOrders.filter((o) => o.status === filterStatus);

  const counts = {
    all: allOrders.length,
    ordered: allOrders.filter((o) => o.status === "ordered").length,
    "in-progress": allOrders.filter((o) => o.status === "in-progress").length,
    completed: allOrders.filter((o) => o.status === "completed").length,
  };

  const startEditing = (order: LabOrder) => {
    setEditingId(order.id);
    setUpdateForm({
      results: order.results || "",
      resultValue: order.resultValue || "",
      normalRange: order.normalRange || "",
      resultStatus:
        (order.resultStatus as "normal" | "abnormal" | "critical") || "normal",
      notes: order.notes || "",
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setUpdateForm(emptyUpdateForm);
  };

  const advanceStatus = (order: LabOrder) => {
    if (order.status === "ordered") {
      updateLabOrder(order.id, { status: "in-progress" });
    } else if (order.status === "in-progress") {
      startEditing(order);
    }
  };

  const saveResults = (orderId: number) => {
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(
      now.getMonth() + 1
    ).padStart(2, "0")}/${now.getFullYear()}`;
    updateLabOrder(orderId, {
      status: "completed",
      results: updateForm.results,
      resultValue: updateForm.resultValue || undefined,
      normalRange: updateForm.normalRange || undefined,
      resultStatus: updateForm.resultStatus,
      completedDate: dateStr,
      notes: updateForm.notes || undefined,
    });
    setEditingId(null);
    setUpdateForm(emptyUpdateForm);
    setSavedId(orderId);
    setTimeout(() => setSavedId(null), 2000);
  };

  const inputCls =
    "w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all text-[13px]";

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <TestTube className="w-5 h-5 text-teal-500" />
            <h3 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>
              בדיקות מעבדה
            </h3>
            <span className="text-gray-500 font-medium text-[13px]">({allOrders.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {allOrders.length > 0 && (
              <button
                onClick={() => exportLabResults(petName, allOrders)}
                className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-2 rounded-xl text-[12px] cursor-pointer transition-colors border border-transparent hover:border-emerald-200"
                style={{ fontWeight: 500 }}
              >
                <Download className="w-3.5 h-3.5" />
                ייצוא לאקסל
              </button>
            )}
            {canEditMedicalRecords() && (
              <button
                onClick={() => setShowOrderModal(true)}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-[13px] cursor-pointer transition-colors shadow-sm"
                style={{ fontWeight: 600 }}
              >
                <Plus className="w-4 h-4" />
                הזמן בדיקות
              </button>
            )}
          </div>
        </div>

        {/* Status Filter */}
        <div className="px-6 py-3 border-b border-gray-50 bg-gray-50/30 flex gap-2 flex-wrap">
          {(
            [
              { key: "all" as FilterStatus, label: "הכל" },
              { key: "ordered" as FilterStatus, label: "ממתינות" },
              { key: "in-progress" as FilterStatus, label: "בביצוע" },
              { key: "completed" as FilterStatus, label: "הושלמו" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] border transition-all cursor-pointer ${
                filterStatus === f.key
                  ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}
              style={{ fontWeight: filterStatus === f.key ? 600 : 400 }}
            >
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="p-6">
          {filteredOrders.length > 0 ? (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                // ── Use LAB_CATEGORIES from central config ──
                const catCfg = LAB_CATEGORIES[order.category];
                const CIcon = catCfg.icon;
                const catColor = catCfg.color;

                const status = statusConfig[order.status];
                const SIcon = status.icon;
                const isExpanded = expandedId === order.id;
                const isEditing = editingId === order.id;
                const justSaved = savedId === order.id;

                return (
                  <div
                    key={order.id}
                    className={`border rounded-xl overflow-hidden transition-all ${
                      justSaved
                        ? "border-emerald-300 shadow-md bg-emerald-50/20"
                        : isExpanded
                        ? "border-teal-200 shadow-md"
                        : "border-gray-100 hover:border-gray-200 hover:shadow-sm"
                    }`}
                  >
                    {/* Order Header */}
                    <button
                      onClick={() => {
                        setExpandedId(isExpanded ? null : order.id);
                        if (isExpanded) cancelEditing();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-gray-50/50 text-right"
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          catColor.split(" ").slice(0, 1).join(" ")
                        }`}
                      >
                        <CIcon className={`w-4.5 h-4.5 ${catColor.split(" ")[1]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>
                            {order.testName}
                          </span>
                          {order.urgent && (
                            <span
                              className="flex items-center gap-0.5 bg-red-50 text-red-500 border border-red-200 rounded-md px-1.5 py-0.5 text-[10px]"
                              style={{ fontWeight: 600 }}
                            >
                              <Zap className="w-3 h-3" />
                              דחוף
                            </span>
                          )}
                          {justSaved && (
                            <span
                              className="flex items-center gap-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-md px-2 py-0.5 text-[10px]"
                              style={{ fontWeight: 600 }}
                            >
                              <Check className="w-3 h-3" />
                              נשמר!
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[12px] text-gray-500 font-medium">
                          <span>{order.orderedDate}</span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[13px] ${status.color}`}
                            style={{ fontWeight: 500 }}
                          >
                            <SIcon className="w-3 h-3" />
                            {status.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[13px] ${catColor}`}>
                            {categoryLabels[order.category]}
                          </span>
                        </div>
                      </div>
                      {order.status === "completed" && order.resultStatus && (
                        <span
                          className={`px-2.5 py-1 rounded-lg border text-[13px] shrink-0 ${
                            resultStatusConfig[order.resultStatus]?.color || ""
                          }`}
                          style={{ fontWeight: 600 }}
                        >
                          {resultStatusConfig[order.resultStatus]?.label || ""}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-500 font-medium shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-500 font-medium shrink-0" />
                      )}
                    </button>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/30">
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <p className="text-gray-500 font-medium text-[13px] mb-0.5" style={{ fontWeight: 500 }}>תאריך הזמנה</p>
                            <p className="text-gray-700 text-[13px]">{order.orderedDate}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 font-medium text-[13px] mb-0.5" style={{ fontWeight: 500 }}>הוזמן ע״י</p>
                            <p className="text-gray-700 text-[13px]">{order.orderedBy}</p>
                          </div>
                          {order.completedDate && (
                            <div>
                              <p className="text-gray-500 font-medium text-[13px] mb-0.5" style={{ fontWeight: 500 }}>תאריך השלמה</p>
                              <p className="text-gray-700 text-[13px]">{order.completedDate}</p>
                            </div>
                          )}
                        </div>

                        {order.status === "completed" && order.results && !isEditing && (
                          <div className="bg-white border border-gray-100 rounded-xl p-4 mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="w-4 h-4 text-teal-500" />
                              <p className="text-gray-800 text-[13px]" style={{ fontWeight: 600 }}>תוצאות</p>
                              {order.resultStatus && (
                                <span
                                  className={`px-2 py-0.5 rounded-md border text-[13px] ${
                                    resultStatusConfig[order.resultStatus]?.color || ""
                                  }`}
                                  style={{ fontWeight: 600 }}
                                >
                                  {resultStatusConfig[order.resultStatus]?.label}
                                </span>
                              )}
                            </div>
                            <p className="text-gray-600 text-[13px] mb-2" style={{ lineHeight: 1.7 }}>
                              {order.results}
                            </p>
                            {order.resultValue && (
                              <div className="bg-gray-50 rounded-lg p-3 mb-2">
                                <p className="text-gray-500 font-medium text-[13px] mb-1" style={{ fontWeight: 500 }}>ערכים</p>
                                <p className="text-gray-800 text-[13px] font-mono">{order.resultValue}</p>
                              </div>
                            )}
                            {order.normalRange && (
                              <div className="bg-blue-50/50 rounded-lg p-3">
                                <p className="text-gray-500 font-medium text-[13px] mb-1" style={{ fontWeight: 500 }}>טווח נורמלי</p>
                                <p className="text-blue-700 text-[13px] font-mono">{order.normalRange}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {order.status !== "completed" && !isEditing && (
                          <div className="space-y-3">
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                              <p className="text-blue-600 text-[12px]">
                                {order.status === "ordered"
                                  ? "הבדיקה הוזמנה וממתינה לביצוע"
                                  : "הבדיקה בתהליך — תוצאות צפויות בקרוב"}
                              </p>
                            </div>
                            {canEditMedicalRecords() && (
                              <div className="flex gap-2">
                                {order.status === "ordered" && (
                                  <button
                                    onClick={() => advanceStatus(order)}
                                    className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-[12px] cursor-pointer transition-colors shadow-sm"
                                    style={{ fontWeight: 600 }}
                                  >
                                    <ArrowLeftRight className="w-3.5 h-3.5" />
                                    העבר ל״בביצוע״
                                  </button>
                                )}
                                <button
                                  onClick={() => startEditing(order)}
                                  className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-[12px] cursor-pointer transition-colors shadow-sm"
                                  style={{ fontWeight: 600 }}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  הזן תוצאות והשלם
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {isEditing && (
                          <div className="bg-white border-2 border-teal-200 rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-2 mb-1">
                              <FileText className="w-4 h-4 text-teal-600" />
                              <h4 className="text-gray-900 text-[14px]" style={{ fontWeight: 700 }}>
                                הזנת תוצאות בדיקה
                              </h4>
                            </div>
                            <div>
                              <label className="block text-gray-700 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>
                                סיכום תוצאות <span className="text-red-400">*</span>
                              </label>
                              <textarea
                                value={updateForm.results}
                                onChange={(e) => setUpdateForm((f) => ({ ...f, results: e.target.value }))}
                                rows={3}
                                className={`${inputCls} resize-none`}
                                placeholder="תיאור מילולי של התוצאות..."
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-gray-700 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>ערכים מספריים</label>
                                <input
                                  type="text"
                                  value={updateForm.resultValue}
                                  onChange={(e) => setUpdateForm((f) => ({ ...f, resultValue: e.target.value }))}
                                  className={inputCls}
                                  placeholder="לדוגמה: WBC: 8.5, RBC: 6.2"
                                />
                              </div>
                              <div>
                                <label className="block text-gray-700 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>טווח נורמלי</label>
                                <input
                                  type="text"
                                  value={updateForm.normalRange}
                                  onChange={(e) => setUpdateForm((f) => ({ ...f, normalRange: e.target.value }))}
                                  className={inputCls}
                                  placeholder="לדוגמה: WBC: 5.5-16.9, RBC: 5.5-8.5"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-gray-700 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>סטטוס תוצאה</label>
                              <div className="flex gap-2">
                                {(["normal", "abnormal", "critical"] as const).map((rs) => (
                                  <button
                                    key={rs}
                                    onClick={() => setUpdateForm((f) => ({ ...f, resultStatus: rs }))}
                                    className={`px-4 py-2 rounded-lg border text-[12px] transition-all cursor-pointer ${
                                      updateForm.resultStatus === rs
                                        ? `${resultStatusConfig[rs].color} shadow-sm ring-1 ring-current/20`
                                        : "bg-white text-gray-500 font-medium border-gray-200 hover:border-gray-300"
                                    }`}
                                    style={{ fontWeight: updateForm.resultStatus === rs ? 600 : 400 }}
                                  >
                                    {resultStatusConfig[rs].label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="block text-gray-700 text-[12px] mb-1.5" style={{ fontWeight: 500 }}>הערות נוספות</label>
                              <input
                                type="text"
                                value={updateForm.notes}
                                onChange={(e) => setUpdateForm((f) => ({ ...f, notes: e.target.value }))}
                                className={inputCls}
                                placeholder="הערות, המלצות, מעקב..."
                              />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => saveResults(order.id)}
                                disabled={!updateForm.results.trim()}
                                className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] transition-all cursor-pointer shadow-sm ${
                                  updateForm.results.trim()
                                    ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                    : "bg-gray-100 text-gray-500 font-medium cursor-not-allowed"
                                }`}
                                style={{ fontWeight: 600 }}
                              >
                                <Save className="w-4 h-4" />
                                שמור תוצאות והשלם בדיקה
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-4 py-2.5 border border-gray-200 rounded-lg text-gray-500 text-[13px] hover:bg-gray-50 cursor-pointer transition-colors"
                                style={{ fontWeight: 500 }}
                              >
                                ביטול
                              </button>
                            </div>
                          </div>
                        )}

                        {order.notes && !isEditing && (
                          <div className="mt-3 bg-amber-50/50 border border-amber-100 rounded-lg p-3 flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-amber-700 text-[12px]">{order.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-500 font-medium">
              <TestTube className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-[14px]">
                {filterStatus === "all" ? "אין בדיקות מעבדה" : "אין בדיקות בסטטוס זה"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lab Order Modal */}
      <LabOrderModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        patientId={patientId}
        petName={petName}
      />
    </>
  );
}
