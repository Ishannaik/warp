import type { CSSProperties, ReactNode } from "react";
import { spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { DISPLAY } from "./theme";

// The hero's `warpRise` reveal: a clip-mask wrapper (overflow hidden) around
// a line that translates up from +60px while fading in, driven by a
// no-wobble spring (damping 200 matches the site's cubic-bezier snap).
export default function RiseText({
  children,
  delay = 0,
  fontSize = 64,
  color = "#efe9da",
  style,
}: {
  children: ReactNode;
  delay?: number;
  fontSize?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  });
  const translateY = interpolate(sp, [0, 1], [60, 0]);
  const opacity = interpolate(sp, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // The clip-mask uses overflow:hidden for the rising-from-baseline reveal, but
  // lineHeight 0.9 makes the box shorter than the glyphs, so descenders (the Q
  // tail) get clipped at rest — "QR" read as "OR". Give the inner box descender
  // room via paddingBottom, and cancel that extra height for layout with a
  // matching negative marginBottom on the mask so line spacing is unchanged.
  return (
    <div style={{ overflow: "hidden", marginBottom: "-0.18em" }}>
      <div
        style={{
          display: "inline-block",
          transform: `translateY(${translateY}px)`,
          opacity,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize,
          lineHeight: 0.9,
          letterSpacing: "-.03em",
          textTransform: "uppercase",
          color,
          paddingBottom: "0.18em",
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}
