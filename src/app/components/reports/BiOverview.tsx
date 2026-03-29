import { 
  DollarSign, Users, Package, UserX, 
  ArrowUpRight, ArrowDownRight, TrendingUp, AlertCircle 
} from "lucide-react";
import { getBIStats } from "../../data/reportsData"; // ייבוא המקור הדינמי

export function BiOverview() {
  const stats = getBIStats(); // משיכת הנתונים המחושבים

  const summaryCards = [
    { title: "חובות פתוחים", ...stats.revenue, color: "text-red-500", icon: DollarSign },
    { title: "ניצולת צוות", ...stats.staff, color: "text-blue-500", icon: Users },
    { title: "פריטים בחוסר", ...stats.inventory, color: "text-purple-500", icon: Package },
    { title: "מעקב טיפולים", ...stats.compliance, color: "text-amber-500", icon: UserX },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* שורת כרטיסי סיכום */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {summaryCards.map((card, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-gray-50">
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <div className={`flex items-center gap-1 text-[12px] font-bold ${card.trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {card.trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {card.change}
              </div>
            </div>
            <h3 className="text-gray-500 text-[14px] font-medium mb-1">{card.title}</h3>
            <p className="text-2xl font-bold text-gray-900 mb-2">{card.value}</p>
            <p className="text-gray-400 text-[11px] font-medium">{card.subText}</p>
          </div>
        ))}
      </div>

      {/* שאר הקומפוננטה (גרפים ותובנות) נשארת אותו דבר... */}
    </div>
  );
}