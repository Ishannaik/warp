import { useEffect, useRef, useState } from "react";
import {
  ACC,
  AMB,
  BODY_COLOR,
  CARD,
  DARKER,
  DISPLAY,
  HAIR,
  INK,
  Label,
  MONO,
  MUTED,
  DiagramFrame,
  useInView,
  useReducedMotion,
} from "./primitives";

/**
 * DurableObject — A7 — the hibernating Cloudflare Durable Object.
 *
 * A lifecycle loop of one DO box across three states: DORMANT (dim, "z z z",
 * WebSocket stays connected, billed $0, slow breathing pulse) → AWAKE /
 * BROKERING (accent glow; two peer sockets attach; offer / answer / ICE notes
 * flicker through for a few seconds) → peers connect directly → back to DORMANT.
 * The brokering window is deliberately brief relative to the long dormant rest.
 * A contrast chip notes that a relay, by contrast, can never sleep.
 *
 * Self-contained · CSS/SVG only · reduced-motion safe (awake state, with a
 * static "hibernates when idle" note — no flicker).
 */

type Stage = "dormant" | "waking" | "brokering" | "connected";

// Durations chosen so DORMANT visibly dominates the cycle.
const SEQUENCE: { stage: Stage; ms: number }[] = [
  { stage: "dormant", ms: 3200 },
  { stage: "waking", ms: 650 },
  { stage: "brokering", ms: 2600 },
  { stage: "connected", ms: 1100 },
];

const NOTES = ["OFFER", "ANSWER", "ICE", "ICE"];

export default function DurableObject() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const animate = inView && !reduced;

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!animate) return;
    setIdx(0);
    let i = 0;
    let timer: number;
    const advance = () => {
      timer = window.setTimeout(() => {
        i = (i + 1) % SEQUENCE.length;
        setIdx(i);
        advance();
      }, SEQUENCE[i].ms);
    };
    advance();
    return () => window.clearTimeout(timer);
  }, [animate]);

  // Under reduced-motion we present the brokering (awake) frame as the static state.
  const stage: Stage = animate ? SEQUENCE[idx].stage : "brokering";

  const awake = stage === "waking" || stage === "brokering";
  const dormant = stage === "dormant";
  const connected = stage === "connected";

  const stageMeta: Record<Stage, { label: string; tone: "acc" | "amb" | "muted" }> =
    {
      dormant: { label: "DORMANT · HIBERNATING", tone: "muted" },
      waking: { label: "WAKING", tone: "acc" },
      brokering: { label: "AWAKE · BROKERING", tone: "acc" },
      connected: { label: "PEERS DIRECT · SLEEPING", tone: "acc" },
    };
  const meta = stageMeta[stage];

  return (
    <div ref={ref}>
      <DiagramFrame
        caption="FIG 07 · HIBERNATING DURABLE OBJECT"
        tone={dormant ? "neutral" : "acc"}
      >
        {/* stage label + billing chip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: MONO,
              fontSize: "10.5px",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: meta.tone === "muted" ? MUTED : ACC,
              transition: "color .4s ease",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: awake || connected ? ACC : MUTED,
                boxShadow: awake ? `0 0 9px ${ACC}` : "none",
                transition: "all .4s ease",
              }}
            />
            {meta.label}
          </span>

          <span
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: ".06em",
              color: dormant ? ACC : BODY_COLOR,
              border: `1px solid ${
                dormant ? ACC : "rgba(239,233,218,.16)"
              }`,
              background: dormant ? "rgba(83,96,255,.1)" : "transparent",
              padding: "3px 9px",
              transition: "all .4s ease",
            }}
          >
            {dormant ? "billed $0 while idle" : connected ? "spinning down" : "active a few seconds"}
          </span>
        </div>

        {/* the topology: Peer A — [DO] — Peer B */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(6px,2vw,16px)",
          }}
        >
          <Peer
            label="PEER A"
            socketLive={awake || connected}
            align="right"
          />

          {/* the link A↔DO — dashed signaling */}
          <SignalLink active={awake} animate={animate} />

          {/* ----------------------------------------- the Durable Object -- */}
          <DoBox stage={stage} animate={animate} />

          <SignalLink active={awake} animate={animate} />

          <Peer label="PEER B" socketLive={awake || connected} align="left" />
        </div>

        {/* direct peer↔peer channel that lights once connected */}
        <div
          style={{
            marginTop: 14,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <DirectChannel on={connected} animate={animate} />
        </div>

        {/* contrast chip: a relay cannot sleep */}
        <div
          style={{
            marginTop: 8,
            paddingTop: 14,
            borderTop: HAIR,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: ".04em",
              color: ACC,
            }}
          >
            <Dot color={ACC} />
            this server sees notes for seconds, then sleeps
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: ".04em",
              color: AMB,
              marginLeft: "auto",
              border: `1px solid ${AMB}`,
              background: "rgba(239,106,61,.08)",
              padding: "4px 10px",
            }}
          >
            <Dot color={AMB} />
            a relay cannot sleep — it bills every byte
          </span>
        </div>
      </DiagramFrame>
    </div>
  );
}

/* ============================================================ sub-parts == */

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        flex: "0 0 auto",
      }}
    />
  );
}

function Peer({
  label,
  socketLive,
  align,
}: {
  label: string;
  socketLive: boolean;
  align: "left" | "right";
}) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: align === "left" ? "flex-start" : "flex-end",
        gap: 6,
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          border: `1px solid ${socketLive ? ACC : "rgba(239,233,218,.18)"}`,
          background: socketLive ? "rgba(83,96,255,.1)" : CARD,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all .4s ease",
        }}
      >
        {/* monitor glyph */}
        <span
          style={{
            width: 28,
            height: 18,
            border: `1px solid ${socketLive ? ACC : BODY_COLOR}`,
            transition: "border-color .4s ease",
          }}
        />
      </div>
      <Label tone={socketLive ? "acc" : "muted"}>{label}</Label>
    </div>
  );
}

/** Dashed signaling link between a peer and the DO; flows when DO is awake. */
function SignalLink({ active, animate }: { active: boolean; animate: boolean }) {
  return (
    <div
      style={{
        flex: "1 1 30px",
        minWidth: 24,
        height: 14,
        position: "relative",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        className={animate && active ? "thy-anim" : undefined}
        style={{
          width: "100%",
          height: active ? 4 : 2,
          background: active
            ? `repeating-linear-gradient(90deg,${ACC} 0 6px,transparent 6px 14px)`
            : `repeating-linear-gradient(90deg,rgba(239,233,218,.2) 0 4px,transparent 4px 12px)`,
          backgroundSize: "20px 100%",
          animation:
            animate && active ? "thyFlow .8s linear infinite" : undefined,
          transition: "height .3s ease",
          WebkitMaskImage:
            "linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent)",
          maskImage:
            "linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent)",
        }}
      />
    </div>
  );
}

/** The Durable Object box: glows + brokers when awake, breathes + "z z z" when dormant. */
function DoBox({ stage, animate }: { stage: Stage; animate: boolean }) {
  const awake = stage === "waking" || stage === "brokering";
  const dormant = stage === "dormant";
  const brokering = stage === "brokering";

  return (
    <div
      style={{
        flex: "0 0 auto",
        position: "relative",
        width: "clamp(116px,34vw,150px)",
        minHeight: 110,
        border: `1px solid ${awake ? ACC : "rgba(239,233,218,.18)"}`,
        background: awake
          ? "rgba(83,96,255,.08)"
          : DARKER,
        boxShadow: awake ? `0 0 26px rgba(83,96,255,.32)` : "none",
        transition: "all .5s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "12px 10px",
        overflow: "hidden",
      }}
    >
      {/* breathing dormant glow */}
      {dormant ? (
        <span
          className={animate ? "thy-anim" : undefined}
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 50%,rgba(83,96,255,.1),transparent 70%)",
            animation: animate ? "thyPulse 3.4s ease-in-out infinite" : "none",
            opacity: 0.6,
          }}
        />
      ) : null}

      {/* title */}
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: "13px",
          color: awake ? INK : BODY_COLOR,
          textAlign: "center",
          lineHeight: 1.15,
          transition: "color .4s ease",
          zIndex: 1,
        }}
      >
        Durable
        <br />
        Object
      </div>

      {/* state glyph zone */}
      <div
        style={{
          position: "relative",
          height: 34,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
        }}
      >
        {dormant ? <Zzz animate={animate} /> : null}
        {brokering ? <BrokerNotes animate={animate} /> : null}
        {stage === "waking" ? (
          <span
            style={{
              fontFamily: MONO,
              fontSize: "9px",
              letterSpacing: ".18em",
              color: ACC,
            }}
          >
            WAKING…
          </span>
        ) : null}
        {stage === "connected" ? (
          <span
            style={{
              fontFamily: MONO,
              fontSize: "9px",
              letterSpacing: ".12em",
              color: ACC,
            }}
          >
            handoff ✓
          </span>
        ) : null}
      </div>

      {/* footer state line */}
      <div
        style={{
          fontFamily: MONO,
          fontSize: "8.5px",
          letterSpacing: ".06em",
          color: dormant ? MUTED : ACC,
          zIndex: 1,
          transition: "color .4s ease",
          textAlign: "center",
        }}
      >
        {dormant ? "evicted · WS kept open" : "relaying notes"}
      </div>
    </div>
  );
}

/** Floating "z z z" sleep glyph for the dormant state. */
function Zzz({ animate }: { animate: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 4,
        color: MUTED,
        fontFamily: DISPLAY,
        fontWeight: 700,
      }}
      aria-hidden
    >
      {[14, 18, 23].map((size, i) => (
        <span
          key={size}
          className={animate ? "thy-anim" : undefined}
          style={{
            fontSize: size,
            lineHeight: 1,
            opacity: 0.5,
            animation: animate
              ? `thyZ 2.8s ease-in-out ${i * 0.35}s infinite`
              : "none",
          }}
        >
          z
        </span>
      ))}
      <style>{`
        @keyframes thyZ {
          0%, 100% { opacity: .25; transform: translateY(0); }
          50% { opacity: .7; transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

/** Offer / answer / ICE note chips flickering through while brokering. */
function BrokerNotes({ animate }: { animate: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {NOTES.map((n, i) => (
        <span
          key={i}
          className={animate ? "thy-anim" : undefined}
          style={{
            fontFamily: MONO,
            fontSize: "7.5px",
            letterSpacing: ".08em",
            color: ACC,
            border: `1px solid ${ACC}`,
            background: "rgba(83,96,255,.16)",
            padding: "2px 4px",
            animation: animate
              ? `thyNoteFlick 1.3s ease-in-out ${i * 0.32}s infinite`
              : "none",
          }}
        >
          {n}
        </span>
      ))}
      <style>{`
        @keyframes thyNoteFlick {
          0%, 100% { opacity: .35; transform: translateY(2px); }
          40%, 60% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** The direct peer↔peer DTLS channel that lights once the DO hands off. */
function DirectChannel({ on, animate }: { on: boolean; animate: boolean }) {
  return (
    <div
      style={{
        width: "min(70%, 360px)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        opacity: on ? 1 : 0,
        transition: "opacity .5s ease",
      }}
    >
      <Label tone="acc" style={{ flex: "0 0 auto" }}>
        DIRECT
      </Label>
      <div
        className={animate && on ? "thy-anim" : undefined}
        style={{
          flex: 1,
          height: 6,
          background: `repeating-linear-gradient(90deg,${ACC} 0 7px,transparent 7px 20px)`,
          backgroundSize: "32px 100%",
          animation: animate && on ? "thyFlow .9s linear infinite" : undefined,
          WebkitMaskImage:
            "linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)",
          maskImage:
            "linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)",
        }}
      />
      <span
        style={{
          flex: "0 0 auto",
          fontFamily: MONO,
          fontSize: "8.5px",
          color: BODY_COLOR,
          letterSpacing: ".06em",
        }}
      >
        DTLS · edge to edge
      </span>
    </div>
  );
}
