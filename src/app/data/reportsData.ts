export const getBIStats = () => ({
  revenue: { value: "₪0", subText: "הנתונים נטענים בדוחות הפעילים", change: "0%", trend: "up" as const },
  staff: { value: "0%", subText: "הנתונים נטענים בדוחות הפעילים", doctorStats: [] as { name: string; revenue: number }[] },
  inventory: { value: "0", subText: "הנתונים נטענים בדוחות הפעילים", change: "0", trend: "down" as const },
  compliance: { value: "0%", subText: "הנתונים נטענים בדוחות הפעילים", change: "0%", trend: "down" as const },
  urgentActions: [] as { title: string; desc: string; type: string }[],
});
