import { Search, X } from "lucide-react";

interface ReportSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function ReportSearchBar({ value, onChange, placeholder }: ReportSearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-gray-200 rounded-xl pr-10 pl-10 py-2.5 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 shadow-sm transition-all placeholder:text-gray-400"
      />
      {value.length > 0 && (
        <button
          onClick={() => onChange("")}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center cursor-pointer transition-colors"
        >
          <X className="w-3 h-3 text-gray-500" />
        </button>
      )}
    </div>
  );
}
