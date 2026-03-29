import { useState, useMemo } from "react";
import {
  AlertTriangle, Check, Plus, DollarSign, FileText,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { ReportSearchBar } from "./ReportSearchBar";

// ─── Data & Types ───────────────────────────────────────────────────
export interface LeakageItem {
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

// הוצאתי את הדאטה החוצה כדי שנוכל לייצא אותו ל-BI
export const LEAKAGE_DATA: LeakageItem[] = [
  {
    id: 1, patientName: "רקס", ownerName: "יוסי כהן", visitDate: "15/03/2026", vet: 'ד"ר שרה לוי',
    soapItems: ["בדיקה כללית", "חיסון כלבת", "בדיקת דם CBC", "ניקוי אוזניים"],
    invoiceItems: ["בדיקה כללית", "חיסון כלבת", "בדיקת דם CBC"],
    discrepancies: [{ item: "ניקוי אוזניים — נרשם בתיק אך לא חויב", estimatedValue: 85 }],
    status: "open",
  },
  {
    id: 2, patientName: "לונה", ownerName: "מיכל לוי", visitDate: "14/03/2026", vet: 'ד"ר דוד מזרחי',
    soapItems: ["ניתוח סירוס", "הרדמה כללית", "צילום רנטגן", "תרופות Rimadyl x5"],
    invoiceItems: ["ניתוח סירוס", "הרדמה כללית", "תרופות Rimadyl x5"],
    discrepancies: [{ item: "צילום רנטגן — בוצע טרום-ניתוח אך לא חויב", estimatedValue: 220 }],
    status: "open",
  },
  {
    id: 3, patientName: "ניקו", ownerName: "שרה לוי", visitDate: "13/03/2026", vet: 'ד"ר יוסי כהן',
    soapItems: ["בדיקת עור", "גרידת עור למיקרוסקופ", "מריחת משחה Surolan"],
    invoiceItems: ["בדיקת עור", "גרידת עור למיקרוסקופ"],
    discrepancies: [{ item: "משחת Surolan — ניתנה במרפאה אך לא חויבה", estimatedValue: 65 }],
    status: "open",
  },
  {
    id: 5, patientName: "באדי", ownerName: "רונית שמש", visitDate: "10/03/2026", vet: 'ד"ר דוד מזרחי',
    soapItems: ["חיסון משושה DHPP", "טיפול תולעים Drontal", "בדיקת צואה"],
    invoiceItems: ["חיסון משושה DHPP"],
    discrepancies: [
      { item: "טיפול תולעים Drontal — ניתן אך לא חויב", estimatedValue: 45 },
      { item: "בדיקת צואה — בוצעה אך לא חויבה", estimatedValue: 120 },
    ],
    status: "open",
  },
  {
    id: 4, patientName: "מקס", ownerName: "דני אברהם", visitDate: "12/03/2026", vet: 'ד"ר שרה לוי',
    soapItems: ["בדיקת שיניים", "ניקוי אבנית בהרדמה", "צילום שיניים", "עקירת שן"],
    invoiceItems: ["בדיקת שיניים", "ניקוי אבנית בהרדמה", "צילום שיניים", "עקירת שן"],
    discrepancies: [],
    status: "resolved",
  },
];

export function RevenueLeakage() {
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  // חישובים מרוכזים (Memoized לביצועים)
  const stats = useMemo(() => {
    const openItems = LEAKAGE_DATA.filter(d => d.status === "open");
    const total = openItems.reduce((sum, d) => sum + d.discrepancies.reduce((s, disc) => s + disc.estimatedValue, 0), 0);
    return {
      totalLeakage: total,
      openCount: openItems.length,
      resolvedCount: LEAKAGE_DATA.filter(d => d.status === "resolved").length
    };
  }, []);

  const filteredData = LEAKAGE_DATA.filter(d => {
    const matchesFilter = filter === "all" || d.status === filter;
    const q = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || 
      d.patientName.toLowerCase().includes(q) || 
      d.ownerName.toLowerCase().includes(q) ||
      d.discrepancies.some(disc => disc.item.toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiMiniCard label="הפסד הכנסה משוער" value={`₪${stats.totalLeakage}`} icon={DollarSign} theme="red" />
        <KpiMiniCard label="פערים פתוחים" value={stats.openCount} icon={AlertTriangle} theme="amber" />
        <KpiMiniCard label="פערים שתוקנו" value={stats.resolvedCount} icon={Check} theme="emerald" />
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex gap-2">
          {["all", "open", "resolved"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-4 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                filter === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {f === "all" ? "הכל" : f === "open" ? "פערים פתוחים" : "שולם"}
            </button>
          ))}
        </div>
        <div className="w-full md:w-96">
           <ReportSearchBar value={searchTerm} onChange={setSearchTerm} placeholder="חיפוש מהיר..." />
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredData.map((item: LeakageItem) => (
          <LeakageRow 
            key={item.id} 
            item={item} 
            isExpanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            addedItems={addedItems}
            onAdd={(idx: number) => setAddedItems(prev => new Set(prev).add(`${item.id}-${idx}`))}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Sub-Components (לסדר וניקיון הקוד) ───────────────────────────────

function KpiMiniCard({ label, value, icon: Icon, theme }: any) {
  const themes = {
    red: "bg-red-50 text-red-600 border-red-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100"
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${themes[theme as keyof typeof themes]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-gray-400 text-[12px] font-medium">{label}</p>
        <p className="text-gray-900 text-[22px] font-bold">{value}</p>
      </div>
    </div>
  );
}

function LeakageRow({ item, isExpanded, onToggle, addedItems, onAdd }: any) {
  const hasDisc = item.discrepancies.length > 0;
  return (
    <div className={`bg-white rounded-2xl border transition-all ${hasDisc ? "border-red-100 shadow-red-500/5" : "border-gray-100"}`}>
      <button onClick={onToggle} className="w-full px-5 py-4 flex items-center justify-between cursor-pointer">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hasDisc ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500"}`}>
            {hasDisc ? <AlertTriangle className="w-5 h-5" /> : <Check className="w-5 h-5" />}
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2">
              <span className="text-gray-900 font-bold">{item.patientName}</span>
              <span className="text-gray-400 text-[12px]">{item.ownerName}</span>
              {hasDisc && <span className="bg-red-50 text-red-600 text-[11px] px-2 py-0.5 rounded-full border border-red-100 font-bold">₪{item.discrepancies.reduce((s:any, d:any) => s + d.estimatedValue, 0)}</span>}
            </div>
            <p className="text-gray-400 text-[12px]">{item.visitDate} · {item.vet}</p>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-300" /> : <ChevronDown className="w-5 h-5 text-gray-300" />}
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 border-t border-gray-50 pt-4 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <ItemList title="תיק רפואי (SOAP)" items={item.soapItems} icon={FileText} color="blue" discrepancies={item.discrepancies} />
            <ItemList title="חשבונית שהופקה" items={item.invoiceItems} icon={DollarSign} color="emerald" />
          </div>
          
          {hasDisc && (
            <div className="bg-red-50/50 rounded-xl p-4 border border-red-100 space-y-3">
              <p className="text-red-700 text-[12px] font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> פערים לחיוב מיידי:
              </p>
              {item.discrepancies.map((d: any, i: number) => (
                <div key={i} className="bg-white p-3 rounded-lg border border-red-100 flex items-center justify-between">
                  <span className="text-gray-700 text-[13px]">{d.item}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-red-600">₪{d.estimatedValue}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onAdd(i); }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                        addedItems.has(`${item.id}-${i}`) ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                      }`}
                    >
                      {addedItems.has(`${item.id}-${i}`) ? "נוסף לחשבונית ✓" : "+ הוסף לחשבונית"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemList({ title, items, icon: Icon, color, discrepancies }: any) {
  return (
    <div className={`bg-${color}-50/30 rounded-xl p-4 border border-${color}-100`}>
      <h4 className={`text-${color}-700 text-[13px] font-bold mb-3 flex items-center gap-2`}>
        <Icon className="w-4 h-4" /> {title}
      </h4>
      <div className="space-y-1.5">
        {items.map((it: string, i: number) => {
          const isMissing = discrepancies?.some((d: any) => d.item.includes(it));
          return (
            <div key={i} className={`px-3 py-2 rounded-lg text-[12px] flex items-center justify-between ${isMissing ? "bg-red-50 text-red-700 border border-red-100 font-medium" : "bg-white text-gray-600 border border-gray-50"}`}>
              {it}
              {isMissing && <span className="text-[10px] opacity-70">חסר בחיובי!</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}