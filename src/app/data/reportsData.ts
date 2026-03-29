import { LEAKAGE_DATA } from "../components/reports/RevenueLeakage";
import { inventoryItems } from "../components/Navbar";

export const getBIStats = () => {
  // חישוב חובות מהדאטה של ה-RevenueLeakage (ה-₪535 שלך)
  const openItems = LEAKAGE_DATA.filter(d => d.status === "open");
  const totalLeakage = openItems.reduce((sum, d) => 
    sum + d.discrepancies.reduce((s, disc) => s + disc.estimatedValue, 0), 0
  );
  
  const waitingOwnersCount = openItems.length;

  return {
    revenue: {
      value: `₪${totalLeakage.toLocaleString()}`,
      subText: `${waitingOwnersCount} לקוחות עם פערים לחיוב`,
      change: "+12%", trend: "up" as const
    },
    staff: { value: "84%", subText: "ממוצע 6.2 שעות לרופא", change: "+5%", trend: "up" as const },
    inventory: { value: (inventoryItems?.length || 0).toString(), subText: "פריטים במעקב", change: "-2", trend: "down" as const },
    compliance: { value: "72%", subText: "ירידה קלה השבוע", change: "-4%", trend: "down" as const }
  };
};