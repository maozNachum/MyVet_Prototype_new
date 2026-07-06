import { LogOut, Search, Cat, Dog, X, Phone, Stethoscope, Scissors, MessageCircle, Package, Loader2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import { getStaffType, getStaffLabel, canAccessReportsPage, getStaffName } from "../data/staffAuth";
import { MyVetLogo } from "./MyVetLogo";
import { useSearchFilter } from "../hooks/useSearchFilter";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_FALLBACK,
} from "../data/categoryConfig";

type PatientSearchItem = {
  id: number;
  petId: number;
  petName: string;
  species: string;
  speciesType: "dog" | "cat" | "other";
  breed: string;
  microchip: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
};

type InventorySearchItem = {
  id: number;
  sku: string;
  name: string;
  category: string;
  categoryLabel: string;
  quantity: number;
};

type PatientRow = {
  pet_id: number | string;
  pet_name: string | null;
  species: string | null;
  breed: string | null;
  microchip: string | null;
  owner_id: string | null;
};

type OwnerRow = {
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  phone: string | null;
  email: string | null;
};

type InventoryRow = {
  item_id: number | string;
  item_name: string | null;
  category: string | null;
  stock_quantity: number | null;
};

function fullName(first?: string | null, last?: string | null) {
  return `${first || ""} ${last || ""}`.trim();
}

function normalizeSpecies(species?: string | null): PatientSearchItem["speciesType"] {
  const value = (species || "").trim().toLowerCase();
  if (value === "cat" || value === "חתול") return "cat";
  if (value === "dog" || value === "כלב") return "dog";
  return "other";
}

function speciesLabel(species?: string | null) {
  const normalized = normalizeSpecies(species);
  if (normalized === "cat") return "חתול";
  if (normalized === "dog") return "כלב";
  return species || "אחר";
}

function InvCategoryIcon({ category }: { category: string }) {
  const cat =
    INVENTORY_CATEGORIES[category as keyof typeof INVENTORY_CATEGORIES] ??
    INVENTORY_CATEGORY_FALLBACK;
  const Icon = cat.icon;
  return <Icon className={`w-4 h-4 ${cat.iconColor}`} />;
}

function getInventoryCategoryLabel(category?: string | null) {
  const cat =
    INVENTORY_CATEGORIES[category as keyof typeof INVENTORY_CATEGORIES] ??
    INVENTORY_CATEGORY_FALLBACK;
  return cat.label;
}

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [patientItems, setPatientItems] = useState<PatientSearchItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventorySearchItem[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
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

  useEffect(() => {
    let mounted = true;

    async function loadSearchData() {
      setIsSearchLoading(true);
      setSearchError(null);

      try {
        const [{ data: patientRows, error: patientsError }, { data: inventoryRows, error: inventoryError }] = await Promise.all([
          supabase
            .from("patients")
            .select("pet_id, pet_name, species, breed, microchip, owner_id")
            .order("pet_name", { ascending: true }),
          supabase
            .from("inventory")
            .select("item_id, item_name, category, stock_quantity")
            .order("item_name", { ascending: true }),
        ]);

        if (patientsError) throw patientsError;
        if (inventoryError) throw inventoryError;

        const typedPatients = (patientRows || []) as PatientRow[];
        const ownerIds = Array.from(new Set(typedPatients.map((row) => row.owner_id).filter(Boolean) as string[]));
        const ownersById = new Map<string, OwnerRow>();

        if (ownerIds.length > 0) {
          const { data: ownerRows, error: ownersError } = await supabase
            .from("owners")
            .select("owner_id, owner_first_name, owner_last_name, phone, email")
            .in("owner_id", ownerIds);

          if (ownersError) throw ownersError;
          for (const owner of (ownerRows || []) as OwnerRow[]) {
            ownersById.set(String(owner.owner_id), owner);
          }
        }

        if (!mounted) return;

        setPatientItems(
          typedPatients.map((row) => {
            const owner = row.owner_id ? ownersById.get(String(row.owner_id)) : undefined;
            return {
              id: Number(row.pet_id),
              petId: Number(row.pet_id),
              petName: row.pet_name || "ללא שם חיה",
              species: speciesLabel(row.species),
              speciesType: normalizeSpecies(row.species),
              breed: row.breed || "",
              microchip: row.microchip || "",
              ownerId: row.owner_id || "",
              ownerName: owner ? fullName(owner.owner_first_name, owner.owner_last_name) || "ללא שם בעלים" : "ללא בעלים",
              ownerPhone: owner?.phone || "",
              ownerEmail: owner?.email || "",
            };
          })
        );

        setInventoryItems(
          ((inventoryRows || []) as InventoryRow[]).map((row) => ({
            id: Number(row.item_id),
            sku: String(row.item_id),
            name: row.item_name || "ללא שם פריט",
            category: row.category || "other",
            categoryLabel: getInventoryCategoryLabel(row.category),
            quantity: Number(row.stock_quantity || 0),
          }))
        );
      } catch (err) {
        console.error("Failed to load global search data", err);
        if (mounted) setSearchError("לא הצלחנו לטעון את החיפוש מהמסד");
      } finally {
        if (mounted) setIsSearchLoading(false);
      }
    }

    loadSearchData();
    return () => {
      mounted = false;
    };
  }, []);

  const patientResults = useSearchFilter(
    searchQuery.length >= 1 ? patientItems : [],
    searchQuery,
    (p) => [p.petName, p.ownerName, p.ownerPhone, p.ownerEmail, p.microchip, p.ownerId, p.species, p.breed]
  );

  const inventoryResults = useSearchFilter(
    searchQuery.length >= 1 ? inventoryItems : [],
    searchQuery,
    (item) => [item.name, item.sku, item.categoryLabel, item.category, String(item.quantity)]
  );

  const limitedPatientResults = useMemo(() => patientResults.slice(0, 8), [patientResults]);
  const limitedInventoryResults = useMemo(() => inventoryResults.slice(0, 6), [inventoryResults]);
  const hasResults = limitedPatientResults.length > 0 || limitedInventoryResults.length > 0;

  const handleSelectPatient = (patientId: number) => {
    setSearchQuery("");
    setIsSearchOpen(false);
    navigate("/patients?selected=" + patientId);
  };

  const handleSelectInventory = (query: string) => {
    setSearchQuery("");
    setIsSearchOpen(false);
    navigate(`/inventory?search=${encodeURIComponent(query)}`);
  };

  const openCommandCenter = () => {
    setSearchQuery("");
    setIsSearchOpen(false);
    window.dispatchEvent(new CustomEvent("myvet:open-command-center"));
  };

  return (
    <nav className="bg-[#1e40af] text-white shadow-md sticky top-0 z-50 w-full">
      <div className="w-full px-4 h-16 flex items-center justify-between mx-auto">
        <div className="flex items-center gap-4 xl:gap-6">
          <Link to="/" className="flex items-center hover:opacity-90 transition-opacity shrink-0">
            <div className="w-22 h-19 flex items-center justify-center transform scale-[1.6] origin-right">
              <MyVetLogo color="white" showTagline={false} />
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
              to="/clients"
              className={`px-3.5 py-2 rounded-lg text-[14px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive("/clients") ? "bg-white/15 text-white shadow-sm" : "text-blue-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              לקוחות
            </Link>
            <Link
              to="/inventory"
              className={`px-3.5 py-2 rounded-lg text-[14px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive("/inventory") ? "bg-white/15 text-white shadow-sm" : "text-blue-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              מלאי
            </Link>
            <Link
              to="/digital-care"
              className={`px-3.5 py-2 rounded-lg text-[14px] font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                isActive("/digital-care") ? "bg-white/15 text-white shadow-sm" : "text-blue-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              דיגיטל
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

          <div className="hidden lg:block w-64 xl:w-80" ref={searchRef}>
            <div className="relative w-full">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
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
                  {isSearchLoading ? (
                    <div className="px-4 py-8 text-center text-gray-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                      <p className="text-[14px] font-medium">טוען נתונים מהמסד...</p>
                    </div>
                  ) : searchError ? (
                    <div className="px-4 py-8 text-center">
                      <Search className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                      <p className="text-red-500 text-[14px] font-medium">{searchError}</p>
                    </div>
                  ) : hasResults ? (
                    <div className="max-h-[420px] overflow-y-auto">
                      {limitedPatientResults.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                            <span className="text-gray-500 text-[12px] font-semibold">מטופלים ולקוחות ({patientResults.length})</span>
                          </div>
                          {limitedPatientResults.map((patient) => {
                            const PetIcon = patient.speciesType === "cat" ? Cat : Dog;
                            return (
                              <button key={`p-${patient.petId}`} type="button" onClick={() => handleSelectPatient(patient.petId)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors cursor-pointer text-right border-b border-gray-50 last:border-b-0">
                                <div className="bg-blue-50 rounded-lg w-9 h-9 flex items-center justify-center shrink-0">
                                  <PetIcon className="w-4.5 h-4.5 text-[#1e40af]" />
                                </div>
                                <div className="flex-1 min-w-0 text-right">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-900 text-[14px] font-semibold truncate">{patient.petName}</span>
                                    <span className="text-gray-500 font-medium text-[12px] truncate">{patient.species}{patient.breed ? ` · ${patient.breed}` : ""}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[12px] text-gray-500">
                                    <span className="truncate">{patient.ownerName}</span>
                                    {patient.ownerPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{patient.ownerPhone}</span>}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </>
                      )}

                      {limitedInventoryResults.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 border-t border-t-gray-100">
                            <span className="text-gray-500 text-[12px] font-semibold">פריטי מלאי ({inventoryResults.length})</span>
                          </div>
                          {limitedInventoryResults.map((item) => (
                            <button key={`inv-${item.id}`} type="button" onClick={() => handleSelectInventory(item.name)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors cursor-pointer text-right border-b border-gray-50 last:border-b-0">
                              <div className="bg-violet-50 rounded-lg w-9 h-9 flex items-center justify-center shrink-0">
                                <InvCategoryIcon category={item.category} />
                              </div>
                              <div className="flex-1 min-w-0 text-right">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-900 text-[14px] font-semibold truncate">{item.name}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[12px] text-gray-500">
                                  <span>{item.categoryLabel}</span>
                                  <span className="font-mono text-gray-500 font-medium">מק״ט {item.sku}</span>
                                  <span>מלאי {item.quantity}</span>
                                </div>
                              </div>
                              <Package className="w-4 h-4 text-gray-300" />
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center">
                      <Search className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-500 text-[14px] font-medium">לא נמצאו תוצאות במסד</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={openCommandCenter}
            className="hidden xl:flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[13px] font-medium text-white/90 transition hover:bg-white/15 hover:text-white"
            title="פתח מרכז פעולות"
          >
            <Search className="w-4 h-4" />
            <span>פעולות</span>
            <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white/80">Ctrl K</kbd>
          </button>
          <div className="hidden lg:block w-px h-6 bg-white/20 ml-2"></div>
          <div className="flex items-center gap-2 bg-[#1e3a8a] rounded-xl px-3 py-1.5 border border-white/10 shadow-inner">
            <StaffIcon className="w-4 h-4 text-blue-200 shrink-0" />
            <span className="text-[13px] text-white font-medium whitespace-nowrap">
              {staffName} <span className="text-blue-300/60 font-normal mx-1">|</span> {staffLabel}
            </span>
          </div>
          <button
            type="button"
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
