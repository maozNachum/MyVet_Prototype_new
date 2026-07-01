import { ReactNode } from "react";

export interface ChartDatum {
  label: string;
  value: number;
  hint?: string;
}

function safeMax(values: number[]) {
  return Math.max(...values.filter((value) => Number.isFinite(value)), 1);
}

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 overflow-hidden">
      <div className="mb-5">
        <h3 className="text-gray-900 font-bold text-[16px]">{title}</h3>
        {subtitle && <p className="text-gray-500 text-[12px] font-medium mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function HorizontalBarChart({
  title,
  subtitle,
  data,
  emptyText = "אין נתונים להצגה",
  valueFormatter = (value) => value.toLocaleString("he-IL"),
}: {
  title: string;
  subtitle?: string;
  data: ChartDatum[];
  emptyText?: string;
  valueFormatter?: (value: number) => string;
}) {
  const max = safeMax(data.map((item) => item.value));

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {data.length === 0 ? (
        <div className="py-10 text-center text-gray-500 text-[13px] font-medium">{emptyText}</div>
      ) : (
        <div className="space-y-4">
          {data.slice(0, 7).map((item, index) => {
            const width = Math.max((item.value / max) * 100, 4);
            return (
              <div key={`${item.label}-${index}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="font-bold text-gray-700 truncate">{item.label}</span>
                  <span className="text-gray-500 font-semibold shrink-0">{valueFormatter(item.value)}</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-[#1e40af] to-[#60a5fa]"
                    style={{ width: `${width}%` }}
                  />
                </div>
                {item.hint && <p className="text-[11px] text-gray-400 font-medium">{item.hint}</p>}
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

export function DonutMetric({
  title,
  subtitle,
  value,
  label,
  segments,
}: {
  title: string;
  subtitle?: string;
  value: string | number;
  label: string;
  segments: { label: string; value: number; className: string }[];
}) {
  const total = safeMax([segments.reduce((sum, segment) => sum + segment.value, 0)]);
  let cursor = 0;
  const stops = segments.map((segment) => {
    const start = cursor;
    const end = cursor + (segment.value / total) * 100;
    cursor = end;
    const color = segment.className.includes("red")
      ? "#ef4444"
      : segment.className.includes("amber")
        ? "#f59e0b"
        : segment.className.includes("blue")
          ? "#3b82f6"
          : segment.className.includes("purple")
            ? "#8b5cf6"
            : "#10b981";
    return `${color} ${start}% ${end}%`;
  }).join(", ");

  return (
    <ChartCard title={title} subtitle={subtitle}>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative w-36 h-36 rounded-full shrink-0" style={{ background: `conic-gradient(${stops || "#e5e7eb 0% 100%"})` }}>
          <div className="absolute inset-4 rounded-full bg-white flex flex-col items-center justify-center text-center shadow-inner">
            <span className="text-2xl font-black text-gray-900">{value}</span>
            <span className="text-[11px] text-gray-500 font-bold">{label}</span>
          </div>
        </div>
        <div className="flex-1 w-full space-y-2">
          {segments.map((segment) => (
            <div key={segment.label} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
              <span className="flex items-center gap-2 text-[12px] text-gray-600 font-semibold">
                <span className={`w-2.5 h-2.5 rounded-full ${segment.className}`} />
                {segment.label}
              </span>
              <span className="text-gray-900 text-[13px] font-bold">{segment.value.toLocaleString("he-IL")}</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

export function MiniColumnChart({
  title,
  subtitle,
  data,
  emptyText = "אין נתונים להצגה",
}: {
  title: string;
  subtitle?: string;
  data: ChartDatum[];
  emptyText?: string;
}) {
  const max = safeMax(data.map((item) => item.value));

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {data.length === 0 ? (
        <div className="py-10 text-center text-gray-500 text-[13px] font-medium">{emptyText}</div>
      ) : (
        <div className="h-56 flex items-end gap-3 px-1 pt-4">
          {data.slice(0, 10).map((item, index) => {
            const height = Math.max((item.value / max) * 100, 8);
            return (
              <div key={`${item.label}-${index}`} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                <div className="text-[11px] text-gray-500 font-bold">{item.value}</div>
                <div className="w-full rounded-t-xl bg-gradient-to-t from-[#1e40af] to-[#93c5fd] min-h-[10px]" style={{ height: `${height}%` }} />
                <div className="text-[10px] text-gray-400 font-semibold truncate w-full text-center" title={item.label}>{item.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}
