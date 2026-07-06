import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";

type PaymentStatus = "unpaid" | "partial" | "paid" | "cancelled" | "refunded" | string;

type OpenPayment = {
  payment_id: number;
  owner_id: string | null;
  pet_id: number | null;
  visit_id: number | null;
  appointment_id: number | null;
  amount: number | null;
  status: PaymentStatus | null;
  payment_method: string | null;
  paid_at: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string | null;
};

interface OwnerDebtPanelProps {
  ownerId?: string;
  ownerName?: string;
}

const paymentMethodOptions = [
  { value: "cash", label: "מזומן" },
  { value: "credit", label: "אשראי" },
  { value: "bit", label: "Bit" },
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "other", label: "אחר" },
];

function money(value: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value?: string | null) {
  if (!value) return "לא צוין";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("he-IL");
}

function statusLabel(status?: PaymentStatus | null) {
  if (status === "partial") return "שולם חלקית";
  if (status === "unpaid") return "פתוח";
  return "פתוח";
}

export function OwnerDebtPanel({ ownerId, ownerName }: OwnerDebtPanelProps) {
  const [payments, setPayments] = useState<OpenPayment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [updatingPaymentId, setUpdatingPaymentId] = useState<number | "all" | null>(null);

  const totalDebt = useMemo(
    () => payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    [payments]
  );

  const loadOpenPayments = async () => {
    if (!ownerId) {
      setPayments([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("payments")
        .select("payment_id, owner_id, pet_id, visit_id, appointment_id, amount, status, payment_method, paid_at, due_date, notes, created_at")
        .eq("owner_id", ownerId)
        .in("status", ["unpaid", "partial"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPayments((data || []) as OpenPayment[]);
    } catch (error) {
      console.error("Failed loading owner debts", error);
      toast.error("לא הצלחנו לטעון חובות פתוחים");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOpenPayments();
  }, [ownerId]);

  useEffect(() => {
    const onPaymentsUpdated = () => loadOpenPayments();
    window.addEventListener("myvet:payments-updated", onPaymentsUpdated);
    return () => window.removeEventListener("myvet:payments-updated", onPaymentsUpdated);
  }, [ownerId]);

  const markPaid = async (paymentId: number) => {
    setUpdatingPaymentId(paymentId);
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          status: "paid",
          payment_method: paymentMethod,
          paid_at: new Date().toISOString(),
        })
        .eq("payment_id", paymentId);

      if (error) throw error;
      toast.success("התשלום סומן כשולם");
      window.dispatchEvent(new CustomEvent("myvet:payments-updated"));
      await loadOpenPayments();
    } catch (error) {
      console.error("Failed marking payment as paid", error);
      toast.error("לא הצלחנו לעדכן את התשלום");
    } finally {
      setUpdatingPaymentId(null);
    }
  };

  const markAllPaid = async () => {
    if (payments.length === 0) return;
    const ids = payments.map((payment) => payment.payment_id);

    setUpdatingPaymentId("all");
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          status: "paid",
          payment_method: paymentMethod,
          paid_at: new Date().toISOString(),
        })
        .in("payment_id", ids);

      if (error) throw error;
      toast.success("כל החובות סומנו כשולמו");
      window.dispatchEvent(new CustomEvent("myvet:payments-updated"));
      await loadOpenPayments();
      setIsOpen(false);
    } catch (error) {
      console.error("Failed marking all payments as paid", error);
      toast.error("לא הצלחנו לעדכן את החובות");
    } finally {
      setUpdatingPaymentId(null);
    }
  };

  if (!ownerId) {
    return null;
  }

  const hasDebt = payments.length > 0;

  return (
    <div className={`rounded-2xl border px-4 py-3 ${hasDebt ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${hasDebt ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
            {hasDebt ? <Wallet className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          </div>
          <div>
            <p className="text-gray-900 text-[14px] font-bold">
              {isLoading ? "בודק חובות פתוחים..." : hasDebt ? `חוב פתוח: ${money(totalDebt)}` : "אין חובות פתוחים"}
            </p>
            <p className="text-gray-600 text-[12px] mt-0.5">
              {hasDebt ? `${payments.length} חיובים פתוחים לבעלים` : "כל התשלומים לבעלים מעודכנים"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadOpenPayments}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl border border-white/70 bg-white/70 text-gray-700 hover:bg-white transition-colors text-[12px] font-bold disabled:opacity-60"
          >
            {isLoading ? "בודק..." : "רענן"}
          </button>
          {hasDebt && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors text-[12px] font-bold flex items-center gap-2"
            >
              <CreditCard className="w-4 h-4" /> גביית חוב
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" dir="rtl">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-gray-900 text-[20px] font-bold">גביית חוב</h3>
                <p className="text-gray-500 text-[13px] mt-1">{ownerName || "בעלים"} · {money(totalDebt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
                aria-label="סגור גבייה"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-gray-900 text-[14px] font-bold">אמצעי גבייה</p>
                  <p className="text-gray-500 text-[12px] mt-0.5">האמצעי יישמר על התשלום שסומן כשולם</p>
                </div>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] min-w-[180px]"
                >
                  {paymentMethodOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                {payments.map((payment) => (
                  <div key={payment.payment_id} className="rounded-2xl border border-gray-100 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-gray-900 text-[16px] font-bold">{money(Number(payment.amount || 0))}</p>
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-[11px] font-bold">
                          {statusLabel(payment.status)}
                        </span>
                      </div>
                      <p className="text-gray-500 text-[12px] mt-1">
                        נוצר: {formatDate(payment.created_at)} · לתשלום עד: {formatDate(payment.due_date)}
                      </p>
                      {payment.notes && <p className="text-gray-600 text-[13px] mt-1">{payment.notes}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => markPaid(payment.payment_id)}
                      disabled={Boolean(updatingPaymentId)}
                      className="px-4 py-2.5 rounded-xl bg-[#1e40af] text-white hover:bg-[#1e3a8a] disabled:bg-gray-300 transition-colors text-[13px] font-bold flex items-center justify-center gap-2"
                    >
                      {updatingPaymentId === payment.payment_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      סמן כשולם
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-gray-900 text-[15px] font-bold">סה״כ פתוח: {money(totalDebt)}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-[13px] font-bold"
                >
                  סגור
                </button>
                <button
                  type="button"
                  onClick={markAllPaid}
                  disabled={Boolean(updatingPaymentId) || payments.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300 text-[13px] font-bold flex items-center gap-2"
                >
                  {updatingPaymentId === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  סמן הכל כשולם
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
