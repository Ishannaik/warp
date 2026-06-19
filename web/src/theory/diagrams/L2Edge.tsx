import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "../../lib/useIsMobile";
import {
  ACC,
  AMB,
  BODY,
  BODY_COLOR,
  DISPLAY,
  INK,
  Label,
  MONO,
  MUTED,
  DiagramFrame,
  useInView,
  useReducedMotion,
} from "./primitives";

/**
 * L2Edge — diagram for L2 — not cacheable / edge egress.
 *
 * Contrasts two workloads through an edge node:
 *  - Cacheable (cheap): one origin fetch, then many cache HITs fan out; the
 *    hit counter climbs while cost-per-delivery collapses (a flat-cheap curve).
 *  - Wrap-style transfer (not cacheable): every request is a unique encrypted
 *    MISS; the egress meter climbs one-for-one (a linear curve).
 *
 * The two cost curves are drawn as SVG and animate their divergence.
 * Reduced-motion: both end states shown, HIT vs MISS labels, full curves.
 */

const STEPS = 8; /* deliveries simulated */

export default function L2Edge() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const animate = inView && !reduced;

  const [n, setN] = useState(reduced ? STEPS : 0);

  useEffect(() => {
    if (!animate) {
      setN(STEPS);
      return;
    }
    setN(0);
    let i = 0;
    let hold = 0; /* extra ticks to pause at the full state before resetting */
    const id = window.setInterval(() => {
      if (i >= STEPS) {
        hold += 1;
        if (hold >= 3) {
          i = 0;
          hold = 0;
          setN(0);
        }
        return;
      }
      i += 1;
      setN(i);
    }, 520);
    return () => window.clearInterval(id);
  }, [animate]);

  /* curve geometry: cumulative cost vs deliveries.
     cacheable -> ~flat (1 origin fetch + epsilon per hit)
     not cacheable -> linear (full egress every time) */
  const W = 100;
  const H = 46;
  const pad = 4;
  const x = (k: number) => pad + (k / STEPS) * (W - pad * 2);
  const cacheCost = (k: number) => 1 + k * 0.12; // 1 origin + tiny per hit
  const missCost = (k: number) => k * 1.0; // full egress each
  const maxCost = missCost(STEPS);
  const y = (cost: number) => H - pad - (cost / maxCost) * (H - pad * 2);

  const path = (fn: (k: number) => number, upto: number) => {
    let d = "";
    for (let k = 0; k <= STEPS; k += 1) {
      const visible = k <= upto;
      const cmd = k === 0 ? "M" : "L";
      const yy = visible ? y(fn(k)) : y(fn(upto));
      const xx = visible ? x(k) : x(upto);
      d += `${cmd}${xx.toFixed(2)} ${yy.toFixed(2)} `;
    }
    return d.trim();
  };

  /* small dots fanning out from an edge node (cache HITs vs unique MISS) */
  function FanRow({
    tone,
    kind,
    count,
  }: {
    tone: "acc" | "amb";
    kind: "HIT" | "MISS";
    count: number;
  }) {
    const c = tone === "acc" ? ACC : AMB;
    const rgb = tone === "acc" ? "83,96,255" : "239,106,61";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: ".12em",
            color: c,
            minWidth: 36,
          }}
        >
          {kind}
        </span>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
          {Array.from({ length: STEPS }).map((_, i) => {
            const on = i < count;
            return (
              <span
                key={i}
                style={{
                  width: 13,
                  height: 16,
                  border: `1px solid ${on ? c : "rgba(239,233,218,.16)"}`,
                  background: on
                    ? kind === "HIT"
                      ? `rgba(${rgb},.32)`
                      : `rgba(${rgb},.16)`
                    : "transparent",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all .3s ease",
                }}
              >
                {on && kind === "MISS" ? (
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      fontFamily: MONO,
                      fontSize: 7,
                      color: "rgba(239,233,218,.7)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      letterSpacing: "-.5px",
                    }}
                  >
                    {"⠿"}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <DiagramFrame caption="L2 · EDGE — CACHE HIT vs UNIQUE EGRESS" tone="amb">
      <div
        ref={ref}
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1.05fr .95fr",
          gap: isMobile ? 18 : 22,
          alignItems: "stretch",
        }}
      >
        {/* left: the two workloads fanning out from an edge node */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ marginBottom: 8 }}>
              <Label tone="acc">CACHEABLE · POPULAR FILE</Label>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                color: MUTED,
                marginBottom: 8,
              }}
            >
              1 origin fetch &rarr; many cache hits
            </div>
            <FanRow tone="acc" kind="HIT" count={n} />
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(239,233,218,.1)",
              paddingTop: 14,
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <Label tone="amb">WRAP-STYLE · PRIVATE TRANSFER</Label>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                color: MUTED,
                marginBottom: 8,
              }}
            >
              every request unique &amp; encrypted &rarr; cache miss
            </div>
            <FanRow tone="amb" kind="MISS" count={n} />
          </div>
        </div>

        {/* right: diverging cumulative-cost curves */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            border: "1px solid rgba(239,233,218,.12)",
            background: "rgba(14,13,10,.6)",
            padding: 14,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <Label tone="muted">CUMULATIVE COST PER DELIVERY</Label>
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            style={{ display: "block", overflow: "visible" }}
            aria-hidden
          >
            {/* axes */}
            <line
              x1={pad}
              y1={H - pad}
              x2={W - pad}
              y2={H - pad}
              stroke="rgba(239,233,218,.18)"
              strokeWidth="0.5"
            />
            <line
              x1={pad}
              y1={pad}
              x2={pad}
              y2={H - pad}
              stroke="rgba(239,233,218,.18)"
              strokeWidth="0.5"
            />
            {/* MISS curve (linear, amber) */}
            <path
              d={path(missCost, n)}
              fill="none"
              stroke={AMB}
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* HIT curve (flat, accent) */}
            <path
              d={path(cacheCost, n)}
              fill="none"
              stroke={ACC}
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* leading dots */}
            <circle cx={x(n)} cy={y(missCost(n))} r="1.6" fill={AMB} />
            <circle cx={x(n)} cy={y(cacheCost(n))} r="1.6" fill={ACC} />
          </svg>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 8,
              fontFamily: MONO,
              fontSize: 9,
              color: MUTED,
            }}
          >
            <span>deliveries &rarr;</span>
            <span style={{ color: AMB }}>egress: linear</span>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: "1px solid rgba(239,233,218,.1)",
          fontFamily: BODY,
          fontSize: 12.5,
          color: BODY_COLOR,
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: INK, fontFamily: DISPLAY, fontWeight: 600 }}>
          Hit rate zero.
        </span>{" "}
        A CDN amortizes <em>repeated</em> bytes — a private transfer is requested
        exactly once, so you pay full egress every time.
      </div>
    </DiagramFrame>
  );
}
