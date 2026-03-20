import { Check } from "lucide-react";

interface SuccessMessageProps {
  title: string;
  subtitle: string;
}

export function SuccessMessage({ title, subtitle }: SuccessMessageProps) {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
        <Check className="w-8 h-8 text-emerald-500" />
      </div>
      <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>{title}</h4>
      <p className="text-gray-500 text-[14px]">{subtitle}</p>
    </div>
  );
}
