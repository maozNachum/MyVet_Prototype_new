import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Filter, X } from "lucide-react";
import { FILTER_DEPARTMENTS } from "../../data/calendar-constants";

interface DeptFilterPanelProps {
  activeDepts: Set<string>;
  onToggle: (dept: string) => void;
  onClearAll: () => void;
  totalCount: number;
  filteredCount: number;
  departmentCounts?: Map<string, number>;
}

export function DeptFilterPanel({
  activeDepts,
  onToggle,
  onClearAll,
  totalCount,
  filteredCount,
  departmentCounts = new Map(),
}: DeptFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasFilters = activeDepts.size > 0;
  const selectedLabels = FILTER_DEPARTMENTS
    .filter((department) => activeDepts.has(department.key))
    .map((department) => department.label);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      dir="rtl"
      className="relative z-30 w-full min-w-0"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="department-filter-options"
        onClick={() => setIsOpen((current) => !current)}
        className={`flex h-11 w-full items-center gap-3 rounded-xl border bg-white px-3.5 text-right shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
          isOpen || hasFilters ? "border-blue-200" : "border-slate-200 hover:border-blue-200"
        }`}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${hasFilters ? "bg-[#1e40af] text-white" : "bg-blue-50 text-[#1e40af]"}`}>
          <Filter className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-extrabold text-slate-800">סינון לפי מחלקה</span>
          <span className="block truncate text-[10.5px] font-medium text-slate-500">
            {hasFilters ? selectedLabels.join(", ") : "כל המחלקות"}
          </span>
        </span>
        {hasFilters && (
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-extrabold text-[#1e40af]">
            {activeDepts.size}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          id="department-filter-options"
          role="listbox"
          aria-label="בחירת מחלקות להצגה"
          aria-multiselectable="true"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3.5 py-3">
            <div>
              <p className="text-[13px] font-extrabold text-slate-900">בחרו מחלקות</p>
              <p className="text-[10.5px] font-medium text-slate-500">אפשר לבחור מספר מחלקות יחד</p>
            </div>
            {hasFilters && (
              <button type="button" onClick={onClearAll} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600">
                <X className="h-3.5 w-3.5" /> ביטול הסינון
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {FILTER_DEPARTMENTS.map((department) => {
              const isActive = activeDepts.has(department.key);
              return (
                <button
                  key={department.key}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => onToggle(department.key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition-colors ${isActive ? "bg-blue-50" : "hover:bg-slate-50"}`}
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${department.color}`} aria-hidden="true" />
                  <span className={`flex-1 text-[13px] font-semibold ${isActive ? "text-[#1e40af]" : "text-slate-700"}`}>{department.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{departmentCounts.get(department.key) || 0}</span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${isActive ? "border-[#1e40af] bg-[#1e40af] text-white" : "border-slate-300 bg-white"}`}>
                    {isActive && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
            <span className="text-[11px] font-semibold text-slate-500">מוצגים {filteredCount} מתוך {totalCount} תורים</span>
            <button type="button" onClick={() => setIsOpen(false)} className="h-7 rounded-lg bg-[#1e40af] px-3 text-[11px] font-bold text-white transition-colors hover:bg-[#1e3a8a]">סיום</button>
          </div>
        </div>
      )}
    </div>
  );
}
