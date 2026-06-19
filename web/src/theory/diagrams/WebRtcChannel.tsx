import { useEffect, useState, type ReactNode } from "react";
import {
  DiagramFrame,
  Endpoint,
  useReducedMotion,
  ACC,
  AMB,
  MONO,
  INK,
  MUTED,
  CARD,
} from "./primitives";
import WebRtcLogo from "../WebRtcLogo";

/**
 * WebRtcChannel — diagram for A2 — WebRTC + DTLS channel.
 *
 * The official WebRTC loop mark is the accent-tinted centerpiece (slow ~9s
 * ambient spin). Beneath it the DataChannel runs as a beam between two
 * endpoints: each end holds a fused key + a closed DTLS lock; the payload rides
 * the beam as scrambling ciphertext (animated hex) and is shown decrypting only
 * at the receiving end. An "observer" beneath the wire sees only hex.
 *
 * Reduced-motion: logo static, lock closed, ciphertext frozen as a static
 * scrambled block, plaintext shown at the receiver.
 */

const HEX = "0123456789abcdef";
function randHex(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}

const LOCK = (
  <svg width="13" height="15" viewBox="0 0 13 15" fill="none" aria-hidden>
    <rect x="1" y="6" width="11" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.3" fill="rgba(83,96,255,.12)" />
    <path d="M3.5 6V4.2a3 3 0 0 1 6 0V6" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="6.5" cy="9.6" r="1.1" fill="currentColor" />
  </svg>
);

const KEY = (
  <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden>
    <circle cx="4" cy="5" r="3.2" stroke="currentColor" strokeWidth="1.3" />
    <path d="M7 5h8M12 5v2.6M14.6 5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const DEVICE = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export default function WebRtcChannel() {
  const reduced = useReducedMotion();
  const [cipher, setCipher] = useState<string>(() => randHex(28));

  // Re-scramble the ciphertext sample periodically (the "observer" view).
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setCipher(randHex(28)), 320);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <DiagramFrame caption="FIG 02 · WEBRTC · ENCRYPTED DATACHANNEL" tone="acc">
      {/* centerpiece: the WebRTC loop mark */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: "22px",
        }}
      >
        <div style={{ position: "relative", color: ACC }}>
          {/* soft halo */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-22px",
              borderRadius: "50%",
              background:
                "radial-gradient(circle,rgba(83,96,255,.22),transparent 70%)",
              animation: reduced ? undefined : "thyPulse 4s ease-in-out infinite",
            }}
          />
          <WebRtcLogo
            size={72}
            strokeWidth={11}
            title="WebRTC"
            style={{
              position: "relative",
              animation: reduced ? undefined : "thySpin 9s linear infinite",
              filter: "drop-shadow(0 0 14px rgba(83,96,255,.45))",
            }}
          />
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: ".22em",
            textTransform: "uppercase",
            color: MUTED,
            marginTop: "12px",
          }}
        >
          built into the browser
        </div>
      </div>

      {/* the encrypted channel between two endpoints */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: "10px",
        }}
      >
        {/* sender end — key fused, lock closed */}
        <EndWithKey label="peer a" tone="acc" />

        {/* the wire carrying ciphertext */}
        <div style={{ position: "relative" }}>
          {/* beam track */}
          <div
            style={{
              position: "relative",
              height: "30px",
              border: "1px solid rgba(83,96,255,.35)",
              background:
                "linear-gradient(90deg,rgba(83,96,255,.05),rgba(83,96,255,.12),rgba(83,96,255,.05))",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* scrambling ciphertext content */}
            <div
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                letterSpacing: ".18em",
                color: "rgba(83,96,255,.85)",
                whiteSpace: "nowrap",
                padding: "0 8px",
                width: "100%",
                textAlign: "center",
                userSelect: "none",
              }}
            >
              {cipher.replace(/(.{4})/g, "$1 ").trim()}
            </div>
            {/* shimmer sweep */}
            {!reduced ? (
              <div
                className="thy-anim"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "40%",
                  background:
                    "linear-gradient(90deg,transparent,rgba(239,233,218,.28),transparent)",
                  animation: "thyShimmer 1.8s ease-in-out infinite",
                }}
              />
            ) : null}
            {/* DTLS lock riding mid-beam */}
            <span
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: CARD,
                border: `1px solid ${ACC}`,
                padding: "2px 7px 2px 5px",
                color: ACC,
              }}
            >
              {LOCK}
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "9px",
                  letterSpacing: ".14em",
                  color: ACC,
                }}
              >
                DTLS
              </span>
            </span>
          </div>

          {/* observer note: only sees hex */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              marginTop: "9px",
              fontFamily: MONO,
              fontSize: "9px",
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: AMB,
            }}
          >
            <span style={{ opacity: 0.7 }}>👁 observer sees only ciphertext</span>
          </div>
        </div>

        {/* receiver end — decrypts to plaintext */}
        <EndWithKey label="peer b" tone="acc" decrypted />
      </div>

      {/* legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "16px",
          marginTop: "20px",
          paddingTop: "16px",
          borderTop: "1px solid rgba(239,233,218,.1)",
        }}
      >
        <Legend tone="acc" glyph={KEY} text="keys live on the devices" />
        <Legend tone="acc" glyph={LOCK} text="encrypted in transit — DTLS" />
      </div>
    </DiagramFrame>
  );
}

/* ---------------------------------------------------------------- pieces -- */

function EndWithKey({
  label,
  tone,
  decrypted = false,
}: {
  label: string;
  tone: "acc" | "amb";
  decrypted?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "7px" }}>
      <Endpoint
        label={label}
        tone={tone}
        icon={DEVICE}
        minWidth={0}
        style={{ padding: "9px 13px" }}
      />
      {/* fused key + lock badge */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          color: ACC,
          border: `1px solid rgba(83,96,255,.4)`,
          background: "rgba(83,96,255,.08)",
          padding: "2px 6px",
        }}
      >
        {KEY}
        {LOCK}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: "8.5px",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: decrypted ? ACC : MUTED,
        }}
      >
        {decrypted ? "→ plaintext" : "plaintext →"}
      </span>
    </div>
  );
}

function Legend({
  tone,
  glyph,
  text,
}: {
  tone: "acc" | "amb";
  glyph: ReactNode;
  text: string;
}) {
  const c = tone === "amb" ? AMB : ACC;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", color: c }}>
      {glyph}
      <span
        style={{
          fontFamily: MONO,
          fontSize: "9.5px",
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: INK,
        }}
      >
        {text}
      </span>
    </span>
  );
}
