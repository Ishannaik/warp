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
 * L4Physical — L4, the physical layer.
 *
 * A seabed cross-section: two continents flank an ocean; a subsea fiber runs
 * along the seafloor between them, with optical repeaters spaced along the
 * span and a landing station at each shore. A cable-laying ship rides the
 * surface paying out cable. A pulse of light travels the fiber and brightens
 * each repeater as it passes. Cost figures (~$25,000/km, ~$250M transatlantic)
 * annotate the cable. Grave, physical, amber-tinged.
 *
 * Self-contained CSS/SVG only. Reduced-motion: light shown mid-span, ship at
 * rest, repeaters lit, figures labeled — no looping motion.
 */
export default function L4Physical() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const animate = inView && !reduced;

  // SVG coordinate space.
  const W = 600;
  const H = 300;
  // The cable sags gently across the ocean floor.
  const cable = "M 70 196 C 200 250, 400 250, 530 196";
  // Repeater positions sampled along the curve.
  const repeaters = [
    { x: 170, y: 232 },
    { x: 300, y: 245 },
    { x: 430, y: 232 },
  ];

  return (
    <DiagramFrame caption="L4 · SUBSEA FIBER" tone="amb">
      <div ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label="Subsea fiber-optic cable spanning the ocean floor between two continents, with optical repeaters and a cable-laying ship."
          style={{ display: "block" }}
        >
          <defs>
            <linearGradient id="l4-sea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(83,96,255,.10)" />
              <stop offset="0.4" stopColor="rgba(83,96,255,.05)" />
              <stop offset="1" stopColor="rgba(14,13,10,.9)" />
            </linearGradient>
            <linearGradient id="l4-land" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(239,233,218,.10)" />
              <stop offset="1" stopColor="rgba(239,233,218,.02)" />
            </linearGradient>
            <radialGradient id="l4-glow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor={AMB} stopOpacity="0.9" />
              <stop offset="1" stopColor={AMB} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* sky / sea body */}
          <rect x="0" y="0" width={W} height={H} fill="url(#l4-sea)" />

          {/* waterline */}
          <line
            x1="0"
            y1="70"
            x2={W}
            y2="70"
            stroke="rgba(83,96,255,.4)"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
          <text
            x={W / 2}
            y="64"
            fill={MUTED}
            fontFamily={MONO}
            fontSize="9.5"
            letterSpacing="2"
            textAnchor="middle"
          >
            SEA LEVEL
          </text>

          {/* continents (left + right shelves) */}
          <path
            d="M 0 70 L 92 70 C 100 110, 70 150, 70 196 L 0 196 Z"
            fill="url(#l4-land)"
            stroke="rgba(239,233,218,.18)"
            strokeWidth="1"
          />
          <path
            d={`M ${W} 70 L ${W - 92} 70 C ${W - 100} 110, ${W - 70} 150, ${W - 70} 196 L ${W} 196 Z`}
            fill="url(#l4-land)"
            stroke="rgba(239,233,218,.18)"
            strokeWidth="1"
          />

          {/* landing stations */}
          {[
            { x: 36, label: "LANDING" },
            { x: W - 60, label: "LANDING" },
          ].map((s) => (
            <g key={s.x}>
              <rect
                x={s.x}
                y={48}
                width="24"
                height="18"
                fill={CARD}
                stroke="rgba(239,233,218,.4)"
                strokeWidth="1"
              />
              <line
                x1={s.x + 12}
                y1={48}
                x2={s.x + 12}
                y2={38}
                stroke="rgba(239,233,218,.4)"
                strokeWidth="1"
              />
              <circle cx={s.x + 12} cy={36} r="2.2" fill={AMB} />
            </g>
          ))}

          {/* seabed floor */}
          <path
            d="M 0 196 C 200 250, 400 250, 600 196 L 600 300 L 0 300 Z"
            fill="rgba(239,233,218,.03)"
            stroke="rgba(239,233,218,.10)"
            strokeWidth="1"
          />

          {/* the cable itself (dim base) */}
          <path
            d={cable}
            fill="none"
            stroke="rgba(239,233,218,.22)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* glass core highlight */}
          <path
            d={cable}
            fill="none"
            stroke={AMB}
            strokeWidth="1"
            strokeOpacity="0.35"
            strokeLinecap="round"
          />

          {/* traveling light pulse: a short bright dash chasing along the path */}
          <path
            d={cable}
            fill="none"
            stroke={AMB}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="26 600"
            style={
              animate
                ? {
                    animation: "l4Pulse 3.4s linear infinite",
                    filter: "drop-shadow(0 0 5px rgba(239,106,61,.9))",
                  }
                : {
                    // static: place the pulse mid-span
                    strokeDashoffset: -300,
                    filter: "drop-shadow(0 0 5px rgba(239,106,61,.9))",
                  }
            }
          />

          {/* repeaters along the span */}
          {repeaters.map((r, i) => (
            <g key={i}>
              <circle
                cx={r.x}
                cy={r.y}
                r="9"
                fill="url(#l4-glow)"
                opacity={animate ? 0 : 0.5}
                style={
                  animate
                    ? {
                        animation: `l4Rep 3.4s linear infinite`,
                        animationDelay: `${0.85 + i * 0.75}s`,
                      }
                    : undefined
                }
              />
              <rect
                x={r.x - 5}
                y={r.y - 4}
                width="10"
                height="8"
                rx="1.5"
                fill={CARD}
                stroke={AMB}
                strokeWidth="1"
                strokeOpacity="0.7"
              />
            </g>
          ))}
          <text
            x={300}
            y={278}
            fill={MUTED}
            fontFamily={MONO}
            fontSize="9"
            letterSpacing="1.5"
            textAnchor="middle"
          >
            OPTICAL REPEATERS · EVERY ~80 KM
          </text>

          {/* cable-laying ship on the surface */}
          <g
            style={
              animate
                ? { animation: "l4Ship 9s ease-in-out infinite" }
                : { transform: "translateX(150px)" }
            }
          >
            {/* hull */}
            <path
              d="M -20 80 L 20 80 L 14 90 L -14 90 Z"
              fill={CARD}
              stroke="rgba(239,233,218,.5)"
              strokeWidth="1"
            />
            <rect
              x="-7"
              y="71"
              width="12"
              height="9"
              fill={CARD}
              stroke="rgba(239,233,218,.45)"
              strokeWidth="1"
            />
            {/* cable paying out from the stern down toward the floor */}
            <line
              x1="-18"
              y1="88"
              x2="-30"
              y2="120"
              stroke="rgba(239,233,218,.3)"
              strokeWidth="1.2"
              strokeDasharray="2 3"
            />
            <circle cx="0" cy="68" r="1.6" fill={AMB} />
          </g>

          {/* depth bracket */}
          <text
            x={300}
            y={150}
            fill={DIM}
            fontFamily={MONO}
            fontSize="8.5"
            letterSpacing="1.5"
            textAnchor="middle"
          >
            ~4 KM DEEP
          </text>
        </svg>

        {/* cost annotations */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            marginTop: "16px",
            alignItems: "stretch",
          }}
        >
          <CostCard
            value="~$25,000"
            unit="/ km of cable"
            note="glass, steel, armor — laid by ship"
          />
          <CostCard
            value="~$250M"
            unit="transatlantic system"
            note="years to plan; decades to maintain"
          />
        </div>

        <p
          style={{
            margin: "14px 0 0",
            fontFamily: MONO,
            fontSize: "10.5px",
            letterSpacing: ".06em",
            lineHeight: 1.6,
            color: MUTED,
          }}
        >
          <span style={{ color: AMB }}>&#9632;</span> You cannot relay a byte
          across an ocean without a cable under that ocean. There is no software
          layer beneath the glass.
        </p>
      </div>

      {/* scoped keyframes */}
      <style>{`
        @keyframes l4Pulse {
          from { stroke-dashoffset: 626; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes l4Rep {
          0%, 100% { opacity: 0; }
          50% { opacity: .85; }
        }
        @keyframes l4Ship {
          0%, 100% { transform: translateX(70px) translateY(0); }
          50%      { transform: translateX(360px) translateY(-2px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="l4Pulse"], [style*="l4Rep"], [style*="l4Ship"] {
            animation: none !important;
          }
        }
      `}</style>
    </DiagramFrame>
  );
}

function CostCard({
  value,
  unit,
  note,
}: {
  value: string;
  unit: string;
  note: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 180px",
        minWidth: 0,
        border: `1px solid rgba(239,106,61,.45)`,
        borderLeft: `2px solid ${AMB}`,
        background: CARD,
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: "22px",
            color: INK,
            letterSpacing: "-.02em",
          }}
        >
          {value}
        </span>
        <Label tone="amb">{unit}</Label>
      </div>
      <div
        style={{
          marginTop: "6px",
          fontFamily: MONO,
          fontSize: "10px",
          letterSpacing: ".04em",
          color: MUTED,
        }}
      >
        {note}
      </div>
    </div>
  );
}
