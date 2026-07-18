import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ACC, HAIRLINE, MONO, MUTED } from "../shared/theme";
import Window from "../shared/Window";
import RiseText from "../shared/RiseText";
import MonoLabel from "../shared/MonoLabel";

// S2 — Drag it in. Local frames 0-119 (nominal global 75-194).
// Window springs in, empty drop zone, a file chip glides in from top-right
// and "drops" at local frame 65 — dashed border flashes accent, chip snaps
// into a queue row. Display copy rises top-left, cross-fades out at the end.
export default function S2Drop() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const winSpring = spring({ frame, fps, config: { damping: 200 } });
  const winScale = interpolate(winSpring, [0, 1], [0.94, 1]);
  const winOpacity = interpolate(winSpring, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const dropped = frame >= 65;
  const chipT = interpolate(frame, [30, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const chipX = interpolate(chipT, [0, 1], [420, 0]);
  const chipY = interpolate(chipT, [0, 1], [-160, 0]);
  const chipRotate = interpolate(chipT, [0, 1], [-4, 0]);
  const chipVisible = frame >= 30 && frame < 65;

  const flashT = interpolate(frame, [65, 71], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const copyOpacity = interpolate(frame, [108, 119], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* copy block, top-left */}
      <div style={{ position: "absolute", top: 140, left: 90, opacity: copyOpacity }}>
        <RiseText delay={5} fontSize={72}>
          NO SIGNUP.
        </RiseText>
        <RiseText delay={11} fontSize={72} color={ACC}>
          NO APP.
        </RiseText>
      </div>

      {/* corner tag */}
      <div style={{ position: "absolute", top: 90, right: 90, opacity: copyOpacity }}>
        <MonoLabel size={18} color={MUTED}>
          01 / DROP
        </MonoLabel>
      </div>

      {/* window, lower two-thirds */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 110,
          transform: `translateX(-50%) scale(${winScale})`,
          opacity: winOpacity,
        }}
      >
        <Window width={860}>
          <div style={{ padding: 28, minHeight: 260, position: "relative", overflow: "hidden" }}>
            {!dropped && (
              <div
                style={{
                  border: `1px dashed rgba(239,233,218,.25)`,
                  height: 220,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderColor:
                    flashT > 0 ? `rgba(83,96,255,${flashT})` : "rgba(239,233,218,.25)",
                }}
              >
                <MonoLabel size={20} color={MUTED} tracking=".14em">
                  DROP FILES HERE
                </MonoLabel>
              </div>
            )}

            {dropped && (
              <div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr 120px 1.4fr 140px",
                    gap: 14,
                    padding: "12px 6px",
                    borderBottom: `1px solid ${HAIRLINE}`,
                    fontFamily: MONO,
                    fontSize: 16,
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: MUTED,
                  }}
                >
                  <span>#</span>
                  <span>NAME</span>
                  <span>SIZE</span>
                  <span>PROGRESS</span>
                  <span style={{ textAlign: "right" }}>STATUS</span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr 120px 1.4fr 140px",
                    gap: 14,
                    alignItems: "center",
                    padding: "18px 6px",
                  }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 18, color: MUTED }}>01</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        flex: "none",
                        border: `1px solid ${MUTED}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span style={{ width: 8, height: 8, background: MUTED }} />
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 500, whiteSpace: "nowrap" }}>
                      album-masters.zip
                    </span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 16, color: "#a8a293" }}>
                    12.4 GB
                  </span>
                  <span style={{ height: 8, background: "rgba(239,233,218,.09)" }} />
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 15,
                      letterSpacing: ".08em",
                      textAlign: "right",
                      color: MUTED,
                    }}
                  >
                    QUEUED
                  </span>
                </div>
              </div>
            )}
          </div>
        </Window>
      </div>

      {/* glide-in file chip */}
      {chipVisible && (
        <div
          style={{
            position: "absolute",
            top: 320,
            left: "50%",
            transform: `translate(calc(-50% + ${chipX}px), ${chipY}px) rotate(${chipRotate}deg)`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 20px",
            background: "#15140f",
            border: "1px solid rgba(239,233,218,.3)",
            boxShadow: "0 20px 50px -20px rgba(0,0,0,.9)",
          }}
        >
          <span style={{ width: 10, height: 10, background: ACC }} />
          <span
            style={{
              fontSize: 20,
              fontWeight: 500,
              color: "#efe9da",
              whiteSpace: "nowrap",
            }}
          >
            album-masters.zip
          </span>
          <span style={{ fontFamily: MONO, fontSize: 15, color: MUTED }}>12.4 GB</span>
        </div>
      )}
    </div>
  );
}
