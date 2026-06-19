import { useRef } from "react";
import {
  DiagramFrame,
  Label,
  useInView,
  useReducedMotion,
  AMB,
  INK,
  MUTED,
  DIM,
  MONO,
  DISPLAY,
  CARD,
} from "./primitives";

/**
 * L5Power — L5, power & iron.
 *
 * A data-center energy-flow diagram. Grid power flows in from the left; it
 * splits — ~1.00 unit reaches the servers (useful compute), ~0.56 unit bleeds
 * to cooling / power conversion / overhead. The PUE 1.56 ratio is rendered as
 * a proportional stacked bar (1.00 : 0.56). A utility meter spins, and heat
 * shimmers off the racks. Amber, recurring, metered.
 *
 * Self-contained CSS/SVG only. Reduced-motion: static stacked bar at the
 * 1.00 : 0.56 split with PUE 1.56 labeled; meter at rest; no shimmer.
 */
export default function L5Power() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const animate = inView && !reduced;

  return (
    <DiagramFrame caption="L5 · DATA-CENTER ENERGY" tone="amb">
      <div ref={ref}>
        {/* ---- top row: grid feed -> meter -> split ---- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          {/* utility meter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flex: "0 0 auto",
            }}
          >
            <Meter spin={animate} />
            <div>
              <Label tone="amb">GRID IN</Label>
              <div
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: "20px",
                  color: INK,
                  marginTop: "2px",
                  lineHeight: 1,
                }}
              >
                1.56&thinsp;W
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: "9px",
                  color: MUTED,
                  letterSpacing: ".06em",
                  marginTop: "3px",
                }}
              >
                billed per kWh
              </div>
            </div>
          </div>

          {/* flowing feed line */}
          <div
            style={{
              flex: "1 1 60px",
              minWidth: 40,
              height: "12px",
              backgroundImage: animate
                ? "repeating-linear-gradient(90deg,var(--amb) 0 7px,transparent 7px 20px)"
                : "repeating-linear-gradient(90deg,rgba(239,106,61,.55) 0 7px,transparent 7px 20px)",
              backgroundSize: "32px 100%",
              animation: animate ? "wrapFlow .8s linear infinite" : undefined,
              WebkitMaskImage:
                "linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent)",
              maskImage:
                "linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent)",
            }}
          />
        </div>

        {/* ---- PUE stacked bar ---- */}
        <div style={{ marginTop: "22px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <Label tone="muted">POWER USAGE EFFECTIVENESS</Label>
            <span
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: "16px",
                color: AMB,
              }}
            >
              PUE&nbsp;&asymp;&nbsp;1.56
            </span>
          </div>

          <div
            style={{
              position: "relative",
              display: "flex",
              height: "46px",
              border: "1px solid rgba(239,233,218,.16)",
              background: CARD,
              overflow: "hidden",
            }}
          >
            {/* compute segment (1.00) */}
            <div
              style={{
                position: "relative",
                width: "64.1%",
                background: "rgba(83,96,255,.22)",
                borderRight: "1px solid rgba(239,233,218,.22)",
                display: "flex",
                alignItems: "center",
                paddingLeft: "12px",
                overflow: "hidden",
              }}
            >
              {/* compute draw pulse */}
              {animate ? (
                <span
                  className="thy-anim"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(90deg,transparent,rgba(83,96,255,.28),transparent)",
                    animation: "thyShimmer 3.2s ease-in-out infinite",
                  }}
                />
              ) : null}
              <span
                style={{
                  position: "relative",
                  fontFamily: MONO,
                  fontSize: "10px",
                  letterSpacing: ".08em",
                  color: INK,
                  whiteSpace: "nowrap",
                }}
              >
                1.00&thinsp;W&nbsp;&middot;&nbsp;COMPUTE
              </span>
            </div>
            {/* overhead segment (0.56) */}
            <div
              style={{
                position: "relative",
                width: "35.9%",
                background:
                  "repeating-linear-gradient(135deg,rgba(239,106,61,.26) 0 6px,rgba(239,106,61,.12) 6px 12px)",
                display: "flex",
                alignItems: "center",
                paddingLeft: "10px",
                overflow: "hidden",
              }}
            >
              {/* heat shimmer sweeping off the overhead racks */}
              {animate ? (
                <span
                  className="thy-anim"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(90deg,transparent,rgba(239,106,61,.4),transparent)",
                    animation: "thyShimmer 2.4s ease-in-out infinite",
                  }}
                />
              ) : null}
              <span
                style={{
                  position: "relative",
                  fontFamily: MONO,
                  fontSize: "10px",
                  letterSpacing: ".06em",
                  color: AMB,
                  whiteSpace: "nowrap",
                }}
              >
                0.56&thinsp;W&nbsp;&middot;&nbsp;OVERHEAD
              </span>
            </div>
          </div>

          {/* tick labels */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "6px",
              fontFamily: MONO,
              fontSize: "9px",
              color: DIM,
              letterSpacing: ".06em",
            }}
          >
            <span>0</span>
            <span>useful work</span>
            <span>cooling · conversion · UPS · lighting</span>
            <span>1.56</span>
          </div>
        </div>

        {/* ---- destinations: servers + cooling ---- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
            gap: "12px",
            marginTop: "20px",
          }}
        >
          {/* server rack — fiber lasers/amplifiers draw power */}
          <div
            style={{
              border: "1px solid rgba(83,96,255,.4)",
              background: CARD,
              padding: "12px 14px",
            }}
          >
            <Label tone="acc">SERVERS · LASERS</Label>
            <div style={{ display: "flex", gap: "4px", marginTop: "10px" }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  style={{
                    flex: 1,
                    height: "26px",
                    background: "rgba(83,96,255,.14)",
                    borderTop: "2px solid var(--acc)",
                    opacity: animate ? undefined : 0.8,
                    animation: animate
                      ? "wrapBlink 1.6s steps(1) infinite"
                      : undefined,
                    animationDelay: animate ? `${i * 0.22}s` : undefined,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                marginTop: "8px",
                fontFamily: MONO,
                fontSize: "9px",
                color: MUTED,
                letterSpacing: ".04em",
              }}
            >
              relay work + optical amplifiers
            </div>
          </div>

          {/* cooling — heat shimmer */}
          <div
            style={{
              position: "relative",
              border: "1px solid rgba(239,106,61,.4)",
              background: CARD,
              padding: "12px 14px",
              overflow: "hidden",
            }}
          >
            <Label tone="amb">COOLING · OVERHEAD</Label>
            <div
              style={{
                position: "relative",
                display: "flex",
                gap: "10px",
                marginTop: "10px",
                height: "26px",
                alignItems: "flex-end",
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    flex: 1,
                    height: "100%",
                    background:
                      "linear-gradient(0deg,rgba(239,106,61,.22),transparent)",
                    borderBottom: "2px solid var(--amb)",
                    transformOrigin: "bottom",
                    animation: animate
                      ? "l5Heat 2.2s ease-in-out infinite"
                      : undefined,
                    animationDelay: animate ? `${i * 0.3}s` : undefined,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                marginTop: "8px",
                fontFamily: MONO,
                fontSize: "9px",
                color: MUTED,
                letterSpacing: ".04em",
              }}
            >
              ~56% lost to keeping it alive
            </div>
          </div>
        </div>

        <p
          style={{
            margin: "16px 0 0",
            fontFamily: MONO,
            fontSize: "10.5px",
            letterSpacing: ".06em",
            lineHeight: 1.6,
            color: MUTED,
          }}
        >
          <span style={{ color: AMB }}>&#9632;</span> None of it amortizes away.
          Every relayed byte is a measurable quantity of joules pulled off a
          grid, billed continuously.
        </p>
      </div>

      <style>{`
        @keyframes l5Heat {
          0%, 100% { transform: scaleY(.55); opacity: .55; }
          50%      { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </DiagramFrame>
  );
}

/* A small utility meter with a spinning dial. */
function Meter({ spin }: { spin: boolean }) {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      aria-hidden
      style={{ flex: "0 0 auto" }}
    >
      <circle
        cx="28"
        cy="28"
        r="24"
        fill={CARD}
        stroke="rgba(239,233,218,.2)"
        strokeWidth="1"
      />
      <circle
        cx="28"
        cy="28"
        r="24"
        fill="none"
        stroke={AMB}
        strokeWidth="2"
        strokeDasharray="113 151"
        strokeLinecap="round"
        transform="rotate(135 28 28)"
        opacity="0.7"
      />
      {/* spinning dial needle */}
      <g
        style={{
          transformOrigin: "28px 28px",
          animation: spin ? "wrapSpin2 3.6s linear infinite" : undefined,
          transform: spin ? undefined : "rotate(40deg)",
        }}
      >
        <line
          x1="28"
          y1="28"
          x2="28"
          y2="9"
          stroke={INK}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
      <circle cx="28" cy="28" r="2.4" fill={AMB} />
      <text
        x="28"
        y="46"
        fill={MUTED}
        fontFamily={MONO}
        fontSize="7"
        letterSpacing="1"
        textAnchor="middle"
      >
        kWh
      </text>
      <style>{`
        @keyframes wrapSpin2 { to { transform: rotate(360deg); } }
      `}</style>
    </svg>
  );
}
