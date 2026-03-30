import { Filter, X } from "lucide-react";
import { FILTER_DEPARTMENTS } from "../../data/calendar-constants";

interface DeptFilterPanelProps {
  activeDepts: Set<string>;
  onToggle: (dept: string) => void;
  onClearAll: () => void;
  totalCount: number;
  filteredCount: number;
}

export function DeptFilterPanel({
  activeDepts, onToggle, onClearAll, totalCount, filteredCount,
}: DeptFilterPanelProps) {
  const hasFilters = activeDepts.size > 0;

  return (
    <div
      dir="rtl"
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#1e40af]/10 rounded-lg flex items-center justify-center">
            <Filter className="w-3.5 h-3.5 text-[#1e40af]" />
          </div>
          <span className="text-gray-800 text-[14px]" style={{ fontWeight: 700 }}>
            סינון לפי מחלקה
          </span>
        </div>
        {hasFilters && (
          <button
            onClick={onClearAll}
            className="flex items-center gap-1 text-[13px] text-gray-500 font-medium hover:text-red-500 cursor-pointer transition-colors"
            style={{ fontWeight: 500 }}
          >
            <X className="w-3 h-3" />
            נקה
          </button>
        )}
      </div>

      {/* Count badge */}
      <div className="px-4 py-2.5 border-b border-gray-50 bg-white flex items-center justify-between">
        <span className="text-gray-500 font-medium text-[13px]" style={{ fontWeight: 500 }}>
          {hasFilters ? "תורים מוצגים" : "כל התורים"}
        </span>
        <span
          className={`text-[12px] px-2 py-0.5 rounded-full ${
            hasFilters
              ? "bg-blue-50 text-[#1e40af] border border-blue-100"
              : "bg-gray-100 text-gray-600"
          }`}
          style={{ fontWeight: 700 }}
        >
          {filteredCount} / {totalCount}
        </span>
      </div>

      {/* Dept checkboxes */}
      <div className="p-3 space-y-1.5">
        {FILTER_DEPARTMENTS.map((dept) => {
          const isActive = activeDepts.has(dept.key);
          return (
            <button
              key={dept.key}
              onClick={() => onToggle(dept.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-right ${
                isActive
                  ? "bg-gray-50 border-gray-200 shadow-sm"
                  : "border-transparent hover:bg-gray-50 hover:border-gray-100"
              }`}
            >
              {/* Color dot */}
              <span className={`w-3 h-3 rounded-full shrink-0 ${dept.color}`} />

              {/* Label */}
              <span
                className={`flex-1 text-[13px] text-right ${isActive ? "text-gray-900" : "text-gray-600"}`}
                style={{ fontWeight: isActive ? 600 : 400 }}
              >
                {dept.label}
              </span>

              {/* Checkbox */}
              <span
                className={`w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                  isActive
                    ? "bg-[#1e40af] border-[#1e40af]"
                    : "border-gray-300"
                }`}
                style={{ width: 18, height: 18 }}
              >
                {isActive && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status legend */}
      <div className="px-4 py-3 border-t border-gray-100 space-y-2">
        <p className="text-gray-500 font-medium text-[13px]" style={{ fontWeight: 600 }}>
          סטטוס תורים
        </p>
        {[
          { color: "bg-green-500", label: "שולם" },
          { color: "bg-blue-500",  label: "ביקור פתוח" },
          { color: "bg-red-500",   label: "מאחר / לא הגיע" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${s.color}`} />
            <span className="text-gray-500 text-[11.5px]" style={{ fontWeight: 500 }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
