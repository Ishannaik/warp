import type { CSSProperties } from "react";

/**
 * WebRtcLogo — the official WebRTC mark recreated as a clean inline SVG.
 *
 * The WebRTC logo is a rounded square drawn as an open loop: a thick,
 * round-capped stroke that traces most of a rounded-rectangle but leaves a gap,
 * giving it the recognizable "spinner / loop" silhouette. It is rendered with
 * `currentColor` so callers can tint it via `color` (we use it in `--acc`), and
 * it can slowly rotate as an ambient flourish in the WebRTC section.
 *
 * Pure vector — no raster assets. Self-contained and reused by the A2
 * `WebRtcChannel` diagram and anywhere the WebRTC area wants the mark.
 */

export interface WebRtcLogoProps {
  /** Rendered width/height in px (the mark is square). Default 64. */
  size?: number;
  /** Stroke thickness of the loop, in viewBox units (0–100). Default 12. */
  strokeWidth?: number;
  /** Extra inline styles (e.g. an `animation` for the ambient spin). */
  style?: CSSProperties;
  className?: string;
  /** Accessible label; omit to mark decorative (aria-hidden). */
  title?: string;
}

export function WebRtcLogo({
  size = 64,
  strokeWidth = 12,
  style,
  className,
  title,
}: WebRtcLogoProps) {
  const decorative = !title;

  /**
   * An open rounded-square loop on a 100×100 grid. We start partway along the
   * top edge, travel clockwise all the way around through three rounded
   * corners, and stop just short of the start — leaving the signature gap at
   * the top. `round` linecaps give the WebRTC mark its soft terminals.
   */
  const inset = strokeWidth / 2 + 4; // keep the stroke inside the viewBox
  const min = inset;
  const max = 100 - inset;
  const r = 22; // corner radius

  // Gap sits centered on the top edge.
  const gapStartX = 60; // where the loop ends (right of center)
  const gapEndX = 40; //   where the loop begins (left of center)

  const d = [
    // begin left of the top-center gap
    `M ${gapEndX} ${min}`,
    // top edge -> top-left corner
    `L ${min + r} ${min}`,
    `A ${r} ${r} 0 0 0 ${min} ${min + r}`,
    // left edge -> bottom-left corner
    `L ${min} ${max - r}`,
    `A ${r} ${r} 0 0 0 ${min + r} ${max}`,
    // bottom edge -> bottom-right corner
    `L ${max - r} ${max}`,
    `A ${r} ${r} 0 0 0 ${max} ${max - r}`,
    // right edge -> top-right corner
    `L ${max} ${min + r}`,
    `A ${r} ${r} 0 0 0 ${max - r} ${min}`,
    // top edge back toward center, stopping short to leave the gap
    `L ${gapStartX} ${min}`,
  ].join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      style={style}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path
        d={d}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default WebRtcLogo;
