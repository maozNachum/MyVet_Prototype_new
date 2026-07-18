import { LogOut, Search, Cat, Dog, X, Phone, Stethoscope, Scissors, Package, Loader2, ShieldCheck, Menu } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import { getStaffType, getStaffLabel, canAccessReportsPage, getStaffName, clearStaffSession } from "../data/staffAuth";
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      clearStaffSession();
      navigate("/login", { replace: true });
    }
  };
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
  const StaffIcon = staffType === "clinic_admin" ? ShieldCheck : staffType === "vet" ? Stethoscope : staffType === "nurse" ? Scissors : Phone;

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

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadSearchData();
    };

    void loadSearchData();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const channel = supabase
      .channel("myvet-navbar-search-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, loadSearchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "owners" }, loadSearchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, loadSearchData)
      .subscribe();

    return () => {
      mounted = false;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
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
    setIsMobileMenuOpen(false);
    window.dispatchEvent(new CustomEvent("myvet:open-command-center"));
  };

  const mobileNavItems = [
    { to: "/", label: "דשבורד" },
    { to: "/appointments", label: "יומן תורים" },
    { to: "/clients", label: "לקוחות" },
    { to: "/patients", label: "מטופלים" },
    { to: "/inventory", label: "מלאי" },
    { to: "/digital-care", label: "דיגיטל" },
    ...(canAccessReportsPage() ? [{ to: "/reports", label: "דוחות" }] : []),
  ];

  return (
    <nav className="bg-[#1e40af] text-white shadow-md sticky top-0 z-50 w-full">
      <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center justify-between px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4 xl:gap-6">
          <Link to="/" aria-label="MyVet – דף הבית" className="flex shrink-0 items-center transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg">
            <div className="flex h-19 w-22 origin-right scale-[1.6] items-center justify-center transform">
              <MyVetLogo color="white" showTagline={false} />
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-label={isMobileMenuOpen ? "סגור תפריט" : "פתח תפריט"}
            aria-expanded={isMobileMenuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 md:hidden"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
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
              className={`px-3.5 py-2 rounded-lg text-[14px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive("/digital-care") ? "bg-white/15 text-white shadow-sm" : "text-blue-100 hover:bg-white/10 hover:text-white"
              }`}
            >
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
                className="w-full pr-10 pl-8 py-2 bg-white/10 hover:bg-white/15 focus:bg-white/20 border border-white/20 rounded-xl text-[14px] text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all shadow-inner"
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
                            <span className="text-gray-500 text-[13px] font-semibold">מטופלים ולקוחות ({patientResults.length})</span>
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
                                    <span className="text-gray-500 font-medium text-[13px] truncate">{patient.species}{patient.breed ? ` · ${patient.breed}` : ""}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[13px] text-gray-500">
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
                            <span className="text-gray-500 text-[13px] font-semibold">פריטי מלאי ({inventoryResults.length})</span>
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
                                <div className="flex items-center gap-3 text-[13px] text-gray-500">
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

        <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-4">
          <button
            type="button"
            onClick={openCommandCenter}
            className="hidden xl:flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[14px] font-medium text-white/90 transition hover:bg-white/15 hover:text-white"
            title="פתח מרכז פעולות"
          >
            <Search className="w-4 h-4" />
            <span>פעולות</span>
            <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-bold text-white/80">Ctrl K</kbd>
          </button>
          <div className="hidden lg:block w-px h-6 bg-white/20 ml-2"></div>
          <div className="flex items-center gap-2 bg-[#1e3a8a] rounded-xl px-2 sm:px-3 py-1.5 border border-white/10 shadow-inner" title={`${staffName} | ${staffLabel}`}>
            <StaffIcon className="w-4 h-4 text-blue-200 shrink-0" />
            <span className="hidden text-[14px] font-medium text-white whitespace-nowrap sm:inline">
              {staffName} <span className="text-blue-300/60 font-normal mx-1">|</span> {staffLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="התנתקות"
            className="flex items-center gap-2 rounded-xl p-2 text-[14px] font-medium text-white/80 transition-all hover:bg-red-500/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:px-3 cursor-pointer"
          >
            <span className="hidden sm:inline">התנתקות</span>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="mx-auto w-full max-w-[1500px] border-t border-white/10 bg-[#1e3a8a]/95 px-4 pb-3 pt-2 shadow-lg sm:px-5 md:hidden">
          <div className="grid grid-cols-2 gap-2">
            {mobileNavItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`rounded-xl px-3 py-2.5 text-center text-[14px] font-semibold transition ${isActive(item.to) ? "bg-white text-[#1e40af]" : "bg-white/10 text-white hover:bg-white/15"}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <button type="button" onClick={openCommandCenter} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-[14px] font-semibold text-white hover:bg-white/15">
            <Search className="h-4 w-4" /> חיפוש ופעולות
          </button>
        </div>
      )}
    </nav>
  );
}
