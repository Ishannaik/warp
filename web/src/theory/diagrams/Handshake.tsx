import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  DiagramFrame,
  Endpoint,
  Card,
  useReducedMotion,
  ACC,
  AMB,
  MONO,
  INK,
  MUTED,
  CARD,
  DIM,
} from "./primitives";

/**
 * Handshake — diagram for A3 — SDP/ICE signaling handshake.
 *
 * A timed three-actor sequence (Peer A · Signaling server · Peer B). Note cards
 * hop along the path in order:
 *   1. OFFER  : A -> server -> B   (mock m= / fingerprint lines)
 *   2. ANSWER : B -> server -> A
 *   3. ICE    : a trickle of host/srflx candidate chips bouncing both ways
 * Then the server dims and a DIRECT link snaps lit between A and B (callback to
 * the hero). The note cards visibly carry coordinates, never a file.
 *
 * Reduced-motion: final state — notes delivered, direct link lit, server dimmed.
 */

type Phase = "offer" | "answer" | "ice" | "connected";
const ORDER: Phase[] = ["offer", "answer", "ice", "connected"];
const DURATIONS: Record<Phase, number> = {
  offer: 2200,
  answer: 2200,
  ice: 2600,
  connected: 2600,
};

const DEVICE = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SWITCHBOARD = (
  <svg width="26" height="22" viewBox="0 0 28 24" fill="none" aria-hidden>
    <rect x="2" y="3" width="24" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="14" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="20" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.2" />
    <path d="M8 9.6V13M14 9.6V13M20 9.6V13M5 21h18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export default function Handshake() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduced ? "connected" : "offer");

  useEffect(() => {
    if (reduced) {
      setPhase("connected");
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = ORDER[i];
      timer = setTimeout(() => {
        i = (i + 1) % ORDER.length;
        setPhase(ORDER[i]);
        tick();
      }, DURATIONS[current]);
    };
    tick();
    return () => clearTimeout(timer);
  }, [reduced]);

  const connected = phase === "connected";
  const serverDim = connected;

  return (
    <DiagramFrame caption="FIG 03 · SDP / ICE HANDSHAKE" tone="acc">
      {/* signaling server (top center) */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
            opacity: serverDim ? 0.35 : 1,
            transition: "opacity .6s ease",
            color: serverDim ? MUTED : ACC,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              border: `1px dashed ${serverDim ? DIM : ACC}`,
              background: CARD,
              padding: "9px 14px",
              color: serverDim ? MUTED : ACC,
              transition: "border-color .6s ease, color .6s ease",
            }}
          >
            {SWITCHBOARD}
            <span
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                letterSpacing: ".14em",
                textTransform: "uppercase",
              }}
            >
              signaling server
            </span>
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: "8.5px",
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            {serverDim ? "introductions done — stepping aside" : "switchboard · relays notes only"}
          </span>
        </div>
      </div>

      {/* the two uplink legs (A->server, B->server) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          maxWidth: "440px",
          margin: "0 auto",
          gap: 0,
        }}
      >
        <UpLink side="left" dim={serverDim} reduced={reduced} />
        <UpLink side="right" dim={serverDim} reduced={reduced} />
      </div>

      {/* peers + direct channel between them */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: "12px",
          maxWidth: "520px",
          margin: "0 auto",
        }}
      >
        <Endpoint
          label="peer a"
          tone="acc"
          icon={DEVICE}
          active={connected && !reduced}
          minWidth={0}
          style={{ padding: "10px 14px" }}
        />

        {/* direct beam — lights only when connected */}
        <div style={{ position: "relative", textAlign: "center" }}>
          <div
            style={{
              height: "12px",
              backgroundImage: connected
                ? "repeating-linear-gradient(90deg,var(--acc) 0 7px,transparent 7px 18px)"
                : "repeating-linear-gradient(90deg,rgba(239,233,218,.14) 0 4px,transparent 4px 12px)",
              backgroundSize: "26px 100%",
              animation: connected && !reduced ? "thyFlow .9s linear infinite" : undefined,
              WebkitMaskImage:
                "linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)",
              maskImage:
                "linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)",
              transition: "background .5s ease",
            }}
          />
          <div
            style={{
              fontFamily: MONO,
              fontSize: "9px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: connected ? ACC : MUTED,
              marginTop: "7px",
              transition: "color .5s ease",
            }}
          >
            {connected ? "● direct · DTLS" : "no data path yet"}
          </div>
        </div>

        <Endpoint
          label="peer b"
          tone="acc"
          icon={DEVICE}
          active={connected && !reduced}
          minWidth={0}
          style={{ padding: "10px 14px" }}
        />
      </div>

      {/* the note in flight / final coordinates */}
      <div style={{ marginTop: "20px", minHeight: 96 }}>
        <NotePanel phase={phase} reduced={reduced} />
      </div>
    </DiagramFrame>
  );
}

/* ---------------------------------------------------------------- pieces -- */

/** A dashed uplink leg between a peer and the server, with a hopping note dot. */
function UpLink({
  side,
  dim,
  reduced,
}: {
  side: "left" | "right";
  dim: boolean;
  reduced: boolean;
}) {
  const lean = side === "left" ? "26deg" : "-26deg";
  return (
    <div
      style={{
        position: "relative",
        height: "40px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "1px",
          height: "100%",
          transform: `rotate(${lean})`,
          transformOrigin: "center",
          background:
            "repeating-linear-gradient(180deg,rgba(239,233,218,.3) 0 5px,transparent 5px 10px)",
          opacity: dim ? 0.2 : 0.8,
          transition: "opacity .6s ease",
        }}
      />
      {!reduced && !dim ? (
        <span
          className="thy-anim"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: ACC,
            boxShadow: `0 0 8px ${ACC}`,
            animation: "hsHop 1.4s ease-in-out infinite",
          }}
        />
      ) : null}
      <style>{`
        @keyframes hsHop { 0%{transform:translate(-50%,10px);opacity:0} 30%{opacity:1} 70%{opacity:1} 100%{transform:translate(-50%,-14px);opacity:0} }
      `}</style>
    </div>
  );
}

const PhaseMeta: Record<
  Phase,
  { tone: "acc" | "amb" | "neutral"; kicker: string; route: string }
> = {
  offer: { tone: "acc", kicker: "1 · SDP OFFER", route: "peer a → server → peer b" },
  answer: { tone: "acc", kicker: "2 · SDP ANSWER", route: "peer b → server → peer a" },
  ice: { tone: "acc", kicker: "3 · ICE CANDIDATES", route: "both ⇄ server · trickle" },
  connected: { tone: "acc", kicker: "✓ EXCHANGE COMPLETE", route: "peers connect directly — server done" },
};

function NotePanel({ phase, reduced }: { phase: Phase; reduced: boolean }) {
  const meta = PhaseMeta[phase];
  const mono: CSSProperties = {
    fontFamily: MONO,
    fontSize: "10.5px",
    lineHeight: 1.7,
    color: INK,
    whiteSpace: "nowrap",
  };

  let body: ReactNode;
  if (phase === "offer") {
    body = (
      <>
        <div style={mono}>v=0</div>
        <div style={mono}>m=application 9 UDP/DTLS/SCTP webrtc-datachannel</div>
        <div style={{ ...mono, color: MUTED }}>a=fingerprint:sha-256 7A:3F:…:E1</div>
        <div style={{ ...mono, color: MUTED }}>a=setup:actpass</div>
      </>
    );
  } else if (phase === "answer") {
    body = (
      <>
        <div style={mono}>v=0</div>
        <div style={mono}>m=application 9 UDP/DTLS/SCTP webrtc-datachannel</div>
        <div style={{ ...mono, color: MUTED }}>a=fingerprint:sha-256 9C:B2:…:4D</div>
        <div style={{ ...mono, color: MUTED }}>a=setup:active</div>
      </>
    );
  } else if (phase === "ice") {
    body = (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {[
          ["host", "192.168.1.24:51000"],
          ["host", "[fe80::1a2b]:51001"],
          ["srflx", "203.0.113.7:51001"],
          ["srflx", "203.0.113.7:51002"],
        ].map(([typ, addr], i) => (
          <span
            key={addr}
            className={!reduced ? "thy-anim" : undefined}
            style={{
              fontFamily: MONO,
              fontSize: "9px",
              letterSpacing: ".02em",
              color: INK,
              border: "1px solid rgba(83,96,255,.4)",
              background: "rgba(83,96,255,.1)",
              padding: "3px 7px",
              animation: !reduced ? `hsChip .5s ease both` : undefined,
              animationDelay: !reduced ? `${i * 0.18}s` : undefined,
            }}
          >
            <span style={{ color: ACC }}>{typ}</span>&nbsp;{addr}
          </span>
        ))}
        <style>{`@keyframes hsChip{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}`}</style>
      </div>
    );
  } else {
    body = (
      <div style={{ ...mono, color: ACC, whiteSpace: "normal" }}>
        offer + answer + candidates exchanged. The peers now talk directly,
        end-to-end encrypted — the server never saw a file.
      </div>
    );
  }

  return (
    <Card
      kicker={meta.kicker}
      tone={meta.tone}
      accentBar
      style={{
        overflowX: "auto",
        transition: "opacity .3s ease",
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: "8.5px",
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: phase === "connected" ? ACC : MUTED,
          marginBottom: "10px",
        }}
      >
        {meta.route}
      </div>
      {body}
      <div
        style={{
          marginTop: "12px",
          fontFamily: MONO,
          fontSize: "8.5px",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: AMB,
        }}
      >
        ↳ coordinates, never content
      </div>
    </Card>
  );
}
