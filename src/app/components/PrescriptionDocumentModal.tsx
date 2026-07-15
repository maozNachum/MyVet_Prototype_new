import type { ReactNode } from "react";
import { X, Printer, FileText, Stethoscope, Phone, Mail, MapPin, UserRound, PawPrint } from "lucide-react";

interface PrescriptionDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  prescription: {
    prescription_id: number;
    visit_id: number | null;
    pet_id: number;
    medication: string | null;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    start_date: string | null;
    prescribed_by: string | null;
  } | null;
  petName: string;
  owner: {
    ownerId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
  visit?: {
    visit_id: number;
    visit_date: string | null;
    vet_name: string | null;
    chief_complaint?: string | null;
    reason?: string | null;
    final_diagnosis?: string | null;
    diagnosis?: string | null;
  } | null;
}

function formatDate(value?: string | null) {
  if (!value) return "לא צוין";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fullOwnerName(owner: PrescriptionDocumentModalProps["owner"]) {
  const name = [owner?.firstName, owner?.lastName].filter(Boolean).join(" ").trim();
  return name || "לא צוין";
}

export function PrescriptionDocumentModal({
  isOpen,
  onClose,
  prescription,
  petName,
  owner,
  visit,
}: PrescriptionDocumentModalProps) {
  if (!isOpen || !prescription) return null;

  const handlePrint = () => {
    window.print();
  };

  const ownerName = fullOwnerName(owner);
  const prescriptionDate = formatDate(prescription.start_date || visit?.visit_date || new Date().toISOString());
  const issueDate = formatDate(new Date().toISOString());
  const vetName = visit?.vet_name || prescription.prescribed_by || "צוות המרפאה";
  const diagnosis = visit?.final_diagnosis || visit?.diagnosis || "לא צוין";
  const visitReason = visit?.chief_complaint || visit?.reason || "לא צוין";

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #prescription-document-print-area,
          #prescription-document-print-area * {
            visibility: visible !important;
          }
          #prescription-document-print-area {
            position: absolute !important;
            inset-inline-start: 0 !important;
            top: 0 !important;
            width: 100% !important;
            min-height: 100vh !important;
            padding: 32px !important;
            background: white !important;
            color: #111827 !important;
            direction: rtl !important;
          }
          .prescription-no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white prescription-no-print">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-[16px]">מרשם רפואי להדפסה</h3>
                <p className="text-gray-500 text-[12px] font-medium">תצוגה מקצועית לשליחה או הדפסה לבעל החיה</p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="סגור חלון" className="p-2 hover:bg-gray-100 rounded-xl text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto bg-gray-50 p-5">
            <PrescriptionPaper
              prescription={prescription}
              petName={petName}
              ownerName={ownerName}
              owner={owner}
              visitReason={visitReason}
              diagnosis={diagnosis}
              vetName={vetName}
              prescriptionDate={prescriptionDate}
              issueDate={issueDate}
            />
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between bg-white prescription-no-print">
            <p className="text-[12px] text-gray-500 font-medium">המרשם מוצג כטיוטת מסמך. רופא/ה צריך/ה לאשר לפני מסירה ללקוח.</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-[13px] hover:bg-gray-50">
                סגור
              </button>
              <button onClick={handlePrint} className="px-4 py-2.5 rounded-xl bg-[#1e40af] text-white font-semibold text-[13px] hover:bg-blue-800 flex items-center gap-2">
                <Printer className="w-4 h-4" /> הדפס / שמור כ-PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PrescriptionPaper({
  prescription,
  petName,
  ownerName,
  owner,
  visitReason,
  diagnosis,
  vetName,
  prescriptionDate,
  issueDate,
}: {
  prescription: NonNullable<PrescriptionDocumentModalProps["prescription"]>;
  petName: string;
  ownerName: string;
  owner: PrescriptionDocumentModalProps["owner"];
  visitReason: string;
  diagnosis: string;
  vetName: string;
  prescriptionDate: string;
  issueDate: string;
}) {
  return (
    <article id="prescription-document-print-area" className="bg-white text-gray-900 rounded-2xl border border-gray-200 shadow-sm max-w-3xl mx-auto p-8" dir="rtl">
      <header className="flex items-start justify-between gap-6 border-b-2 border-blue-900 pb-5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-900 text-white flex items-center justify-center">
              <PawPrint className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-blue-950">MyVet</h1>
              <p className="text-gray-500 font-semibold text-sm">מערכת תיק רפואי וטרינרי</p>
            </div>
          </div>
          <p className="text-gray-600 text-sm leading-6">מרשם רפואי וטרינרי</p>
        </div>

        <div className="text-left text-sm text-gray-600 leading-6">
          <p><b>מס׳ מרשם:</b> RX-{prescription.prescription_id}</p>
          <p><b>תאריך הנפקה:</b> {issueDate}</p>
          <p><b>תאריך התחלה:</b> {prescriptionDate}</p>
        </div>
      </header>

      <section className="grid md:grid-cols-2 gap-4 mt-6">
        <InfoBox icon={UserRound} title="פרטי בעלים">
          <p><b>שם:</b> {ownerName}</p>
          {owner?.ownerId && <p><b>ת.ז:</b> {owner.ownerId}</p>}
          {owner?.phone && <p className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {owner.phone}</p>}
          {owner?.email && <p className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {owner.email}</p>}
          {owner?.address && <p className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {owner.address}</p>}
        </InfoBox>

        <InfoBox icon={PawPrint} title="פרטי מטופל">
          <p><b>שם החיה:</b> {petName}</p>
          <p><b>סיבת ביקור:</b> {visitReason}</p>
          <p><b>אבחנה:</b> {diagnosis}</p>
        </InfoBox>
      </section>

      <section className="mt-6 rounded-2xl border-2 border-blue-100 bg-blue-50/40 p-5">
        <h2 className="text-lg font-black text-blue-950 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5" /> פרטי המרשם
        </h2>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="text-right p-3 border-b border-gray-200">תרופה</th>
                <th className="text-right p-3 border-b border-gray-200">מינון</th>
                <th className="text-right p-3 border-b border-gray-200">תדירות</th>
                <th className="text-right p-3 border-b border-gray-200">משך טיפול</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 font-bold text-gray-900">{prescription.medication || "לא צוין"}</td>
                <td className="p-3">{prescription.dosage || "לא צוין"}</td>
                <td className="p-3">{prescription.frequency || "לא צוין"}</td>
                <td className="p-3">{prescription.duration || "לא צוין"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gray-200 p-4">
          <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2"><Stethoscope className="w-4 h-4 text-blue-800" /> רופא/ה מטפל/ת</h3>
          <p className="text-gray-700">{vetName}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 p-4 min-h-[92px]">
          <h3 className="font-bold text-gray-900 mb-2">חתימה וחותמת</h3>
          <div className="border-b border-gray-400 h-8 mt-5" />
        </div>
      </section>

      <footer className="mt-8 pt-4 border-t border-gray-200 text-[12px] text-gray-500 leading-6">
        <p>המסמך הופק ממערכת MyVet. יש למסור תרופות בהתאם להנחיית הרופא/ה המטפל/ת בלבד.</p>
        <p>במקרה של החמרה, תופעות לוואי או חוסר שיפור — יש לפנות למרפאה.</p>
      </footer>
    </article>
  );
}

function InfoBox({ icon: Icon, title, children }: { icon: any; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="font-black text-gray-900 mb-3 flex items-center gap-2">
        <Icon className="w-4 h-4 text-blue-800" /> {title}
      </h2>
      <div className="text-sm text-gray-700 leading-7 space-y-0.5">{children}</div>
    </div>
  );
}
