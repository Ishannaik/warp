import { interpolate, useCurrentFrame } from "remotion";
import { ACC, AMB, MONO, MUTED } from "../shared/theme";
import Window from "../shared/Window";
import ProgressBar from "../shared/ProgressBar";
import RiseText from "../shared/RiseText";
import MonoLabel from "../shared/MonoLabel";

// S5 — It never dies (the money beat). Local frames 0-179 (nominal global
// 465-644, offset -8 for the S4 overlap). Bar climbs 62->90, freezes and
// desaturates on a simulated drop, jitters, then a clean accent flash
// sweeps it back to life and it continues straight from 90 -> 100.
export default function S5NeverDies() {
  const frame = useCurrentFrame();

  const stalled = frame >= 55 && frame < 91;
  const resuming = frame >= 91 && frame < 103;

  let pct: number;
  if (frame < 55) {
    pct = interpolate(frame, [0, 55], [62, 90], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else if (frame < 103) {
    pct = 90;
  } else {
    pct = interpolate(frame, [103, 175], [90, 100], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  const variant = stalled ? "stalled" : "active";
  const jitter = frame >= 55 && frame < 80 ? (Math.floor(frame / 3) % 2 === 0 ? 2 : -2) : 0;

  const throughputText = stalled ? "— GB/S" : `${(1.9 + ((frame % 12) / 12) * 0.4).toFixed(1)} GB/S`;

  const blink = Math.floor(frame / 12) % 2 === 0;

  let statusNode;
  if (frame < 55) {
    statusNode = (
      <MonoLabel size={20} color={AMB}>
        ▮ {Math.round(pct)}%
      </MonoLabel>
    );
  } else if (stalled) {
    statusNode = (
      <span style={{ opacity: blink ? 1 : 0.3 }}>
        <MonoLabel size={20} color={AMB}>
          RECONNECTING…
        </MonoLabel>
      </span>
    );
  } else {
    statusNode = (
      <MonoLabel size={20} color={ACC}>
        ● RESUMED @ 90%
      </MonoLabel>
    );
  }

  const flashX = interpolate(frame, [91, 103], [-20, 120], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const displayOpacity = interpolate(frame, [105, 118], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const footnoteOpacity = interpolate(frame, [135, 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const compareVisible = frame >= 95 && frame < 140;
  const compareT = interpolate(frame, [95, 108], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const comparePct = interpolate(frame, [95, 108], [87, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          top: 90,
          left: "50%",
          transform: "translateX(-50%)",
          opacity: displayOpacity,
        }}
      >
        <RiseText delay={105} fontSize={78} style={{ textAlign: "center" }}>
          IT NEVER DIES.
        </RiseText>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 340,
          transform: `translate(calc(-50% + ${jitter}px), 0)`,
        }}
      >
        <Window width={860}>
          <div style={{ padding: 30 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              {statusNode}
              <MonoLabel size={18} color={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
                {throughputText}
              </MonoLabel>
            </div>

            <div style={{ position: "relative" }}>
              <ProgressBar pct={pct} variant={variant} height={16} />
              {resuming && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${flashX}%`,
                    width: 40,
                    background:
                      "linear-gradient(90deg,transparent,rgba(255,255,255,.9),transparent)",
                  }}
                />
              )}
            </div>

            {compareVisible && (
              <div style={{ marginTop: 22, opacity: compareT }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                    fontFamily: MONO,
                    fontSize: 15,
                    letterSpacing: ".08em",
                    color: MUTED,
                    textTransform: "uppercase",
                    textDecoration: "line-through",
                  }}
                >
                  <span>EVERYONE ELSE</span>
                  <span>{Math.round(comparePct)}%</span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: "rgba(239,233,218,.09)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${comparePct}%`,
                      background: MUTED,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </Window>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 130,
          left: "50%",
          transform: "translateX(-50%)",
          opacity: footnoteOpacity,
        }}
      >
        <MonoLabel size={18} color={MUTED} tracking=".08em">
          BYTE-EXACT RESUME. OTHERS RESTART AT 0.
        </MonoLabel>
      </div>
    </div>
  );
}
