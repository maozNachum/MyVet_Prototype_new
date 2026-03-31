import { LogOut, Search, Cat, Dog, X, Phone, Stethoscope, Scissors } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { useState, useRef, useEffect } from "react";
import { patients } from "../data/patients";
import { getStaffType, getStaffLabel, canAccessReportsPage, getStaffName } from "../data/staffAuth";
import { MyVetLogo } from "./MyVetLogo";
import { useSearchFilter } from "../hooks/useSearchFilter";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_FALLBACK,
} from "../data/categoryConfig";

// ── Inventory data for global search ──
interface InventorySearchItem {
  id: number;
  sku: string;
  name: string;
  category: string;
  categoryLabel: string;
}

export const inventoryItems: InventorySearchItem[] = [
  { id: 1, sku: "10045", name: 'אמוקסיצילין 500 מ"ג', category: "medication", categoryLabel: "תרופות" },
  { id: 2, sku: "20099", name: "תחבושת אלסטית", category: "equipment", categoryLabel: "ציוד רפואי" },
  { id: 3, sku: "10088", name: "טיפות עיניים", category: "medication", categoryLabel: "תרופות" },
  { id: 4, sku: "30012", name: 'מזרק 5 מ"ל', category: "consumable", categoryLabel: "ציוד מתכלה" },
  { id: 5, sku: "10072", name: 'מטרונידזול 250 מ"ג', category: "medication", categoryLabel: "תרופות" },
  { id: 6, sku: "20150", name: "כפפות ניטריל M", category: "consumable", categoryLabel: "ציוד מתכלה" },
  { id: 7, sku: "10091", name: "חיסון כלבת", category: "medication", categoryLabel: "תרופות" },
  { id: 8, sku: "20201", name: "צינור אנדוטרכיאלי", category: "equipment", categoryLabel: "ציוד רפואי" },
];

function InvCategoryIcon({ category }: { category: string }) {
  const cat =
    INVENTORY_CATEGORIES[category as keyof typeof INVENTORY_CATEGORIES] ??
    INVENTORY_CATEGORY_FALLBACK;
  const Icon = cat.icon;
  return <Icon className={`w-4 h-4 ${cat.iconColor}`} />;
}

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const staffType = getStaffType();
  const staffLabel = getStaffLabel(staffType);
  const staffName = getStaffName();
  const StaffIcon = staffType === "vet" ? Stethoscope : staffType === "nurse" ? Scissors : Phone;

  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const patientResults = useSearchFilter(
    searchQuery.length >= 1 ? patients : [],
    searchQuery,
    (p) => [p.pet.name, p.owner.name, p.owner.phone, p.owner.email, p.pet.microchip, p.owner.id]
  );

  const inventoryResults = useSearchFilter(
    searchQuery.length >= 1 ? inventoryItems : [],
    searchQuery,
    (item) => [item.name, item.sku, item.categoryLabel]
  );

  const hasResults = patientResults.length > 0 || inventoryResults.length > 0;

  const handleSelectPatient = (patientId: number) => {
    setSearchQuery("");
    setIsSearchOpen(false);
    navigate("/patients?selected=" + patientId);
  };

  const handleSelectInventory = (_query: string) => {
    setSearchQuery("");
    setIsSearchOpen(false);
    navigate("/inventory");
  };

  return (
    <nav className="bg-[#1e40af] text-white shadow-md sticky top-0 z-50 w-full">
      <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* קבוצה ימנית: לוגו, ניווט וחיפוש */}
        <div className="flex items-center gap-4 xl:gap-6">
          <Link to="/" className="flex items-center hover:opacity-90 transition-opacity shrink-0">
            {/* לוגו */}
            <div className="w-22 h-19 flex items-center justify-center transform scale-[1.6] origin-right">
              <MyVetLogo color="white" />
            </div>
          </Link>
          <div className="hidden md:block w-px h-6 bg-white/20 ml-2"></div>
          <div className="hidden md:flex items-center gap-1">
            <Link
              to="/appointments"
              className={`px-1 py-2 rounded-lg text-[14px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive("/appointments") ? "bg-white/15 text-white shadow-sm" : "text-blue-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              יומן תורים
            </Link>
            <Link
              to="/patients"
              className={`px-3.5 py-2 rounded-lg text-[14px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive("/patients") ? "bg-white/15 text-white shadow-sm" : "text-blue-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              מטופלים
            </Link>
            <Link
              to="/inventory"
              className={`px-3.5 py-2 rounded-lg text-[14px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive("/inventory") ? "bg-white/15 text-white shadow-sm" : "text-blue-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              מלאי
            </Link>
            {canAccessReportsPage() && (
              <Link
                to="/reports"
                className={`px-3.5 py-2 rounded-lg text-[14px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isActive("/reports") ? "bg-white/15 text-white shadow-sm" : "text-blue-100 hover:bg-white/10 hover:text-white"
                }`}
              >
                דוחות
              </Link>
            )}
          </div>

          {/* חיפוש */}
          <div className="hidden lg:block w-64 xl:w-72" ref={searchRef}>
            <div className="relative w-full">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setIsSearchOpen(false);
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 hover:text-white cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <input
                type="text"
                placeholder="חיפוש מטופל, לקוח, פריט מלאי..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => {
                  if (searchQuery.length >= 1) setIsSearchOpen(true);
                }}
                className="w-full pr-10 pl-8 py-2 bg-white/10 hover:bg-white/15 focus:bg-white/20 border border-white/20 rounded-xl text-[13px] text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all shadow-inner"
              />

              {isSearchOpen && searchQuery.length >= 1 && (
                <div className="absolute top-full mt-2 right-0 left-0 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-[100]">
                  {hasResults ? (
                    <div className="max-h-[400px] overflow-y-auto">
                      {patientResults.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                            <span className="text-gray-500 text-[12px] font-semibold">מטופלים ({patientResults.length})</span>
                          </div>
                          {patientResults.map((patient) => {
                            const PetIcon = patient.pet.speciesType === "cat" ? Cat : Dog;
                            return (
                              <button key={`p-${patient.id}`} onClick={() => handleSelectPatient(patient.id)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors cursor-pointer text-right border-b border-gray-50 last:border-b-0">
                                <div className="bg-blue-50 rounded-lg w-9 h-9 flex items-center justify-center shrink-0">
                                  <PetIcon className="w-4.5 h-4.5 text-[#1e40af]" />
                                </div>
                                <div className="flex-1 min-w-0 text-right">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-900 text-[14px] font-semibold">{patient.pet.name}</span>
                                    <span className="text-gray-500 font-medium text-[12px]">{patient.pet.species} · {patient.pet.breed}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[12px] text-gray-500">
                                    <span>{patient.owner.name}</span>
                                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{patient.owner.phone}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </>
                      )}

                      {inventoryResults.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 border-t border-t-gray-100">
                            <span className="text-gray-500 text-[12px] font-semibold">פריטי מלאי ({inventoryResults.length})</span>
                          </div>
                          {inventoryResults.map((item) => (
                            <button key={`inv-${item.id}`} onClick={() => handleSelectInventory(item.name)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors cursor-pointer text-right border-b border-gray-50 last:border-b-0">
                              <div className="bg-violet-50 rounded-lg w-9 h-9 flex items-center justify-center shrink-0">
                                <InvCategoryIcon category={item.category} />
                              </div>
                              <div className="flex-1 min-w-0 text-right">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-900 text-[14px] font-semibold">{item.name}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[12px] text-gray-500">
                                  <span>{item.categoryLabel}</span>
                                  <span className="font-mono text-gray-500 font-medium">מק״ט {item.sku}</span>
                                </div>
                              </div>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center">
                      <Search className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-500 text-[14px] font-medium">לא נמצאו תוצאות</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── קבוצה שמאלית: פרופיל והתנתקות ─── */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:block w-px h-6 bg-white/20 ml-2"></div>
          <div className="flex items-center gap-2 bg-[#1e3a8a] rounded-xl px-3 py-1.5 border border-white/10 shadow-inner">
            <StaffIcon className="w-4 h-4 text-blue-200 shrink-0" />
            <span className="text-[13px] text-white font-medium whitespace-nowrap">
              {staffName} <span className="text-blue-300/60 font-normal mx-1">|</span> {staffLabel}
            </span>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 text-white/80 hover:text-white hover:bg-red-500/90 transition-all px-3 py-2 rounded-xl text-[13px] font-medium cursor-pointer"
          >
            <span>התנתקות</span>
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </div>
    </nav>
  );
}