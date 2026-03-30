import { useState } from "react";
import {
  AlertTriangle, PackageX, Shield, Lock, Search,
  ChevronDown, ChevronUp, Pill, Clock, Check,
} from "lucide-react";
import { ReportSearchBar } from "./ReportSearchBar";

// ─── Mock Data ───────────────────────────────────────────────────────
interface ExpiringMed {
  id: number;
  name: string;
  sku: string;
  batchNo: string;
  expiryDate: string;
  daysUntilExpiry: number;
  quantity: number;
  category: "medication" | "vaccine" | "controlled";
}

interface LowStockItem {
  id: number;
  name: string;
  sku: string;
  currentQty: number;
  minQty: number;
  avgDailyUsage: number;
  daysUntilEmpty: number;
}

interface ControlledLog {
  id: number;
  timestamp: string;
  medication: string;
  batchNo: string;
  action: "dispensed" | "received" | "disposed" | "adjusted";
  quantity: number;
  patientName: string | null;
  vet: string;
  remainingStock: number;
  notes: string;
}

const EXPIRING_MEDS: ExpiringMed[] = [
  { id: 1, name: "חיסון כלבת Nobivac", sku: "VAC-001", batchNo: "NB-2024-8891", expiryDate: "28/03/2026", daysUntilExpiry: 10, quantity: 15, category: "vaccine" },
  { id: 2, name: 'אמוקסיצילין 500 מ"ג', sku: "MED-045", batchNo: "AM-2024-3321", expiryDate: "05/04/2026", daysUntilExpiry: 18, quantity: 42, category: "medication" },
  { id: 3, name: "קטמין 100mg/ml", sku: "CTL-003", batchNo: "KT-2025-1102", expiryDate: "12/04/2026", daysUntilExpiry: 25, quantity: 8, category: "controlled" },
  { id: 4, name: "משחת Surolan", sku: "MED-078", batchNo: "SR-2024-5540", expiryDate: "01/04/2026", daysUntilExpiry: 14, quantity: 6, category: "medication" },
  { id: 5, name: "חיסון FVRCP Purevax", sku: "VAC-012", batchNo: "PV-2024-7721", expiryDate: "15/04/2026", daysUntilExpiry: 28, quantity: 22, category: "vaccine" },
];

const LOW_STOCK: LowStockItem[] = [
  { id: 1, name: 'מזרק 5 מ"ל', sku: "CON-030", currentQty: 12, minQty: 50, avgDailyUsage: 8, daysUntilEmpty: 1 },
  { id: 2, name: "כפפות ניטריל M", sku: "CON-015", currentQty: 25, minQty: 100, avgDailyUsage: 15, daysUntilEmpty: 2 },
  { id: 3, name: "Rimadyl 50mg", sku: "MED-022", currentQty: 8, minQty: 30, avgDailyUsage: 3, daysUntilEmpty: 3 },
  { id: 4, name: "תחבושת אלסטית", sku: "CON-050", currentQty: 5, minQty: 20, avgDailyUsage: 2, daysUntilEmpty: 3 },
];

const CONTROLLED_LOG: ControlledLog[] = [
  { id: 1, timestamp: "18/03/2026 09:15", medication: "קטמין 100mg/ml", batchNo: "KT-2025-1102", action: "dispensed", quantity: 2, patientName: "מקס (גרמני)", vet: 'ד"ר דוד מזרחי', remainingStock: 6, notes: "הרדמה לניתוח חירום" },
  { id: 2, timestamp: "18/03/2026 08:30", medication: "בוטורפנול 10mg/ml", batchNo: "BU-2025-0891", action: "dispensed", quantity: 1, patientName: "לונה (לברדור)", vet: 'ד"ר שרה לוי', remainingStock: 12, notes: "משכך כאבים לאחר ניתוח" },
  { id: 3, timestamp: "17/03/2026 14:00", medication: "דיאזפם 5mg/ml", batchNo: "DZ-2025-3340", action: "dispensed", quantity: 1, patientName: "רקס (גולדן)", vet: 'ד"ר יוסי כהן', remainingStock: 9, notes: "טיפול בעוויתות" },
  { id: 4, timestamp: "17/03/2026 10:30", medication: "קטמין 100mg/ml", batchNo: "KT-2025-1102", action: "received", quantity: 10, patientName: null, vet: 'ד"ר דוד מזרחי', remainingStock: 8, notes: "קבלת משלוח - מחסן מרכזי" },
  { id: 5, timestamp: "16/03/2026 16:45", medication: "בוטורפנול 10mg/ml", batchNo: "BU-2025-0891", action: "disposed", quantity: 3, patientName: null, vet: 'ד"ר שרה לוי', remainingStock: 13, notes: "השמדת יתרה — פג תוקף Batch BU-2024-0110" },
  { id: 6, timestamp: "16/03/2026 11:20", medication: "פנטניל 50mcg/ml", batchNo: "FN-2025-5501", action: "dispensed", quantity: 1, patientName: "באדי (פודל)", vet: 'ד"ר דוד מזרחי', remainingStock: 5, notes: "הרדמה + שיכוך כאבים - ניתוח שיניים" },
  { id: 7, timestamp: "15/03/2026 09:00", medication: "דיאזפם 5mg/ml", batchNo: "DZ-2025-3340", action: "adjusted", quantity: -1, patientName: null, vet: 'ד"ר יוסי כהן', remainingStock: 10, notes: "תיקון מלאי — שבר בקבוק" },
];

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  dispensed: { label: "ניפוק", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  received: { label: "קבלה", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  disposed: { label: "השמדה", color: "text-red-700", bg: "bg-red-50 border-red-200" },
  adjusted: { label: "תיקון", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
};

// ─── Component ──────────────────────────────────────────────────────
export function InventoryControl() {
  const [logSearch, setLogSearch] = useState("");
  const [expandedAlert, setExpandedAlert] = useState<"expiring" | "lowstock" | null>("expiring");
  const [inventorySearch, setInventorySearch] = useState("");

  const filteredExpiring = EXPIRING_MEDS.filter((m) => {
    if (!inventorySearch) return true;
    const q = inventorySearch.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q) || m.batchNo.toLowerCase().includes(q) || m.category.includes(q);
  });

  const filteredLowStock = LOW_STOCK.filter((item) => {
    if (!inventorySearch) return true;
    const q = inventorySearch.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
  });

  const filteredLog = logSearch.length > 0
    ? CONTROLLED_LOG.filter((l) =>
        l.medication.includes(logSearch) ||
        l.vet.includes(logSearch) ||
        (l.patientName && l.patientName.includes(logSearch)) ||
        l.batchNo.includes(logSearch)
      )
    : CONTROLLED_LOG;

  return (
    <div className="space-y-6">
      {/* ── Critical Alerts Dashboard ── */}
      <ReportSearchBar value={inventorySearch} onChange={setInventorySearch} placeholder="חיפוש תרופה, מק״ט, אצווה..." />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Expiring medications */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setExpandedAlert(expandedAlert === "expiring" ? null : "expiring")}
            className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center relative">
                <Clock className="w-5 h-5 text-red-500" />
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center" style={{ fontWeight: 700 }}>
                  {filteredExpiring.filter((m) => m.daysUntilExpiry <= 14).length}
                </div>
              </div>
              <div className="text-right">
                <h3 className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>תרופות שפג תוקפן בקרוב</h3>
                <p className="text-red-500 text-[12px]">{filteredExpiring.filter((m) => m.daysUntilExpiry <= 14).length} פריטים ב-14 ימים הקרובים</p>
              </div>
            </div>
            {expandedAlert === "expiring" ? <ChevronUp className="w-4 h-4 text-gray-500 font-medium" /> : <ChevronDown className="w-4 h-4 text-gray-500 font-medium" />}
          </button>
          {expandedAlert === "expiring" && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {filteredExpiring.map((med) => (
                <div key={med.id} className={`px-5 py-3.5 flex items-center gap-3 ${med.daysUntilExpiry <= 14 ? "bg-red-50/30" : ""}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    med.category === "controlled" ? "bg-purple-50" : med.category === "vaccine" ? "bg-blue-50" : "bg-amber-50"
                  }`}>
                    {med.category === "controlled"
                      ? <Shield className="w-4 h-4 text-purple-600" />
                      : <Pill className="w-4 h-4 text-amber-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-gray-900 text-[13px]" style={{ fontWeight: 600 }}>{med.name}</span>
                      {med.category === "controlled" && (
                        <span className="bg-purple-50 text-purple-600 text-[9px] px-1.5 py-0.5 rounded border border-purple-200" style={{ fontWeight: 600 }}>מפוקח</span>
                      )}
                    </div>
                    <p className="text-gray-500 font-medium text-[13px]">Batch: {med.batchNo} · {med.quantity} יחידות</p>
                  </div>
                  <div className="text-left shrink-0">
                    <span className={`text-[13px] ${med.daysUntilExpiry <= 14 ? "text-red-600" : "text-amber-600"}`} style={{ fontWeight: 700 }}>
                      {med.daysUntilExpiry} ימים
                    </span>
                    <p className="text-gray-500 font-medium text-[10px]">{med.expiryDate}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low stock alerts */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setExpandedAlert(expandedAlert === "lowstock" ? null : "lowstock")}
            className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center relative">
                <PackageX className="w-5 h-5 text-amber-600" />
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full text-white text-[10px] flex items-center justify-center" style={{ fontWeight: 700 }}>
                  {filteredLowStock.length}
                </div>
              </div>
              <div className="text-right">
                <h3 className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>מלאי נמוך</h3>
                <p className="text-amber-600 text-[12px]">{filteredLowStock.filter((l) => l.daysUntilEmpty <= 2).length} פריטים קריטיים</p>
              </div>
            </div>
            {expandedAlert === "lowstock" ? <ChevronUp className="w-4 h-4 text-gray-500 font-medium" /> : <ChevronDown className="w-4 h-4 text-gray-500 font-medium" />}
          </button>
          {expandedAlert === "lowstock" && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {filteredLowStock.map((item) => (
                <div key={item.id} className={`px-5 py-3.5 ${item.daysUntilEmpty <= 1 ? "bg-red-50/30" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900 text-[13px]" style={{ fontWeight: 600 }}>{item.name}</span>
                      <span className="text-gray-500 font-medium text-[13px]">({item.sku})</span>
                    </div>
                    <span className={`text-[12px] ${item.daysUntilEmpty <= 1 ? "text-red-600" : "text-amber-600"}`} style={{ fontWeight: 600 }}>
                      {item.daysUntilEmpty <= 1 ? "נגמר היום!" : `${item.daysUntilEmpty} ימים`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          item.currentQty / item.minQty <= 0.25 ? "bg-red-400" : item.currentQty / item.minQty <= 0.5 ? "bg-amber-400" : "bg-emerald-400"
                        }`}
                        style={{ width: `${Math.min((item.currentQty / item.minQty) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-gray-500 text-[13px] shrink-0 w-16 text-left">
                      {item.currentQty}/{item.minQty}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Controlled Substances Audit Log ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center">
                <Lock className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>יומן חומרים מפוקחים (Audit Log)</h3>
                <p className="text-gray-500 font-medium text-[12px]">רשומות בלתי ניתנות לעריכה · מותאם לפיקוח משרד הבריאות</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 font-medium" />
              <input
                type="text"
                placeholder="חיפוש ביומן..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-xl pr-9 pl-4 py-2.5 text-[13px] text-gray-700 w-64 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["תאריך ושעה", "תרופה", "אצווה", "פעולה", "כמות", "מטופל", "רופא/ה", "יתרה", "הערות"].map((h) => (
                  <th key={h} className="py-3 px-3 text-right text-gray-500" style={{ fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLog.map((log) => {
                const actionStyle = ACTION_LABELS[log.action];
                return (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-3 text-gray-600 font-mono text-[13px] whitespace-nowrap">{log.timestamp}</td>
                    <td className="py-3 px-3 text-gray-900" style={{ fontWeight: 500 }}>{log.medication}</td>
                    <td className="py-3 px-3 text-gray-500 font-mono text-[10px]">{log.batchNo}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] ${actionStyle.bg} ${actionStyle.color}`} style={{ fontWeight: 600 }}>
                        {actionStyle.label}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-700" style={{ fontWeight: 600 }}>
                      {log.action === "adjusted" && log.quantity < 0 ? log.quantity : `+${log.quantity}`}
                    </td>
                    <td className="py-3 px-3 text-gray-600">{log.patientName || "—"}</td>
                    <td className="py-3 px-3 text-gray-600">{log.vet}</td>
                    <td className="py-3 px-3 text-gray-900" style={{ fontWeight: 600 }}>{log.remainingStock}</td>
                    <td className="py-3 px-3 text-gray-500 font-medium max-w-[200px] truncate">{log.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 bg-purple-50/30 border-t border-purple-100 flex items-center gap-2 text-[13px] text-purple-600">
          <Shield className="w-3.5 h-3.5" />
          <span>יומן זה מוגן מעריכה בהתאם לתקנות משרד הבריאות · כל שינוי נרשם אוטומטית</span>
        </div>
      </div>
    </div>
  );
}