import {
  Calendar,
  PawPrint,
  AlertTriangle,
  ChevronDown,
  Clock,
  MapPin,
  Dog,
  Cat,
  Rabbit,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

// Departments / wards for hospitalized patients
const departments = [
  {
    id: 1,
    name: "מחלקה פנימית",
    icon: "🏥",
    color: "bg-blue-50 border-blue-200 text-blue-700",
    patients: [
      { id: 1, name: "רקס", species: "כלב", owner: "יוסי כהן", status: "מאושפז - יום 2", statusColor: "bg-blue-100 text-blue-700" },
      { id: 2, name: "לונה", species: "כלב", owner: "מיכל לוי", status: "מאושפזת - יום 1", statusColor: "bg-blue-100 text-blue-700" },
    ],
  },
  {
    id: 2,
    name: "מחלקה כירורגית",
    icon: "🔬",
    color: "bg-purple-50 border-purple-200 text-purple-700",
    patients: [
      { id: 3, name: "מקס", species: "כלב", owner: "דני אברהם", status: "לאחר ניתוח", statusColor: "bg-amber-100 text-amber-700" },
    ],
  },
  {
    id: 3,
    name: "טיפול נמרץ",
    icon: "🚨",
    color: "bg-red-50 border-red-200 text-red-700",
    patients: [
      { id: 4, name: "באדי", species: "כלב", owner: "רונית שמש", status: "מצב יציב", statusColor: "bg-green-100 text-green-700" },
    ],
  },
  {
    id: 4,
    name: "אשפוז יום",
    icon: "☀️",
    color: "bg-amber-50 border-amber-200 text-amber-700",
    patients: [
      { id: 5, name: "ניקו", species: "חתול", owner: "שרה לוי", status: "ממתין לשחרור", statusColor: "bg-emerald-100 text-emerald-700" },
      { id: 6, name: "מיאו", species: "חתול", owner: "שרה גולדברג", status: "בהשגחה", statusColor: "bg-blue-100 text-blue-700" },
    ],
  },
];

// Urgent cases
const urgentCases = [
  {
    id: 1,
    petName: "מקס",
    species: "כלב",
    owner: "דני אברהם",
    issue: "ניתוח חירום - גוף זר במע' העיכול",
    severity: "קריטי",
    sevColor: "bg-red-100 text-red-700",
    time: "הגיע ב-08:15",
  },
  {
    id: 2,
    petName: "באדי",
    species: "כלב",
    owner: "רונית שמש",
    issue: "הרעלת שוקולד - ניטור",
    severity: "בינוני",
    sevColor: "bg-orange-100 text-orange-700",
    time: "הגיע ב-07:40",
  },
  {
    id: 3,
    petName: "שוקו",
    species: "ארנב",
    owner: "נועה פרץ",
    issue: "שבר ברגל אחורית",
    severity: "דחוף",
    sevColor: "bg-amber-100 text-amber-700",
    time: "הגיע ב-09:00",
  },
];

// Today's appointments summary
const todayAppointments = [
  { id: 1, time: "09:00", pet: "רקס", owner: "יוסי כהן", type: "חיסון שנתי" },
  { id: 2, time: "10:30", pet: "לונה", owner: "מיכל לוי", type: "בדיקה כללית" },
  { id: 3, time: "11:00", pet: "מקס", owner: "דני אברהם", type: "ניתוח חירום" },
  { id: 4, time: "13:00", pet: "מיאו", owner: "שרה גולדברג", type: "טיפול שיניים" },
  { id: 5, time: "14:00", pet: "באדי", owner: "רונית שמש", type: "בדיקת מעקב" },
  { id: 6, time: "14:30", pet: "ניקו", owner: "שרה לוי", type: "חיסון FVRCP" },
  { id: 7, time: "15:00", pet: "שוקו", owner: "נועה פרץ", type: "בדיקה ראשונית" },
  { id: 8, time: "15:30", pet: "לולו", owner: "אבי דנינו", type: "הסרת תפרים" },
  { id: 9, time: "16:00", pet: "סנדי", owner: "ורד מלכה", type: "טיפול אוזניים" },
  { id: 10, time: "16:30", pet: "טוסיק", owner: "גלעד ברק", type: "גזיזת ציפורניים" },
  { id: 11, time: "17:00", pet: "פלאפי", owner: "דינה עוז", type: "בדיקת עור" },
  { id: 12, time: "17:30", pet: "צ׳רלי", owner: "רון גפן", type: "חיסון כלבת" },
];

const kpis = [
  {
    id: "appointments",
    label: "תורים היום",
    value: 12,
    icon: Calendar,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    hoverBorder: "hover:border-blue-200",
    activeBorder: "border-blue-300",
  },
  {
    id: "patients",
    label: "מטופלים פעילים",
    value: 85,
    icon: PawPrint,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    hoverBorder: "hover:border-green-200",
    activeBorder: "border-green-300",
  },
  {
    id: "urgent",
    label: "מקרים דחופים",
    value: 3,
    icon: AlertTriangle,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500",
    hoverBorder: "hover:border-orange-200",
    activeBorder: "border-orange-300",
  },
];

export function KpiCards() {
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null);
  const navigate = useNavigate();

  const toggleExpand = (id: string) => {
    setExpandedKpi(expandedKpi === id ? null : id);
  };

  const PetSpeciesIcon = (species: string) => {
    if (species === "חתול") return Cat;
    if (species === "ארנב") return Rabbit;
    return Dog;
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const isActive = expandedKpi === kpi.id;
          return (
            <button
              key={kpi.id}
              onClick={() => toggleExpand(kpi.id)}
              className={`bg-white rounded-xl shadow-sm border p-6 flex items-center gap-5 transition-all cursor-pointer text-right w-full group ${
                isActive
                  ? `${kpi.activeBorder} shadow-md`
                  : `border-gray-100 ${kpi.hoverBorder} hover:shadow-md`
              }`}
            >
              <div className={`${kpi.iconBg} rounded-xl p-3.5 group-hover:scale-105 transition-transform`}>
                <Icon className={`w-7 h-7 ${kpi.iconColor}`} />
              </div>
              <div className="flex-1">
                <p className="text-gray-500 text-[14px] mb-1">{kpi.label}</p>
                <p className="text-3xl text-gray-900" style={{ fontWeight: 700 }}>
                  {kpi.value}
                </p>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-gray-300 transition-transform ${
                  isActive ? "rotate-180 text-gray-500" : ""
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Expanded Panel for Appointments */}
      {expandedKpi === "appointments" && (
        <div className="bg-white rounded-2xl shadow-md border border-blue-200 overflow-hidden animate-in">
          <div className="px-6 py-4 bg-gradient-to-l from-blue-50 to-white border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-blue-600" />
              <h3 className="text-gray-900 text-[16px]" style={{ fontWeight: 600 }}>
                כל התורים להיום
              </h3>
              <span className="bg-blue-100 text-blue-700 text-[12px] px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>
                {todayAppointments.length}
              </span>
            </div>
            <button
              onClick={() => setExpandedKpi(null)}
              className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {todayAppointments.map((appt) => (
              <button
                key={appt.id}
                onClick={() => navigate("/appointments")}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all cursor-pointer text-right group"
              >
                <div className="bg-blue-50 rounded-lg px-2.5 py-1.5 text-[13px] text-blue-700 shrink-0 group-hover:bg-blue-100 transition-colors" style={{ fontWeight: 600 }}>
                  {appt.time}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 text-[13px] truncate" style={{ fontWeight: 600 }}>
                    {appt.pet}
                    <span className="text-gray-400" style={{ fontWeight: 400 }}> · {appt.owner}</span>
                  </p>
                  <p className="text-gray-400 text-[12px] truncate">{appt.type}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-gray-300 -rotate-90 group-hover:text-blue-500 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Expanded Panel for Active Patients / Departments */}
      {expandedKpi === "patients" && (
        <div className="bg-white rounded-2xl shadow-md border border-green-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-l from-green-50 to-white border-b border-green-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <MapPin className="w-5 h-5 text-green-600" />
              <h3 className="text-gray-900 text-[16px]" style={{ fontWeight: 600 }}>
                מחלקות אשפוז ומטופלים פעילים
              </h3>
            </div>
            <button
              onClick={() => setExpandedKpi(null)}
              className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {departments.map((dept) => (
              <div
                key={dept.id}
                className={`rounded-xl border p-4 ${dept.color}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[18px]">{dept.icon}</span>
                  <h4 className="text-[14px]" style={{ fontWeight: 600 }}>
                    {dept.name}
                  </h4>
                  <span className="bg-white/60 text-[11px] px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>
                    {dept.patients.length} מאושפזים
                  </span>
                </div>
                <div className="space-y-2">
                  {dept.patients.map((p) => {
                    const SIcon = PetSpeciesIcon(p.species);
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/patients?selected=${p.id}`)}
                        className="w-full flex items-center gap-3 bg-white/80 rounded-lg px-3 py-2.5 text-right hover:bg-white transition-colors cursor-pointer group"
                      >
                        <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                          <SIcon className="w-4 h-4 text-gray-500 group-hover:text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 text-[13px]" style={{ fontWeight: 600 }}>
                            {p.name}
                            <span className="text-gray-400 mr-1" style={{ fontWeight: 400 }}>({p.owner})</span>
                          </p>
                        </div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.statusColor}`} style={{ fontWeight: 500 }}>
                          {p.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expanded Panel for Urgent Cases */}
      {expandedKpi === "urgent" && (
        <div className="bg-white rounded-2xl shadow-md border border-orange-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-l from-orange-50 to-white border-b border-orange-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <h3 className="text-gray-900 text-[16px]" style={{ fontWeight: 600 }}>
                מקרים דחופים פעילים
              </h3>
              <span className="bg-red-100 text-red-700 text-[12px] px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>
                {urgentCases.length} פתוחים
              </span>
            </div>
            <button
              onClick={() => setExpandedKpi(null)}
              className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {urgentCases.map((uc) => {
              const UCIcon = PetSpeciesIcon(uc.species);
              return (
                <div
                  key={uc.id}
                  className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/20 transition-all"
                >
                  <div className="w-11 h-11 bg-orange-50 rounded-xl flex items-center justify-center shrink-0">
                    <UCIcon className="w-6 h-6 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>
                        {uc.petName}
                      </span>
                      <span className="text-gray-400 text-[12px]">{uc.species} · {uc.owner}</span>
                    </div>
                    <p className="text-gray-600 text-[13px]">{uc.issue}</p>
                  </div>
                  <div className="text-left shrink-0 space-y-1">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${uc.sevColor} block text-center`} style={{ fontWeight: 600 }}>
                      {uc.severity}
                    </span>
                    <p className="text-gray-400 text-[11px] text-center">{uc.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
