import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { ACC, AMB, HAIRLINE, MONO, MUTED } from "../shared/theme";
import Window from "../shared/Window";
import RiseText from "../shared/RiseText";
import MonoLabel from "../shared/MonoLabel";

const ROOM_CODE = "K7XW2Q";

// S3 — Share the code. Local frames 0-119 (nominal global 195-314).
// A side panel unfolds from the window's right edge: QR + room code (typed
// on), a phone outline pops in, status flips WAITING -> PEER JOINED. Hard
// cut at the end as the panel collapses.
export default function S3ShareQr() {
  const frame = useCurrentFrame();

  const panelWidth = interpolate(frame, [0, 20], [0, 340], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const collapseWidth = interpolate(frame, [114, 119], [340, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sideWidth = frame < 114 ? panelWidth : collapseWidth;

  const qrSpringOpacity = interpolate(frame, [14, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const charsShown = Math.max(0, Math.min(ROOM_CODE.length, Math.floor((frame - 20) / 2)));
  const codeText = ROOM_CODE.slice(0, charsShown);

  const phoneOpacity = interpolate(frame, [65, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const joined = frame >= 95;
  const blink = Math.floor(frame / 12) % 2 === 0;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* copy block */}
      <div style={{ position: "absolute", top: 110, left: 90 }}>
        <RiseText delay={0} fontSize={68}>
          SHARE A LINK.
        </RiseText>
        <RiseText delay={6} fontSize={68} color={ACC}>
          OR A QR.
        </RiseText>
      </div>

      {/* window + side panel */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 100,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "flex-start",
        }}
      >
        <Window width={640}>
          <div style={{ padding: 28, minHeight: 300 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "36px 1fr 110px",
                gap: 14,
                alignItems: "center",
                padding: "12px 6px",
                borderBottom: `1px solid ${HAIRLINE}`,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  border: `1px solid ${AMB}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ width: 8, height: 8, background: AMB }} />
              </span>
              <span style={{ fontSize: 20, fontWeight: 500 }}>album-masters.zip</span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 15,
                  color: MUTED,
                  textAlign: "right",
                }}
              >
                QUEUED
              </span>
            </div>
            <div style={{ marginTop: 24 }}>
              <MonoLabel size={16} color={MUTED}>
                ROOM CODE
              </MonoLabel>
              <div
                style={{
                  fontFamily: MONO,
                  fontWeight: 600,
                  fontSize: 40,
                  color: "#efe9da",
                  letterSpacing: ".08em",
                  marginTop: 8,
                }}
              >
                {codeText || " "}
              </div>
            </div>
          </div>
        </Window>

        <div
          style={{
            width: sideWidth,
            overflow: "hidden",
            marginLeft: sideWidth > 0 ? 2 : 0,
          }}
        >
          <div
            style={{
              width: 340,
              border: "1px solid rgba(239,233,218,.22)",
              background: "#15140f",
              padding: 26,
              boxSizing: "border-box",
              minHeight: 352,
            }}
          >
            <div style={{ opacity: qrSpringOpacity }}>
              <Img
                src={staticFile("qr.png")}
                style={{ width: 220, height: 220, display: "block" }}
              />
            </div>
            <div
              style={{
                marginTop: 18,
                fontFamily: MONO,
                fontSize: 15,
                letterSpacing: ".06em",
                color: MUTED,
                wordBreak: "break-all",
              }}
            >
              WARP.ISHANNAIK.COM/R/{ROOM_CODE}
            </div>
            <div style={{ marginTop: 20 }}>
              {!joined ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      background: AMB,
                      opacity: blink ? 1 : 0.15,
                    }}
                  />
                  <MonoLabel size={16} color={MUTED}>
                    WAITING FOR PEER…
                  </MonoLabel>
                </div>
              ) : (
                <MonoLabel size={16} color={ACC}>
                  ● PEER JOINED
                </MonoLabel>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* phone device frame, far right */}
      <div
        style={{
          position: "absolute",
          right: 60,
          bottom: 130,
          width: 90,
          height: 190,
          border: "1px solid rgba(239,233,218,.3)",
          opacity: phoneOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <span style={{ width: 20, height: 20, background: ACC, opacity: joined ? 1 : 0.3 }} />
        <MonoLabel size={11} color={MUTED} tracking=".08em" style={{ textAlign: "center" }}>
          THEY REVIEW
          <br />→ ACCEPT
        </MonoLabel>
      </div>
    </div>
  );
}
