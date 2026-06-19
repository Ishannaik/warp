import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "../../lib/useIsMobile";
import {
  AMB,
  BODY,
  BODY_COLOR,
  DISPLAY,
  Endpoint,
  Figure,
  INK,
  Label,
  MONO,
  MUTED,
  DiagramFrame,
  useInView,
  useReducedMotion,
} from "./primitives";

/**
 * L1Turn — diagram for L1 — TURN relay.
 *
 * Reprises A1's cloud shape, but now framed as cost. A file token climbs to a
 * TURN relay (ingress) and descends to the peer (egress); the relay carries an
 * ingress + egress counter that visibly doubles — 4 GB in / 4 GB out = 8 GB
 * billed — and a per-byte meter that ticks up. Amber, slightly tense pacing.
 *
 * Reduced-motion: static doubled-counter end state.
 */

const TOTAL = 4; /* GB transferred */

export default function L1Turn() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const animate = inView && !reduced;

  /* progress 0..1 of the in-leg, then the out-leg. We loop a 2-phase cycle. */
  const [ingress, setIngress] = useState(reduced ? TOTAL : 0);
  const [egress, setEgress] = useState(reduced ? TOTAL : 0);
  const [phase, setPhase] = useState<"in" | "out" | "rest">(
    reduced ? "rest" : "in",
  );

  useEffect(() => {
    if (!animate) {
      setIngress(TOTAL);
      setEgress(TOTAL);
      setPhase("rest");
      return;
    }
    let raf = 0;
    let start = performance.now();
    let stage: "in" | "out" | "rest" = "in";
    setIngress(0);
    setEgress(0);
    setPhase("in");

    const IN_MS = 2200;
    const OUT_MS = 2200;
    const REST_MS = 1400;

    const tick = (now: number) => {
      const dt = now - start;
      if (stage === "in") {
        const p = Math.min(1, dt / IN_MS);
        setIngress(p * TOTAL);
        if (p >= 1) {
          stage = "out";
          setPhase("out");
          start = now;
        }
      } else if (stage === "out") {
        const p = Math.min(1, dt / OUT_MS);
        setEgress(p * TOTAL);
        if (p >= 1) {
          stage = "rest";
          setPhase("rest");
          start = now;
        }
      } else {
        if (dt >= REST_MS) {
          stage = "in";
          setPhase("in");
          setIngress(0);
          setEgress(0);
          start = now;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  const billed = ingress + egress;
  const fmt = (n: number) => `${n.toFixed(2)} GB`;

  /* a vertical leg of the cloud path with a travelling token */
  function Leg({
    active,
    done,
    dir,
  }: {
    active: boolean;
    done: boolean;
    dir: "up" | "down";
  }) {
    const lit = active || done;
    return (
      <div
        style={{
          position: "relative",
          width: 14,
          height: isMobile ? 52 : 64,
        }}
      >
        <div
          className={active ? "thy-anim" : undefined}
          style={{
            position: "absolute",
            inset: 0,
            margin: "0 auto",
            width: 12,
            background: lit
              ? "repeating-linear-gradient(180deg,rgba(239,106,61,.85) 0 6px,transparent 6px 16px)"
              : "repeating-linear-gradient(180deg,rgba(239,233,218,.18) 0 4px,transparent 4px 12px)",
            backgroundSize: "100% 22px",
            animation: active
              ? `thyFlow 0.7s linear infinite ${dir === "down" ? "reverse" : ""}`
              : undefined,
            opacity: lit ? 1 : 0.5,
            WebkitMaskImage:
              "linear-gradient(180deg,transparent,#000 16%,#000 84%,transparent)",
            maskImage:
              "linear-gradient(180deg,transparent,#000 16%,#000 84%,transparent)",
          }}
        />
        {active ? (
          <span
            className="thy-anim"
            style={{
              position: "absolute",
              left: "50%",
              width: 13,
              height: 17,
              marginLeft: -6.5,
              border: `1px solid ${AMB}`,
              background: "rgba(239,106,61,.3)",
              animation: `${dir === "up" ? "l1up" : "l1down"} 2.2s linear infinite`,
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <DiagramFrame caption="L1 · TURN RELAY — EVERY BYTE, TWICE" tone="amb">
      <div ref={ref}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: isMobile ? 4 : 14,
          }}
        >
          {/* PEER A */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Endpoint
              label="PEER A"
              name="sender"
              tone="amb"
              minWidth={isMobile ? 0 : 116}
              fluid={isMobile}
            />
          </div>

          {/* up-leg */}
          <Leg active={phase === "in"} done={ingress >= TOTAL} dir="up" />

          {/* TURN relay box with the doubling counter */}
          <div
            style={{
              border: `1px solid ${AMB}`,
              background: "rgba(239,106,61,.07)",
              padding: isMobile ? "12px 10px" : "14px 16px",
              textAlign: "center",
              minWidth: isMobile ? 92 : 150,
              boxShadow:
                phase !== "rest" && animate
                  ? "0 0 22px rgba(239,106,61,.25)"
                  : "none",
              transition: "box-shadow .4s ease",
            }}
          >
            <Label tone="amb">TURN RELAY</Label>
            <div
              style={{
                marginTop: 10,
                display: "grid",
                gap: 6,
                fontFamily: MONO,
                fontSize: isMobile ? 10 : 11,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  color: phase === "in" ? INK : BODY_COLOR,
                }}
              >
                <span style={{ color: MUTED }}>in</span>
                <span style={{ color: AMB }}>{fmt(ingress)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  color: phase === "out" ? INK : BODY_COLOR,
                }}
              >
                <span style={{ color: MUTED }}>out</span>
                <span style={{ color: AMB }}>{fmt(egress)}</span>
              </div>
              <div
                style={{
                  marginTop: 4,
                  paddingTop: 6,
                  borderTop: "1px solid rgba(239,106,61,.3)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  fontWeight: 700,
                }}
              >
                <span style={{ color: MUTED }}>billed</span>
                <span style={{ color: AMB }}>{fmt(billed)}</span>
              </div>
            </div>
          </div>

          {/* down-leg */}
          <Leg active={phase === "out"} done={egress >= TOTAL} dir="down" />

          {/* PEER B */}
          <Endpoint
            label="PEER B"
            name="receiver"
            tone="amb"
            minWidth={isMobile ? 0 : 116}
            fluid={isMobile}
          />
        </div>

        {/* per-byte meter / readout */}
        <div
          style={{
            marginTop: 22,
            paddingTop: 16,
            borderTop: "1px solid rgba(239,233,218,.1)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: BODY,
              fontSize: 12.5,
              color: BODY_COLOR,
              maxWidth: 360,
              lineHeight: 1.5,
            }}
          >
            <span style={{ color: INK, fontFamily: DISPLAY, fontWeight: 600 }}>
              Every byte in is a byte out.
            </span>{" "}
            The relay receives the whole file and re-sends it — counted twice.
          </span>
          <Figure tone="amb" style={{ fontSize: 13, padding: "4px 10px" }}>
            4 GB &rarr; 8 GB billed
          </Figure>
        </div>
      </div>

      <style>{`
        @keyframes l1up {
          0% { bottom: 2%; opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: 1; }
          100% { bottom: 86%; opacity: 0; }
        }
        @keyframes l1down {
          0% { top: 2%; opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: 1; }
          100% { top: 86%; opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="l1up"], [style*="l1down"] { animation: none !important; }
        }
      `}</style>
    </DiagramFrame>
  );
}
