import { Dog, Cat } from "lucide-react";

interface PetIconProps {
  species: "dog" | "cat";
  className?: string;
}

export function PetIcon({ species, className = "w-6 h-6" }: PetIconProps) {
  return species === "dog"
    ? <Dog className={className} />
    : <Cat className={className} />;
}
