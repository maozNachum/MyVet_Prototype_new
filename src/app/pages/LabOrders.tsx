import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";
import { publishLabResultToOwner } from "../../services/portalNotifications";

type FilterKey = "open" | "urgent" | "abnormal" | "completed" | "all";

type LabOrderRow = {
  lab_order_id: number;
  pet_id: number | null;
  visit_id: number | null;
  test_name: string | null;
  category: string | null;
  status: string | null;
  ordered_date: string | null;
  test_date: string | null;
  results: string | null;
  normal_range: string | null;
  result_value: string | null;
  result_status: string | null;
  completed_date: string | null;
  notes: string | null;
  is_urgent: boolean | null;
};

type PatientRow = {
  pet_id: number;
  pet_name: string | null;
  species: string | null;
  owner_id: string | null;
};

type OwnerRow = {
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  phone: string | null;
};

type LabOrderVM = LabOrderRow & {
  pet?: PatientRow;
  owner?: OwnerRow;
};

type ResultModalState = {
  row: LabOrderVM;
  resultValue: string;
  normalRange: string;
  resultStatus: string;
  results: string;
  notes: string;
  error?: string;
};

function ownerName(owner?: OwnerRow) {
  if (!owner) return "בעלים לא משויך";
  return (
    `${owner.owner_first_name || ""} ${owner.owner_last_name || ""}`.trim() ||
    owner.owner_id
  );
}

function petName(pet?: PatientRow, petId?: number | null) {
  return pet?.pet_name || (petId ? `מטופל #${petId}` : "מטופל לא משויך");
}

function formatDate(value?: string | null) {
  if (!value) return "לא צוין";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "לא צוין";
  return date.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusLabel(status?: string | null) {
  const value = String(status || "").toLowerCase();
  if (value === "completed") return "הושלמה";
  if (value === "cancelled") return "בוטלה";
  if (value === "in_progress") return "בטיפול";
  return "פתוחה";
}

function resultStatusLabel(status?: string | null) {
  if (status === "abnormal") return "חריגה";
  if (status === "normal") return "תקינה";
  if (status === "borderline") return "גבולית";
  return "לא צוין";
}

function matches(row: LabOrderVM, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const values = [
    row.test_name || "",
    row.category || "",
    petName(row.pet, row.pet_id),
    ownerName(row.owner),
    row.owner?.phone || "",
    row.results || "",
    row.notes || "",
  ]
    .join(" ")
    .toLowerCase();
  return values.includes(q);
}

function isCompleted(row: LabOrderRow) {
  return String(row.status || "").toLowerCase() === "completed";
}

function normalizeFilter(value: string | null): FilterKey {
  if (
    value === "urgent" ||
    value === "abnormal" ||
    value === "completed" ||
    value === "all"
  )
    return value;
  return "open";
}

export function LabOrders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialFilter = normalizeFilter(searchParams.get("filter"));
  const [rows, setRows] = useState<LabOrderVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const [resultModal, setResultModal] = useState<ResultModalState | null>(null);
  const [savingResult, setSavingResult] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const { data: labRows, error } = await supabase
        .from("lab_orders")
        .select(
          "lab_order_id, pet_id, visit_id, test_name, category, status, ordered_date, test_date, results, normal_range, result_value, result_status, completed_date, notes, is_urgent",
        )
        .order("ordered_date", { ascending: false });

      if (error) throw error;

      const labs = (labRows || []) as LabOrderRow[];
      const petIds = Array.from(
        new Set(
          labs
            .map((row) => row.pet_id)
            .filter(Boolean)
            .map(Number),
        ),
      );
      let patients: PatientRow[] = [];
      if (petIds.length > 0) {
        const { data: patientRows, error: patientError } = await supabase
          .from("patients")
          .select("pet_id, pet_name, species, owner_id")
          .in("pet_id", petIds);
        if (patientError) throw patientError;
        patients = (patientRows || []) as PatientRow[];
      }

      const patientById = new Map(
        patients.map((patient) => [Number(patient.pet_id), patient]),
      );
      const ownerIds = Array.from(
        new Set(
          patients
            .map((patient) => patient.owner_id)
            .filter(Boolean) as string[],
        ),
      );
      let owners: OwnerRow[] = [];
      if (ownerIds.length > 0) {
        const { data: ownerRows, error: ownerError } = await supabase
          .from("owners")
          .select("owner_id, owner_first_name, owner_last_name, phone")
          .in("owner_id", ownerIds);
        if (ownerError) throw ownerError;
        owners = (ownerRows || []) as OwnerRow[];
      }
      const ownerById = new Map(
        owners.map((owner) => [String(owner.owner_id), owner]),
      );

      setRows(
        labs.map((row) => {
          const pet = row.pet_id
            ? patientById.get(Number(row.pet_id))
            : undefined;
          return {
            ...row,
            pet,
            owner: pet?.owner_id ? ownerById.get(pet.owner_id) : undefined,
          };
        }),
      );
    } catch (error) {
      console.error("Failed loading lab orders", error);
      toast.error("לא הצלחנו לטעון בדיקות מעבדה");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setFilter(normalizeFilter(searchParams.get("filter")));
  }, [searchParams]);

  const metrics = useMemo(() => {
    const open = rows.filter((row) => !isCompleted(row));
    return {
      open: open.length,
      urgent: open.filter((row) => row.is_urgent).length,
      completed: rows.filter((row) => isCompleted(row)).length,
      abnormal: rows.filter((row) => row.result_status === "abnormal").length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((row) => {
        if (filter === "open") return !isCompleted(row);
        if (filter === "urgent")
          return !isCompleted(row) && Boolean(row.is_urgent);
        if (filter === "abnormal") return row.result_status === "abnormal";
        if (filter === "completed") return isCompleted(row);
        return true;
      })
      .filter((row) => matches(row, query));
  }, [rows, filter, query]);

  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: "open", label: "פתוחות", count: metrics.open },
    { key: "urgent", label: "דחופות", count: metrics.urgent },
    { key: "abnormal", label: "חריגות", count: metrics.abnormal },
    { key: "completed", label: "הושלמו", count: metrics.completed },
    { key: "all", label: "הכול", count: rows.length },
  ];

  const openPatient = (petId?: number | null) => {
    if (!petId) {
      toast.message("לא משויך תיק מטופל לבדיקה הזו");
      return;
    }
    navigate(`/patients?selected=${petId}`);
  };

  const openResultModal = (row: LabOrderVM) => {
    setResultModal({
      row,
      resultValue: row.result_value || "",
      normalRange: row.normal_range || "",
      resultStatus: row.result_status || "normal",
      results: row.results || "",
      notes: row.notes || "",
    });
  };

  const saveResult = async () => {
    if (!resultModal) return;
    if (!resultModal.results.trim() && !resultModal.resultValue.trim()) {
      setResultModal({
        ...resultModal,
        error: "חובה להזין תוצאה או סיכום תוצאה",
      });
      return;
    }

    setSavingResult(true);
    try {
      const { error } = await supabase
        .from("lab_orders")
        .update({
          result_value: resultModal.resultValue.trim() || null,
          normal_range: resultModal.normalRange.trim() || null,
          result_status: resultModal.resultStatus || null,
          results: resultModal.results.trim() || null,
          notes: resultModal.notes.trim() || null,
          status: "completed",
          completed_date: new Date().toISOString(),
        })
        .eq("lab_order_id", resultModal.row.lab_order_id);

      if (error) throw error;

      if (resultModal.row.owner?.owner_id) {
        const resultText = [
          resultModal.resultValue.trim(),
          resultModal.results.trim(),
        ]
          .filter(Boolean)
          .join(" · ");
        await publishLabResultToOwner({
          ownerId: resultModal.row.owner.owner_id,
          petId: resultModal.row.pet_id,
          labOrderId: resultModal.row.lab_order_id,
          petName: petName(resultModal.row.pet, resultModal.row.pet_id),
          testName: resultModal.row.test_name,
          resultText,
        });
      }

      toast.success("תוצאת המעבדה נשמרה ונשלחה לפורטל");
      setResultModal(null);
      await loadData();
    } catch (error) {
      console.error("Failed saving lab result", error);
      toast.error("לא הצלחנו לשמור את תוצאת המעבדה");
    } finally {
      setSavingResult(false);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 py-7 sm:px-6 sm:py-8" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <FlaskConical className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-gray-900 text-[26px] font-bold">מעבדה</h1>
            <p className="text-gray-500 text-[15px] mt-1">
              בדיקות פתוחות, דחופות ותוצאות שהושלמו
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          aria-busy={loading}
          className="h-10 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[13px] font-bold flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {loading ? "מרענן..." : "רענן"}
        </button>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-gray-500 text-[12px] font-bold">בדיקות פתוחות</p>
          <p className="text-gray-900 text-[28px] font-bold mt-1">
            {metrics.open}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-gray-500 text-[12px] font-bold">דחופות</p>
          <p className="text-red-700 text-[28px] font-bold mt-1">
            {metrics.urgent}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-gray-500 text-[12px] font-bold">הושלמו</p>
          <p className="text-emerald-700 text-[28px] font-bold mt-1">
            {metrics.completed}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-gray-500 text-[12px] font-bold">תוצאות חריגות</p>
          <p className="text-amber-700 text-[28px] font-bold mt-1">
            {metrics.abnormal}
          </p>
        </div>
      </section>

      <section className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`px-4 py-2 rounded-xl text-[13px] font-bold cursor-pointer transition-all ${filter === item.key ? "bg-amber-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
              >
                {item.label} · {item.count}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי בדיקה, חיה או בעלים"
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-300"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-500">
            <Loader2 className="w-7 h-7 animate-spin mx-auto mb-3" />
            טוען בדיקות...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <CheckCircle2 className="w-9 h-9 mx-auto mb-3 text-emerald-400" />
            <p className="font-bold">אין בדיקות להצגה</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((row) => (
              <article
                key={row.lab_order_id}
                className="p-4 hover:bg-gray-50/70 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${row.is_urgent ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}
                    >
                      {row.is_urgent ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        <FlaskConical className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-gray-900 text-[16px] font-bold truncate">
                          {row.test_name || "בדיקת מעבדה"}
                        </h3>
                        {row.is_urgent && (
                          <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">
                            דחופה
                          </span>
                        )}
                        <span className="px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200 text-[11px] font-bold">
                          {statusLabel(row.status)}
                        </span>
                        {row.result_status && (
                          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold">
                            {resultStatusLabel(row.result_status)}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-[13px]">
                        {petName(row.pet, row.pet_id)} · {ownerName(row.owner)}
                      </p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-gray-500 text-[12px] mt-2">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          הוזמנה: {formatDate(row.ordered_date)}
                        </span>
                        <span>תאריך בדיקה: {formatDate(row.test_date)}</span>
                        {row.category && <span>{row.category}</span>}
                      </div>
                      {(row.result_value || row.results) && (
                        <p className="text-gray-700 text-[13px] mt-2 leading-6 line-clamp-2">
                          {row.result_value ? `${row.result_value} · ` : ""}
                          {row.results}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openPatient(row.pet_id)}
                      className="h-9 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[12px] font-bold cursor-pointer"
                    >
                      פתח תיק
                    </button>
                    {!isCompleted(row) && (
                      <button
                        type="button"
                        onClick={() => openResultModal(row)}
                        className="h-9 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-bold cursor-pointer"
                      >
                        עדכן תוצאה
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {resultModal && (
        <div className="fixed inset-0 z-[90] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-gray-900 text-[18px] font-bold">
                  עדכון תוצאת מעבדה
                </h2>
                <p className="text-gray-500 text-[13px] mt-1">
                  {resultModal.row.test_name || "בדיקת מעבדה"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResultModal(null)}
                className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 text-[14px] font-bold mb-2">
                    ערך תוצאה
                  </label>
                  <input
                    value={resultModal.resultValue}
                    onChange={(e) =>
                      setResultModal({
                        ...resultModal,
                        resultValue: e.target.value,
                        error: undefined,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-amber-500/10"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 text-[14px] font-bold mb-2">
                    טווח תקין
                  </label>
                  <input
                    value={resultModal.normalRange}
                    onChange={(e) =>
                      setResultModal({
                        ...resultModal,
                        normalRange: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-amber-500/10"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-700 text-[14px] font-bold mb-2">
                    סטטוס תוצאה
                  </label>
                  <select
                    value={resultModal.resultStatus}
                    onChange={(e) =>
                      setResultModal({
                        ...resultModal,
                        resultStatus: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/10"
                  >
                    <option value="normal">תקינה</option>
                    <option value="borderline">גבולית</option>
                    <option value="abnormal">חריגה</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-gray-700 text-[14px] font-bold mb-2">
                  סיכום תוצאה *
                </label>
                <textarea
                  value={resultModal.results}
                  onChange={(e) =>
                    setResultModal({
                      ...resultModal,
                      results: e.target.value,
                      error: undefined,
                    })
                  }
                  rows={4}
                  placeholder="סיכום קצר של תוצאת המעבדה..."
                  className={`w-full rounded-2xl border px-4 py-3 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/10 ${resultModal.error ? "border-red-300" : "border-gray-200"}`}
                />
                {resultModal.error && (
                  <p className="text-red-500 text-[12px] font-bold mt-2">
                    {resultModal.error}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-gray-700 text-[14px] font-bold mb-2">
                  הערות
                </label>
                <textarea
                  value={resultModal.notes}
                  onChange={(e) =>
                    setResultModal({ ...resultModal, notes: e.target.value })
                  }
                  rows={3}
                  placeholder="אופציונלי"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/10"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between gap-3">
              <button
                type="button"
                onClick={() => setResultModal(null)}
                className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-[13px] font-bold cursor-pointer"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={savingResult}
                onClick={() => void saveResult()}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-[13px] font-bold cursor-pointer flex items-center gap-2"
              >
                {savingResult ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}{" "}
                שמור תוצאה
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
