import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalOverlayProps {
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  zIndex?: string;
}

export function ModalOverlay({ onClose, children, maxWidth = "max-w-lg", zIndex = "z-[200]" }: ModalOverlayProps) {
  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-end justify-center bg-black/40 sm:items-center sm:px-4`}
      onClick={onClose}
    >
      <div
        className={`max-h-[94dvh] w-full ${maxWidth} overflow-y-auto rounded-t-[28px] border border-gray-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

interface ModalHeaderProps {
  title: string;
  icon: ReactNode;
  onClose: () => void;
  gradient?: string;
}

export function ModalHeader({
  title,
  icon,
  onClose,
  gradient = "bg-gradient-to-l from-[#1e40af] to-[#2563eb]",
}: ModalHeaderProps) {
  return (
    <div className={`sticky top-0 z-10 px-4 py-4 sm:px-6 flex items-center justify-between ${gradient}`}>
      <div className="flex items-center gap-3">
        {icon}
        <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>{title}</h3>
      </div>
      <button type="button" onClick={onClose} aria-label="סגור חלון" className="text-white/60 hover:text-white cursor-pointer p-1">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
