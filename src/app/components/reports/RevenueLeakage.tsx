import { useState } from "react";
import {
  AlertTriangle, Check, Plus, DollarSign, FileText,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { ReportSearchBar } from "./ReportSearchBar";

// ─── Mock Data ───────────────────────────────────────────────────────
interface LeakageItem {
  id: number;
  patientName: string;
  ownerName: string;
  visitDate: string;
  vet: string;
  soapItems: string[];
  invoiceItems: string[];
  discrepancies: { item: string; estimatedValue: number }[];
  status: "open" | "resolved" | "ignored";
}

const LEAKAGE_DATA: LeakageItem[] = [
  {
    id: 1, patientName: "רקס", ownerName: "יוסי כהן", visitDate: "15/03/2026",
    vet: 'ד"ר שרה לוי',
    soapItems: ["בדיקה כללית", "חיסון כלבת", "בדיקת דם CBC", "ניקוי אוזניים"],
    invoiceItems: ["בדיקה כללית", "חיסון כלבת", "בדיקת דם CBC"],
    discrepancies: [{ item: "ניקוי אוזניים — נרשם בתיק אך לא חויב", estimatedValue: 85 }],
    status: "open",
  },
  {
    id: 2, patientName: "לונה", ownerName: "מיכל לוי", visitDate: "14/03/2026",
    vet: 'ד"ר דוד מזרחי',
    soapItems: ["ניתוח סירוס", "הרדמה כללית", "צילום רנטגן", "תרופות Rimadyl x5"],
    invoiceItems: ["ניתוח סירוס", "הרדמה כללית", "תרופות Rimadyl x5"],
    discrepancies: [{ item: "צילום רנטגן — בוצע טרום-ניתוח אך לא חויב", estimatedValue: 220 }],
    status: "open",
  },
  {
    id: 3, patientName: "ניקו", ownerName: "שרה לוי", visitDate: "13/03/2026",
    vet: 'ד"ר יוסי כהן',
    soapItems: ["בדיקת עור", "גרידת עור למיקרוסקופ", "מריחת משחה Surolan"],
    invoiceItems: ["בדיקת עור", "גרידת עור למיקרוסקופ"],
    discrepancies: [{ item: "משחת Surolan — ניתנה במרפאה אך לא חויבה", estimatedValue: 65 }],
    status: "open",
  },
  {
    id: 4, patientName: "מקס", ownerName: "דני אברהם", visitDate: "12/03/2026",
    vet: 'ד"ר שרה לוי',
    soapItems: ["בדיקת שיניים", "ניקוי אבנית בהרדמה", "צילום שיניים", "עקירת שן"],
    invoiceItems: ["בדיקת שיניים", "ניקוי אבנית בהרדמה", "צילום שיניים", "עקירת שן"],
    discrepancies: [],
    status: "resolved",
  },
  {
    id: 5, patientName: "באדי", ownerName: "רונית שמש", visitDate: "10/03/2026",
    vet: 'ד"ר דוד מזרחי',
    soapItems: ["חיסון משושה DHPP", "טיפול תולעים Drontal", "בדיקת צואה"],
    invoiceItems: ["חיסון משושה DHPP"],
    discrepancies: [
      { item: "טיפול תולעים Drontal — ניתן אך לא חויב", estimatedValue: 45 },
      { item: "בדיקת צואה — בוצעה אך לא חויבה", estimatedValue: 120 },
    ],
    status: "open",
  },
  {
    id: 6, patientName: "מיאו", ownerName: "שרה גולדברג", visitDate: "08/03/2026",
    vet: 'ד"ר יוסי כהן',
    soapItems: ["חיסון FVRCP", "בדיקה כללית"],
    invoiceItems: ["חיסון FVRCP", "בדיקה כללית"],
    discrepancies: [],
    status: "resolved",
  },
];

// ─── Component ──────────────────────────────────────────────────────
export function RevenueLeakage() {
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = LEAKAGE_DATA
    .filter((d) => filter === "all" || d.status === filter)
    .filter((d) => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        d.patientName.toLowerCase().includes(q) ||
        d.ownerName.toLowerCase().includes(q) ||
        d.vet.toLowerCase().includes(q) ||
        d.visitDate.includes(q) ||
        d.soapItems.some((s) => s.toLowerCase().includes(q)) ||
        d.discrepancies.some((disc) => disc.item.toLowerCase().includes(q))
      );
    });
  const totalLeakage = LEAKAGE_DATA.filter((d) => d.status === "open")
    .reduce((sum, d) => sum + d.discrepancies.reduce((s, disc) => s + disc.estimatedValue, 0), 0);
  const openCount = LEAKAGE_DATA.filter((d) => d.status === "open").length;
  const resolvedCount = LEAKAGE_DATA.filter((d) => d.status === "resolved").length;

  const handleAddToInvoice = (itemId: number, discIdx: number) => {
    setAddedItems((prev) => new Set(prev).add(`${itemId}-${discIdx}`));
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "הפסד הכנסה משוער", value: `₪${totalLeakage.toLocaleString()}`, color: "bg-red-50 text-red-600 border-red-200", icon: DollarSign },
          { label: "פערים פתוחים", value: String(openCount), color: "bg-amber-50 text-amber-600 border-amber-200", icon: AlertTriangle },
          { label: "פערים שתוקנו", value: String(resolvedCount), color: "bg-emerald-50 text-emerald-600 border-emerald-200", icon: Check },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${kpi.color}`}>
              <kpi.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-gray-400 text-[12px]">{kpi.label}</p>
              <p className="text-gray-900 text-[24px]" style={{ fontWeight: 700 }}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {([
          { key: "all" as const, label: "הכל" },
          { key: "open" as const, label: "פערים פתוחים" },
          { key: "resolved" as const, label: "שולם" },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-[13px] transition-all cursor-pointer ${
              filter === f.key ? "bg-[#1e40af] text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            style={{ fontWeight: filter === f.key ? 600 : 400 }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <ReportSearchBar value={searchTerm} onChange={setSearchTerm} placeholder="חיפוש לפי מטופל, בעלים, רופא/ה, טיפול..." />

      {/* Leakage items */}
      <div className="space-y-3">
        {filtered.map((item) => {
          const isExpanded = expandedId === item.id;
          const hasDiscrepancies = item.discrepancies.length > 0;
          return (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border overflow-hidden transition-all shadow-sm ${
                hasDiscrepancies ? "border-red-200" : "border-gray-100"
              }`}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors"
              >
                <div className="flex items-center gap-4 text-right">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    hasDiscrepancies ? "bg-red-50" : "bg-emerald-50"
                  }`}>
                    {hasDiscrepancies
                      ? <AlertTriangle className="w-5 h-5 text-red-500" />
                      : <Check className="w-5 h-5 text-emerald-600" />
                    }
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{item.patientName}</span>
                      <span className="text-gray-400 text-[12px]">({item.ownerName})</span>
                      {hasDiscrepancies && (
                        <span className="bg-red-50 text-red-600 text-[10px] px-2 py-0.5 rounded-full border border-red-200" style={{ fontWeight: 600 }}>
                          {item.discrepancies.length} פערים · ₪{item.discrepancies.reduce((s, d) => s + d.estimatedValue, 0)}
                        </span>
                      )}
                      {!hasDiscrepancies && (
                        <span className="bg-emerald-50 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full border border-emerald-200" style={{ fontWeight: 600 }}>
                          תקין
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-[12px]">{item.visitDate} · {item.vet}</p>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-5">
                  {/* Split view */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
                    {/* SOAP Column */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <h4 className="text-gray-700 text-[13px]" style={{ fontWeight: 600 }}>תיק רפואי (SOAP)</h4>
                      </div>
                      <div className="bg-blue-50/40 rounded-xl p-3 space-y-1.5">
                        {item.soapItems.map((s, i) => {
                          const isMissing = item.discrepancies.some((d) => d.item.includes(s));
                          return (
                            <div
                              key={`soap-${i}`}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] ${
                                isMissing
                                  ? "bg-red-50 text-red-700 border border-red-200"
                                  : "bg-white text-gray-700 border border-transparent"
                              }`}
                            >
                              {isMissing
                                ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                : <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              }
                              <span style={{ fontWeight: isMissing ? 600 : 400 }}>{s}</span>
                              {isMissing && <span className="mr-auto text-red-400 text-[11px]">לא חויב!</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Invoice Column */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        <h4 className="text-gray-700 text-[13px]" style={{ fontWeight: 600 }}>חשבונית שהופקה</h4>
                      </div>
                      <div className="bg-emerald-50/40 rounded-xl p-3 space-y-1.5">
                        {item.invoiceItems.map((inv, i) => (
                          <div key={`inv-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-gray-700 text-[13px]">
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>{inv}</span>
                          </div>
                        ))}
                        {item.invoiceItems.length === 0 && (
                          <p className="text-gray-400 text-[13px] text-center py-4">לא הופקה חשבונית</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Discrepancies & Actions */}
                  {item.discrepancies.length > 0 && (
                    <div className="bg-red-50/50 rounded-xl border border-red-100 p-4 space-y-2.5">
                      <h4 className="text-red-700 text-[12px]" style={{ fontWeight: 600 }}>פערים שזוהו</h4>
                      {item.discrepancies.map((disc, di) => {
                        const key = `${item.id}-${di}`;
                        const wasAdded = addedItems.has(key);
                        return (
                          <div key={di} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-red-100">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                              <span className="text-gray-800 text-[13px]">{disc.item}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-red-600 text-[14px]" style={{ fontWeight: 700 }}>₪{disc.estimatedValue}</span>
                              {wasAdded ? (
                                <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-[12px] px-3 py-1.5 rounded-lg border border-emerald-200" style={{ fontWeight: 500 }}>
                                  <Check className="w-3.5 h-3.5" /> נוסף לחשבונית
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleAddToInvoice(item.id, di)}
                                  className="flex items-center gap-1.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-[12px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-sm"
                                  style={{ fontWeight: 500 }}
                                >
                                  <Plus className="w-3.5 h-3.5" /> הוסף לחשבונית
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}