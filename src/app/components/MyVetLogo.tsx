import { useMemo } from "react";
import { cleanLogoSvg } from "../../assets/cleanLogo";

interface MyVetLogoProps {
  className?: string;
  color?: string;
  size?: number;
}

export function MyVetLogo({
  className = "",
  color = "currentColor",
  size,
}: MyVetLogoProps) {
  // Memoize the SVG content manipulation to avoid unnecessary recalculations
  const svgContent = useMemo(() => {
    const fillColor = color === "currentColor" ? color : (color || "#000000");
    return cleanLogoSvg.replace(
      /fill="currentColor"/g,
      `fill="${fillColor}"`
    );
  }, [color]);

  const sizeStyles = size ? { width: `${size}px`, height: `${size}px` } : {};

  return (
    <svg
      version="1.0"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
      viewBox="0 0 600 327"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={sizeStyles}
      dangerouslySetInnerHTML={{
        __html: svgContent
          .replace(/<svg[^>]*>/i, "")
          .replace(/<\/svg>/i, ""),
      }}
    />
  );
}
