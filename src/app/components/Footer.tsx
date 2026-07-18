import { Mail, Phone } from "lucide-react";
import { Link } from "react-router";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-12 bg-[#1e40af] py-6 text-white">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col items-center justify-between gap-4 px-4 sm:px-5 md:flex-row">
        <div className="text-center text-[13px] text-blue-100 md:text-right">
          <p>© {currentYear} MyVet — כל הזכויות שמורות</p>
          <p className="mt-1 text-[12px] text-blue-200">מערכת הדגמה במסגרת פרויקט גמר — אינה שירות רפואי פעיל</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          <a
            href="mailto:info@myvet.co.il"
            className="flex items-center gap-1.5 text-blue-100 hover:text-white text-[13px] transition-colors"
          >
            <Mail className="w-3.5 h-3.5" aria-hidden="true" />
            <span>info@myvet.co.il</span>
          </a>
          <span className="hidden text-white/20 sm:inline" aria-hidden="true">|</span>
          <a
            href="tel:+972-3-1234567"
            className="flex items-center gap-1.5 text-blue-100 hover:text-white text-[13px] transition-colors"
          >
            <Phone className="w-3.5 h-3.5" aria-hidden="true" />
            <span>03-123-4567</span>
          </a>
        </div>

        <nav aria-label="קישורי מידע" className="flex items-center gap-4 text-blue-100 text-[13px]">
          <Link to="/privacy" className="hover:text-white transition-colors">פרטיות</Link>
          <span className="text-white/20" aria-hidden="true">•</span>
          <Link to="/privacy#terms" className="hover:text-white transition-colors">תנאי שימוש</Link>
          <span className="text-white/20" aria-hidden="true">•</span>
          <Link to="/accessibility" className="hover:text-white transition-colors">נגישות</Link>
        </nav>
      </div>
    </footer>
  );
}
