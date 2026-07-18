import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ACC, BG, MONO, MUTED } from "../shared/theme";
import Window from "../shared/Window";
import ProgressBar from "../shared/ProgressBar";
import WarpLogo from "../shared/WarpLogo";
import RiseText from "../shared/RiseText";
import MonoLabel from "../shared/MonoLabel";

const URL_TEXT = "WARP.ISHANNAIK.COM";

// S6 — Done + CTA. Local frames 0-(durationInFrames-1) (nominal global
// 645-779, extended by 16 frames to absorb the two -8 overlap offsets
// upstream so the composition lands on 780 total).
// Bar snaps to done -> window fades -> logo lockup springs back bigger with
// the URL typed on -> a long breathing hold -> fade to black.
export default function S6Cta({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const doneBarPct = interpolate(frame, [0, 10], [96, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const checkSpring = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const checkScale = interpolate(checkSpring, [0, 1], [0.4, 1]);
  const checkOpacity = interpolate(checkSpring, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const windowOpacity = interpolate(frame, [25, 45], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const windowScale = interpolate(frame, [25, 45], [1, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logoSpring = spring({ frame: frame - 30, fps, config: { damping: 200 } });
  const logoScale = interpolate(logoSpring, [0, 1], [0.6, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const urlChars = Math.max(0, Math.min(URL_TEXT.length, Math.floor((frame - 40) / 2)));
  const urlText = URL_TEXT.slice(0, urlChars);

  const tagOpacity = interpolate(frame, [70, 88], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const breathe = 1 + Math.sin(frame / 20) * 0.01;

  const fadeStart = durationInFrames - 20;
  const fadeOpacity = interpolate(frame, [fadeStart, durationInFrames - 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* window with the final done state, fades out early */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 300,
          transform: `translateX(-50%) scale(${windowScale})`,
          opacity: windowOpacity,
        }}
      >
        <Window width={780}>
          <div style={{ padding: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  background: ACC,
                  transform: `scale(${checkScale})`,
                  opacity: checkOpacity,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontFamily: MONO,
                  fontSize: 16,
                }}
              >
                ✓
              </span>
              <MonoLabel size={20} color="#efe9da">
                DONE — 12.4 GB · DIRECT · ENCRYPTED
              </MonoLabel>
            </div>
            <ProgressBar pct={doneBarPct} variant="done" />
          </div>
        </Window>
      </div>

      {/* logo lockup, center */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${breathe})`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
          }}
        >
          <WarpLogo size={160} />
          <RiseText delay={30} fontSize={140}>
            WARP
          </RiseText>
        </div>

        <div
          style={{
            marginTop: 30,
            fontFamily: MONO,
            fontWeight: 600,
            fontSize: 40,
            letterSpacing: ".05em",
            color: "#efe9da",
            minHeight: 48,
          }}
        >
          {urlText}
        </div>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontFamily: MONO,
            fontSize: 18,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: MUTED,
            opacity: tagOpacity,
          }}
        >
          <span>FREE</span>
          <span style={{ color: "#4a463c" }}>•</span>
          <span>OPEN-SOURCE</span>
          <span style={{ color: "#4a463c" }}>•</span>
          <span>NO ACCOUNT</span>
        </div>
      </div>

      {/* fade to black */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: BG,
          opacity: fadeOpacity,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
