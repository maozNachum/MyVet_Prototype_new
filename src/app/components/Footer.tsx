import { Mail, Phone } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-12 bg-[#1e40af] py-6 text-white">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-blue-100 text-[13px]">
          © {currentYear} MyVet — כל הזכויות שמורות
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          <a
            href="mailto:info@myvet.co.il"
            className="flex items-center gap-1.5 text-blue-100 hover:text-white text-[13px] transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>info@myvet.co.il</span>
          </a>
          <span className="hidden text-white/20 sm:inline">|</span>
          <a
            href="tel:+972-3-1234567"
            className="flex items-center gap-1.5 text-blue-100 hover:text-white text-[13px] transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>03-123-4567</span>
          </a>
        </div>

        <div className="flex items-center gap-4 text-blue-100 text-[13px]">
          <a href="/privacy" className="hover:text-white transition-colors">פרטיות</a>
          <span className="text-white/20">•</span>
          <a href="/privacy#terms" className="hover:text-white transition-colors">תנאי שימוש</a>
        </div>
      </div>
    </footer>
  );
}
