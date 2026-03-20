interface MyVetLogoProps {
  className?: string;
  color?: string;
  secondaryColor?: string;
  size?: number;
}

export function MyVetLogo({
  className = "",
  color = "currentColor",
  secondaryColor,
  size = 32,
}: MyVetLogoProps) {
  const sc = secondaryColor || color;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer arc — subtle tech/connect feel */}
      <path
        d="M 52 20 A 26 26 0 1 1 16 12"
        stroke={sc}
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.35"
      />

      {/* Dog silhouette — right side, larger, behind */}
      <path
        d={[
          "M 38 44",          // chin
          "Q 44 40, 44 34",   // jaw up
          "Q 44 28, 40 24",   // cheek to forehead
          "Q 38 21, 38 17",   // forehead up
          "Q 38 12, 42 9",    // ear up (floppy top)
          "Q 44 7, 44 11",    // ear tip folds
          "Q 44 14, 41 17",   // ear back down
          "Q 39 20, 38 22",   // connect to head
        ].join(" ")}
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dog snout */}
      <path
        d="M 38 44 Q 36 46, 33 45 Q 31 44, 32 41"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dog eye */}
      <circle cx="38" cy="27" r="1.5" fill={color} />

      {/* Cat silhouette — left side, in front, smaller */}
      <path
        d={[
          "M 28 48",          // chin
          "Q 22 45, 20 39",   // jaw
          "Q 18 33, 20 28",   // cheek
          "Q 21 24, 22 20",   // forehead
          "Q 22 14, 18 8",    // ear up (pointed!)
          "Q 17 6, 19 10",    // ear tip
        ].join(" ")}
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cat second ear */}
      <path
        d="M 22 20 Q 24 14, 27 9 Q 28 7, 26 11 Q 25 15, 25 20"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cat snout */}
      <path
        d="M 28 48 Q 30 49, 32 48 Q 34 47, 33 45"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cat eye */}
      <circle cx="24" cy="29" r="1.4" fill={color} />

      {/* Small medical cross — minimal, at top right of arc */}
      <line x1="50" y1="14" x2="50" y2="20" stroke={sc} strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
      <line x1="47" y1="17" x2="53" y2="17" stroke={sc} strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />

      {/* Shield outline — tiny, bottom center */}
      <path
        d="M 29 53 Q 29 51, 32 50 Q 35 51, 35 53 Q 35 56, 32 58 Q 29 56, 29 53 Z"
        stroke={sc}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
      />
      {/* Tiny heart inside shield */}
      <path
        d="M 31 53.5 Q 31 52.5, 32 53.5 Q 33 52.5, 33 53.5 Q 33 55, 32 55.8 Q 31 55, 31 53.5"
        fill={sc}
        opacity="0.45"
      />
    </svg>
  );
}
