import { useEffect, useRef, useState } from "react";
import {
  ACC,
  BODY_COLOR,
  CARD,
  DARKER,
  DIM,
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
 * LanDiscovery — A6 — LAN discovery (shared public IPv4 + IPv6 /64 prefix).
 *
 * The signaling server buckets connections by the public address they egress
 * from. Three devices behind one router all share public IPv4 203.0.113.7 — they
 * snap into a "nearby" cluster, a "no code needed" badge lights, and a direct
 * beam can form between any two. An IPv6 inset shows two devices whose full
 * addresses differ but whose /64 prefix matches: the prefix is highlighted in
 * accent, the differing suffix dimmed, and they bucket together.
 *
 * Self-contained · CSS/SVG only · reduced-motion safe (final bucketed state).
 */

export default function LanDiscovery() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const animate = inView && !reduced;

  // Staged arrival: each device snaps into its bucket in sequence, then the
  // "nearby" badge + direct beam light. Loops slowly.
  const STEPS = 5; // 0,1,2 = devices arrive; 3 = badge; 4 = hold; then loop
  const [step, setStep] = useState(animate ? 0 : STEPS);

  useEffect(() => {
    if (!animate) {
      setStep(STEPS);
      return;
    }
    setStep(0);
    let s = 0;
    const id = window.setInterval(() => {
      s = s + 1;
      if (s > STEPS + 2) s = 0; // pause at end, then restart
      setStep(s);
    }, 900);
    return () => window.clearInterval(id);
  }, [animate]);

  const settled = !animate || step >= STEPS;
  const arrived = (i: number) => !animate || step > i;
  const badgeOn = !animate || step >= 3;

  return (
    <div ref={ref}>
      <DiagramFrame caption="FIG 06 · LAN DISCOVERY" tone="acc">
        {/* ---------------------------------------- the signaling server -- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <ServerGlyph />
          <div style={{ textAlign: "left" }}>
            <Label tone="muted">SIGNALING SERVER</Label>
            <div
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                color: BODY_COLOR,
                marginTop: 2,
              }}
            >
              buckets by public address
            </div>
          </div>
        </div>

        {/* descending hairlines from server to the bucket */}
        <div
          style={{
            height: 18,
            display: "flex",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <span
            style={{
              width: 1,
              height: "100%",
              background: "rgba(239,233,218,.16)",
            }}
          />
        </div>

        {/* ------------------------------------------ Group A : IPv4 bucket -- */}
        <div
          style={{
            border: badgeOn ? `1px solid ${ACC}` : HAIR_STRONG,
            background: badgeOn
              ? "rgba(83,96,255,.06)"
              : DARKER,
            transition: "all .5s ease",
            padding: "14px clamp(10px,2.5vw,22px) 16px",
            position: "relative",
          }}
        >
          {/* bucket header: shared IP + badge */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px 14px",
              marginBottom: 16,
            }}
          >
            <Label tone={badgeOn ? "acc" : "muted"}>SHARED PUBLIC IPv4</Label>
            <span
              style={{
                fontFamily: MONO,
                fontSize: "13px",
                color: badgeOn ? ACC : INK,
                letterSpacing: ".04em",
                transition: "color .4s ease",
              }}
            >
              203.0.113.7
            </span>
            <span
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: MONO,
                fontSize: "9.5px",
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: badgeOn ? ACC : MUTED,
                border: `1px solid ${badgeOn ? ACC : "rgba(239,233,218,.2)"}`,
                background: badgeOn ? "rgba(83,96,255,.12)" : "transparent",
                padding: "4px 9px",
                opacity: badgeOn ? 1 : 0.5,
                transform: badgeOn ? "scale(1)" : "scale(.94)",
                transition: "all .4s cubic-bezier(.2,.8,.2,1)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: badgeOn ? ACC : MUTED,
                  boxShadow: badgeOn ? `0 0 7px ${ACC}` : "none",
                }}
              />
              no code needed
            </span>
          </div>

          {/* the three devices behind one router + direct beam */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              gap: "clamp(6px,3vw,28px)",
              minHeight: 86,
            }}
          >
            {/* direct beam connecting the cluster — appears once settled */}
            <DirectBeam on={settled} animate={animate} />

            <DeviceNode
              name="laptop"
              arrived={arrived(0)}
              highlight={settled}
            />
            <DeviceNode
              name="phone"
              arrived={arrived(1)}
              highlight={settled}
              router
            />
            <DeviceNode
              name="tablet"
              arrived={arrived(2)}
              highlight={settled}
            />
          </div>

          <div
            style={{
              marginTop: 12,
              textAlign: "center",
              fontFamily: MONO,
              fontSize: "10px",
              color: MUTED,
              letterSpacing: ".04em",
            }}
          >
            same network → same group → transfer directly, edge to edge
          </div>
        </div>

        {/* ------------------------------------------ IPv6 /64 inset ------ */}
        <Ipv6Inset highlight={settled} />
      </DiagramFrame>
    </div>
  );
}

/* ============================================================ sub-parts == */

function ServerGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
      <rect
        x="6"
        y="5"
        width="22"
        height="8"
        rx="1.5"
        fill="none"
        stroke={BODY_COLOR}
        strokeWidth="1.2"
      />
      <rect
        x="6"
        y="15"
        width="22"
        height="8"
        rx="1.5"
        fill="none"
        stroke={BODY_COLOR}
        strokeWidth="1.2"
      />
      <circle cx="11" cy="9" r="1.4" fill={ACC} />
      <circle cx="11" cy="19" r="1.4" fill={ACC} />
      <line
        x1="17"
        y1="23"
        x2="17"
        y2="29"
        stroke={BODY_COLOR}
        strokeWidth="1.2"
      />
    </svg>
  );
}

/** A device that fades + rises into its bucket slot when it "arrives". */
function DeviceNode({
  name,
  arrived,
  highlight,
  router,
}: {
  name: string;
  arrived: boolean;
  highlight: boolean;
  router?: boolean;
}) {
  const c = highlight ? ACC : "rgba(239,233,218,.22)";
  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        opacity: arrived ? 1 : 0,
        transform: arrived ? "translateY(0)" : "translateY(-14px)",
        transition: "opacity .5s ease, transform .5s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 34,
          border: `1px solid ${c}`,
          background: highlight ? "rgba(83,96,255,.14)" : CARD,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all .4s ease",
        }}
      >
        {/* monitor glyph */}
        <span
          style={{
            width: 22,
            height: 14,
            border: `1px solid ${highlight ? ACC : BODY_COLOR}`,
            transition: "border-color .4s ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: MONO,
          fontSize: "9px",
          letterSpacing: ".06em",
          color: highlight ? INK : BODY_COLOR,
          transition: "color .4s ease",
        }}
      >
        {name}
      </span>
      {router ? (
        <span
          style={{
            fontFamily: MONO,
            fontSize: "7.5px",
            letterSpacing: ".1em",
            color: MUTED,
          }}
        >
          ↑ router
        </span>
      ) : null}
    </div>
  );
}

/** Triangular direct-beam web connecting the three clustered devices. */
function DirectBeam({ on, animate }: { on: boolean; animate: boolean }) {
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: on ? 1 : 0,
        transition: "opacity .6s ease",
        pointerEvents: "none",
      }}
    >
      {/* arc from left device over the middle to the right device */}
      {[
        "M16 24 Q50 4 84 24",
        "M16 24 L50 24",
        "M50 24 L84 24",
      ].map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={ACC}
          strokeWidth="0.8"
          strokeDasharray="3 4"
          className={animate && on ? "thy-anim" : undefined}
          style={{
            animation:
              animate && on ? "thyBeamFlow .8s linear infinite" : undefined,
          }}
        />
      ))}
      <style>{`
        @keyframes thyBeamFlow { to { stroke-dashoffset: -14; } }
      `}</style>
    </svg>
  );
}

/** IPv6 inset: two addresses whose /64 prefix matches (accent), suffix differs (dim). */
function Ipv6Inset({ highlight }: { highlight: boolean }) {
  const prefix = "2001:db8:ac10:fe01";
  const rows = [
    { suffix: ":a14e:9c2b:0f31:7d88", name: "laptop" },
    { suffix: ":52d0:1abf:cc09:e6a2", name: "phone" },
  ];
  return (
    <div
      style={{
        marginTop: 14,
        border: HAIR,
        background: DARKER,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <Label tone="muted">IPv6 — GROUP BY /64 PREFIX</Label>
        <span
          style={{
            fontFamily: MONO,
            fontSize: "9.5px",
            color: MUTED,
            letterSpacing: ".04em",
          }}
        >
          full 128-bit would split the household
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map((r) => (
          <div
            key={r.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: "9px",
                color: MUTED,
                width: 44,
                flex: "0 0 auto",
              }}
            >
              {r.name}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: "12px",
                letterSpacing: ".01em",
                whiteSpace: "nowrap",
                overflowX: "auto",
              }}
            >
              {/* matching /64 prefix — accent highlight */}
              <span
                style={{
                  color: highlight ? ACC : INK,
                  background: highlight ? "rgba(83,96,255,.16)" : "transparent",
                  borderBottom: `1px solid ${highlight ? ACC : "transparent"}`,
                  padding: "1px 2px",
                  transition: "all .4s ease",
                }}
              >
                {prefix}
              </span>
              {/* differing suffix — dimmed */}
              <span style={{ color: DIM }}>{r.suffix}</span>
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: MONO,
          fontSize: "9.5px",
          letterSpacing: ".04em",
          color: highlight ? ACC : MUTED,
          transition: "color .4s ease",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            border: `1px solid ${highlight ? ACC : MUTED}`,
            borderRadius: "50%",
            fontSize: "10px",
            transition: "border-color .4s ease",
          }}
        >
          {highlight ? "✓" : "·"}
        </span>
        prefix matches → same network → bucketed together as{" "}
        <span style={{ color: highlight ? ACC : BODY_COLOR }}>
          {prefix}::/64
        </span>
      </div>
    </div>
  );
}
