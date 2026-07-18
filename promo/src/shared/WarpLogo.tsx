import type { CSSProperties } from "react";

// Copied from web/src/WarpLogo.tsx — CSS var --acc swapped for the literal
// hex (Remotion's render has no page stylesheet), stroke stays #121110.
// Zero border-radius, miter joins — keep exactly as-is.
export default function WarpLogo({
  size = 26,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      style={{ display: "block", flex: "none", ...style }}
    >
      <rect width="32" height="32" fill="#5360ff" />
      <g
        fill="none"
        stroke="#121110"
        strokeWidth="3.1"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      >
        <path d="M8.5 10 L14.5 16 L8.5 22" />
        <path d="M15.5 10 L21.5 16 L15.5 22" />
      </g>
    </svg>
  );
}
