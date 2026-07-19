import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Activity,
  Bed,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  PawPrint,
  RefreshCw,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";
import { getStaffName } from "../data/staffAuth";

type HospitalizationStatus = "active" | "discharged" | "cancelled" | string;
type Severity = "normal" | "serious" | "critical" | string;
type FilterKey = "active" | "critical" | "discharge" | "discharged" | "all";

type HospitalizationRow = {
  hospitalization_id: number;
  pet_id: number | null;
  owner_id: string | null;
  visit_id: number | null;
  department: string | null;
  cage_or_room: string | null;
  reason: string | null;
  status: HospitalizationStatus;
  severity: Severity | null;
  admitted_at: string | null;
  expected_discharge_at: string | null;
  discharged_at: string | null;
  vet_name: string | null;
  discharge_summary: string | null;
  notes: string | null;
};

type PatientRow = {
  pet_id: number;
  pet_name: string | null;
  species: string | null;
  breed: string | null;
  owner_id: string | null;
};

type OwnerRow = {
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  phone: string | null;
};

type HospitalizationVM = HospitalizationRow & {
  pet?: PatientRow;
  owner?: OwnerRow;
};

type DischargeState = {
  row: HospitalizationVM;
  summary: string;
  notes: string;
  error?: string;
};

function ownerName(owner?: OwnerRow) {
  if (!owner) return "בעלים לא משויך";
  return `${owner.owner_first_name || ""} ${owner.owner_last_name || ""}`.trim() || owner.owner_id;
}

function petName(pet?: PatientRow, petId?: number | null) {
  return pet?.pet_name || (petId ? `מטופל #${petId}` : "מטופל לא משויך");
}

function formatDateTime(value?: string | null) {
  if (!value) return "לא צוין";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "לא צוין";
  return date.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityLabel(value?: Severity | null) {
  if (value === "critical") return "קריטי";
  if (value === "serious") return "חמור";
  return "רגיל";
}

function statusLabel(value?: HospitalizationStatus | null) {
  if (value === "active") return "מאושפז";
  if (value === "discharged") return "שוחרר";
  if (value === "cancelled") return "בוטל";
  return "לא ידוע";
}

function severityClass(value?: Severity | null) {
  if (value === "critical") return "bg-red-50 text-red-700 border-red-200";
  if (value === "serious") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function matches(row: HospitalizationVM, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const values = [
    petName(row.pet, row.pet_id),
    ownerName(row.owner),
    row.owner?.phone || "",
    row.department || "",
    row.cage_or_room || "",
    row.reason || "",
    row.vet_name || "",
  ].join(" ").toLowerCase();
  return values.includes(q);
}

function normalizeFilter(value: string | null): FilterKey {
  if (value === "critical" || value === "discharge" || value === "discharged" || value === "all") return value;
  return "active";
}


export function Hospitalizations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeFilter = searchParams.get("filter");
  const [rows, setRows] = useState<HospitalizationVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>(normalizeFilter(routeFilter));
  const [discharge, setDischarge] = useState<DischargeState | null>(null);
  const [savingDischarge, setSavingDischarge] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const { data: hospitalizationRows, error } = await supabase
        .from("hospitalizations")
        .select("*")
        .order("admitted_at", { ascending: false });

      if (error) throw error;

      const hospitalizations = (hospitalizationRows || []) as HospitalizationRow[];
      const petIds = Array.from(new Set(hospitalizations.map((row) => row.pet_id).filter(Boolean).map(Number)));
      const ownerIdsFromHospitalizations = hospitalizations.map((row) => row.owner_id).filter(Boolean) as string[];

      let patients: PatientRow[] = [];
      if (petIds.length > 0) {
        const { data: patientRows, error: patientError } = await supabase
          .from("patients")
          .select("pet_id, pet_name, species, breed, owner_id")
          .in("pet_id", petIds);
        if (patientError) throw patientError;
        patients = (patientRows || []) as PatientRow[];
      }

      const patientById = new Map(patients.map((patient) => [Number(patient.pet_id), patient]));
      const ownerIds = Array.from(new Set([...ownerIdsFromHospitalizations, ...patients.map((patient) => patient.owner_id).filter(Boolean) as string[]]));

      let owners: OwnerRow[] = [];
      if (ownerIds.length > 0) {
        const { data: ownerRows, error: ownerError } = await supabase
          .from("owners")
          .select("owner_id, owner_first_name, owner_last_name, phone")
          .in("owner_id", ownerIds);
        if (ownerError) throw ownerError;
        owners = (ownerRows || []) as OwnerRow[];
      }

      const ownerById = new Map(owners.map((owner) => [String(owner.owner_id), owner]));
      setRows(hospitalizations.map((row) => {
        const pet = row.pet_id ? patientById.get(Number(row.pet_id)) : undefined;
        // The current patient-owner relationship is the source of truth. Older
        // hospitalization rows may retain the owner that existed at admission.
        const ownerId = pet?.owner_id || row.owner_id || "";
        return { ...row, pet, owner: ownerId ? ownerById.get(ownerId) : undefined };
      }));
    } catch (error) {
      console.error("Failed loading hospitalizations", error);
      toast.error("לא הצלחנו לטעון את רשימת האשפוזים");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setFilter(normalizeFilter(routeFilter));
  }, [routeFilter]);

  const metrics = useMemo(() => {
    const active = rows.filter((row) => row.status === "active");
    return {
      active: active.length,
      critical: active.filter((row) => row.severity === "critical" || row.severity === "serious").length,
      expectedDischarge: active.filter((row) => row.expected_discharge_at).length,
      discharged: rows.filter((row) => row.status === "discharged").length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((row) => {
        if (filter === "active") return row.status === "active";
        if (filter === "critical") return row.status === "active" && (row.severity === "critical" || row.severity === "serious");
        if (filter === "discharge") return row.status === "active" && Boolean(row.expected_discharge_at);
        if (filter === "discharged") return row.status === "discharged";
        return true;
      })
      .filter((row) => matches(row, query));
  }, [rows, filter, query]);

  const openPatient = (petId?: number | null) => {
    if (!petId) {
      toast.message("לא משויך תיק מטופל לאשפוז הזה");
      return;
    }
    navigate(`/patients?selected=${petId}`);
  };

  const saveDischarge = async () => {
    if (!discharge) return;
    const summary = discharge.summary.trim();
    if (!summary) {
      setDischarge({ ...discharge, error: "חובה להזין סיכום שחרור קצר" });
      return;
    }

    setSavingDischarge(true);
    try {
      const dischargedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("hospitalizations")
        .update({
          status: "discharged",
          discharged_at: dischargedAt,
          discharge_summary: summary,
          notes: discharge.notes.trim() || discharge.row.notes || null,
        })
        .eq("hospitalization_id", discharge.row.hospitalization_id);

      if (updateError) throw updateError;

      if (discharge.row.pet_id) {
        const { error: visitError } = await supabase.from("medical_visits").insert({
          pet_id: discharge.row.pet_id,
          visit_date: dischargedAt,
          vet_name: getStaffName(),
          reason: "שחרור מאשפוז",
          diagnosis: "",
          treatment: summary,
          notes: discharge.notes.trim() || null,
          visit_type: "hospitalization_discharge",
          urgency_level: "normal",
          chief_complaint: "שחרור מאשפוז",
          final_diagnosis: "",
          follow_up_required: false,
          follow_up_notes: "",
          entry_data: {
            entryType: "hospitalization_discharge",
            hospitalizationId: discharge.row.hospitalization_id,
            dischargedAt,
          },
        });

        if (visitError) {
          const { error: rollbackError } = await supabase
            .from("hospitalizations")
            .update({
              status: discharge.row.status,
              discharged_at: discharge.row.discharged_at,
              discharge_summary: discharge.row.discharge_summary,
              notes: discharge.row.notes,
            })
            .eq("hospitalization_id", discharge.row.hospitalization_id);

          if (rollbackError) {
            console.error("Failed rolling back hospitalization after medical visit failure", rollbackError);
            throw new Error("השחרור נשמר חלקית. יש לבדוק את האשפוז ואת התיק הרפואי לפני ניסיון נוסף.");
          }

          throw visitError;
        }
      }

      toast.success("האשפוז נסגר בהצלחה");
      setDischarge(null);
      await loadData();
    } catch (error) {
      console.error("Failed discharging hospitalization", error);
      toast.error(
        error instanceof Error && error.message.startsWith("השחרור נשמר חלקית")
          ? error.message
          : "לא הצלחנו לשחרר מאשפוז. לא בוצע שינוי סופי.",
      );
    } finally {
      setSavingDischarge(false);
    }
  };

  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: "active", label: "פעילים", count: metrics.active },
    { key: "discharge", label: "לשחרור", count: metrics.expectedDischarge },
    { key: "critical", label: "חמורים", count: metrics.critical },
    { key: "discharged", label: "שוחררו", count: metrics.discharged },
    { key: "all", label: "הכול", count: rows.length },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 py-7 sm:px-6 sm:py-8" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Bed className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-gray-900 text-[26px] font-bold">אשפוזים</h1>
            <p className="text-gray-500 text-[15px] mt-1">מעקב אחר מטופלים מאושפזים ושחרורים</p>
          </div>
        </div>
        <button type="button" onClick={() => void loadData()} disabled={loading} aria-busy={loading} className="h-10 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[13px] font-bold flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {loading ? "מרענן..." : "רענן"}
        </button>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-gray-100 rounded-2xl p-4"><p className="text-gray-500 text-[12px] font-bold">מאושפזים פעילים</p><p className="text-gray-900 text-[28px] font-bold mt-1">{metrics.active}</p></div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4"><p className="text-gray-500 text-[12px] font-bold">חמורים / קריטיים</p><p className="text-amber-700 text-[28px] font-bold mt-1">{metrics.critical}</p></div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4"><p className="text-gray-500 text-[12px] font-bold">עם צפי שחרור</p><p className="text-blue-700 text-[28px] font-bold mt-1">{metrics.expectedDischarge}</p></div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4"><p className="text-gray-500 text-[12px] font-bold">שוחררו</p><p className="text-emerald-700 text-[28px] font-bold mt-1">{metrics.discharged}</p></div>
      </section>

      <section className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`px-4 py-2 rounded-xl text-[13px] font-bold cursor-pointer transition-all ${filter === item.key ? "bg-emerald-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>
                {item.label} · {item.count}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי חיה, בעלים, מחלקה או סיבה" className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-300" />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-500"><Loader2 className="w-7 h-7 animate-spin mx-auto mb-3" />טוען אשפוזים...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-500"><CheckCircle2 className="w-9 h-9 mx-auto mb-3 text-emerald-400" /><p className="font-bold">אין אשפוזים להצגה</p></div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((row) => (
              <article key={row.hospitalization_id} className="p-4 hover:bg-gray-50/70 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><PawPrint className="w-5 h-5" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-gray-900 text-[16px] font-bold truncate">{petName(row.pet, row.pet_id)}</h3>
                        <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${severityClass(row.severity)}`}>{severityLabel(row.severity)}</span>
                        <span className="px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200 text-[11px] font-bold">{statusLabel(row.status)}</span>
                      </div>
                      <p className="text-gray-500 text-[13px]">{ownerName(row.owner)}{row.owner?.phone ? ` · ${row.owner.phone}` : ""}</p>
                      <p className="text-gray-700 text-[13px] mt-2 leading-6">{row.reason || "לא צוינה סיבת אשפוז"}</p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-gray-500 text-[12px] mt-2">
                        <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" />{row.department || "מחלקה לא צוינה"}{row.cage_or_room ? ` · ${row.cage_or_room}` : ""}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />פתיחה: {formatDateTime(row.admitted_at)}</span>
                        {row.expected_discharge_at && <span className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />צפי שחרור: {formatDateTime(row.expected_discharge_at)}</span>}
                        {row.vet_name && <span className="flex items-center gap-1"><Stethoscope className="w-3.5 h-3.5" />{row.vet_name}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button type="button" onClick={() => openPatient(row.pet_id)} className="h-9 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[12px] font-bold cursor-pointer">פתח תיק</button>
                    {row.status === "active" && (
                      <button type="button" onClick={() => setDischarge({ row, summary: "", notes: "" })} className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold cursor-pointer">שחרר</button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {discharge && (
        <div className="fixed inset-0 z-[90] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-gray-900 text-[18px] font-bold">שחרור מאשפוז</h2>
                <p className="text-gray-500 text-[13px] mt-1">{petName(discharge.row.pet, discharge.row.pet_id)}</p>
              </div>
              <button type="button" onClick={() => setDischarge(null)} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-gray-700 text-[14px] font-bold mb-2">סיכום שחרור *</label>
                <textarea value={discharge.summary} onChange={(e) => setDischarge({ ...discharge, summary: e.target.value, error: undefined })} rows={5} placeholder="מצב בשחרור, טיפול שבוצע והנחיות להמשך..." className={`w-full rounded-2xl border px-4 py-3 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/10 ${discharge.error ? "border-red-300" : "border-gray-200"}`} />
                {discharge.error && <p className="text-red-500 text-[12px] font-bold mt-2">{discharge.error}</p>}
              </div>
              <div>
                <label className="block text-gray-700 text-[14px] font-bold mb-2">הערות לצוות</label>
                <textarea value={discharge.notes} onChange={(e) => setDischarge({ ...discharge, notes: e.target.value })} rows={3} placeholder="אופציונלי" className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/10" />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between gap-3">
              <button type="button" onClick={() => setDischarge(null)} className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-[13px] font-bold cursor-pointer">ביטול</button>
              <button type="button" disabled={savingDischarge} onClick={() => void saveDischarge()} className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-[13px] font-bold cursor-pointer flex items-center gap-2">
                {savingDischarge && <Loader2 className="w-4 h-4 animate-spin" />} שחרר מאשפוז
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
