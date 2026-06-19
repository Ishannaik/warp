import { useRef, type ReactNode } from "react";
import {
  DiagramFrame,
  Label,
  useInView,
  useNarrowViewport,
  useReducedMotion,
  ACC,
  AMB,
  INK,
  BODY_COLOR,
  MUTED,
  DIM,
  MONO,
  DISPLAY,
  CARD,
} from "./primitives";

/**
 * L7Bedrock — L7, the bedrock stratum at the bottom of the descent.
 *
 * Three "laws" carved as distinct plates:
 *  1. Landauer — a single bit being erased, releasing a quantum of heat.
 *     Annotated >= 2.75e-21 J/bit @ 300 K. A single slow bit-erasure pulse.
 *  2. Shannon — a channel with a capacity ceiling C = B*log2(1 + S/N);
 *     throughput presses against the ceiling and cannot pass.
 *  3. Scarcity — finite supply against many reaching hands.
 *
 * Heavy, inevitable, minimal motion. Self-contained CSS/SVG only.
 * Reduced-motion: fully static plates with all three figures/laws labeled.
 */
export default function L7Bedrock() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const narrow = useNarrowViewport();
  const inView = useInView(ref);
  const animate = inView && !reduced;

  return (
    <DiagramFrame caption="L7 · BEDROCK" tone="neutral">
      <div ref={ref}>
        <div
          style={{
            display: "grid",
            // Mobile: stack the three law plates into one readable column.
            gridTemplateColumns: narrow
              ? "1fr"
              : "repeat(auto-fit, minmax(170px, 1fr))",
            gap: narrow ? "10px" : "12px",
          }}
        >
          {/* ---- Landauer ---- */}
          <Plate index={1} kicker="THERMODYNAMICS" name="Landauer">
            <div
              style={{
                position: "relative",
                height: "78px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* the bit */}
              <span
                style={{
                  position: "relative",
                  zIndex: 2,
                  fontFamily: MONO,
                  fontSize: "26px",
                  fontWeight: 700,
                  color: INK,
                }}
              >
                <span style={{ color: ACC }}>1</span>
                <span style={{ color: DIM }}>&rarr;</span>
                <span style={{ color: MUTED }}>0</span>
              </span>
              {/* quantum of heat released on erasure */}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "44px",
                  height: "44px",
                  marginLeft: "-22px",
                  marginTop: "-22px",
                  borderRadius: "50%",
                  border: `1px solid ${AMB}`,
                  opacity: animate ? 0 : 0.4,
                  animation: animate
                    ? "thyQuantum 4.2s ease-out infinite"
                    : undefined,
                }}
              />
              {/* a couple of escaping heat motes */}
              {[0, 1].map((i) => (
                <span
                  key={i}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "3px",
                    height: "3px",
                    borderRadius: "50%",
                    background: AMB,
                    opacity: animate ? 0 : 0.5,
                    animation: animate
                      ? "l7Mote 4.2s ease-out infinite"
                      : undefined,
                    animationDelay: animate ? `${0.4 + i * 0.5}s` : undefined,
                    ["--mx" as string]: i === 0 ? "18px" : "-16px",
                    ["--my" as string]: i === 0 ? "-20px" : "-22px",
                  }}
                />
              ))}
            </div>
            <Figure>
              &ge; kT&middot;ln2 &asymp; 2.75&times;10
              <sup>&minus;21</sup>&nbsp;J / bit
            </Figure>
            <PlateNote>at 300&nbsp;K · erasing a bit dissipates heat</PlateNote>
          </Plate>

          {/* ---- Shannon ---- */}
          <Plate index={2} kicker="INFORMATION THEORY" name="Shannon">
            <div
              style={{
                position: "relative",
                height: "78px",
                paddingTop: "8px",
              }}
            >
              {/* capacity ceiling */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "10px",
                  borderTop: `1px dashed ${INK}`,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "-12px",
                    fontFamily: MONO,
                    fontSize: "8px",
                    color: BODY_COLOR,
                    letterSpacing: ".06em",
                  }}
                >
                  C (ceiling)
                </span>
              </div>
              {/* throughput bars pressing up against the ceiling */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "58px",
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "4px",
                }}
              >
                {[0.6, 0.82, 1, 1, 0.9, 1].map((h, i) => (
                  <span
                    key={i}
                    style={{
                      flex: 1,
                      height: `${h * 100}%`,
                      maxHeight: "100%",
                      background:
                        h >= 1
                          ? "linear-gradient(0deg,rgba(83,96,255,.5),rgba(83,96,255,.2))"
                          : "rgba(83,96,255,.25)",
                      borderTop: h >= 1 ? `2px solid ${ACC}` : "none",
                      transformOrigin: "bottom",
                      animation: animate
                        ? "l7Press 2.6s ease-in-out infinite"
                        : undefined,
                      animationDelay: animate ? `${i * 0.16}s` : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
            <Figure>C = B&middot;log&#8322;(1 + S/N)</Figure>
            <PlateNote>finite capacity · cannot push past it</PlateNote>
          </Plate>

          {/* ---- Scarcity ---- */}
          <Plate index={3} kicker="ECONOMICS" name="Scarcity">
            <div
              style={{
                position: "relative",
                height: "78px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {/* bounded supply */}
              <div
                style={{
                  width: "40px",
                  height: "22px",
                  border: `1px solid ${AMB}`,
                  background: "rgba(239,106,61,.16)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: MONO,
                  fontSize: "8px",
                  color: AMB,
                  letterSpacing: ".06em",
                }}
              >
                FINITE
              </div>
              {/* many reaching hands (demand) */}
              <div style={{ display: "flex", gap: "5px" }}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: "5px",
                      height: "12px",
                      background: BODY_COLOR,
                      transformOrigin: "bottom",
                      opacity: 0.7,
                      animation: animate
                        ? "l7Reach 2.4s ease-in-out infinite"
                        : undefined,
                      animationDelay: animate ? `${i * 0.12}s` : undefined,
                    }}
                  />
                ))}
              </div>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "7.5px",
                  letterSpacing: ".06em",
                  color: MUTED,
                }}
              >
                demand &rarr; &infin;
              </span>
            </div>
            <Figure tone="amb">price &gt; 0, always</Figure>
            <PlateNote>finite supply vs. unlimited wants</PlateNote>
          </Plate>
        </div>

        {/* the synthesis caption — the floor */}
        <div
          style={{
            marginTop: "18px",
            borderTop: "1px solid rgba(239,233,218,.16)",
            paddingTop: "16px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: "clamp(15px,2.4vw,19px)",
              lineHeight: 1.3,
              letterSpacing: "-.01em",
              color: INK,
            }}
          >
            cost floor = energy &times; scarcity
          </div>
          <div
            style={{
              marginTop: "8px",
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            toward zero possible &middot;{" "}
            <span style={{ color: AMB }}>equal to zero impossible</span>
          </div>
          <div
            style={{
              marginTop: "10px",
              fontFamily: MONO,
              fontSize: "9.5px",
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: DIM,
            }}
          >
            &mdash; there is no L8 &mdash;
          </div>
        </div>
      </div>

      <style>{`
        @keyframes l7Mote {
          0%   { transform: translate(0,0) scale(1); opacity: 0; }
          25%  { opacity: .8; }
          100% { transform: translate(var(--mx), var(--my)) scale(.4); opacity: 0; }
        }
        @keyframes l7Press {
          0%, 100% { transform: scaleY(.86); }
          50%      { transform: scaleY(1); }
        }
        @keyframes l7Reach {
          0%, 100% { transform: scaleY(.7); }
          50%      { transform: scaleY(1.25); }
        }
      `}</style>
    </DiagramFrame>
  );
}

/* A carved law plate. Heavier border, kicker + name, then the law content. */
function Plate({
  index,
  kicker,
  name,
  children,
}: {
  index: number;
  kicker: string;
  name: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        border: "1px solid rgba(239,233,218,.18)",
        background:
          "linear-gradient(180deg,#15140f,rgba(14,13,10,.6))",
        padding: "14px 14px 16px",
        boxShadow: "inset 0 1px 0 rgba(239,233,218,.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <span
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: "16px",
            color: INK,
            letterSpacing: "-.01em",
          }}
        >
          {name}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: "9px",
            color: DIM,
            letterSpacing: ".1em",
          }}
        >
          0{index}
        </span>
      </div>
      <div style={{ marginBottom: "10px" }}>
        <Label tone="muted">{kicker}</Label>
      </div>
      {children}
    </div>
  );
}

/* A law's formula/figure line — mono, boxed, sits beneath the visual. */
function Figure({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "amb";
}) {
  const color = tone === "amb" ? AMB : INK;
  return (
    <div
      style={{
        marginTop: "12px",
        fontFamily: MONO,
        fontSize: "11px",
        letterSpacing: ".02em",
        color,
        background: CARD,
        border: "1px solid rgba(239,233,218,.14)",
        padding: "6px 9px",
        textAlign: "center",
        lineHeight: 1.3,
      }}
    >
      {children}
    </div>
  );
}

function PlateNote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: "8px",
        fontFamily: MONO,
        fontSize: "8.5px",
        letterSpacing: ".04em",
        color: MUTED,
        lineHeight: 1.4,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}
