import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "../../lib/useIsMobile";
import {
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
 * L3Transit — diagram for L3 — paid transit & peering.
 *
 * A small map of distinct Autonomous Systems (network clouds). A packet
 * traverses several ASes; each boundary it crosses is either:
 *  - settlement-free PEERING (green, $0 — but requires ports/cross-connects), or
 *  - paid TRANSIT (amber/red, priced in the $0.05–$0.80/Mbps/month band).
 * Hub-adjacent crossings sit near $0.05; the remote / under-connected node sits
 * near $0.80. A committed-bandwidth gauge + a running $/Mbps total accrue as the
 * packet hops. Reduced-motion: static map with priced boundaries + final total.
 */

const GREEN = "#5fb87a"; /* settlement-free peering */
const GREEN_RGB = "95,184,122";
const AMB_RGB = "239,106,61";

type Node = { id: string; label: string; x: number; y: number; dim?: boolean };
type Hop = {
  from: string;
  to: string;
  kind: "peer" | "transit";
  price?: number; /* $/Mbps for transit */
};

/* normalized 0..100 coordinates on the SVG canvas */
const NODES: Node[] = [
  { id: "src", label: "AS-A · origin", x: 8, y: 30 },
  { id: "hub", label: "AS-HUB · IX", x: 34, y: 62 },
  { id: "mid", label: "AS-MID", x: 60, y: 26 },
  { id: "far", label: "AS-FAR · remote", x: 90, y: 64, dim: true },
];

const HOPS: Hop[] = [
  { from: "src", to: "hub", kind: "transit", price: 0.05 },
  { from: "hub", to: "mid", kind: "peer" },
  { from: "mid", to: "far", kind: "transit", price: 0.8 },
];

export default function L3Transit() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const animate = inView && !reduced;

  const totalCrossings = HOPS.length;
  const [hopIdx, setHopIdx] = useState(reduced ? totalCrossings : 0);

  useEffect(() => {
    if (!animate) {
      setHopIdx(totalCrossings);
      return;
    }
    setHopIdx(0);
    let i = 0;
    let hold = 0;
    const id = window.setInterval(() => {
      if (i >= totalCrossings) {
        hold += 1;
        if (hold >= 3) {
          i = 0;
          hold = 0;
          setHopIdx(0);
        }
        return;
      }
      i += 1;
      setHopIdx(i);
    }, 1300);
    return () => window.clearInterval(id);
  }, [animate, totalCrossings]);

  const nodeById = (id: string) => NODES.find((n) => n.id === id)!;

  /* accrued transit cost = sum of priced crossings already traversed */
  const accrued = HOPS.slice(0, hopIdx).reduce(
    (s, h) => s + (h.kind === "transit" ? h.price ?? 0 : 0),
    0,
  );
  const maxAccrued = HOPS.reduce(
    (s, h) => s + (h.kind === "transit" ? h.price ?? 0 : 0),
    0,
  );

  /* packet position: interpolate along the current hop */
  const W = 100;
  const H = 80;

  return (
    <DiagramFrame caption="L3 · TRANSIT — PEERING vs PAID CROSSINGS" tone="amb">
      <div ref={ref}>
        <div
          style={{
            position: "relative",
            border: "1px solid rgba(239,233,218,.1)",
            background: "rgba(14,13,10,.55)",
          }}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            style={{ display: "block", overflow: "visible" }}
            aria-hidden
          >
            {/* links */}
            {HOPS.map((h, i) => {
              const a = nodeById(h.from);
              const b = nodeById(h.to);
              const traversed = i < hopIdx;
              const active = i === hopIdx - 1;
              const c = h.kind === "peer" ? GREEN : AMB;
              return (
                <g key={`${h.from}-${h.to}`}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={c}
                    strokeWidth={active ? 1.4 : 1}
                    strokeDasharray={h.kind === "peer" ? "0" : "2.4 1.8"}
                    opacity={traversed ? 0.95 : 0.32}
                    style={{ transition: "opacity .4s ease" }}
                  />
                  {/* price / peering tag at midpoint */}
                  {(() => {
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2 - 3.4;
                    return (
                      <g
                        opacity={traversed ? 1 : 0.45}
                        style={{ transition: "opacity .4s ease" }}
                      >
                        <rect
                          x={mx - 9}
                          y={my - 4}
                          width="18"
                          height="6.6"
                          rx="1"
                          fill="rgba(14,13,10,.92)"
                          stroke={c}
                          strokeWidth="0.4"
                        />
                        <text
                          x={mx}
                          y={my + 0.9}
                          textAnchor="middle"
                          fontFamily="'JetBrains Mono',monospace"
                          fontSize="3.1"
                          fill={c}
                        >
                          {h.kind === "peer"
                            ? "peer · $0"
                            : `$${h.price?.toFixed(2)}/Mbps`}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {/* nodes */}
            {NODES.map((nd) => (
              <g key={nd.id}>
                <circle
                  cx={nd.x}
                  cy={nd.y}
                  r="4.4"
                  fill="rgba(14,13,10,.95)"
                  stroke={nd.dim ? "rgba(239,233,218,.32)" : "rgba(239,233,218,.55)"}
                  strokeWidth="0.7"
                  opacity={nd.dim ? 0.7 : 1}
                />
                <circle
                  cx={nd.x}
                  cy={nd.y}
                  r="1.4"
                  fill={nd.dim ? MUTED : INK}
                  opacity={nd.dim ? 0.7 : 1}
                />
                <text
                  x={nd.x}
                  y={nd.y + 8}
                  textAnchor="middle"
                  fontFamily="'JetBrains Mono',monospace"
                  fontSize="2.9"
                  letterSpacing="0.1"
                  fill={nd.dim ? MUTED : BODY_COLOR}
                >
                  {nd.label}
                </text>
              </g>
            ))}

            {/* travelling packet on the active hop */}
            {animate && hopIdx > 0 && hopIdx <= totalCrossings
              ? (() => {
                  const h = HOPS[hopIdx - 1];
                  const a = nodeById(h.from);
                  const b = nodeById(h.to);
                  return (
                    <circle
                      key={`pkt-${hopIdx}`}
                      r="2"
                      fill={h.kind === "peer" ? GREEN : AMB}
                    >
                      <animate
                        attributeName="cx"
                        from={a.x}
                        to={b.x}
                        dur="1.1s"
                        fill="freeze"
                      />
                      <animate
                        attributeName="cy"
                        from={a.y}
                        to={b.y}
                        dur="1.1s"
                        fill="freeze"
                      />
                      <animate
                        attributeName="opacity"
                        values="0;1;1;0.85"
                        dur="1.1s"
                        fill="freeze"
                      />
                    </circle>
                  );
                })()
              : null}

            {/* resting packet at final node when done */}
            {hopIdx >= totalCrossings ? (
              <circle
                cx={nodeById(HOPS[totalCrossings - 1].to).x}
                cy={nodeById(HOPS[totalCrossings - 1].to).y}
                r="2"
                fill={AMB}
              />
            ) : null}
          </svg>
        </div>

        {/* committed-bandwidth gauge + accruing $/Mbps total */}
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
            gap: 14,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <Label tone="muted">COMMITTED BANDWIDTH · TRANSIT ACCRUED</Label>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: AMB,
                }}
              >
                ${accrued.toFixed(2)}/Mbps
              </span>
            </div>
            <div
              style={{
                position: "relative",
                height: 8,
                background: "rgba(239,233,218,.08)",
                border: "1px solid rgba(239,233,218,.12)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: "0 auto 0 0",
                  width: `${(accrued / maxAccrued) * 100}%`,
                  background: `linear-gradient(90deg,rgba(${GREEN_RGB},.5),rgba(${AMB_RGB},.85))`,
                  transition: "width .6s cubic-bezier(.2,.8,.2,1)",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 5,
                fontFamily: MONO,
                fontSize: 8.5,
                color: MUTED,
              }}
            >
              <span style={{ color: GREEN }}>$0.05 · major hub</span>
              <span style={{ color: AMB }}>$0.80 · remote / scarce fiber</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 14,
              justifyContent: isMobile ? "flex-start" : "flex-end",
            }}
          >
            <Legend color={GREEN} text="peering · $0" />
            <Legend color={AMB} text="paid transit" />
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid rgba(239,233,218,.1)",
            fontFamily: BODY,
            fontSize: 12.5,
            color: BODY_COLOR,
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: INK, fontFamily: DISPLAY, fontWeight: 600 }}>
            Cost moves down a layer, it doesn&rsquo;t vanish.
          </span>{" "}
          Transit is sold by committed Mbps every month; peering only shifts the
          bill to ports and cross-connects.
        </div>
      </div>
    </DiagramFrame>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 14,
          height: 2,
          background: color,
          display: "inline-block",
        }}
      />
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: ".08em",
          color: MUTED,
        }}
      >
        {text}
      </span>
    </span>
  );
}
