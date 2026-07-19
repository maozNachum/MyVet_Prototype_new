import { useState } from "react";
import {
  Download, CalendarRange, DollarSign, Users, UserX,
  Package, BarChart3, LayoutDashboard, Stethoscope,
} from "lucide-react";
import { getStaffType } from "../data/staffAuth";
import * as XLSX from "xlsx";

import { AIInsightsPanel } from "../components/reports/AIInsightsPanel";
import { BiOverview } from "../components/reports/BiOverview";
import { RevenueLeakage } from "../components/reports/RevenueLeakage";
import { StaffUtilization } from "../components/reports/StaffUtilization";
import { ClientCompliance } from "../components/reports/ClientCompliance";
import { InventoryControl } from "../components/reports/InventoryControl";
import { EpiRadar } from "../components/reports/EpiRadar";

const ALL_TABS = [
  { key: "overview" as const, label: "סקירה כללית", icon: LayoutDashboard, color: "text-teal-600" },
  { key: "revenue" as const, label: "תשלומים וגבייה", icon: DollarSign, color: "text-red-600" },
  { key: "staff" as const, label: "תורים וצוות", icon: Users, color: "text-blue-600" },
  { key: "inventory" as const, label: "מלאי", icon: Package, color: "text-purple-600" },
  { key: "medical" as const, label: "פעילות רפואית", icon: Stethoscope, color: "text-rose-600" },
  { key: "compliance" as const, label: "מעקב לקוחות", icon: UserX, color: "text-amber-600" },
] as const;

function getAvailableTabs() {
  const staffType = getStaffType();
  if (staffType === "secretary") {
    return ALL_TABS.filter((t) => ["overview", "staff", "compliance"].includes(t.key));
  }
  return ALL_TABS;
}

type TabKey = typeof ALL_TABS[number]["key"];

const DATE_RANGES = [
  { key: "today", label: "היום" },
  { key: "7d", label: "7 ימים" },
  { key: "30d", label: "30 יום" },
  { key: "90d", label: "רבעון" },
  { key: "12m", label: "שנה" },
  { key: "custom", label: "הכל" },
] as const;

export function Reports() {
  const availableTabs = getAvailableTabs();
  const [activeTab, setActiveTab] = useState<TabKey>(availableTabs[0].key);
  const [dateRange, setDateRange] = useState("30d");

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const activeLabel = ALL_TABS.find((t) => t.key === activeTab)?.label || "דוח";
    const data = [
      [`דוח ${activeLabel} — MyVet`],
      ["תאריך הפקה", new Date().toLocaleDateString("he-IL")],
      ["טווח", DATE_RANGES.find((range) => range.key === dateRange)?.label || dateRange],
      ["הערה", "הייצוא הנוכחי מפיק תקציר. ניתן להרחיב בהמשך לייצוא נתוני הדוח הפעיל."],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Report");
    XLSX.writeFile(wb, `MyVet_${activeLabel}.xlsx`);
  };

  return (
    <main className="min-h-screen w-full px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3.5 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1e40af] to-[#6366f1] flex items-center justify-center shadow-md shrink-0">
          <BarChart3 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-gray-900 text-[26px] font-bold">דוחות ותובנות</h1>
          <p className="text-gray-500 text-[15px]">מבט מהיר על פעילות המרפאה, תשלומים, מלאי ומעקב לקוחות</p>
        </div>
      </div>

      <div className="flex items-center bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 gap-1 mb-5 overflow-x-auto">
        {availableTabs.map((tab) => {
          const TIcon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] transition-all cursor-pointer whitespace-nowrap ${
                isActive ? "bg-gray-900 text-white shadow-md" : "text-gray-500 hover:bg-gray-50"
              }`}
              style={{ fontWeight: isActive ? 600 : 500 }}
            >
              <TIcon className={`w-4.5 h-4.5 ${isActive ? "text-white" : tab.color}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-5 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center bg-gray-50 rounded-xl p-1 w-full sm:w-auto overflow-x-auto">
          <CalendarRange className="w-4.5 h-4.5 text-gray-500 font-medium mx-2.5 shrink-0" />
          <div className="flex gap-1">
            {DATE_RANGES.map((dr) => (
              <button
                key={dr.key}
                onClick={() => setDateRange(dr.key)}
                className={`px-3.5 py-2 rounded-lg text-[13px] transition-all cursor-pointer whitespace-nowrap ${
                  dateRange === dr.key ? "bg-white shadow-sm text-gray-900 border border-gray-200" : "text-gray-500 hover:bg-gray-100"
                }`}
                style={{ fontWeight: dateRange === dr.key ? 600 : 500 }}
              >
                {dr.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto justify-end">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl transition-colors cursor-pointer text-[13px] border border-emerald-200 font-semibold shadow-sm"
            title="ייצוא תקציר הדוח הפעיל לקובץ Excel"
          >
            <Download className="w-4 h-4" /> ייצוא תקציר ל־Excel
          </button>
        </div>
      </div>

      <AIInsightsPanel key={`${activeTab}-${dateRange}`} dateRange={dateRange} context={activeTab} maxItems={3} />

      <div key={`${activeTab}-${dateRange}-content`} className="animate-in fade-in duration-500">
        {activeTab === "overview" && <BiOverview dateRange={dateRange} />}
        {activeTab === "revenue" && <RevenueLeakage dateRange={dateRange} />}
        {activeTab === "staff" && <StaffUtilization dateRange={dateRange} />}
        {activeTab === "inventory" && <InventoryControl dateRange={dateRange} />}
        {activeTab === "medical" && <EpiRadar dateRange={dateRange} />}
        {activeTab === "compliance" && <ClientCompliance dateRange={dateRange} />}
      </div>
    </main>
  );
}
