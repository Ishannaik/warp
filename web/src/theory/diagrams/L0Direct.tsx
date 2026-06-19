import { useRef } from "react";
import { useIsMobile } from "../../lib/useIsMobile";
import {
  ACC,
  BODY,
  BODY_COLOR,
  DISPLAY,
  Endpoint,
  Figure,
  INK,
  MONO,
  MUTED,
  DiagramFrame,
  useInView,
  useReducedMotion,
} from "./primitives";

/**
 * L0Direct — diagram for L0 — direct P2P (surface).
 *
 * The calm baseline of the descent. Two peers, one direct accent beam. Beneath
 * each peer sits a faint, pre-existing "already-paid" access pipe that the live
 * channel simply reuses — the whole point being that the marginal cost is $0.
 * Slow, serene, accent-toned ambient flow.
 *
 * Reduced-motion: static lit beam, no token motion.
 */
export default function L0Direct() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const animate = inView && !reduced;

  const accLine = "rgba(83,96,255,.55)";

  /* A faint, pre-existing access link. Drawn as a dim dashed stub with a
     "sunk cost / flat rate" tag — it exists whether or not Wrap uses it. */
  function AccessStub({ tag, align }: { tag: string; align: "left" | "right" }) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          opacity: animate ? 1 : reduced ? 1 : 0,
          transition: "opacity .6s ease .2s",
        }}
      >
        <span
          style={{
            width: 1,
            height: 22,
            background:
              "repeating-linear-gradient(180deg,rgba(239,233,218,.22) 0 3px,transparent 3px 7px)",
          }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 8.5,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: MUTED,
            textAlign: align,
            lineHeight: 1.5,
          }}
        >
          {tag}
        </span>
      </div>
    );
  }

  return (
    <DiagramFrame caption="L0 · DIRECT P2P — $0 MARGINAL" tone="acc">
      <div ref={ref}>
        {/* ambient halo behind the channel */}
        <div style={{ position: "relative" }}>
          <div
            aria-hidden
            className={animate ? "thy-anim" : undefined}
            style={{
              position: "absolute",
              inset: "10% 6% auto 6%",
              height: 90,
              top: "50%",
              transform: "translateY(-50%)",
              background:
                "radial-gradient(ellipse at center,rgba(83,96,255,.16),transparent 70%)",
              filter: "blur(8px)",
              animation: animate ? "thyPulse 6s ease-in-out infinite" : undefined,
              pointerEvents: "none",
            }}
          />

          {/* peers + the live direct beam */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: isMobile ? 10 : 22,
            }}
          >
            <Endpoint
              label="PEER A"
              name="sender"
              tone="acc"
              active={animate}
              minWidth={isMobile ? 0 : 130}
              fluid={isMobile}
            />

            {/* the channel */}
            <div
              style={{
                position: "relative",
                flex: 1,
                height: 16,
                minWidth: isMobile ? 54 : 90,
              }}
            >
              {/* base beam */}
              <div
                className={animate ? "thy-anim" : undefined}
                style={{
                  position: "absolute",
                  inset: "5px 0",
                  background: animate
                    ? "repeating-linear-gradient(90deg,rgba(83,96,255,.85) 0 7px,transparent 7px 20px)"
                    : `linear-gradient(90deg,${accLine},${accLine})`,
                  backgroundSize: "32px 100%",
                  animation: animate ? "thyFlow 1.4s linear infinite" : undefined,
                  WebkitMaskImage:
                    "linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)",
                  maskImage:
                    "linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)",
                }}
              />
              {/* a single serene token drifting across */}
              {animate ? (
                <span
                  className="thy-anim"
                  style={{
                    position: "absolute",
                    top: "50%",
                    width: 9,
                    height: 9,
                    marginTop: -4.5,
                    borderRadius: "50%",
                    background: ACC,
                    boxShadow: "0 0 10px rgba(83,96,255,.9)",
                    animation: "l0drift 3.4s ease-in-out infinite",
                  }}
                />
              ) : null}
            </div>

            <Endpoint
              label="PEER B"
              name="receiver"
              tone="acc"
              active={animate}
              minWidth={isMobile ? 0 : 130}
              fluid={isMobile}
            />
          </div>

          {/* already-paid access stubs hanging beneath each peer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 4,
              padding: isMobile ? "0 4px" : "0 18px",
            }}
          >
            <AccessStub tag={"already-paid\nbroadband"} align="left" />
            <AccessStub tag={"already-paid\nconnection"} align="right" />
          </div>
        </div>

        {/* readout */}
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
              No third party in the path.
            </span>{" "}
            The bytes reuse pipes both peers already pay for, flat-rate.
          </span>
          <Figure tone="acc" style={{ fontSize: 13, padding: "4px 10px" }}>
            marginal cost = $0
          </Figure>
        </div>
      </div>

      <style>{`
        @keyframes l0drift {
          0% { left: 6%; opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: 1; }
          100% { left: 94%; opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="l0drift"] { animation: none !important; }
        }
      `}</style>
    </DiagramFrame>
  );
}
