interface PillPickerProps<T extends string> {
  label: string;
  items: { key: T; label: string }[];
  selected: T | null;
  onSelect: (value: T) => void;
}

export function PillPicker<T extends string>({ label, items, selected, onSelect }: PillPickerProps<T>) {
  return (
    <div className="mb-4">
      <label className="block text-gray-700 text-[13px] mb-2" style={{ fontWeight: 500 }}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={`px-3 py-1.5 rounded-lg text-[12px] border transition-all cursor-pointer ${
              selected === item.key
                ? "bg-[#1e40af] text-white border-[#1e40af] shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
            }`}
            style={{ fontWeight: selected === item.key ? 600 : 400 }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
