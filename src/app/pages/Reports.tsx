import { useState } from "react";
import {
  Download, CalendarRange, DollarSign, Users, UserX,
  Package, Building2, Radar, BarChart3,
} from "lucide-react";
import { getStaffType, canViewFinancialReports } from "../data/staffAuth";
import * as XLSX from "xlsx";

import { RevenueLeakage } from "../components/reports/RevenueLeakage";
import { StaffUtilization } from "../components/reports/StaffUtilization";
import { ClientCompliance } from "../components/reports/ClientCompliance";
import { InventoryControl } from "../components/reports/InventoryControl";
import { ReferralDashboard } from "../components/reports/ReferralDashboard";
import { EpiRadar } from "../components/reports/EpiRadar";

// ─── Tabs - סמניות סוגי דוחות ────────────────────────────────────────────────────────────
const ALL_TABS = [
  { key: "revenue" as const, label: "דליפת הכנסות", icon: DollarSign, color: "text-red-600" },
  { key: "staff" as const, label: "ניהול צוות", icon: Users, color: "text-blue-600" },
  { key: "compliance" as const, label: "ציות לקוחות", icon: UserX, color: "text-amber-600" },
  { key: "inventory" as const, label: "מלאי ופיקוח", icon: Package, color: "text-purple-600" },
  { key: "referrals" as const, label: "הפניות B2B", icon: Building2, color: "text-indigo-600" },
  { key: "epi" as const, label: "רדאר אפידמיולוגי", icon: Radar, color: "text-rose-600" },
] as const;

// Filter tabs based on user role
function getAvailableTabs() {
  const staffType = getStaffType();
  if (staffType === "secretary") {
    // Secretary: only operational tabs (Team Management & Client Compliance)
    return ALL_TABS.filter((tab) => tab.key === "staff" || tab.key === "compliance");
  }
  // Vet and anyone else: all tabs
  return ALL_TABS;
}

type TabKey = typeof ALL_TABS[number]["key"];

// ─── Date Range presets ──────────────────────────────────────────────
const DATE_RANGES = [
  { key: "7d", label: "7 ימים" },
  { key: "30d", label: "30 יום" },
  { key: "90d", label: "רבעון" },
  { key: "12m", label: "שנה" },
  { key: "custom", label: "מותאם" },
] as const;

// ─── Component ──────────────────────────────────────────────────────
export function Reports() {
  const availableTabs = getAvailableTabs();
  const initialTab = availableTabs[0]?.key || ("revenue" as TabKey);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [dateRange, setDateRange] = useState("30d");

  // ── Generic export stub ──
  const handleExport = (format: "csv" | "pdf") => {
    if (format === "csv") {
      const wb = XLSX.utils.book_new();
      const today = new Date().toLocaleDateString("he-IL");
      const activeLabel = ALL_TABS.find((t) => t.key === activeTab)?.label || "";
      const data = [
        [`דוח ${activeLabel} — MyVet`, ""],
        ["תאריך הפקה", today],
        ["טווח תאריכים", DATE_RANGES.find((d) => d.key === dateRange)?.label || ""],
        [""],
        ["נתוני הדוח זמינים בממשק המערכת", ""],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "דוח");
      XLSX.writeFile(wb, `דוח_${activeLabel}_${today.replace(/\./g, "-")}.xlsx`);
    }
    // PDF would require jspdf — stubbed for demo
  };

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6">
      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1e40af] to-[#6366f1] flex items-center justify-center shadow-md shadow-blue-500/15">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-gray-900 text-[22px]" style={{ fontWeight: 700 }}>Business Intelligence & ניהול מרפאה</h1>
              <p className="text-gray-400 text-[13px]">תובנות מבוססות נתונים · ROI גבוה · מרץ 2026</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Date range picker */}
          <div className="flex items-center bg-gray-100 rounded-xl p-0.5 gap-0.5">
            <CalendarRange className="w-4 h-4 text-gray-400 mx-2" />
            {/* Date range picker */}
      <div className="flex items-center bg-gray-100 rounded-xl p-0.5 gap-0.5">
        <CalendarRange className="w-4 h-4 text-gray-400 mx-2" />
        {DATE_RANGES.map((dr) => (
              <button
                key={dr.key}
                onClick={() => setDateRange(dr.key)}
                className={`px-3 py-1.5 rounded-lg text-[12px] transition-all cursor-pointer ${
                  dateRange === dr.key
                    ? "bg-white shadow-sm text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                style={{ fontWeight: dateRange === dr.key ? 600 : 400 }}
              >
                {dr.label}
              </button>
            ))}
        </div>
      </div>

        {/* Export buttons */}
        <button
            onClick={() => handleExport("csv")}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl transition-colors cursor-pointer text-[13px] border border-emerald-200 shadow-sm"
            style={{ fontWeight: 500 }}
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={() => handleExport("pdf")}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-xl transition-colors cursor-pointer text-[13px] border border-blue-200 shadow-sm"
            style={{ fontWeight: 500 }}
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="flex items-center bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 gap-1 mb-6 overflow-x-auto">
        {getAvailableTabs().map((tab) => {
          const TIcon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[13px] transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-gray-900 text-white shadow-md"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
              style={{ fontWeight: isActive ? 600 : 400 }}
            >
              <TIcon className={`w-4 h-4 ${isActive ? "text-white" : tab.color}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Active Report Panel ── */}
      {activeTab === "revenue" && <RevenueLeakage />}
      {activeTab === "staff" && <StaffUtilization />}
      {activeTab === "compliance" && <ClientCompliance />}
      {activeTab === "inventory" && <InventoryControl />}
      {activeTab === "referrals" && <ReferralDashboard />}
      {activeTab === "epi" && <EpiRadar />}
    </main>
  );
}
