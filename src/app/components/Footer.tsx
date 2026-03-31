import { Mail, Phone } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#1e40af] text-white py-6 mt-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Copyright */}
        <p className="text-blue-100 text-[13px]">
          © {currentYear} MyVet - כל הזכויות שמורות
        </p>

        {/* Quick Contact */}
        <div className="flex items-center gap-6">
          <a href="mailto:info@myvet.co.il" className="flex items-center gap-1.5 text-blue-100 hover:text-white text-[13px] transition-colors">
            <Mail className="w-3.5 h-3.5" />
            <span>info@myvet.co.il</span>
          </a>
          <span className="text-white/20">|</span>
          <a href="tel:+972-3-1234567" className="flex items-center gap-1.5 text-blue-100 hover:text-white text-[13px] transition-colors">
            <Phone className="w-3.5 h-3.5" />
            <span>03-123-4567</span>
          </a>
        </div>

        {/* Links */}
        <div className="flex items-center gap-4">
          <a href="#" className="text-blue-100 hover:text-white text-[13px] transition-colors">
            פרטיות
          </a>
          <span className="text-white/20">•</span>
          <a href="#" className="text-blue-100 hover:text-white text-[13px] transition-colors">
            תנאים
          </a>
        </div>
      </div>
    </footer>
  );
}
