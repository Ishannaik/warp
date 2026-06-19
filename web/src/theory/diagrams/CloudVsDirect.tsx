import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  DiagramFrame,
  Endpoint,
  FileToken,
  useNarrowViewport,
  useReducedMotion,
  ACC,
  AMB,
  MONO,
  MUTED,
} from "./primitives";

/**
 * CloudVsDirect — diagram for A1 — cloud vs direct.
 *
 * Side-by-side comparison that animates the contrast between a two-leg cloud
 * detour (a copy left behind) and a single direct beam.
 *
 * - Left "CLOUD" panel (amber = cost/risk): a token climbs sender -> cloud,
 *   the cloud lights a persistent "STORED COPY" badge that lingers, then a
 *   second token descends cloud -> receiver. Two hops, doubled distance, a
 *   copy retained.
 * - Right "DIRECT" panel (accent): one straight beam; a single token crosses
 *   once, no copy retained.
 *
 * A shared phase clock loops the sequence slowly. Under prefers-reduced-motion
 * both paths render at rest (cloud copy visible, direct beam lit, no motion).
 */

/* Phases of the loop:
 * 0 idle  ·  1 cloud token climbing (up-leg)  ·  2 stored at cloud
 * 3 cloud token descending (down-leg)  ·  4 direct token crossing */
const CLOUD_GLYPH = (
  <svg width="40" height="26" viewBox="0 0 40 26" fill="none" aria-hidden>
    <path
      d="M10 22h21a7 7 0 0 0 1.2-13.9A9 9 0 0 0 15 6.3 6.5 6.5 0 0 0 10 22Z"
      stroke="currentColor"
      strokeWidth="1.6"
      fill="rgba(239,106,61,.1)"
    />
  </svg>
);

const DEVICE_GLYPH = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export default function CloudVsDirect() {
  const reduced = useReducedMotion();
  const narrow = useNarrowViewport();
  const [phase, setPhase] = useState(reduced ? 5 : 0);

  useEffect(() => {
    if (reduced) {
      setPhase(5); // resting state: both paths shown
      return;
    }
    // 6-beat loop, ~900ms each => ~5.4s cycle.
    const t = setInterval(() => setPhase((p) => (p + 1) % 6), 900);
    return () => clearInterval(t);
  }, [reduced]);

  // resting "5" shows everything settled (copy + direct beam lit).
  const resting = phase === 5;
  const upActive = resting || phase === 1;
  const storedVisible = resting || phase >= 2;
  const downActive = resting || phase === 3;
  const directActive = resting || phase >= 4;

  return (
    <DiagramFrame caption="FIG 01 · CLOUD VS DIRECT" tone="amb">
      <div
        style={{
          display: "grid",
          // Phones: stack the CLOUD and DIRECT panels so each gets full width.
          gridTemplateColumns: narrow ? "1fr" : "1fr 1fr",
          gap: "1px",
          background: "rgba(239,233,218,.13)",
        }}
      >
        {/* ------------------------------------------------ CLOUD panel -- */}
        <Panel
          title="CLOUD"
          subtitle="two hops · a copy left behind"
          tone="amb"
          active={upActive || downActive}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {/* sender (top) */}
            <Endpoint
              label="sender"
              tone="amb"
              icon={DEVICE_GLYPH}
              minWidth={0}
              style={{ padding: "8px 14px" }}
            />

            {/* up-leg: sender -> cloud */}
            <VerticalLeg active={upActive} reduced={reduced} dir="up" />

            {/* cloud node + lingering STORED COPY badge */}
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: AMB,
                opacity: storedVisible ? 1 : 0.72,
                transition: "opacity .5s ease",
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                {CLOUD_GLYPH}
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: "9px",
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    color: MUTED,
                  }}
                >
                  server
                </span>
              </span>
              <span
                className="thy-anim"
                style={{
                  fontFamily: MONO,
                  fontSize: "8px",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: AMB,
                  border: `1px solid ${AMB}`,
                  background: "rgba(239,106,61,.12)",
                  padding: "3px 6px",
                  whiteSpace: "nowrap",
                  opacity: storedVisible ? 1 : 0,
                  transform: storedVisible ? "scale(1)" : "scale(.85)",
                  transition: "opacity .45s ease, transform .45s ease",
                  animation:
                    storedVisible && !reduced
                      ? "thyPulse 2.4s ease-in-out infinite"
                      : undefined,
                }}
              >
                ⬡ stored copy
              </span>
            </div>

            {/* down-leg: cloud -> receiver */}
            <VerticalLeg active={downActive} reduced={reduced} dir="down" />

            {/* receiver (bottom) */}
            <Endpoint
              label="receiver"
              tone="amb"
              icon={DEVICE_GLYPH}
              minWidth={0}
              style={{ padding: "8px 14px" }}
            />
            <CloudCaption phase={phase} resting={resting} />
          </div>
        </Panel>

        {/* ----------------------------------------------- DIRECT panel -- */}
        <Panel
          title="DIRECT"
          subtitle="one hop · no copy retained"
          tone="acc"
          active={directActive}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "14px",
              height: "100%",
            }}
          >
            <Endpoint
              label="sender"
              tone="acc"
              icon={DEVICE_GLYPH}
              minWidth={0}
              style={{ padding: "9px 14px" }}
            />
            <DirectBeam active={directActive} reduced={reduced} />
            <Endpoint
              label="receiver"
              tone="acc"
              icon={DEVICE_GLYPH}
              active={directActive && !reduced}
              minWidth={0}
              style={{ padding: "9px 14px" }}
            />
            <div
              style={{
                fontFamily: MONO,
                fontSize: "9.5px",
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: directActive ? ACC : MUTED,
                transition: "color .4s ease",
                marginTop: "2px",
              }}
            >
              edge to edge · no middleman
            </div>
          </div>
        </Panel>
      </div>
    </DiagramFrame>
  );
}

/* ---------------------------------------------------------------- pieces -- */

function Panel({
  title,
  subtitle,
  tone,
  active,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "acc" | "amb";
  active: boolean;
  children: ReactNode;
}) {
  const c = tone === "amb" ? AMB : ACC;
  return (
    <div
      style={{
        position: "relative",
        background: "#0e0d0a",
        padding: "18px 16px 20px",
        minHeight: 260,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "18px",
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: c,
            boxShadow: active ? `0 0 8px ${c}` : "none",
            transition: "box-shadow .4s ease",
          }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: ".18em",
            color: c,
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: "9px",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          {subtitle}
        </span>
      </div>
      {children}
    </div>
  );
}

/** One vertical leg of the cloud detour (sender->cloud or cloud->receiver),
 * with an amber token traveling down it while active. */
function VerticalLeg({
  active,
  reduced,
  dir,
}: {
  active: boolean;
  reduced: boolean;
  dir: "up" | "down";
}) {
  const trackStyle: CSSProperties = {
    position: "relative",
    width: "3px",
    height: "30px",
    background:
      "repeating-linear-gradient(180deg,rgba(239,106,61,.5) 0 5px,transparent 5px 12px)",
  };
  return (
    <div style={trackStyle}>
      {active ? (
        <span
          className={!reduced ? "thy-anim" : undefined}
          style={{
            position: "absolute",
            left: "50%",
            top: reduced ? "50%" : 0,
            transform: "translate(-50%,-50%)",
            animation: !reduced
              ? `cvdFall .85s ease-in-out ${dir === "up" ? "" : ""}forwards`
              : undefined,
          }}
        >
          <FileToken tone="amb" size={15} />
        </span>
      ) : null}
      <style>{`
        @keyframes cvdFall { 0%{top:-4px;opacity:.2} 20%{opacity:1} 100%{top:100%;opacity:1} }
      `}</style>
    </div>
  );
}

function CloudCaption({ phase, resting }: { phase: number; resting: boolean }) {
  let text = "uploading…";
  if (resting) text = "up, stored, then down";
  else if (phase === 1) text = "1 · climbing to server";
  else if (phase === 2) text = "2 · copy held on server";
  else if (phase === 3) text = "3 · descending to peer";
  else if (phase >= 4) text = "doubled distance, a copy left";
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: "9.5px",
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: AMB,
        marginTop: "4px",
        minHeight: "12px",
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

/** Direct panel's single horizontal beam with a token crossing once. */
function DirectBeam({ active, reduced }: { active: boolean; reduced: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "180px",
        height: "16px",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          top: "50%",
          height: "3px",
          transform: "translateY(-50%)",
          backgroundImage: active
            ? "repeating-linear-gradient(90deg,var(--acc) 0 7px,transparent 7px 18px)"
            : "repeating-linear-gradient(90deg,rgba(239,233,218,.16) 0 4px,transparent 4px 12px)",
          backgroundSize: "26px 100%",
          animation: active && !reduced ? "thyFlow .9s linear infinite" : undefined,
          WebkitMaskImage:
            "linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)",
          maskImage:
            "linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)",
          transition: "background .4s ease",
        }}
      />
      {active ? (
        <span
          style={{
            position: "absolute",
            top: "50%",
            left: reduced ? "50%" : 0,
            transform: "translate(-50%,-50%)",
            animation: !reduced ? "cvdCross 1.6s ease-in-out infinite" : undefined,
          }}
        >
          <FileToken tone="acc" size={16} />
        </span>
      ) : null}
      <style>{`
        @keyframes cvdCross { 0%{left:6%;opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{left:94%;opacity:0} }
      `}</style>
    </div>
  );
}
