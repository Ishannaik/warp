import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { navigate } from "../router";
import { useIsMobile } from "../lib/useIsMobile";
import "./theory.css";
import WebRtcLogo from "./WebRtcLogo";
import { DepthGauge, type DepthLayer } from "./diagrams/primitives";

/* --- PART A diagrams (the lifecycle of one transfer) --- */
import CloudVsDirect from "./diagrams/CloudVsDirect";
import WebRtcChannel from "./diagrams/WebRtcChannel";
import Handshake from "./diagrams/Handshake";
import NatStun from "./diagrams/NatStun";
import Chunking from "./diagrams/Chunking";
import LanDiscovery from "./diagrams/LanDiscovery";
import DurableObject from "./diagrams/DurableObject";

/* --- PART B diagrams (the descent: why a relay is never free) --- */
import L0Direct from "./diagrams/L0Direct";
import L1Turn from "./diagrams/L1Turn";
import L2Edge from "./diagrams/L2Edge";
import L3Transit from "./diagrams/L3Transit";
import L4Physical from "./diagrams/L4Physical";
import L5Power from "./diagrams/L5Power";
import L6Energy from "./diagrams/L6Energy";
import L7Bedrock from "./diagrams/L7Bedrock";

/**
 * Theory — the "/how" deep-dive (page shell / foundation).
 *
 * Editorial technical longform that teaches (PART A) how Wrap actually works,
 * concept by concept, then descends (PART B) through the economics of a relayed
 * byte to show why a relay can never be truly free.
 *
 * Built entirely on the Wrap design system: dark palette, Bricolage/Archivo/
 * JetBrains Mono, hairline borders, mono eyebrows, accent var(--acc) /
 * amber var(--amb). All diagrams are self-contained CSS/SVG components living in
 * ./diagrams and rendered beside their prose. Final copy comes from
 * docs/theory-content.md (filled by Assemble); prose here is placeholder-grade.
 *
 * This file owns: nav chrome, hero, A1..A7 section slots, the PART B intro, the
 * L0..L7 descent with a sticky DepthGauge, the closing synthesis, and the CTA +
 * footer. It does NOT implement the diagrams themselves.
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";
const HAIR = "1px solid rgba(239,233,218,.13)";
const HAIR_STRONG = "1px solid rgba(239,233,218,.16)";

const PROSE_MAX = 880;
const WIDE_MAX = 1320;

/* ================================================================ chrome == */

const navLink: CSSProperties = { color: "#b6b0a0", textDecoration: "none" };

function Chrome() {
  const isMobile = useIsMobile();
  return (
    <>
      <style>{`
        .thy-nav-link:hover{color:#efe9da}
        .thy-back:hover{opacity:.85}
        .thy-launch:hover{background:#6470ff}
        .thy-home:hover{color:#efe9da;border-color:rgba(239,233,218,.55)}
      `}</style>

      {/* status strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "10px 16px" : "11px 22px",
          borderBottom: HAIR,
          fontFamily: MONO,
          fontSize: "11px",
          letterSpacing: ".13em",
          color: "#908a7b",
          textTransform: "uppercase",
          position: "relative",
          zIndex: 5,
        }}
      >
        <span>WRAP&nbsp;&nbsp;/&nbsp;&nbsp;how it works &mdash; the theory</span>
        {!isMobile && (
          <span style={{ display: "flex", gap: "26px" }}>
            <span style={{ color: "var(--acc)" }}>&#9679; PEER-TO-PEER</span>
            <span>WEBRTC</span>
            <span>NO SERVER TOUCHES FILES</span>
          </span>
        )}
      </div>

      {/* nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "16px 16px" : "20px 26px",
          position: "relative",
          zIndex: 5,
        }}
      >
        <a
          href="/"
          className="thy-back"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "11px",
            textDecoration: "none",
            color: "#efe9da",
          }}
        >
          <span
            style={{
              width: "26px",
              height: "26px",
              background: "var(--acc)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ width: "9px", height: "9px", background: "#121110" }} />
          </span>
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: "21px",
              fontWeight: 800,
              letterSpacing: "-.02em",
            }}
          >
            WRAP
          </span>
        </a>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: isMobile ? "0" : "30px",
            fontFamily: MONO,
            fontSize: "12px",
            letterSpacing: ".05em",
          }}
        >
          {!isMobile && (
            <a
              href="/"
              className="thy-nav-link"
              style={navLink}
              onClick={(e) => {
                e.preventDefault();
                navigate("/");
              }}
            >
              &larr; HOME
            </a>
          )}
          {!isMobile && (
            <a
              href="https://github.com/Ishannaik/warp"
              className="thy-nav-link"
              style={navLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              GITHUB
            </a>
          )}
          <a
            href="/send"
            className="thy-launch"
            onClick={(e) => {
              e.preventDefault();
              navigate("/send");
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "9px",
              padding: "10px 17px",
              background: "var(--acc)",
              fontFamily: MONO,
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "#fff",
              textDecoration: "none",
            }}
          >
            Start a transfer <span>&rarr;</span>
          </a>
        </div>
      </div>
    </>
  );
}

/* ============================================================ primitives == */

/**
 * Section — an editorial concept block. Eyebrow ("01 / THE PROBLEM"), heading,
 * lede, then a two-column body: prose on one side, the diagram slot on the
 * other (stacks on mobile). `flip` swaps which side the diagram sits on so the
 * page alternates rhythm. `dark` paints the darker inset background.
 */
function Section({
  id,
  eyebrow,
  heading,
  lede,
  prose,
  diagram,
  callout,
  dark = false,
  flip = false,
}: {
  id?: string;
  eyebrow: string;
  heading: ReactNode;
  lede?: ReactNode;
  prose?: ReactNode;
  diagram?: ReactNode;
  callout?: ReactNode;
  dark?: boolean;
  flip?: boolean;
}) {
  const isMobile = useIsMobile();
  return (
    <section
      id={id}
      style={{
        position: "relative",
        zIndex: 4,
        borderTop: HAIR,
        padding: isMobile ? "56px 18px" : "92px 26px",
        background: dark ? "#0e0d0a" : "transparent",
      }}
    >
      <div style={{ maxWidth: WIDE_MAX, margin: "0 auto" }}>
        <SectionHead eyebrow={eyebrow} heading={heading} lede={lede} />

        {(prose || diagram) && (
          <div
            style={{
              display: "grid",
              // minmax(0,1fr) — NOT plain "1fr" (== minmax(auto,1fr)) — so a wide
              // child's min-content can't inflate the column past the viewport.
              // Plain 1fr was dragging the prose to the diagram's intrinsic width.
              gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)",
              gap: isMobile ? "32px" : "clamp(32px,5vw,72px)",
              alignItems: "start",
              marginTop: isMobile ? "30px" : "46px",
            }}
          >
            <div
              style={{
                order: !isMobile && flip ? 2 : 1,
                maxWidth: PROSE_MAX,
              }}
            >
              {prose}
              {callout}
            </div>
            {diagram && (
              <div
                style={{
                  order: !isMobile && flip ? 1 : 2,
                  position: !isMobile ? "sticky" : "static",
                  top: !isMobile ? "92px" : undefined,
                }}
              >
                {diagram}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SectionHead({
  eyebrow,
  heading,
  lede,
}: {
  eyebrow: string;
  heading: ReactNode;
  lede?: ReactNode;
}) {
  return (
    <>
      <div
        style={{
          fontFamily: MONO,
          fontSize: "11.5px",
          letterSpacing: ".2em",
          textTransform: "uppercase",
          color: "#6f6a5d",
        }}
      >
        {eyebrow}
      </div>
      <h2
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: "clamp(28px,3.4vw,46px)",
          lineHeight: 1.04,
          letterSpacing: "-.025em",
          margin: "14px 0 0",
          color: "#efe9da",
          maxWidth: "18ch",
        }}
      >
        {heading}
      </h2>
      {lede && (
        <p
          style={{
            fontSize: "18px",
            lineHeight: 1.6,
            color: "#cdc8ba",
            maxWidth: PROSE_MAX,
            margin: "20px 0 0",
          }}
        >
          {lede}
        </p>
      )}
    </>
  );
}

const pStyle: CSSProperties = {
  fontSize: "16px",
  lineHeight: 1.72,
  color: "#a8a293",
  margin: "0 0 18px",
};

function P({ children }: { children: ReactNode }) {
  return <p style={pStyle}>{children}</p>;
}

/** Inline mono term, lightly accented. */
function Term({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: "0.86em",
        color: "#efe9da",
        background: "rgba(239,233,218,.06)",
        border: "1px solid rgba(239,233,218,.12)",
        padding: "1px 6px",
      }}
    >
      {children}
    </span>
  );
}

/** Editorial pull-out used to land the one true sentence of a section. */
function Callout({
  kicker,
  children,
  tone = "acc",
}: {
  kicker: string;
  children: ReactNode;
  tone?: "acc" | "amb";
}) {
  const color = tone === "amb" ? "var(--amb)" : "var(--acc)";
  return (
    <div
      style={{
        maxWidth: PROSE_MAX,
        marginTop: "30px",
        borderLeft: `2px solid ${color}`,
        background: "#15140f",
        padding: "22px 26px",
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: "10.5px",
          letterSpacing: ".2em",
          textTransform: "uppercase",
          color,
          marginBottom: "10px",
        }}
      >
        {kicker}
      </div>
      <p
        style={{
          fontFamily: DISPLAY,
          fontWeight: 600,
          fontSize: "21px",
          lineHeight: 1.4,
          letterSpacing: "-.01em",
          color: "#efe9da",
          margin: 0,
        }}
      >
        {children}
      </p>
    </div>
  );
}

/* ============================================= signature: hero flow diagram */
/**
 * FlowDiagram — the page's signature element (kept inline as the hero, since it
 * sets the whole metaphor). Phase 1: both peers reach UP to the signaling
 * server over dashed, content-free links. Phase 2: the server dims and a solid,
 * flowing, encrypted channel lights up directly between A and B. Auto-toggles.
 */
function FlowDiagram() {
  const [direct, setDirect] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDirect(true);
      return;
    }
    const t = setInterval(() => setDirect((d) => !d), 3200);
    return () => clearInterval(t);
  }, []);

  const dashV: CSSProperties = {
    width: "1px",
    height: "46px",
    margin: "0 auto",
    background:
      "repeating-linear-gradient(180deg,rgba(239,233,218,.35) 0 5px,transparent 5px 10px)",
    opacity: direct ? 0.18 : 0.85,
    transition: "opacity .6s ease",
  };

  const endpoint = (label: string, name: string, accent: string) => (
    <div
      style={{
        border: `1px solid ${accent}`,
        background: "#15140f",
        padding: "18px 20px",
        minWidth: isMobile ? "0" : "130px",
        width: isMobile ? "100%" : undefined,
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            width: "9px",
            height: "9px",
            background: accent,
            display: "inline-block",
            animation: direct ? "wrapBlink 1.1s steps(1) infinite" : "none",
          }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "#6f6a5d",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: "16px",
          color: "#efe9da",
        }}
      >
        {name}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "relative",
        border: HAIR_STRONG,
        background: "#0e0d0a",
        padding: isMobile ? "24px 16px 28px" : "30px 28px 34px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: "10.5px",
          letterSpacing: ".18em",
          textTransform: "uppercase",
          color: direct ? "var(--acc)" : "#908a7b",
          textAlign: "center",
          marginBottom: "22px",
          transition: "color .5s ease",
        }}
      >
        {direct ? (
          <>&#9679; Phase 2 &middot; direct encrypted P2P channel</>
        ) : (
          <>&#9675; Phase 1 &middot; brokering the handshake</>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            border: "1px dashed rgba(239,233,218,.35)",
            padding: "10px 16px",
            fontFamily: MONO,
            fontSize: "10.5px",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "#b6b0a0",
            opacity: direct ? 0.35 : 1,
            transition: "opacity .6s ease",
          }}
        >
          Signaling server
          <span style={{ color: "#6f6a5d" }}>&nbsp;&middot; introductions only</span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
          maxWidth: "520px",
          margin: "0 auto",
        }}
      >
        <div style={dashV} />
        <div style={dashV} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "auto 1fr auto",
          alignItems: "center",
          gap: "16px",
          maxWidth: "640px",
          margin: "0 auto",
        }}
      >
        {endpoint("Peer A", "sender", "var(--acc)")}

        <div style={{ position: "relative", textAlign: "center" }}>
          <div
            style={{
              height: "16px",
              background: direct
                ? "repeating-linear-gradient(90deg,var(--acc) 0 7px,transparent 7px 20px)"
                : "repeating-linear-gradient(90deg,rgba(239,233,218,.18) 0 4px,transparent 4px 12px)",
              backgroundSize: "32px 100%",
              animation: direct ? "wrapFlow .9s linear infinite" : "none",
              WebkitMaskImage:
                "linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)",
              maskImage:
                "linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)",
              transition: "background .4s ease",
            }}
          />
          <div
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: direct ? "var(--acc)" : "#6f6a5d",
              marginTop: "8px",
              transition: "color .5s ease",
            }}
          >
            {direct ? "DTLS · your bytes, edge to edge" : "no data path yet"}
          </div>
        </div>

        {endpoint("Peer B", "receiver", "var(--amb)")}
      </div>
    </div>
  );
}

/* =================================================== PART B descent layout */

const LAYERS: DepthLayer[] = [
  { id: "L0", name: "SURFACE" },
  { id: "L1", name: "THE RELAY" },
  { id: "L2", name: "THE EDGE" },
  { id: "L3", name: "TRANSIT" },
  { id: "L4", name: "PHYSICAL" },
  { id: "L5", name: "POWER & IRON" },
  { id: "L6", name: "THE SOURCE" },
  { id: "L7", name: "BEDROCK" },
];

interface LayerDef {
  id: string;
  depth: string;
  heading: ReactNode;
  lede: ReactNode;
  prose: ReactNode;
  diagram: ReactNode;
  callout: ReactNode;
}

/**
 * DescentLayer — one L-layer in PART B. Renders inside the descent column
 * (right of the sticky DepthGauge). Reports its active state up via
 * IntersectionObserver so the gauge can light the right marker.
 */
function DescentLayer({
  index,
  layer,
  onActive,
}: {
  index: number;
  layer: LayerDef;
  onActive: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onActive(index);
        }
      },
      { threshold: 0, rootMargin: "-45% 0px -45% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [index, onActive]);

  return (
    <div
      ref={ref}
      id={layer.id}
      style={{
        padding: isMobile ? "44px 0" : "60px 0",
        borderTop: index === 0 ? "none" : HAIR,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: "11px",
          letterSpacing: ".2em",
          textTransform: "uppercase",
          color: "var(--acc)",
        }}
      >
        {layer.depth}
      </div>
      <h3
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: "clamp(24px,2.8vw,38px)",
          lineHeight: 1.06,
          letterSpacing: "-.02em",
          margin: "12px 0 0",
          color: "#efe9da",
          maxWidth: "20ch",
        }}
      >
        {layer.heading}
      </h3>
      <p
        style={{
          fontSize: "17px",
          lineHeight: 1.6,
          color: "#cdc8ba",
          maxWidth: PROSE_MAX,
          margin: "16px 0 0",
        }}
      >
        {layer.lede}
      </p>

      <div style={{ marginTop: isMobile ? "26px" : "34px" }}>{layer.diagram}</div>

      <div style={{ marginTop: "28px", maxWidth: PROSE_MAX }}>{layer.prose}</div>
      {layer.callout}
    </div>
  );
}

/* ======================================================== closing + footer */

function ClosingCta() {
  const isMobile = useIsMobile();
  return (
    <section
      style={{
        position: "relative",
        zIndex: 4,
        borderTop: HAIR,
        padding: isMobile ? "72px 18px 0" : "112px 26px 0",
        overflow: "hidden",
      }}
    >
      <div style={{ maxWidth: WIDE_MAX, margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: "11.5px",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "#6f6a5d",
            marginBottom: "20px",
          }}
        >
          The whole story, in one breath
        </div>
        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: "clamp(40px,7vw,108px)",
            lineHeight: 0.92,
            letterSpacing: "-.04em",
            textTransform: "uppercase",
            margin: 0,
            color: "#efe9da",
          }}
        >
          Free by refusing
          <br />
          <span
            style={{
              color: "var(--acc)",
              textShadow: "0 0 60px rgba(var(--acc-rgb),.4)",
            }}
          >
            to relay.
          </span>
        </h2>
        <p
          style={{
            fontSize: "17px",
            lineHeight: 1.6,
            color: "#a8a293",
            maxWidth: "560px",
            margin: "26px auto 0",
          }}
        >
          Free where free is real. Honest where it isn't. Open a channel, share
          the code, and watch your bytes go straight across &mdash; never a
          middleman by stealth.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "14px",
            flexWrap: "wrap",
            marginTop: "38px",
          }}
        >
          <a
            href="/send"
            className="thy-launch"
            onClick={(e) => {
              e.preventDefault();
              navigate("/send");
            }}
            style={{
              padding: "18px 34px",
              background: "var(--acc)",
              color: "#fff",
              fontFamily: MONO,
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            Start a transfer &nbsp;&rarr;
          </a>
          <a
            href="/"
            className="thy-home"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
            style={{
              padding: "18px 30px",
              background: "transparent",
              border: "1px solid rgba(239,233,218,.25)",
              color: "#b6b0a0",
              fontFamily: MONO,
              fontSize: "13px",
              fontWeight: 500,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            &larr; Back to home
          </a>
        </div>
      </div>

      <div
        style={{
          maxWidth: WIDE_MAX,
          margin: isMobile ? "64px auto 0" : "96px auto 0",
          borderTop: HAIR,
          padding: "30px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
          <div
            style={{
              width: "22px",
              height: "22px",
              background: "var(--acc)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: "8px", height: "8px", background: "#121110" }} />
          </div>
          <span style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 800 }}>
            WRAP
          </span>
        </div>
        <a
          href="https://github.com/Ishannaik/warp"
          className="thy-nav-link"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: MONO,
            fontSize: "12px",
            color: "#6f6a5d",
            letterSpacing: ".06em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          GitHub
        </a>
        <div
          style={{
            fontFamily: MONO,
            fontSize: "11px",
            color: "#4a463c",
            letterSpacing: ".06em",
            textTransform: "uppercase",
          }}
        >
          MIT licensed &middot; made for the open web
        </div>
      </div>
    </section>
  );
}

/* ================================================================== page == */

export default function Theory() {
  const isMobile = useIsMobile();
  const [activeLayer, setActiveLayer] = useState(0);

  /* PART B layer definitions — placeholder prose; Assemble fills from the doc. */
  const layers: LayerDef[] = [
    {
      id: "L0",
      depth: "L0 · Surface",
      heading: "At the top, it really is free — because nothing is relayed.",
      lede: (
        <>
          A direct peer-to-peer transfer reuses the internet access both people
          are <em>already</em> paying for. No new pipe, no third party in the data
          path, no marginal cost.
        </>
      ),
      prose: (
        <>
          <P>
            When Wrap connects two peers directly, your bytes ride existing
            broadband on both ends &mdash; sunk costs, already paid. Wrap adds a
            few seconds of tiny, content-free signaling on top, cheap enough to
            give away. <Term>Free</Term> isn&rsquo;t magic; it&rsquo;s the absence
            of a relay.
          </P>
        </>
      ),
      diagram: <L0Direct />,
      callout: (
        <Callout kicker="The surface">
          Free is the absence of a relay. Reuse pipes that are already paid for
          and the marginal cost really is zero.
        </Callout>
      ),
    },
    {
      id: "L1",
      depth: "L1 · The relay",
      heading: "A relay has to carry every byte twice.",
      lede: (
        <>
          When the direct path fails, a <Term>TURN</Term> relay steps in. Now your
          file goes <em>up</em> to the relay and <em>down</em> to the peer &mdash;
          received and re-sent in full.
        </>
      ),
      prose: (
        <P>
          Send 4&nbsp;GB through TURN and the relay handles ~8&nbsp;GB &mdash; in
          and back out. That bandwidth is metered and scales linearly with every
          byte. No caching, no amortization: relayed traffic is pure, recurring,
          per-byte cost.
        </P>
      ),
      diagram: <L1Turn />,
      callout: (
        <Callout kicker="The relay" tone="amb">
          A relay&rsquo;s cost scales one-to-one with traffic. Every byte in is a
          byte out &mdash; there is nothing to amortize.
        </Callout>
      ),
    },
    {
      id: "L2",
      depth: "L2 · The edge",
      heading: "&ldquo;Just put it on a CDN&rdquo; doesn't help — this can't be cached.",
      lede: (
        <>
          CDNs make <em>popular, repeated</em> content cheap. A private one-to-one
          transfer is the opposite: unique, encrypted, requested exactly once.
        </>
      ),
      prose: (
        <P>
          Every transfer is a distinct, end-to-end-encrypted payload to exactly
          one recipient &mdash; cache hit rate zero. So even at the edge you pay
          full <Term>egress</Term> for every byte, one of the most aggressively
          priced lines on any cloud bill.
        </P>
      ),
      diagram: <L2Edge />,
      callout: (
        <Callout kicker="The edge" tone="amb">
          Caching amortizes <em>repeated</em> bytes. A private transfer is
          requested once &mdash; hit rate zero, full egress every time.
        </Callout>
      ),
    },
    {
      id: "L3",
      depth: "L3 · Transit",
      heading: "Bytes between networks ride paid transit and peering.",
      lede: (
        <>
          The internet is many separate networks. Crossing between them costs{" "}
          <Term>transit</Term> &mdash; sold by committed bandwidth, not goodwill.
        </>
      ),
      prose: (
        <P>
          IP transit commonly runs ~$0.05&ndash;$0.80 per Mbps per month: cheapest
          in major hubs, far higher where fiber is scarce. Your free direct
          transfer rides this bundled into flat-rate access fees; a relay operator
          buys it explicitly, by the committed Mbps, every month.
        </P>
      ),
      diagram: <L3Transit />,
      callout: (
        <Callout kicker="Transit" tone="amb">
          Transit is sold by committed Mbps, every month &mdash; ~$0.05 in a major
          hub, up to ~$0.80 or more where the fiber is scarce.
        </Callout>
      ),
    },
    {
      id: "L4",
      depth: "L4 · The physical layer",
      heading: "Under the transit price is glass, steel, and ships.",
      lede: (
        <>
          Transit is cheap only because the physical link already exists &mdash;
          fiber-optic cable, including the subsea cables carrying nearly all
          intercontinental traffic.
        </>
      ),
      prose: (
        <P>
          You can&rsquo;t relay a byte across an ocean without a cable under it.
          Subsea systems run on the order of <Term>~$25,000/km</Term>, with a
          transatlantic system around <Term>~$250M</Term> to build &mdash; plus
          ships, repeaters every ~80&nbsp;km, landing stations, and decades of
          repair. There is no software layer beneath the cable.
        </P>
      ),
      diagram: <L4Physical />,
      callout: (
        <Callout kicker="The physical layer" tone="amb">
          ~$25k per kilometer of subsea cable; ~$250M for a transatlantic system.
          You can&rsquo;t relay a byte across an ocean without one.
        </Callout>
      ),
    },
    {
      id: "L5",
      depth: "L5 · Power & iron",
      heading: "The machines run on electricity that is never free.",
      lede: (
        <>
          Relays and the networks under them live in data centers &mdash; capital
          poured into buildings, servers, and cooling, drawing continuous power
          billed by the kilowatt-hour.
        </>
      ),
      prose: (
        <P>
          Industry-average <Term>PUE &asymp; 1.56</Term>: for every watt reaching
          the compute, ~0.56&nbsp;W extra goes to cooling, conversion, and
          overhead. None of it amortizes away &mdash; the relayed byte you
          didn&rsquo;t want to pay for is a measurable quantity of joules pulled
          off a grid.
        </P>
      ),
      diagram: <L5Power />,
      callout: (
        <Callout kicker="Power & iron" tone="amb">
          PUE ~1.56 means ~56% overhead on top of the compute itself &mdash; every
          relayed byte is metered electricity, billed continuously.
        </Callout>
      ),
    },
    {
      id: "L6",
      depth: "L6 · The source",
      heading: "That electricity comes from somewhere finite.",
      lede: (
        <>
          Power isn&rsquo;t conjured. It&rsquo;s generated from fuel, sun, wind, or
          water &mdash; all bounded by physical supply, infrastructure, and cost.
        </>
      ),
      prose: (
        <P>
          Trace the kilowatt-hour back and it lands on a finite source: fuel
          burned out of the ground, or renewables capped by how much generation
          humanity has actually built. Energy is a scarce, priced good &mdash; and
          a relay&rsquo;s appetite for joules is real demand on that finite pool.
        </P>
      ),
      diagram: <L6Energy />,
      callout: (
        <Callout kicker="The source" tone="amb">
          Energy is a scarce, priced good drawn from finite sources. A relay&rsquo;s
          joules are real demand competing against everyone else&rsquo;s.
        </Callout>
      ),
    },
    {
      id: "L7",
      depth: "L7 · Bedrock",
      heading: "At the bottom: physics doesn't let a bit move for free.",
      lede: (
        <>
          Strip away every layer of business and you reach laws, not policies.
          Moving and erasing information has a hard physical floor; economics has a
          hard scarcity floor. Neither is negotiable.
        </>
      ),
      prose: (
        <>
          <P>
            <Term>Landauer</Term> says erasing one bit dissipates at least
            kT&middot;ln2 &asymp; 2.75&times;10&#8315;&#178;&#185;&nbsp;J at room
            temperature. <Term>Shannon</Term> caps a channel at C =
            B&middot;log&#8322;(1 + S/N). And <Term>scarcity</Term> says any finite
            resource against unlimited wants must carry a price.
          </P>
          <P>
            Stack them and the conclusion is forced: relaying information is a
            physical process, physical processes cost energy, energy is finite, and
            finite things are never free. The only way to pay nothing is to relay
            nothing.
          </P>
        </>
      ),
      diagram: <L7Bedrock />,
      callout: (
        <Callout kicker="Bedrock">
          A truly free relay would have to break thermodynamics, Shannon, or
          scarcity. The only winning move is to not relay at all.
        </Callout>
      ),
    },
  ];

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        fontFamily: "'Archivo',system-ui,sans-serif",
        color: "#efe9da",
        // `clip` (not `hidden`) is the page-level safety net: it contains any
        // stray horizontal overflow WITHOUT creating a scroll container, so the
        // sticky DepthGauge rail / sticky diagram columns keep working.
        overflowX: "clip",
      }}
    >
      <Chrome />

      {/* ---------------------------------------------------------- hero -- */}
      <header
        style={{
          position: "relative",
          zIndex: 4,
          padding: isMobile ? "40px 18px 56px" : "60px 26px 84px",
        }}
      >
        <div style={{ maxWidth: WIDE_MAX, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "12px",
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "#908a7b",
              animation: "wrapFade .8s ease both",
            }}
          >
            The theory &mdash; in plain language
          </div>
          <h1
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: "clamp(44px,7vw,104px)",
              lineHeight: 0.9,
              letterSpacing: "-.035em",
              textTransform: "uppercase",
              margin: "18px 0 0",
              maxWidth: "12ch",
            }}
          >
            <span style={{ display: "block", overflow: "hidden" }}>
              <span
                style={{
                  display: "inline-block",
                  animation: "wrapRise .7s cubic-bezier(.2,.8,.2,1) both",
                }}
              >
                No server
              </span>
            </span>
            <span style={{ display: "block", overflow: "hidden" }}>
              <span
                style={{
                  display: "inline-block",
                  color: "var(--acc)",
                  animation: "wrapRise .7s cubic-bezier(.2,.8,.2,1) .09s both",
                }}
              >
                in the middle.
              </span>
            </span>
          </h1>
          <p
            style={{
              fontSize: "19px",
              lineHeight: 1.6,
              color: "#cdc8ba",
              maxWidth: "600px",
              margin: "28px 0 0",
              animation: "wrapFade .8s ease .5s both",
            }}
          >
            Wrap moves a file straight from one device to another over an
            encrypted, peer-to-peer channel. Here is exactly how that works
            &mdash; and, at the end, the honest reason a relay-based service can
            never be truly free.
          </p>

          <div
            style={{
              marginTop: isMobile ? "36px" : "52px",
              animation: "wrapFade .8s ease .65s both",
            }}
          >
            <FlowDiagram />
          </div>
        </div>
      </header>

      {/* ===================================================== PART A === */}
      {/* A1 · cloud vs direct */}
      <Section
        eyebrow="01 / The problem"
        heading="Most transfers park your file on a stranger's computer."
        lede={
          <>
            Upload to a typical sharing service and your file makes a detour: it
            travels up to a company&rsquo;s server, sits there as a complete copy,
            and only then travels back down to whoever you sent it to.
          </>
        }
        prose={
          <>
            <P>
              That detour has real costs. Your file now exists on hardware you
              don&rsquo;t control &mdash; it can be scanned, logged, retained,
              subpoenaed, or leaked in a breach. You usually hit a size cap. And
              the round trip is slower than it needs to be, because every byte
              goes up before it can come down.
            </P>
            <P>
              The uncomfortable part: the server didn&rsquo;t need to see the file
              at all. It was only ever a middleman. Wrap removes the middleman.
            </P>
          </>
        }
        diagram={<CloudVsDirect />}
        callout={
          <Callout kicker="The core idea" tone="amb">
            If two devices are both online, the file should go directly between
            them. No third computer needs a copy.
          </Callout>
        }
        dark
      />

      {/* A2 · WebRTC + DTLS */}
      <Section
        eyebrow="02 / Peer-to-peer"
        heading={
          <>
            A direct line between two browsers &mdash; that&rsquo;s{" "}
            <span style={{ display: "inline-flex", alignItems: "center", gap: ".3em", verticalAlign: "middle" }}>
              <WebRtcLogo
                size={36}
                style={{ color: "var(--acc)", animation: "thySpin 9s linear infinite" }}
              />
              WebRTC.
            </span>
          </>
        }
        lede={
          <>
            Peer-to-peer means the two devices talk to each other, not through a
            hub. The browser already ships with the machinery to do this: a
            built-in standard called <Term>WebRTC</Term>.
          </>
        }
        prose={
          <>
            <P>
              WebRTC was built for live video, where routing every frame through a
              server would be slow and costly. Wrap uses that same capability
              &mdash; not for video, but for your files, over a{" "}
              <Term>DataChannel</Term> wrapped in <Term>DTLS</Term> by the standard
              itself. Encryption isn&rsquo;t a toggle; it&rsquo;s the only mode.
            </P>
            <P>
              The catch the rest of this page is about: two browsers can&rsquo;t
              dial each other out of nowhere. First, a brief, carefully limited
              introduction.
            </P>
          </>
        }
        diagram={<WebRtcChannel />}
        callout={
          <Callout kicker="End-to-end, by default">
            The keys live on the two devices. No server holds them, so no server
            could read the transfer even if it wanted to.
          </Callout>
        }
        flip
      />

      {/* A3 · handshake */}
      <Section
        eyebrow="03 / The handshake"
        heading="An introduction, not a delivery: SDP offer, answer, and ICE."
        lede={
          <>
            To connect, the peers swap two short text descriptions and a list of
            possible addresses. A small signaling server passes these notes back
            and forth &mdash; and that is the only thing it ever does.
          </>
        }
        prose={
          <>
            <P>
              Peer A writes an <Term>SDP offer</Term> &mdash; codecs, encryption
              parameters, capabilities. Peer B replies with an <Term>SDP answer</Term>.
              Alongside, each peer emits <Term>ICE candidates</Term>: addresses
              where it might be reachable.
            </P>
            <P>
              The server relays those notes and nothing else &mdash; a switchboard
              operator who connects the call but never joins it. Once offer,
              answer, and candidates are exchanged, the peers connect directly and
              the server&rsquo;s part is over.
            </P>
          </>
        }
        diagram={<Handshake />}
        callout={
          <Callout kicker="What the server sees">
            Connection coordinates &mdash; never content. The notes describe{" "}
            <em>how</em> to connect, not <em>what</em> you&rsquo;re sending.
          </Callout>
        }
        dark
      />

      {/* A4 · NAT + STUN */}
      <Section
        eyebrow="04 / NAT traversal"
        heading="Finding a public address with STUN — and being honest when there isn't one."
        lede={
          <>
            Almost no device has a clean public address anymore. They sit behind a
            router doing <Term>NAT</Term>, so peers need help working out where they
            appear from the outside.
          </>
        }
        prose={
          <>
            <P>
              A <Term>STUN</Term> server answers one question &mdash; &ldquo;from out
              here, what address and port do I look like?&rdquo; Behind ordinary
              routers, two peers can then <em>hole-punch</em> a direct path. STUN is
              tiny and cheap, so Wrap uses it freely.
            </P>
            <P>
              But <Term>symmetric NATs</Term> and <Term>CGNAT</Term> rewrite the port
              per destination, so the address STUN found no longer matches.
              Hole-punching fails. The only fix is a <Term>TURN</Term> relay &mdash;
              and that quietly puts a paid server back in your data path.
            </P>
          </>
        }
        diagram={<NatStun />}
        callout={
          <Callout kicker="The $0 tradeoff" tone="amb">
            Wrap runs no TURN relay. On the rare network where a direct path
            can&rsquo;t form, it tells you plainly &mdash; never a middleman by
            stealth.
          </Callout>
        }
        flip
      />

      {/* A5 · chunking + backpressure */}
      <Section
        eyebrow="05 / Moving the bytes"
        heading="Big files go across as a steady stream of 16 KB chunks."
        lede={
          <>
            You can&rsquo;t hand a multi-gigabyte file to the channel in one piece.
            Wrap slices it into small <Term>16 KB chunks</Term> and feeds them
            through one after another.
          </>
        }
        prose={
          <>
            <P>
              Chunking keeps memory flat: only a small window is ever in flight, no
              matter how large the file. That&rsquo;s why there&rsquo;s no size cap
              &mdash; the real limit is free space on the receiving device.
            </P>
            <P>
              The other half is <Term>backpressure</Term>. Wrap watches the
              channel&rsquo;s outgoing buffer: when it fills past a threshold the
              sender pauses; when it drains, it resumes. The file moves at exactly
              the speed the link can sustain &mdash; never overflowing.
            </P>
          </>
        }
        diagram={<Chunking />}
        callout={
          <Callout kicker="No size cap">
            Only a small window is ever in memory, so the real limit is free space
            on the receiving device.
          </Callout>
        }
        dark
      />

      {/* A6 · LAN discovery */}
      <Section
        eyebrow="06 / Nearby"
        heading="Devices on the same network find each other automatically."
        lede={
          <>
            When two devices share a network, Wrap can let them discover each other
            with no code at all &mdash; grouped by the public address they share.
          </>
        }
        prose={
          <>
            <P>
              Two devices on one home or office network almost always egress from
              the same public <Term>IPv4</Term> address. Wrap groups connections by
              that address and shows you the devices sitting right next to you
              &mdash; no room code to type.
            </P>
            <P>
              IPv6 needs a gentler match: a subscriber line gets a whole{" "}
              <Term>/64 prefix</Term>, and devices take different addresses within
              it. So Wrap groups by the /64 prefix &mdash; the part that identifies
              the network, not the device.
            </P>
          </>
        }
        diagram={<LanDiscovery />}
        callout={
          <Callout kicker="Same network, no code">
            Group by shared public IPv4, or by the IPv6 /64 prefix &mdash; then
            transfer directly, edge to edge.
          </Callout>
        }
        flip
      />

      {/* A7 · Durable Object */}
      <Section
        eyebrow="07 / The server that barely exists"
        heading="A Cloudflare Durable Object that wakes to introduce two peers, then sleeps."
        lede={
          <>
            The one piece of server Wrap needs is the signaling switchboard. It runs
            as a Cloudflare <Term>Durable Object</Term> &mdash; a tiny coordinator
            that hibernates the instant it goes idle.
          </>
        }
        prose={
          <>
            <P>
              Open a transfer and a Durable Object spins up to hold one
              room&rsquo;s signaling: offer, answer, ICE. The moment the peers
              connect directly and the room falls quiet, it{" "}
              <Term>hibernates</Term> &mdash; freeing its resources until something
              else needs it.
            </P>
            <P>
              No fleets of servers, no storage buckets, no file-handling tier to pay
              for or to breach. Just a coordinator that sees connection notes for a
              few seconds and goes back to sleep &mdash; while your file travels a
              path it was never on.
            </P>
          </>
        }
        diagram={<DurableObject />}
        callout={
          <Callout kicker="The whole architecture, in one line">
            A server introduces the peers, then disappears. Everything that matters
            &mdash; your file &mdash; goes directly, encrypted, edge to edge.
          </Callout>
        }
        dark
      />

      {/* ============================================ PART B intro === */}
      <section
        style={{
          position: "relative",
          zIndex: 4,
          borderTop: HAIR,
          padding: isMobile ? "64px 18px" : "120px 26px",
          background: "#0e0d0a",
        }}
      >
        <div style={{ maxWidth: WIDE_MAX, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "11.5px",
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "var(--amb)",
            }}
          >
            Part B / The economics of a byte
          </div>
          <h2
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: "clamp(36px,5.5vw,76px)",
              lineHeight: 0.96,
              letterSpacing: "-.035em",
              margin: "16px 0 0",
              color: "#efe9da",
              maxWidth: "16ch",
            }}
          >
            Why a relay can never be completely free.
          </h2>
          <p
            style={{
              fontSize: "19px",
              lineHeight: 1.6,
              color: "#cdc8ba",
              maxWidth: "680px",
              margin: "26px 0 0",
            }}
          >
            Wrap is free because, in the common case, it relays nothing &mdash; it
            reuses pipes you&rsquo;ve <em>already</em> paid for. The moment a service
            relays your bytes, it inherits a cost that doesn&rsquo;t disappear no
            matter how deep you push it. Follow it down.
          </p>

          <p
            style={{
              fontFamily: DISPLAY,
              fontWeight: 600,
              fontSize: "clamp(20px,2.4vw,30px)",
              lineHeight: 1.34,
              letterSpacing: "-.015em",
              color: "#efe9da",
              maxWidth: "20ch",
              margin: isMobile ? "34px 0 0" : "44px 0 0",
              borderLeft: "2px solid var(--amb)",
              paddingLeft: isMobile ? "18px" : "24px",
            }}
          >
            P2P reuses a paid pipe; a relay is a new pipe &mdash; and pipes cost
            energy and capital all the way down.
          </p>
        </div>
      </section>

      {/* ============================================ PART B descent === */}
      <section
        style={{
          position: "relative",
          zIndex: 4,
          background: "#0e0d0a",
          padding: isMobile ? "0 18px 24px" : "0 26px 40px",
        }}
      >
        <div
          style={{
            maxWidth: WIDE_MAX,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "220px minmax(0,1fr)",
            gap: isMobile ? 0 : "clamp(32px,4vw,64px)",
            alignItems: "start",
          }}
        >
          {/* sticky DepthGauge rail (desktop only) */}
          {!isMobile && (
            <div
              style={{
                position: "sticky",
                top: "96px",
                height: "calc(100vh - 160px)",
                paddingTop: "60px",
              }}
            >
              <DepthGauge
                layers={LAYERS}
                activeIndex={activeLayer}
                onSelect={(i) => {
                  const el = document.getElementById(LAYERS[i].id);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
            </div>
          )}

          {/* the descending layers */}
          <div>
            {layers.map((layer, i) => (
              <DescentLayer
                key={layer.id}
                index={i}
                layer={layer}
                onActive={setActiveLayer}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ===================================================== closing === */}
      <ClosingCta />
    </div>
  );
}
