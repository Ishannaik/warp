import { useEffect, useRef, useState } from "react";
import {
  ACC,
  AMB,
  BODY_COLOR,
  CARD,
  DARKER,
  DIM,
  DISPLAY,
  HAIR,
  HAIR_STRONG,
  INK,
  Label,
  MONO,
  MUTED,
  DiagramFrame,
  useInView,
  useReducedMotion,
} from "./primitives";

/**
 * Chunking — A5 — 16 KB chunking + backpressure.
 *
 * A 4.2 GB FILE block on the left is sliced into a marching train of 16 KB chunk
 * cells that stream across a channel into a "reassembles" block on the right.
 * The centerpiece is the backpressure throttle: the channel's send buffer is a
 * vertical water-tank meter with HIGH-WATER / LOW-WATER marks. As chunks pour in
 * the buffer rises; crossing HIGH slams the valve shut and the sender PAUSES;
 * draining below LOW reopens the valve and the sender RESUMES. The cycle loops.
 *
 * Self-contained · CSS/SVG only · reduced-motion safe (static partial-fill snapshot).
 */

type Phase = "flowing" | "paused";

const HIGH = 0.86; // high-water threshold (fraction of tank)
const LOW = 0.34; // low-water threshold
const TICK_MS = 90; // simulation step

export default function Chunking() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const animate = inView && !reduced;

  // Buffer fill 0..1, current throttle phase, and a rolling chunk counter.
  const [fill, setFill] = useState(0.18);
  const [phase, setPhase] = useState<Phase>("flowing");
  const [sent, setSent] = useState(18402);

  // Refs hold live values so the interval closure stays correct without resets.
  const fillRef = useRef(fill);
  const phaseRef = useRef<Phase>(phase);
  fillRef.current = fill;
  phaseRef.current = phase;

  useEffect(() => {
    if (!animate) return;
    const id = window.setInterval(() => {
      const f = fillRef.current;
      const p = phaseRef.current;
      // Network always drains at a steady rate.
      const drain = 0.045;
      // Sender produces fast while flowing; nothing while paused.
      const produce = p === "flowing" ? 0.11 : 0;
      let next = f + produce - drain;
      if (next > 1) next = 1;
      if (next < 0) next = 0;

      // Throttle state machine.
      if (p === "flowing" && next >= HIGH) setPhase("paused");
      else if (p === "paused" && next <= LOW) setPhase("flowing");

      // Count chunks emitted whenever we're producing (16 KB each).
      if (p === "flowing") setSent((s) => s + 7);
      setFill(next);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [animate]);

  // Static reduced-motion snapshot: partway full, flowing.
  const shownFill = animate ? fill : 0.52;
  const shownPhase: Phase = animate ? phase : "flowing";
  const valveOpen = shownPhase === "flowing";

  const accentNow = valveOpen ? ACC : AMB;

  return (
    <div ref={ref}>
      <DiagramFrame
        caption="FIG 05 · CHUNKING + BACKPRESSURE"
        tone={valveOpen ? "acc" : "amb"}
      >
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: "clamp(8px,2vw,18px)",
            flexWrap: "wrap",
          }}
        >
          {/* ---------------------------------------------- FILE (source) -- */}
          <SourceFile />

          {/* ---------------------------------------------- chunk channel -- */}
          <div
            style={{
              flex: "1 1 220px",
              minWidth: 200,
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
                <Label tone="muted">16 KB chunks</Label>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: "9px",
                    color: MUTED,
                    letterSpacing: ".04em",
                  }}
                >
                  ·{" "}
                  {(animate ? sent : 18402).toLocaleString("en-US")} sent
                </span>
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "10px",
                  letterSpacing: ".06em",
                  color: valveOpen ? ACC : AMB,
                  transition: "color .25s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: accentNow,
                    boxShadow: `0 0 8px ${accentNow}`,
                    transition: "background .25s ease",
                  }}
                />
                {valveOpen ? "SENDING" : "PAUSED"}
              </span>
            </div>

            <ChunkTrack flowing={valveOpen} animate={animate} />

            <div
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                letterSpacing: ".04em",
                color: MUTED,
                textAlign: "center",
              }}
            >
              sent only while the buffer has room
            </div>
          </div>

          {/* ------------------------------------------------ send buffer -- */}
          <BufferTank fill={shownFill} valveOpen={valveOpen} />

          {/* ----------------------------------------------- PEER B (dest) -- */}
          <DestPeer animate={animate} />
        </div>

        {/* legend strip */}
        <div
          style={{
            marginTop: "16px",
            paddingTop: "14px",
            borderTop: HAIR,
            display: "flex",
            flexWrap: "wrap",
            gap: "10px 20px",
            alignItems: "center",
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: ".04em",
            color: BODY_COLOR,
          }}
        >
          <LegendItem color={AMB} text="HIGH-WATER → valve closes, sender pauses" />
          <LegendItem color={ACC} text="LOW-WATER → valve reopens, sender resumes" />
          <span style={{ color: MUTED, marginLeft: "auto" }}>
            no size cap · memory stays flat
          </span>
        </div>
      </DiagramFrame>
    </div>
  );
}

/* ============================================================ sub-parts == */

function SourceFile() {
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 64,
          height: 80,
          border: `1px solid ${ACC}`,
          background: `linear-gradient(180deg,rgba(83,96,255,.22),rgba(83,96,255,.08))`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // dog-ear corner
          clipPath:
            "polygon(0 0, 72% 0, 100% 22%, 100% 100%, 0 100%)",
        }}
      >
        {/* sliced grid lines hinting at chunking */}
        {[0.28, 0.46, 0.64, 0.82].map((t) => (
          <span
            key={t}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${t * 100}%`,
              height: 1,
              background: "rgba(239,233,218,.16)",
            }}
          />
        ))}
        <span
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: "15px",
            color: INK,
            zIndex: 1,
          }}
        >
          4.2
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: "9px",
            letterSpacing: ".1em",
            color: BODY_COLOR,
            zIndex: 1,
          }}
        >
          GB
        </span>
      </div>
      <Label tone="acc">FILE</Label>
    </div>
  );
}

/** The marching train of 16 KB chunk cells crossing the channel. */
function ChunkTrack({ flowing, animate }: { flowing: boolean; animate: boolean }) {
  const cells = 9;
  return (
    <div
      style={{
        position: "relative",
        height: 30,
        border: HAIR,
        background: DARKER,
        overflow: "hidden",
      }}
    >
      {/* baseline rail */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 1,
          background: "rgba(239,233,218,.08)",
        }}
      />
      <div
        className={animate && flowing ? "thy-anim" : undefined}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingLeft: 6,
          animation:
            animate && flowing ? "thyChunkMarch 1.05s linear infinite" : "none",
          opacity: flowing ? 1 : 0.4,
          transition: "opacity .3s ease",
          // fade the leading edge so cells appear/vanish cleanly
          WebkitMaskImage:
            "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)",
          maskImage:
            "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)",
        }}
      >
        {Array.from({ length: cells * 2 }).map((_, i) => (
          <ChunkCell key={i} dim={!flowing} />
        ))}
      </div>
      {/* keyframe local to this diagram */}
      <style>{`
        @keyframes thyChunkMarch {
          to { transform: translateX(-44px); }
        }
      `}</style>
    </div>
  );
}

function ChunkCell({ dim }: { dim: boolean }) {
  return (
    <span
      style={{
        flex: "0 0 auto",
        width: 22,
        height: 16,
        border: `1px solid ${dim ? DIM : ACC}`,
        background: dim ? "rgba(239,233,218,.04)" : "rgba(83,96,255,.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: MONO,
        fontSize: "6px",
        letterSpacing: ".02em",
        color: dim ? MUTED : INK,
        transition: "all .3s ease",
      }}
    >
      16K
    </span>
  );
}

/** The send buffer as a vertical water tank with high/low-water marks + valve. */
function BufferTank({ fill, valveOpen }: { fill: number; valveOpen: boolean }) {
  const pct = Math.round(fill * 100);
  const danger = fill >= HIGH - 0.04;
  const fillColor = danger ? AMB : ACC;
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
      }}
    >
      <Label tone="muted">bufferedAmount</Label>
      <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
        {/* the tank */}
        <div
          style={{
            position: "relative",
            width: 52,
            height: 120,
            border: HAIR_STRONG,
            background: DARKER,
            overflow: "hidden",
          }}
        >
          {/* liquid fill */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: `${pct}%`,
              background: `linear-gradient(180deg,${fillColor},rgba(${
                danger ? "239,106,61" : "83,96,255"
              },.35))`,
              transition: "height .12s linear, background .25s ease",
            }}
          >
            {/* surface shimmer */}
            <span
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: "rgba(239,233,218,.5)",
              }}
            />
          </div>
          {/* HIGH-WATER line */}
          <WaterMark frac={HIGH} color={AMB} label="HIGH" />
          {/* LOW-WATER line */}
          <WaterMark frac={LOW} color={ACC} label="LOW" />
        </div>

        {/* valve indicator */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
          title={valveOpen ? "valve open" : "valve closed"}
        >
          <Valve open={valveOpen} />
          <span
            style={{
              fontFamily: MONO,
              fontSize: "8px",
              letterSpacing: ".08em",
              color: valveOpen ? ACC : AMB,
              transition: "color .25s ease",
              writingMode: "vertical-rl",
            }}
          >
            {valveOpen ? "OPEN" : "SHUT"}
          </span>
        </div>
      </div>
      <span
        style={{
          fontFamily: MONO,
          fontSize: "10px",
          color: fillColor,
          transition: "color .25s ease",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

function WaterMark({
  frac,
  color,
  label,
}: {
  frac: number;
  color: string;
  label: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: `${frac * 100}%`,
        height: 0,
        borderTop: `1px dashed ${color}`,
        display: "flex",
        alignItems: "center",
      }}
    >
      <span
        style={{
          position: "absolute",
          right: 2,
          top: -8,
          fontFamily: MONO,
          fontSize: "6.5px",
          letterSpacing: ".08em",
          color,
          background: "rgba(14,13,10,.7)",
          padding: "0 2px",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Tiny valve glyph — two trapezoids meeting; the gate slides shut when closed. */
function Valve({ open }: { open: boolean }) {
  const c = open ? ACC : AMB;
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      {/* body */}
      <path
        d="M3 5 L13 13 L3 21 Z"
        fill={`${open ? "rgba(83,96,255,.25)" : "rgba(239,106,61,.25)"}`}
        stroke={c}
        strokeWidth="1.2"
      />
      <path
        d="M23 5 L13 13 L23 21 Z"
        fill={`${open ? "rgba(83,96,255,.25)" : "rgba(239,106,61,.25)"}`}
        stroke={c}
        strokeWidth="1.2"
      />
      {/* gate stem — drops to seal when closed */}
      <line
        x1="13"
        y1="2"
        x2="13"
        y2={open ? "7" : "13"}
        stroke={c}
        strokeWidth="1.6"
        style={{ transition: "all .25s ease" }}
      />
    </svg>
  );
}

function DestPeer({ animate }: { animate: boolean }) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 80,
          border: HAIR_STRONG,
          background: CARD,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          padding: 4,
        }}
      >
        {/* reassembling stack — bars filling */}
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={animate ? "thy-anim" : undefined}
            style={{
              width: "78%",
              height: 8,
              border: `1px solid rgba(83,96,255,.5)`,
              background: "rgba(83,96,255,.18)",
              animation: animate
                ? `thyFade .6s ease ${i * 0.18}s both, thyPulse 2.4s ease ${
                    i * 0.18
                  }s infinite`
                : "none",
            }}
          />
        ))}
      </div>
      <Label tone="acc">PEER B</Label>
      <span
        style={{
          fontFamily: MONO,
          fontSize: "9px",
          color: MUTED,
          letterSpacing: ".06em",
        }}
      >
        reassembles
      </span>
    </div>
  );
}

function LegendItem({ color, text }: { color: string; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span
        style={{
          width: 14,
          height: 0,
          borderTop: `1px dashed ${color}`,
          display: "inline-block",
        }}
      />
      {text}
    </span>
  );
}
