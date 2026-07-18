import { interpolate, useCurrentFrame } from "remotion";
import { ACC, AMB, MONO, MUTED } from "../shared/theme";
import RiseText from "../shared/RiseText";
import WarpLogo from "../shared/WarpLogo";
import MonoLabel from "../shared/MonoLabel";
import ProgressBar from "../shared/ProgressBar";

const DEVICE_Y = 470;
const LEFT_X = 260;
const RIGHT_X = 820;
const LINE_LEN = RIGHT_X - LEFT_X;

// S4 — The architecture claim. Local frames 0-149 (nominal global 315-464).
// A dashed route tries the server (center), gets struck through, then a
// direct accent line draws device-to-device with traveling packet squares.
export default function S4Direct() {
  const frame = useCurrentFrame();

  const strikeOpacity = interpolate(frame, [45, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const serverFade = interpolate(frame, [45, 60], [1, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const serverDrop = interpolate(frame, [45, 60], [0, 40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lineProgress = interpolate(frame, [50, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lineVisible = frame >= 50;
  const packetsVisible = frame >= 80;

  const subOpacity = interpolate(frame, [85, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const throughput = (2.1 + ((Math.floor(frame / 6) % 5) - 2) * 0.07).toFixed(1);
  const barPct = interpolate(frame, [0, 149], [8, 96], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* copy block, centered top */}
      <div
        style={{
          position: "absolute",
          top: 110,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <RiseText delay={25} fontSize={62} style={{ textAlign: "center" }}>
          YOUR FILE NEVER
        </RiseText>
        <RiseText delay={31} fontSize={62} color={ACC} style={{ textAlign: "center" }}>
          TOUCHES A SERVER.
        </RiseText>
        <div style={{ marginTop: 18, opacity: subOpacity }}>
          <MonoLabel size={18} color={MUTED} tracking=".1em">
            PRIVACY IS ARCHITECTURE — NOT POLICY.
          </MonoLabel>
        </div>
      </div>

      {/* stage: two devices + server + direct line */}
      <svg
        width={1080}
        height={1080}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {lineVisible && (
          <line
            x1={LEFT_X + 60}
            y1={DEVICE_Y}
            x2={LEFT_X + 60 + LINE_LEN - 120}
            y2={DEVICE_Y}
            stroke={ACC}
            strokeWidth={3}
            strokeDasharray={LINE_LEN}
            strokeDashoffset={LINE_LEN * (1 - lineProgress)}
          />
        )}
        {packetsVisible &&
          [0, 1, 2].map((i) => {
            const phase = ((frame - 80 + i * 20) % 60) / 60;
            const x = LEFT_X + 60 + phase * (LINE_LEN - 120);
            return (
              <rect
                key={i}
                x={x - 4}
                y={DEVICE_Y - 4}
                width={8}
                height={8}
                fill="#efe9da"
              />
            );
          })}
        {strikeOpacity > 0 && (
          <line
            x1={480}
            y1={DEVICE_Y - 60 + serverDrop}
            x2={600}
            y2={DEVICE_Y + 60 + serverDrop}
            stroke={AMB}
            strokeWidth={4}
            opacity={strikeOpacity}
          />
        )}
      </svg>

      {/* left device */}
      <div
        style={{
          position: "absolute",
          left: LEFT_X,
          top: DEVICE_Y - 60,
          width: 120,
          height: 120,
          border: "1px solid rgba(239,233,218,.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <WarpLogo size={48} />
      </div>

      {/* right device */}
      <div
        style={{
          position: "absolute",
          left: RIGHT_X - 120,
          top: DEVICE_Y - 60,
          width: 120,
          height: 120,
          border: "1px solid rgba(239,233,218,.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <WarpLogo size={48} />
      </div>

      {/* server glyph, center */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: DEVICE_Y - 60 + serverDrop,
          transform: "translateX(-50%)",
          width: 70,
          height: 120,
          border: "1px solid rgba(239,233,218,.3)",
          opacity: serverFade,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-evenly",
          padding: "10px 0",
          boxSizing: "border-box",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 2, background: "rgba(239,233,218,.35)", margin: "0 10px" }} />
        ))}
      </div>

      {/* progress strip, bottom */}
      <div style={{ position: "absolute", left: 90, right: 90, bottom: 100 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
            fontFamily: MONO,
            fontSize: 16,
            letterSpacing: ".1em",
            color: MUTED,
            textTransform: "uppercase",
          }}
        >
          <span>DIRECT · ENCRYPTED</span>
          <span style={{ color: "#efe9da", fontVariantNumeric: "tabular-nums" }}>
            {throughput} GB/S
          </span>
        </div>
        <ProgressBar pct={barPct} variant="active" />
      </div>
    </div>
  );
}
