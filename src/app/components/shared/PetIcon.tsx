import { Dog, Cat, PawPrint } from "lucide-react";

interface PetIconProps {
  species: "dog" | "cat" | "other" | string;
  className?: string;
}

export function PetIcon({ species, className = "w-6 h-6" }: PetIconProps) {
  if (species === "cat") return <Cat className={className} />;
  if (species === "dog") return <Dog className={className} />;
  return <PawPrint className={className} />;
}
