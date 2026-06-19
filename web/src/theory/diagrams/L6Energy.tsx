import { useRef } from "react";
import {
  DiagramFrame,
  Label,
  useInView,
  useNarrowViewport,
  useReducedMotion,
  ACC,
  AMB,
  INK,
  MUTED,
  MONO,
  DISPLAY,
  CARD,
} from "./primitives";

/**
 * L6Energy — L6, the source.
 *
 * Generation sources feed a shared grid bus that powers the L5 data center.
 * Fossil drains a finite reserve gauge; nuclear is bounded by fuel; renewables
 * are capped by built capacity (a hard ceiling). A relay's demand draws a
 * visible amber slice off the bus. Emphasis: finitude — every input is bounded,
 * so the bus has a price floor above zero.
 *
 * Self-contained CSS/SVG only. Reduced-motion: static sources -> grid with the
 * depleting/ceiling indicators shown at rest; no draining/flow motion.
 */

interface Source {
  key: string;
  label: string;
  detail: string;
  /** 0..1 fill of its capacity/reserve bar */
  level: number;
  /** "drains" = depleting finite reserve; "ceiling" = capped at max built */
  kind: "drains" | "ceiling";
}

const SOURCES: Source[] = [
  { key: "fossil", label: "FOSSIL", detail: "finite reserve · depleting", level: 0.42, kind: "drains" },
  { key: "nuclear", label: "NUCLEAR", detail: "mined + enriched fuel", level: 0.7, kind: "drains" },
  { key: "renew", label: "SOLAR · WIND · HYDRO", detail: "capped by built capacity", level: 0.85, kind: "ceiling" },
];

export default function L6Energy() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const narrow = useNarrowViewport();
  const inView = useInView(ref);
  const animate = inView && !reduced;

  // On phones, stack the three finite sources into one readable column instead
  // of squeezing three cards across ~360px; the feed-lines row collapses too.
  const sourceCols = narrow ? "1fr" : "repeat(3, minmax(0,1fr))";

  return (
    <DiagramFrame caption="L6 · FINITE SOURCES" tone="amb">
      <div ref={ref}>
        {/* generation sources */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: sourceCols,
            gap: "10px",
          }}
        >
          {SOURCES.map((s, i) => (
            <SourceCell key={s.key} source={s} animate={animate} index={i} />
          ))}
        </div>

        {/* feed lines down into the bus */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: sourceCols,
            gap: "10px",
            height: "22px",
          }}
        >
          {SOURCES.map((s, i) => (
            <div
              key={s.key}
              style={{ display: "flex", justifyContent: "center" }}
            >
              <div
                style={{
                  width: "10px",
                  height: "100%",
                  backgroundImage: animate
                    ? "repeating-linear-gradient(180deg,var(--amb) 0 5px,transparent 5px 14px)"
                    : "repeating-linear-gradient(180deg,rgba(239,106,61,.5) 0 5px,transparent 5px 14px)",
                  backgroundSize: "100% 24px",
                  animation: animate
                    ? "l6Drip 1s linear infinite"
                    : undefined,
                  animationDelay: animate ? `${i * 0.18}s` : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* the shared grid bus */}
        <div
          style={{
            position: "relative",
            border: "1px solid rgba(239,233,218,.2)",
            background:
              "linear-gradient(90deg,rgba(239,106,61,.10),rgba(83,96,255,.10))",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            overflow: "hidden",
          }}
        >
          {animate ? (
            <span
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: "30%",
                background:
                  "linear-gradient(90deg,transparent,rgba(239,233,218,.12),transparent)",
                animation: "l6Bus 3.5s linear infinite",
              }}
            />
          ) : null}
          <span
            style={{
              position: "relative",
              fontFamily: MONO,
              fontSize: "10.5px",
              letterSpacing: ".14em",
              color: INK,
            }}
          >
            SHARED GRID BUS
          </span>
          <span
            style={{
              position: "relative",
              fontFamily: MONO,
              fontSize: "9px",
              letterSpacing: ".08em",
              color: MUTED,
            }}
          >
            supply = bounded · price &gt; 0
          </span>
        </div>

        {/* split: relay demand vs everyone else */}
        <div
          style={{
            display: "flex",
            flexDirection: narrow ? "column" : "row",
            gap: "12px",
            marginTop: "22px",
          }}
        >
          {/* relay's slice */}
          <div
            style={{
              flex: narrow ? "1 1 auto" : "0 0 38%",
              border: `1px solid rgba(239,106,61,.5)`,
              borderLeft: `2px solid ${AMB}`,
              background: CARD,
              padding: "12px 14px",
            }}
          >
            <Label tone="amb">RELAY DEMAND</Label>
            <div
              style={{
                marginTop: "9px",
                height: "10px",
                background: "rgba(239,233,218,.06)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: animate ? undefined : "100%",
                  background: AMB,
                  transformOrigin: "left",
                  animation: animate
                    ? "l6Draw 3s ease-in-out infinite"
                    : undefined,
                }}
              />
            </div>
            <div
              style={{
                marginTop: "8px",
                fontFamily: MONO,
                fontSize: "9px",
                color: MUTED,
                letterSpacing: ".04em",
                lineHeight: 1.5,
              }}
            >
              real joules, competing for the same finite pool
            </div>
          </div>

          {/* powers the L5 data center */}
          <div
            style={{
              flex: 1,
              border: "1px solid rgba(83,96,255,.4)",
              background: CARD,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <Label tone="acc">&rarr; POWERS THE L5 DATA CENTER</Label>
            <div
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: "15px",
                color: INK,
                marginTop: "6px",
                lineHeight: 1.25,
                letterSpacing: "-.01em",
              }}
            >
              No source lets a byte move for nothing.
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
          <span style={{ color: AMB }}>&#9632;</span> Energy is a scarce, priced
          good. Even renewables are capped by what humanity has actually built.
        </p>
      </div>

      <style>{`
        @keyframes l6Drip { to { background-position: 0 24px; } }
        @keyframes l6Bus  { from { left: -30%; } to { left: 100%; } }
        @keyframes l6Draw {
          0%, 100% { transform: scaleX(.42); }
          50%      { transform: scaleX(.92); }
        }
        @keyframes l6Reserve {
          0%   { transform: scaleY(1); }
          100% { transform: scaleY(.82); }
        }
      `}</style>
    </DiagramFrame>
  );
}

function SourceCell({
  source,
  animate,
  index,
}: {
  source: Source;
  animate: boolean;
  index: number;
}) {
  const ceiling = source.kind === "ceiling";
  const tone = ceiling ? ACC : AMB;
  return (
    <div
      style={{
        border: "1px solid rgba(239,233,218,.14)",
        background: CARD,
        padding: "10px 11px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: "8.5px",
          letterSpacing: ".1em",
          color: INK,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {source.label}
      </div>

      {/* vertical capacity / reserve gauge */}
      <div
        style={{
          position: "relative",
          height: "62px",
          marginTop: "9px",
          background: "rgba(239,233,218,.05)",
          border: "1px solid rgba(239,233,218,.1)",
          overflow: "hidden",
        }}
      >
        {/* ceiling marker for renewables */}
        {ceiling ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${(1 - source.level) * 100}%`,
              borderTop: `1px dashed ${ACC}`,
              zIndex: 2,
            }}
          >
            <span
              style={{
                position: "absolute",
                right: "2px",
                top: "-10px",
                fontFamily: MONO,
                fontSize: "7px",
                color: ACC,
                letterSpacing: ".05em",
              }}
            >
              MAX
            </span>
          </div>
        ) : null}

        {/* fill */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: `${source.level * 100}%`,
            background: ceiling
              ? "linear-gradient(0deg,rgba(83,96,255,.4),rgba(83,96,255,.12))"
              : "linear-gradient(0deg,rgba(239,106,61,.45),rgba(239,106,61,.12))",
            transformOrigin: "bottom",
            animation:
              animate && !ceiling
                ? "l6Reserve 5s ease-in-out infinite alternate"
                : undefined,
            animationDelay: animate ? `${index * 0.4}s` : undefined,
          }}
        />
        {/* depleting arrow for finite reserves */}
        {!ceiling ? (
          <span
            style={{
              position: "absolute",
              left: "3px",
              bottom: "2px",
              fontFamily: MONO,
              fontSize: "9px",
              color: tone,
            }}
          >
            &darr;
          </span>
        ) : null}
      </div>

      <div
        style={{
          marginTop: "7px",
          fontFamily: MONO,
          fontSize: "7.5px",
          letterSpacing: ".03em",
          color: MUTED,
          lineHeight: 1.35,
          minHeight: "20px",
        }}
      >
        {source.detail}
      </div>
    </div>
  );
}
