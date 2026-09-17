
import { Link } from "react-router";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-12 bg-[#1e40af] py-6 text-white">
      <div className="flex w-full flex-col items-center justify-between gap-4 px-4 sm:px-5 md:flex-row">
        <div className="text-center text-[13px] text-blue-100 md:text-right">
          <p>© {currentYear} MyVet — כל הזכויות שמורות</p>
          <p className="mt-1 text-[12px] text-blue-200">מערכת הדגמה במסגרת פרויקט גמר — אינה שירות רפואי פעיל</p>
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
