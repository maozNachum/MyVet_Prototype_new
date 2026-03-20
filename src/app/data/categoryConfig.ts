/**
 * Single source of truth for every colour / icon / label mapping used
 * across visit types, inventory categories and lab categories.
 *
 * Import the relevant constant instead of duplicating switch-statements or
 * inline config arrays in individual components.
 */

import {
  Stethoscope,
  Syringe,
  Scissors,
  ShieldAlert,
  Sparkles,
  Eye,
  Pill,
  Package,
  Droplets,
  FlaskConical,
  ScanLine,
  Microscope,
  TestTube,
} from "lucide-react";

// ─── Visit / Appointment Types ────────────────────────────────────────────────

export const VISIT_TYPES = {
  checkup: {
    icon: Stethoscope,
    label: "בדיקה כללית",
    color: "bg-amber-50 text-amber-600 border-amber-200",
    activeColor:
      "bg-amber-100 border-amber-400 shadow-amber-500/10 ring-2 ring-amber-300",
  },
  vaccination: {
    icon: Syringe,
    label: "חיסון",
    color: "bg-blue-50 text-blue-600 border-blue-200",
    activeColor:
      "bg-blue-100 border-blue-400 shadow-blue-500/10 ring-2 ring-blue-300",
  },
  surgery: {
    icon: Scissors,
    label: "ניתוח",
    color: "bg-purple-50 text-purple-600 border-purple-200",
    activeColor:
      "bg-purple-100 border-purple-400 shadow-purple-500/10 ring-2 ring-purple-300",
  },
  emergency: {
    icon: ShieldAlert,
    label: "חירום",
    color: "bg-red-50 text-red-600 border-red-200",
    activeColor:
      "bg-red-100 border-red-400 shadow-red-500/10 ring-2 ring-red-300",
  },
  dental: {
    icon: Sparkles,
    label: "טיפול שיניים",
    color: "bg-green-50 text-green-600 border-green-200",
    activeColor:
      "bg-green-100 border-green-400 shadow-green-500/10 ring-2 ring-green-300",
  },
  eye: {
    icon: Eye,
    label: "בדיקת עיניים",
    color: "bg-sky-50 text-sky-600 border-sky-200",
    activeColor:
      "bg-sky-100 border-sky-400 shadow-sky-500/10 ring-2 ring-sky-300",
  },
  medication: {
    icon: Pill,
    label: "מעקב תרופתי",
    color: "bg-teal-50 text-teal-600 border-teal-200",
    activeColor:
      "bg-teal-100 border-teal-400 shadow-teal-500/10 ring-2 ring-teal-300",
  },
} as const;

export type VisitTypeKey = keyof typeof VISIT_TYPES;

/** Ordered list used by the TreatmentModal wizard step. */
export const CLINIC_VISIT_TYPE_KEYS: VisitTypeKey[] = [
  "checkup",
  "vaccination",
  "surgery",
  "emergency",
  "dental",
];

/** Ordered list used by the owner booking flow. */
export const BOOKING_VISIT_TYPE_KEYS: VisitTypeKey[] = [
  "vaccination",
  "checkup",
  "surgery",
  "dental",
  "eye",
  "medication",
];

// ─── Inventory Categories ─────────────────────────────────────────────────────

export const INVENTORY_CATEGORIES = {
  medication: {
    icon: Pill,
    label: "תרופות",
    color: "bg-violet-50 text-violet-700 border-violet-200",
    iconColor: "text-violet-500",
  },
  equipment: {
    icon: Stethoscope,
    label: "ציוד רפואי",
    color: "bg-sky-50 text-sky-700 border-sky-200",
    iconColor: "text-sky-500",
  },
  consumable: {
    icon: Syringe,
    label: "ציוד מתכלה",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    iconColor: "text-amber-500",
  },
} as const;

export type InventoryCategoryKey = keyof typeof INVENTORY_CATEGORIES;

/** Fallback config for unknown inventory categories. */
export const INVENTORY_CATEGORY_FALLBACK = {
  icon: Package,
  label: "אחר",
  color: "bg-gray-50 text-gray-700 border-gray-200",
  iconColor: "text-gray-500",
};

// ─── Lab Categories ───────────────────────────────────────────────────────────

export const LAB_CATEGORIES = {
  blood: {
    icon: Droplets,
    label: "בדיקת דם",
    color: "bg-red-50 text-red-500 border-red-200",
  },
  urine: {
    icon: FlaskConical,
    label: "בדיקת שתן",
    color: "bg-amber-50 text-amber-500 border-amber-200",
  },
  imaging: {
    icon: ScanLine,
    label: "הדמיה",
    color: "bg-blue-50 text-blue-500 border-blue-200",
  },
  biopsy: {
    icon: Microscope,
    label: "ביופסיה",
    color: "bg-purple-50 text-purple-500 border-purple-200",
  },
  other: {
    icon: TestTube,
    label: "אחר",
    color: "bg-gray-50 text-gray-500 border-gray-200",
  },
} as const;

export type LabCategoryKey = keyof typeof LAB_CATEGORIES;
