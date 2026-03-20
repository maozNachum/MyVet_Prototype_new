import { useState } from "react";
import {
  CreditCard,
  Banknote,
  X,
  Printer,
  Send,
  Mail,
  Smartphone,
  Check,
  ArrowRight,
  Edit3,
  Loader2,
  Receipt,
  CircleDollarSign,
  Coins,
} from "lucide-react";

// ── Pricing map ──
const VISIT_PRICES: Record<string, number> = {
  checkup: 250,
  vaccination: 180,
  surgery: 1200,
  emergency: 450,
  dental: 650,
};

const TREATMENT_PRICE = 120; // per treatment item
const PRESCRIPTION_PRICE = 45; // per prescription
const LAB_PRICE = 85; // per lab test

export interface PaymentSummary {
  visitType: string;
  visitTypeLabel: string;
  treatmentCount: number;
  prescriptionCount: number;
  labCount: number;
  petName: string;
  ownerName: string;
  vet: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: PaymentSummary;
}

type PaymentStep = "method" | "credit" | "cash" | "receipt";

interface ReceiptData {
  method: "credit" | "cash";
  total: number;
  amountPaid?: number;
  change?: number;
  last4?: string;
}

export function PaymentModal({ isOpen, onClose, summary }: PaymentModalProps) {
  const [step, setStep] = useState<PaymentStep>("method");
  const [editingTotal, setEditingTotal] = useState(false);

  // Calculate base total
  const baseVisit = VISIT_PRICES[summary.visitType] || 250;
  const treatmentsCost = summary.treatmentCount * TREATMENT_PRICE;
  const prescriptionsCost = summary.prescriptionCount * PRESCRIPTION_PRICE;
  const labsCost = summary.labCount * LAB_PRICE;
  const calculatedTotal = baseVisit + treatmentsCost + prescriptionsCost + labsCost;

  const [total, setTotal] = useState(calculatedTotal);
  const [manualTotalInput, setManualTotalInput] = useState(String(calculatedTotal));

  // Cash state
  const [amountPaid, setAmountPaid] = useState("");
  const paidNum = parseFloat(amountPaid) || 0;
  const change = Math.max(0, paidNum - total);

  // Credit state
  const [creditProcessing, setCreditProcessing] = useState(false);

  // Receipt state
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [sentTo, setSentTo] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleEditTotal = () => {
    setEditingTotal(true);
    setManualTotalInput(String(total));
  };

  const handleSaveTotal = () => {
    const val = parseFloat(manualTotalInput);
    if (!isNaN(val) && val >= 0) setTotal(val);
    setEditingTotal(false);
  };

  const handleCreditPay = () => {
    setCreditProcessing(true);
    // Simulate credit card processing
    setTimeout(() => {
      setCreditProcessing(false);
      setReceiptData({
        method: "credit",
        total,
        last4: "4582",
      });
      setStep("receipt");
    }, 2500);
  };

  const handleCashConfirm = () => {
    if (paidNum < total) return;
    setReceiptData({
      method: "cash",
      total,
      amountPaid: paidNum,
      change,
    });
    setStep("receipt");
  };

  const handleSendReceipt = (channel: string) => {
    if (!sentTo.includes(channel)) {
      setSentTo((prev) => [...prev, channel]);
    }
  };

  const handleFullClose = () => {
    // Reset everything
    setStep("method");
    setEditingTotal(false);
    setTotal(calculatedTotal);
    setAmountPaid("");
    setCreditProcessing(false);
    setReceiptData(null);
    setSentTo([]);
    onClose();
  };

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 px-4"
      onClick={handleFullClose}
      dir="rtl"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ═══ STEP: Method Selection ═══ */}
        {step === "method" && (
          <>
            <div className="bg-gradient-to-l from-emerald-600 to-emerald-500 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/15 rounded-xl p-2">
                  <CircleDollarSign className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>
                    מעבר לתשלום
                  </h3>
                  <p className="text-white/60 text-[12px]">{summary.petName} · {summary.ownerName}</p>
                </div>
              </div>
              <button onClick={handleFullClose} className="text-white/60 hover:text-white cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Price Breakdown */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-500">{summary.visitTypeLabel || "ביקור"}</span>
                  <span className="text-gray-700" style={{ fontWeight: 500 }}>₪{baseVisit}</span>
                </div>
                {summary.treatmentCount > 0 && (
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-gray-500">טיפולים ({summary.treatmentCount})</span>
                    <span className="text-gray-700" style={{ fontWeight: 500 }}>₪{treatmentsCost}</span>
                  </div>
                )}
                {summary.prescriptionCount > 0 && (
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-gray-500">מרשמים ({summary.prescriptionCount})</span>
                    <span className="text-gray-700" style={{ fontWeight: 500 }}>₪{prescriptionsCost}</span>
                  </div>
                )}
                {summary.labCount > 0 && (
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-gray-500">בדיקות מעבדה ({summary.labCount})</span>
                    <span className="text-gray-700" style={{ fontWeight: 500 }}>₪{labsCost}</span>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-2.5 mt-2.5 flex items-center justify-between">
                  <span className="text-gray-900 text-[15px]" style={{ fontWeight: 700 }}>סה״כ לתשלום</span>
                  {editingTotal ? (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-[14px]">₪</span>
                      <input
                        type="number"
                        value={manualTotalInput}
                        onChange={(e) => setManualTotalInput(e.target.value)}
                        className="w-24 px-2 py-1 border border-emerald-300 rounded-lg text-[15px] text-left focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        style={{ fontWeight: 700 }}
                        dir="ltr"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveTotal}
                        className="text-emerald-600 hover:text-emerald-700 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 text-[20px]" style={{ fontWeight: 700 }}>
                        ₪{total.toLocaleString()}
                      </span>
                      <button
                        onClick={handleEditTotal}
                        className="text-gray-400 hover:text-gray-600 cursor-pointer"
                        title="עריכת סכום ידנית"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Methods */}
              <p className="text-gray-500 text-[13px] text-center" style={{ fontWeight: 500 }}>
                בחרו אמצעי תשלום
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setStep("credit");
                    handleCreditPay();
                  }}
                  className="flex flex-col items-center gap-3 p-5 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-2xl transition-all cursor-pointer group"
                >
                  <div className="w-14 h-14 rounded-xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                    <CreditCard className="w-7 h-7 text-blue-600" />
                  </div>
                  <span className="text-gray-800 text-[15px]" style={{ fontWeight: 600 }}>
                    אשראי
                  </span>
                  <span className="text-gray-400 text-[11px]">סולק אשראי</span>
                </button>

                <button
                  onClick={() => setStep("cash")}
                  className="flex flex-col items-center gap-3 p-5 border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50 rounded-2xl transition-all cursor-pointer group"
                >
                  <div className="w-14 h-14 rounded-xl bg-emerald-50 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
                    <Banknote className="w-7 h-7 text-emerald-600" />
                  </div>
                  <span className="text-gray-800 text-[15px]" style={{ fontWeight: 600 }}>
                    מזומן
                  </span>
                  <span className="text-gray-400 text-[11px]">תשלום במזומן</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ═══ STEP: Credit Card Processing ═══ */}
        {step === "credit" && (
          <>
            <div className="bg-gradient-to-l from-blue-600 to-blue-500 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/15 rounded-xl p-2">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>
                    סולק אשראי
                  </h3>
                  <p className="text-white/60 text-[12px]">מעבד תשלום...</p>
                </div>
              </div>
              <button onClick={handleFullClose} className="text-white/60 hover:text-white cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 flex flex-col items-center justify-center py-16">
              {creditProcessing ? (
                <>
                  <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-5">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  </div>
                  <h3 className="text-gray-900 text-[18px] mb-2" style={{ fontWeight: 700 }}>
                    מתחבר לסולק אשראי...
                  </h3>
                  <p className="text-gray-400 text-[14px] mb-4">
                    סכום: ₪{total.toLocaleString()}
                  </p>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-center">
                    <p className="text-blue-700 text-[13px]" style={{ fontWeight: 500 }}>
                      העבירו את הכרטיס במסוף
                    </p>
                    <p className="text-blue-500 text-[11px] mt-1">
                      ממתין לאישור עסקה...
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
                    <Check className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h3 className="text-gray-900 text-[18px] mb-2" style={{ fontWeight: 700 }}>
                    העסקה אושרה!
                  </h3>
                  <p className="text-gray-400 text-[14px]">
                    התשלום בוצע בהצלחה
                  </p>
                </>
              )}
            </div>
          </>
        )}

        {/* ═══ STEP: Cash Payment ═══ */}
        {step === "cash" && (
          <>
            <div className="bg-gradient-to-l from-emerald-600 to-emerald-500 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep("method")}
                  className="text-white/60 hover:text-white cursor-pointer p-1"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
                <div className="bg-white/15 rounded-xl p-2">
                  <Banknote className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>
                    תשלום במזומן
                  </h3>
                  <p className="text-white/60 text-[12px]">הכנס סכום ששולם</p>
                </div>
              </div>
              <button onClick={handleFullClose} className="text-white/60 hover:text-white cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Total to pay */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <p className="text-emerald-600 text-[12px] mb-1" style={{ fontWeight: 500 }}>
                  סה״כ לתשלום
                </p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-emerald-700 text-[28px]" style={{ fontWeight: 700 }}>
                    ₪{total.toLocaleString()}
                  </p>
                  <button
                    onClick={handleEditTotal}
                    className="text-emerald-400 hover:text-emerald-600 cursor-pointer"
                    title="עריכת סכום"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {editingTotal && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className="text-emerald-600 text-[13px]">₪</span>
                    <input
                      type="number"
                      value={manualTotalInput}
                      onChange={(e) => setManualTotalInput(e.target.value)}
                      className="w-28 px-2 py-1 border border-emerald-300 rounded-lg text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      style={{ fontWeight: 700 }}
                      dir="ltr"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveTotal}
                      className="bg-emerald-500 text-white px-3 py-1 rounded-lg text-[12px] cursor-pointer hover:bg-emerald-600"
                      style={{ fontWeight: 500 }}
                    >
                      עדכן
                    </button>
                  </div>
                )}
              </div>

              {/* Amount Paid Input */}
              <div>
                <label className="flex items-center gap-2 text-gray-700 text-[13px] mb-2" style={{ fontWeight: 500 }}>
                  <Coins className="w-4 h-4 text-amber-500" />
                  סכום שהתקבל מהלקוח
                </label>
                <div className="relative">
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-[16px]" style={{ fontWeight: 600 }}>₪</span>
                  <input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="w-full pr-10 pl-4 py-4 border-2 border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all text-[22px] text-center"
                    style={{ fontWeight: 700 }}
                    dir="ltr"
                    placeholder="0"
                    autoFocus
                  />
                </div>

                {/* Quick amount buttons */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {[total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 200) * 200]
                    .filter((v, i, a) => v >= total && a.indexOf(v) === i)
                    .slice(0, 4)
                    .map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setAmountPaid(String(amt))}
                        className={`px-3.5 py-1.5 rounded-lg border text-[13px] transition-all cursor-pointer ${
                          paidNum === amt
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                        style={{ fontWeight: 500 }}
                      >
                        ₪{amt}
                      </button>
                    ))}
                </div>
              </div>

              {/* Change Display */}
              {paidNum > 0 && (
                <div className={`rounded-xl p-4 text-center border-2 transition-all ${
                  paidNum >= total
                    ? "bg-amber-50 border-amber-200"
                    : "bg-red-50 border-red-200"
                }`}>
                  {paidNum >= total ? (
                    <>
                      <p className="text-amber-600 text-[12px] mb-1" style={{ fontWeight: 500 }}>
                        עודף להחזרה
                      </p>
                      <p className="text-amber-700 text-[28px]" style={{ fontWeight: 700 }}>
                        ₪{change.toLocaleString()}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-red-600 text-[12px] mb-1" style={{ fontWeight: 500 }}>
                        חסר
                      </p>
                      <p className="text-red-600 text-[22px]" style={{ fontWeight: 700 }}>
                        ₪{(total - paidNum).toLocaleString()}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Confirm Button */}
              <button
                onClick={handleCashConfirm}
                disabled={paidNum < total}
                className={`w-full py-3.5 rounded-xl transition-all cursor-pointer text-[15px] flex items-center justify-center gap-2 shadow-sm ${
                  paidNum >= total
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
                style={{ fontWeight: 600 }}
              >
                <Check className="w-4.5 h-4.5" />
                אשר תשלום
              </button>
            </div>
          </>
        )}

        {/* ═══ STEP: Receipt ═══ */}
        {step === "receipt" && receiptData && (
          <>
            <div className="bg-gradient-to-l from-emerald-600 to-emerald-500 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/15 rounded-xl p-2">
                  <Receipt className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>
                    קבלה
                  </h3>
                  <p className="text-white/60 text-[12px]">התשלום בוצע בהצלחה</p>
                </div>
              </div>
              <button onClick={handleFullClose} className="text-white/60 hover:text-white cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Success */}
              <div className="text-center pb-2">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>
                  התשלום התקבל!
                </h3>
              </div>

              {/* Receipt details */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2.5 border border-gray-100">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200 mb-2">
                  <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>קבלה #{Math.floor(10000 + Math.random() * 90000)}</span>
                  <span className="text-gray-400 text-[12px]">{dateStr} · {timeStr}</span>
                </div>

                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-500">מטופל</span>
                  <span className="text-gray-700" style={{ fontWeight: 500 }}>{summary.petName}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-500">בעלים</span>
                  <span className="text-gray-700" style={{ fontWeight: 500 }}>{summary.ownerName}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-500">רופא</span>
                  <span className="text-gray-700" style={{ fontWeight: 500 }}>{summary.vet}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-500">אמצעי תשלום</span>
                  <span className="text-gray-700" style={{ fontWeight: 500 }}>
                    {receiptData.method === "credit"
                      ? `אשראי •••• ${receiptData.last4}`
                      : "מזומן"}
                  </span>
                </div>

                <div className="border-t border-gray-200 pt-2.5 mt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-900 text-[15px]" style={{ fontWeight: 700 }}>סה״כ שולם</span>
                    <span className="text-emerald-600 text-[18px]" style={{ fontWeight: 700 }}>
                      ₪{receiptData.total.toLocaleString()}
                    </span>
                  </div>
                  {receiptData.method === "cash" && receiptData.change != null && receiptData.change > 0 && (
                    <div className="flex items-center justify-between text-[13px] mt-1">
                      <span className="text-gray-500">עודף שהוחזר</span>
                      <span className="text-amber-600" style={{ fontWeight: 600 }}>₪{receiptData.change.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Send/Print Options */}
              <div className="space-y-2.5">
                <p className="text-gray-500 text-[13px] text-center" style={{ fontWeight: 500 }}>
                  שליחת קבלה ללקוח
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => handleSendReceipt("print")}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all cursor-pointer text-[13px] ${
                      sentTo.includes("print")
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    style={{ fontWeight: 500 }}
                  >
                    {sentTo.includes("print") ? <Check className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
                    הדפס קבלה
                  </button>

                  <button
                    onClick={() => handleSendReceipt("sms")}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all cursor-pointer text-[13px] ${
                      sentTo.includes("sms")
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    style={{ fontWeight: 500 }}
                  >
                    {sentTo.includes("sms") ? <Check className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                    שלח SMS
                  </button>

                  <button
                    onClick={() => handleSendReceipt("email")}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all cursor-pointer text-[13px] ${
                      sentTo.includes("email")
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    style={{ fontWeight: 500 }}
                  >
                    {sentTo.includes("email") ? <Check className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                    שלח למייל
                  </button>

                  <button
                    onClick={() => handleSendReceipt("whatsapp")}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all cursor-pointer text-[13px] ${
                      sentTo.includes("whatsapp")
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    style={{ fontWeight: 500 }}
                  >
                    {sentTo.includes("whatsapp") ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    WhatsApp
                  </button>
                </div>
              </div>

              {/* Done Button */}
              <button
                onClick={handleFullClose}
                className="w-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white py-3.5 rounded-xl transition-colors cursor-pointer text-[15px] shadow-sm flex items-center justify-center gap-2"
                style={{ fontWeight: 600 }}
              >
                <Check className="w-4.5 h-4.5" />
                סיום
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
