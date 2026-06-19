import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  DiagramFrame,
  Figure,
  useReducedMotion,
  ACC,
  AMB,
  MONO,
  INK,
  MUTED,
  CARD,
} from "./primitives";

/**
 * NatStun — diagram for A4 — NAT + STUN (full-cone vs symmetric / CGNAT).
 *
 * Two stacked scenarios:
 *  - FULL-CONE / OPEN (accent, success): STUN returns ONE stable IP:port; the
 *    same mapping is reused, so a hole-punched DIRECT beam forms — the ball
 *    goes through the hole. The consistent port persists.
 *  - SYMMETRIC / CGNAT (amber, failure): the NAT assigns a DIFFERENT outbound
 *    port per destination (:51001 → :51002 → :51003). The address STUN learned
 *    no longer matches; the hole-punch fails (broken beam) — the ball hits the
 *    wall. Only a TURN relay could bridge it — and Wrap won't.
 *
 * Beneath: the ~10–20% "needs a relay" bar — the hinge into PART B.
 *
 * Reduced-motion: both scenarios shown at rest (open connected, symmetric
 * broken with mismatched ports labeled).
 */

const PORTS = [":51001", ":51002", ":51003"];

const DEVICE = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export default function NatStun() {
  const reduced = useReducedMotion();

  // Symmetric scenario cycles the outbound port to show it drifting per dest.
  const [portIdx, setPortIdx] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setPortIdx((i) => (i + 1) % PORTS.length), 1300);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <DiagramFrame caption="FIG 04 · NAT TRAVERSAL · STUN" tone="neutral">
      {/* ============================== FULL-CONE / OPEN — success ====== */}
      <Scenario
        tone="acc"
        title="full-cone / open"
        verdict="hole-punch succeeds"
        stunReply=":51001"
        stunNote="stable — same mapping reused"
        ball="through"
      >
        <Wall tone="acc" hole reduced={reduced} ball="through" />
      </Scenario>

      <Divider />

      {/* ============================== SYMMETRIC / CGNAT — failure ===== */}
      <Scenario
        tone="amb"
        title="symmetric / CGNAT"
        verdict="hole-punch fails"
        stunReply={reduced ? PORTS[0] : PORTS[portIdx]}
        stunNote="port changes per destination"
        ball="blocked"
      >
        <Wall tone="amb" hole={false} reduced={reduced} ball="blocked" />
      </Scenario>

      {/* ============================== the relay-share bar ============= */}
      <RelayBar />
    </DiagramFrame>
  );
}

/* ---------------------------------------------------------------- pieces -- */

function Scenario({
  tone,
  title,
  verdict,
  stunReply,
  stunNote,
  ball,
  children,
}: {
  tone: "acc" | "amb";
  title: string;
  verdict: string;
  stunReply: string;
  stunNote: string;
  ball: "through" | "blocked";
  children: ReactNode;
}) {
  const c = tone === "amb" ? AMB : ACC;
  return (
    <div>
      {/* header row: title + verdict */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c }} />
        <span
          style={{
            fontFamily: MONO,
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: c,
          }}
        >
          {title}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: MONO,
            fontSize: "9px",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: c,
            border: `1px solid ${c}`,
            padding: "2px 7px",
          }}
        >
          {ball === "through" ? "✓ " : "✕ "}
          {verdict}
        </span>
      </div>

      {/* STUN question/answer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: "9.5px",
            letterSpacing: ".06em",
            color: MUTED,
          }}
        >
          STUN: “what do I look like?” →
        </span>
        <Figure tone={tone}>
          203.0.113.9
          <span style={{ color: c, transition: "color .3s ease" }}>{stunReply}</span>
        </Figure>
        <span
          style={{
            fontFamily: MONO,
            fontSize: "8.5px",
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: tone === "amb" ? AMB : MUTED,
          }}
        >
          {stunNote}
        </span>
      </div>

      {/* the wall + ball metaphor */}
      {children}
    </div>
  );
}

/**
 * Wall — the NAT boundary. A full-cone NAT has a stable hole the ball passes
 * through (direct beam). A symmetric NAT shows no usable hole — the ball hits
 * the wall (broken beam).
 */
function Wall({
  tone,
  hole,
  ball,
  reduced,
}: {
  tone: "acc" | "amb";
  hole: boolean;
  ball: "through" | "blocked";
  reduced: boolean;
}) {
  const c = tone === "amb" ? AMB : ACC;
  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: "10px",
      }}
    >
      {/* peer A */}
      <PeerChip label="peer a" tone={tone} />

      {/* the channel between them, crossing the NAT wall */}
      <div style={{ position: "relative", height: "44px" }}>
        {/* beam */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            height: "3px",
            transform: "translateY(-50%)",
            backgroundImage:
              ball === "through"
                ? "repeating-linear-gradient(90deg,var(--acc) 0 7px,transparent 7px 18px)"
                : `repeating-linear-gradient(90deg,${AMB} 0 6px,transparent 6px 16px)`,
            backgroundSize: "26px 100%",
            animation:
              ball === "through" && !reduced ? "thyFlow .9s linear infinite" : undefined,
            opacity: ball === "through" ? 1 : 0.5,
            WebkitMaskImage:
              ball === "through"
                ? "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)"
                : "linear-gradient(90deg,transparent,#000 8%,#000 40%,transparent 46%,transparent 54%,#000 60%,#000 92%,transparent)",
            maskImage:
              ball === "through"
                ? "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)"
                : "linear-gradient(90deg,transparent,#000 8%,#000 40%,transparent 46%,transparent 54%,#000 60%,#000 92%,transparent)",
          }}
        />

        {/* NAT wall in the middle */}
        <div
          style={{
            position: "absolute",
            top: "2px",
            bottom: "2px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "10px",
            background: hole
              ? `repeating-linear-gradient(180deg,${ACC}55 0 6px,transparent 6px 12px)`
              : `repeating-linear-gradient(180deg,${AMB} 0 4px,${AMB}99 4px 8px)`,
            border: `1px solid ${hole ? ACC : AMB}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* hole punched through, or a solid blocked marker */}
          {hole ? (
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: CARD,
                border: `1px solid ${ACC}`,
              }}
            />
          ) : (
            <span
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                color: CARD,
                fontWeight: 700,
              }}
            >
              ✕
            </span>
          )}
        </div>

        {/* the ball / packet */}
        {!reduced ? (
          <span
            className="thy-anim"
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              width: "9px",
              height: "9px",
              borderRadius: "50%",
              background: c,
              boxShadow: `0 0 8px ${c}`,
              transform: "translate(-50%,-50%)",
              animation:
                ball === "through"
                  ? "nsThrough 1.8s ease-in-out infinite"
                  : "nsBlocked 1.5s ease-in-out infinite",
            }}
          />
        ) : (
          <span
            style={{
              position: "absolute",
              top: "50%",
              left: ball === "through" ? "82%" : "40%",
              width: "9px",
              height: "9px",
              borderRadius: "50%",
              background: c,
              transform: "translate(-50%,-50%)",
            }}
          />
        )}

        {/* NAT label */}
        <span
          style={{
            position: "absolute",
            bottom: "-3px",
            left: "50%",
            transform: "translateX(-50%) translateY(100%)",
            fontFamily: MONO,
            fontSize: "8px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: MUTED,
            whiteSpace: "nowrap",
          }}
        >
          NAT
        </span>
      </div>

      {/* peer B */}
      <PeerChip label="peer b" tone={tone} dimmed={ball === "blocked"} />

      <style>{`
        @keyframes nsThrough { 0%{left:0%;opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{left:100%;opacity:0} }
        @keyframes nsBlocked { 0%{left:0%;opacity:0} 18%{opacity:1} 46%{left:46%;opacity:1} 60%{left:40%} 100%{left:40%;opacity:0} }
      `}</style>
    </div>
  );
}

function PeerChip({
  label,
  tone,
  dimmed = false,
}: {
  label: string;
  tone: "acc" | "amb";
  dimmed?: boolean;
}) {
  const c = tone === "amb" ? AMB : ACC;
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "3px",
        border: `1px solid ${c}`,
        background: CARD,
        padding: "7px 10px",
        color: c,
        opacity: dimmed ? 0.5 : 1,
        transition: "opacity .4s ease",
      }}
    >
      {DEVICE}
      <span
        style={{
          fontFamily: MONO,
          fontSize: "8px",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: MUTED,
        }}
      >
        {label}
      </span>
    </span>
  );
}

function Divider() {
  return (
    <div
      style={{
        margin: "22px 0",
        borderTop: "1px solid rgba(239,233,218,.1)",
      }}
    />
  );
}

/**
 * RelayBar — the ~10–20% slice of networks where no direct path forms and only
 * a TURN relay could bridge them. The explicit hinge into PART B.
 */
function RelayBar() {
  const labelStyle: CSSProperties = {
    fontFamily: MONO,
    fontSize: "8.5px",
    letterSpacing: ".08em",
    textTransform: "uppercase",
  };
  return (
    <div
      style={{
        marginTop: "24px",
        paddingTop: "18px",
        borderTop: "1px solid rgba(239,233,218,.1)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "8px",
        }}
      >
        <span style={{ ...labelStyle, color: MUTED }}>networks in the wild</span>
        <span style={{ ...labelStyle, color: MUTED }}>~10–20% need a relay</span>
      </div>
      <div
        style={{
          display: "flex",
          height: "16px",
          border: "1px solid rgba(239,233,218,.16)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: "0 0 83%",
            background: "rgba(83,96,255,.28)",
            borderRight: "1px solid rgba(239,233,218,.16)",
            display: "flex",
            alignItems: "center",
            paddingLeft: "8px",
            fontFamily: MONO,
            fontSize: "8.5px",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: INK,
          }}
        >
          direct · free
        </div>
        <div
          style={{
            flex: "1 1 auto",
            background: "rgba(239,106,61,.32)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: MONO,
            fontSize: "8.5px",
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: INK,
          }}
        >
          TURN
        </div>
      </div>
      <div
        style={{
          marginTop: "10px",
          fontFamily: MONO,
          fontSize: "9px",
          lineHeight: 1.6,
          letterSpacing: ".02em",
          color: AMB,
        }}
      >
        only a TURN relay could bridge the amber case — a server that forwards
        every byte. Wrap won&rsquo;t. → continues in Part B.
      </div>
    </div>
  );
}
