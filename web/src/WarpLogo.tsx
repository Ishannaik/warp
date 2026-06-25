import type { CSSProperties } from "react";

/**
 * Warp brandmark — a sharp accent tile with a forward "warp" double-chevron
 * (speed · direct device-to-device transfer). Mirrors public/favicon.svg.
 * Used as the logo in every page nav. Tracks the accent CSS var so it stays in
 * sync with the theme; the chevrons are punched in the page background colour.
 */
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
      <rect width="32" height="32" fill="var(--acc)" />
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
