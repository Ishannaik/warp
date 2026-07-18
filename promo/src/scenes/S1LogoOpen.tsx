import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { MONO, MUTED } from "../shared/theme";
import WarpLogo from "../shared/WarpLogo";
import RiseText from "../shared/RiseText";

// S1 — Cold open: the mark. Local frames 0-74.
// Logo tile springs in center (0-12), WARP letters rise beside it staggered
// (from 10), mono sub-line fades in (40), whole lockup scales down + fades
// out (66-74) as S2's window pops over it.
export default function S1LogoOpen() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 200 } });
  const logoScale = interpolate(logoSpring, [0, 1], [0.5, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subOpacity = interpolate(frame, [40, 58], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const outScale = interpolate(frame, [66, 74], [1, 0.92], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outOpacity = interpolate(frame, [66, 74], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const letters = ["W", "A", "R", "P"];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${outScale})`,
        opacity: outOpacity,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div
          style={{
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
          }}
        >
          <WarpLogo size={140} />
        </div>
        <div style={{ display: "flex" }}>
          {letters.map((letter, i) => (
            <RiseText key={letter} delay={10 + i * 4} fontSize={180}>
              {letter}
            </RiseText>
          ))}
        </div>
      </div>
      <div
        style={{
          marginTop: 34,
          fontFamily: MONO,
          fontSize: 24,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: MUTED,
          opacity: subOpacity,
        }}
      >
        PEER-TO-PEER FILE TRANSFER
      </div>
    </div>
  );
}
