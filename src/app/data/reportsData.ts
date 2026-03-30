import { medicalHistory } from "./patients";
import { LEAKAGE_DATA } from "../components/reports/RevenueLeakage";
import { inventoryItems } from "../components/Navbar";

export const getBIStats = () => {
  // 1. נתוני חובות (מה שכבר עשינו והצליח)
  const openItems = LEAKAGE_DATA.filter(d => d.status === "open");
  const totalLeakage = openItems.reduce((sum, d) => 
    sum + d.discrepancies.reduce((s, disc) => s + disc.estimatedValue, 0), 0
  );

  // 2. חישוב ביצועי רופאים מתוך ההיסטוריה הרפואית
  const doctors = ["ד\"ר שרה לוי", "ד\"ר יוסי כהן", "ד\"ר דוד מזרחי"];
  const doctorStats = doctors.map(doc => {
    const docVisits = medicalHistory.filter(v => v.vet === doc);
    const revenue = docVisits.reduce((sum, v) => sum + (v.cost || 0), 0);
    return { 
      name: doc.replace("ד\"ר ", ""), 
      revenue 
    };
  });

  return {
    revenue: {
      value: `₪${totalLeakage.toLocaleString()}`,
      subText: `${openItems.length} לקוחות עם פערים לחיוב`,
      change: "+12%", trend: "up" as const
    },
    staff: { 
      value: "84%", 
      subText: "ממוצע 6.2 שעות לרופא", 
      doctorStats // <--- זה מה שבונה את דיאגרמת המקלות!
    },
    inventory: { 
      value: (inventoryItems?.length || 0).toString(), 
      subText: "פריטים במעקב", 
      change: "-2", trend: "down" as const 
    },
    compliance: { 
      value: "72%", 
      subText: "ירידה קלה השבוע", 
      change: "-4%", trend: "down" as const 
    },
    // <--- זה מה שבונה את רשימת הפעולות הדחופות!
    urgentActions: openItems.slice(0, 3).map(item => ({
      title: item.patientName,
      desc: `חוב של ₪${item.discrepancies.reduce((s, d) => s + d.estimatedValue, 0)}`,
      type: "debt"
    }))
  };
};