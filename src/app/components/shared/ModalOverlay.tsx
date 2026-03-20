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
      className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-black/40 px-4`}
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl border border-gray-200 w-full ${maxWidth} overflow-hidden`}
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
    <div className={`px-6 py-4 flex items-center justify-between ${gradient}`}>
      <div className="flex items-center gap-3">
        {icon}
        <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>{title}</h3>
      </div>
      <button onClick={onClose} className="text-white/60 hover:text-white cursor-pointer p-1">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}