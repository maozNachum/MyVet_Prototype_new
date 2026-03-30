import { 
  DollarSign, Users, Package, UserX, 
  ArrowUpRight, ArrowDownRight, TrendingUp, AlertCircle, ChevronLeft
} from "lucide-react";
import { getBIStats } from "../../data/reportsData";

export function BiOverview() {
  const stats = getBIStats();

  // הגנה: אם stats ריק זמנית, ניתן לו אובייקטים ריקים כברירת מחדל
  const summaryCards = [
    { title: "חובות פתוחים", ...(stats?.revenue || {}), color: "text-red-500", icon: DollarSign, trend: "up", change: "+5.2%" },
    { title: "ניצולת צוות", ...(stats?.staff || {}), color: "text-blue-500", icon: Users, trend: "up", change: "+2.1%" },
    { title: "פריטים בחוסר", ...(stats?.inventory || {}), color: "text-purple-500", icon: Package, trend: "down", change: "-1.3%" },
    { title: "מעקב טיפולים", ...(stats?.compliance || {}), color: "text-amber-500", icon: UserX, trend: "up", change: "+3.8%" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* 1. כרטיסי KPI (השורה העליונה) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {summaryCards.map((card, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-gray-50"><card.icon className={`w-6 h-6 ${card.color || 'text-gray-500'}`} /></div>
              <div className={`flex items-center gap-1 text-[12px] font-bold ${card.trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {card.trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {card.change}
              </div>
            </div>
            <h3 className="text-gray-500 text-[14px] font-medium mb-1">{card.title}</h3>
            <p className="text-2xl font-bold text-gray-900 mb-1">{card.value || "0"}</p>
            <p className="text-gray-500 font-medium text-[13px]">{card.subText}</p>
          </div>
        ))}
      </div>

      {/* 2. הגרפים והפעולות (השורה השנייה) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* גרף ביצועי רופאים - דיאגרמת מקלות (Bar Chart) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-gray-900 font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              ביצועי רופאים (הכנסות חודש מרץ)
            </h3>
          </div>
          
          <div className="space-y-6">
            {/* הוספתי ?. כדי למנוע קריסה */}
            {stats?.staff?.doctorStats?.map((doc, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between text-[13px]">
                  <span className="font-bold text-gray-700">ד"ר {doc.name}</span>
                  <span className="text-blue-600 font-bold">₪{doc.revenue.toLocaleString()}</span>
                </div>
                <div className="h-4 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                  <div 
                    className="h-full bg-gradient-to-l from-blue-600 to-blue-400 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min((doc.revenue / 500) * 100, 100)}%` }} // חישוב רוחב יחסי
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* פעולות דחופות לטיפול */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="text-gray-900 font-bold mb-6 flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            פעולות דחופות
          </h3>
          <div className="space-y-4">
            {/* הוספתי ?. כדי למנוע קריסה */}
            {stats?.urgentActions?.map((action, i) => (
              <div key={i} className="group p-4 bg-gray-50 hover:bg-red-50 rounded-2xl border border-transparent hover:border-red-100 transition-all cursor-pointer">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-gray-900 text-[14px] font-bold mb-1">{action.title}</p>
                    <p className="text-gray-500 text-[12px]">{action.desc}</p>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-red-400 transition-colors" />
                </div>
              </div>
            ))}
            {(!stats?.urgentActions || stats.urgentActions.length === 0) && (
              <p className="text-gray-500 font-medium text-[13px] text-center py-4">אין פעולות דחופות כרגע ✓</p>
            )}
            <button className="w-full py-3 text-blue-600 text-[13px] font-bold border border-dashed border-blue-200 rounded-xl hover:bg-blue-50 transition-colors">
              לצפייה בכל ההתראות
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}