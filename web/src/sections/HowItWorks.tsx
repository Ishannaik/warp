import type { CSSProperties } from "react";
import { useIsMobile } from "../lib/useIsMobile";

const cardBase: CSSProperties = {
  border: "1px solid rgba(239,233,218,.16)",
  background: "#15140f",
  padding: "26px",
  position: "relative",
};

const stepLabel: CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "11px",
  letterSpacing: ".18em",
  color: "var(--acc)",
};

const cardTitle: CSSProperties = {
  fontFamily: "'Bricolage Grotesque',sans-serif",
  fontWeight: 700,
  fontSize: "22px",
  letterSpacing: "-.01em",
};

const cardBody: CSSProperties = {
  fontSize: "14.5px",
  lineHeight: 1.55,
  color: "#a8a293",
  margin: "10px 0 0",
};

export default function HowItWorks() {
  const isMobile = useIsMobile();
  return (
    <section
      id="work"
      style={{
        position: "relative",
        zIndex: 4,
        borderTop: "1px solid rgba(239,233,218,.13)",
        padding: isMobile ? "56px 18px" : "96px 26px",
      }}
    >
      <div style={{ maxWidth: "1320px", margin: "0 auto" }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: "11.5px",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "#6f6a5d",
          }}
        >
          01 / How it works
        </div>
        <h2
          style={{
            fontFamily: "'Bricolage Grotesque',sans-serif",
            fontWeight: 700,
            fontSize: "clamp(32px,4vw,54px)",
            lineHeight: 1,
            letterSpacing: "-.025em",
            margin: "14px 0 0",
            color: "#efe9da",
            maxWidth: "760px",
          }}
        >
          Three moves from your machine to theirs.
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
            gap: isMobile ? "14px" : "18px",
            marginTop: isMobile ? "36px" : "52px",
          }}
        >
          {/* STEP 01 */}
          <div style={cardBase}>
            <div style={stepLabel}>STEP 01</div>
            <div style={{ display: "flex", gap: "6px", margin: "22px 0" }}>
              <div
                style={{
                  width: "14px",
                  height: "18px",
                  border: "1px solid rgba(239,233,218,.4)",
                }}
              />
              <div
                style={{
                  width: "14px",
                  height: "18px",
                  border: "1px solid rgba(239,233,218,.4)",
                }}
              />
              <div
                style={{
                  width: "14px",
                  height: "18px",
                  border: "1px solid var(--acc)",
                  background: "rgba(var(--acc-rgb),.25)",
                }}
              />
            </div>
            <div style={cardTitle}>Drop your files</div>
            <p style={cardBody}>
              Drag anything in &mdash; folders, 50&nbsp;GB videos, whole disk
              images. Nothing leaves your device yet.
            </p>
          </div>

          {/* STEP 02 */}
          <div style={cardBase}>
            <div style={stepLabel}>STEP 02</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                margin: "22px 0",
              }}
            >
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  border: "1px solid var(--acc)",
                }}
              />
              <div
                style={{
                  flex: 1,
                  height: "2px",
                  background:
                    "repeating-linear-gradient(90deg,var(--acc) 0 6px,transparent 6px 12px)",
                }}
              />
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  border: "1px solid var(--amb)",
                }}
              />
            </div>
            <div style={cardTitle}>A channel opens</div>
            <p style={cardBody}>
              Share a short code. Wrap pairs the two devices directly &mdash;
              the relay only brokers the handshake, then steps aside.
            </p>
          </div>

          {/* STEP 03 */}
          <div style={cardBase}>
            <div style={stepLabel}>STEP 03</div>
            <div
              style={{
                height: "18px",
                margin: "22px 0",
                background:
                  "repeating-linear-gradient(90deg,var(--acc) 0 7px,transparent 7px 20px)",
                backgroundSize: "32px 100%",
                animation: "wrapFlow .9s linear infinite",
                WebkitMaskImage:
                  "linear-gradient(90deg,transparent,#000 20%,#000 80%,transparent)",
                maskImage:
                  "linear-gradient(90deg,transparent,#000 20%,#000 80%,transparent)",
              }}
            />
            <div style={cardTitle}>Bytes fly across</div>
            <p style={cardBody}>
              Encrypted end-to-end and streamed straight device-to-device at
              full line speed. No upload, no middleman.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
