import { LogOut, Search, Cat, Dog, X, Phone, Package, Stethoscope, Scissors } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { useState, useRef, useEffect } from "react";
import { patients } from "../data/patients";
import { getStaffType, getStaffLabel } from "../data/staffAuth";
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

const inventoryItems: InventorySearchItem[] = [
  { id: 1, sku: "10045", name: 'אמוקסיצילין 500 מ"ג', category: "medication", categoryLabel: "תרופות" },
  { id: 2, sku: "20099", name: "תחבושת אלסטית", category: "equipment", categoryLabel: "ציוד רפואי" },
  { id: 3, sku: "10088", name: "טיפות עיניים", category: "medication", categoryLabel: "תרופות" },
  { id: 4, sku: "30012", name: 'מזרק 5 מ"ל', category: "consumable", categoryLabel: "ציוד מתכלה" },
  { id: 5, sku: "10072", name: 'מטרונידזול 250 מ"ג', category: "medication", categoryLabel: "תרופות" },
  { id: 6, sku: "20150", name: "כפפות ניטריל M", category: "consumable", categoryLabel: "ציוד מתכלה" },
  { id: 7, sku: "10091", name: "חיסון כלבת", category: "medication", categoryLabel: "תרופות" },
  { id: 8, sku: "20201", name: "צינור אנדוטרכיאלי", category: "equipment", categoryLabel: "ציוד רפואי" },
];

/** Render the icon for an inventory category using the central config. */
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

  // ── Centralised search via shared hook ──
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
    <nav className="bg-[#1e40af] text-white shadow-lg relative z-50">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          <div className="bg-white/15 rounded-lg p-1.5">
            <MyVetLogo size={24} color="white" />
          </div>
          <span className="text-[22px] tracking-wide" style={{ fontWeight: 700 }}>
            MyVet
          </span>
        </Link>

        {/* Search Bar */}
        <div className="hidden md:flex flex-1 max-w-md mx-6" ref={searchRef}>
          <div className="relative w-full">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 hover:text-white cursor-pointer"
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
              className="w-full pr-10 pl-8 py-1.5 bg-white/10 border border-white/15 rounded-lg text-[13px] text-white placeholder-white/50 focus:outline-none focus:bg-white/15 focus:border-white/30 transition-colors"
            />

            {/* Search Dropdown */}
            {isSearchOpen && searchQuery.length >= 1 && (
              <div className="absolute top-full mt-2 right-0 left-0 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-[100]">
                {hasResults ? (
                  <div className="max-h-[400px] overflow-y-auto">
                    {/* Patient Results */}
                    {patientResults.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                          <span className="text-gray-500 text-[12px]" style={{ fontWeight: 600 }}>
                            מטופלים ({patientResults.length})
                          </span>
                        </div>
                        {patientResults.map((patient) => {
                          const PetIcon = patient.pet.speciesType === "cat" ? Cat : Dog;
                          return (
                            <button
                              key={`p-${patient.id}`}
                              onClick={() => handleSelectPatient(patient.id)}
                              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors cursor-pointer text-right border-b border-gray-50 last:border-b-0"
                            >
                              <div className="bg-blue-50 rounded-lg w-9 h-9 flex items-center justify-center shrink-0">
                                <PetIcon className="w-4.5 h-4.5 text-[#1e40af]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>
                                    {patient.pet.name}
                                  </span>
                                  <span className="text-gray-400 text-[12px]">
                                    {patient.pet.species} · {patient.pet.breed}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[12px] text-gray-500">
                                  <span>{patient.owner.name}</span>
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {patient.owner.phone}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {/* Inventory Results */}
                    {inventoryResults.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 border-t border-t-gray-100">
                          <span className="text-gray-500 text-[12px]" style={{ fontWeight: 600 }}>
                            פריטי מלאי ({inventoryResults.length})
                          </span>
                        </div>
                        {inventoryResults.map((item) => (
                          <button
                            key={`inv-${item.id}`}
                            onClick={() => handleSelectInventory(item.name)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors cursor-pointer text-right border-b border-gray-50 last:border-b-0"
                          >
                            <div className="bg-violet-50 rounded-lg w-9 h-9 flex items-center justify-center shrink-0">
                              <InvCategoryIcon category={item.category} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>
                                  {item.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[12px] text-gray-500">
                                <span>{item.categoryLabel}</span>
                                <span className="font-mono text-gray-400">מק״ט {item.sku}</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <Search className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-[14px]">לא נמצאו תוצאות</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex items-center gap-1">
          <Link
            to="/appointments"
            className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
              isActive("/appointments") ? "bg-white/20" : "hover:bg-white/10"
            }`}
          >
            יומן תורים
          </Link>
          <Link
            to="/patients"
            className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
              isActive("/patients") ? "bg-white/20" : "hover:bg-white/10"
            }`}
          >
            מטופלים
          </Link>
          <Link
            to="/inventory"
            className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
              isActive("/inventory") ? "bg-white/20" : "hover:bg-white/10"
            }`}
          >
            מלאי
          </Link>
          <Link
            to="/reports"
            className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
              isActive("/reports") ? "bg-white/20" : "hover:bg-white/10"
            }`}
          >
            דוחות
          </Link>
          <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-1.5 mr-2 border border-white/15">
            <StaffIcon className="w-4 h-4 text-white/70" />
            <span className="text-[12px] text-white/90" style={{ fontWeight: 500 }}>{staffLabel}</span>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 transition-colors px-4 py-2 rounded-lg cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>התנתקות</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
