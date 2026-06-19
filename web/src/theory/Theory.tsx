import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { navigate } from "../router";

/**
 * Theory — the "/how" deep-dive. A genuinely educational, editorial page that
 * teaches how Wrap actually works: the problem with cloud transfer, what P2P +
 * WebRTC means, the SDP/ICE signaling handshake, STUN + NAT traversal (and why
 * some networks honestly can't connect), the encrypted DTLS DataChannel,
 * chunking + backpressure, and the hibernating Durable Object signaling server.
 *
 * Built entirely from the existing Wrap design system — same dark palette,
 * Bricolage/Archivo/JetBrains Mono fonts, hairline borders, mono eyebrows,
 * accent var(--acc). Diagrams are CSS-only (no images). Numbering is real: the
 * sections trace the literal lifecycle of one transfer, so 01..07 carry order.
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";
const HAIR = "1px solid rgba(239,233,218,.13)";
const HAIR_STRONG = "1px solid rgba(239,233,218,.16)";

/* ---------------------------------------------------------------- chrome -- */

const navLink: CSSProperties = { color: "#b6b0a0", textDecoration: "none" };

function Chrome() {
  return (
    <>
      <style>{`
        .thy-nav-link:hover{color:#efe9da}
        .thy-back:hover{border-color:var(--acc);background:rgba(var(--acc-rgb),.12)}
        .thy-launch:hover{background:#6470ff}
        .thy-home:hover{color:#efe9da;border-color:rgba(239,233,218,.55)}
      `}</style>

      {/* status strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 22px",
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
        <span>
          WRAP&nbsp;&nbsp;/&nbsp;&nbsp;how it works &mdash; the theory
        </span>
        <span style={{ display: "flex", gap: "26px" }}>
          <span style={{ color: "var(--acc)" }}>&#9679; PEER-TO-PEER</span>
          <span>WEBRTC</span>
          <span>NO SERVER TOUCHES FILES</span>
        </span>
      </div>

      {/* nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 26px",
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
            gap: "30px",
            fontFamily: MONO,
            fontSize: "12px",
            letterSpacing: ".05em",
          }}
        >
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

/* ----------------------------------------------------------- primitives -- */

const PROSE_MAX = 880;
const WIDE_MAX = 1320;

function Section({
  id,
  num,
  eyebrow,
  heading,
  lede,
  dark = false,
  children,
}: {
  id?: string;
  num: string;
  eyebrow: string;
  heading: ReactNode;
  lede?: ReactNode;
  dark?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        position: "relative",
        zIndex: 4,
        borderTop: HAIR,
        padding: "92px 26px",
        background: dark ? "#0e0d0a" : "transparent",
      }}
    >
      <div style={{ maxWidth: WIDE_MAX, margin: "0 auto" }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: "11.5px",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "#6f6a5d",
          }}
        >
          {num} / {eyebrow}
        </div>
        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: "clamp(30px,3.6vw,50px)",
            lineHeight: 1.02,
            letterSpacing: "-.025em",
            margin: "14px 0 0",
            color: "#efe9da",
            maxWidth: "860px",
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
        {children}
      </div>
    </section>
  );
}

/** A constrained reading column for body prose. */
function Prose({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: PROSE_MAX, marginTop: "26px" }}>{children}</div>
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

const nodeBox: CSSProperties = {
  border: HAIR_STRONG,
  background: "#15140f",
  padding: "16px 18px",
  minWidth: "112px",
  textAlign: "center",
};

const nodeLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: "10px",
  letterSpacing: ".2em",
  textTransform: "uppercase",
  color: "#6f6a5d",
};

const nodeName: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 700,
  fontSize: "16px",
  marginTop: "6px",
  color: "#efe9da",
};

/* ------------------------------------------------- signature: hero flow -- */
/**
 * The signature element. Two endpoints, A and B. Phase 0: both reach UP to the
 * signaling server (dashed, brokered, content-free). Phase 1: the server fades
 * out of the path and a solid, flowing, encrypted channel lights up directly
 * between A and B. The two phases auto-toggle so the reader literally watches
 * the relay step aside.
 */
function FlowDiagram() {
  const [direct, setDirect] = useState(false);

  useEffect(() => {
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
        minWidth: "130px",
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
        <span style={nodeLabel}>{label}</span>
      </div>
      <div style={nodeName}>{name}</div>
    </div>
  );

  return (
    <div
      style={{
        position: "relative",
        border: HAIR_STRONG,
        background: "#0e0d0a",
        padding: "30px 28px 34px",
        overflow: "hidden",
      }}
    >
      {/* phase label */}
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

      {/* signaling server */}
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
          <span style={{ color: "#6f6a5d" }}>
            &nbsp;&middot; introductions only
          </span>
        </div>
      </div>

      {/* the two dashed uplinks to the server */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          maxWidth: "520px",
          margin: "0 auto",
        }}
      >
        <div style={dashV} />
        <div style={dashV} />
      </div>

      {/* endpoints + the direct channel between them */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
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

/* ------------------------------------------------ section-04: NAT lattice */
/** A small CSS lattice illustrating NAT: who can reach whom, and the wall. */
function NatDiagram() {
  const row = (
    label: string,
    ok: boolean,
    note: string,
    tone: string,
  ) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px 0",
        borderTop: HAIR_STRONG,
      }}
    >
      <span
        style={{
          width: "10px",
          height: "10px",
          flex: "none",
          background: tone,
          borderRadius: ok ? "50%" : 0,
        }}
      />
      <span
        style={{
          fontFamily: MONO,
          fontSize: "12px",
          letterSpacing: ".05em",
          color: "#efe9da",
          minWidth: "210px",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "14.5px", color: "#a8a293", lineHeight: 1.5 }}>
        {note}
      </span>
    </div>
  );

  return (
    <div
      style={{
        maxWidth: PROSE_MAX,
        marginTop: "30px",
        border: HAIR_STRONG,
        background: "#15140f",
        padding: "6px 24px 18px",
      }}
    >
      {row(
        "Open / home networks",
        true,
        "STUN reveals each peer's public address; they connect directly. The common case.",
        "var(--acc)",
      )}
      {row(
        "One side behind a typical NAT",
        true,
        "Hole-punching through the router works once both sides know where to aim.",
        "var(--acc)",
      )}
      {row(
        "Symmetric NAT / locked-down corporate",
        false,
        "The router rewrites ports unpredictably. Hole-punching fails — only a TURN relay could bridge it.",
        "var(--amb)",
      )}
    </div>
  );
}

/* ------------------------------------------------ section-06: chunk pipe -- */
/** Visualizes a large file sliced into 16KB chunks streamed under backpressure. */
function ChunkDiagram() {
  return (
    <div
      style={{
        maxWidth: PROSE_MAX,
        marginTop: "30px",
        border: HAIR_STRONG,
        background: "#15140f",
        padding: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ ...nodeBox, minWidth: "96px" }}>
          <div style={nodeLabel}>FILE</div>
          <div style={{ ...nodeName, fontSize: "15px" }}>4.2 GB</div>
        </div>

        <span style={{ color: "#4a463c", fontFamily: MONO }}>&rarr;</span>

        {/* the chunk train */}
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div
            style={{
              display: "flex",
              gap: "4px",
              overflow: "hidden",
              WebkitMaskImage:
                "linear-gradient(90deg,#000 70%,transparent)",
              maskImage: "linear-gradient(90deg,#000 70%,transparent)",
            }}
          >
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: "16px",
                  height: "22px",
                  flex: "none",
                  border: "1px solid var(--acc)",
                  background:
                    i < 6 ? "rgba(var(--acc-rgb),.25)" : "transparent",
                }}
              />
            ))}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "#6f6a5d",
              marginTop: "8px",
            }}
          >
            16 KB chunks &middot; sent only while the buffer has room
          </div>
        </div>

        <span style={{ color: "#4a463c", fontFamily: MONO }}>&rarr;</span>

        <div style={{ ...nodeBox, minWidth: "96px" }}>
          <div style={nodeLabel}>PEER B</div>
          <div style={{ ...nodeName, fontSize: "15px" }}>reassembles</div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- footer -- */

function FooterCta() {
  return (
    <section
      style={{
        position: "relative",
        zIndex: 4,
        borderTop: HAIR,
        padding: "112px 26px 0",
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
          Now you know how
        </div>
        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: "clamp(44px,8vw,124px)",
            lineHeight: 0.9,
            letterSpacing: "-.04em",
            textTransform: "uppercase",
            margin: 0,
            color: "#efe9da",
          }}
        >
          Watch it
          <br />
          <span
            style={{
              color: "var(--acc)",
              textShadow: "0 0 60px rgba(var(--acc-rgb),.4)",
            }}
          >
            happen.
          </span>
        </h2>
        <p
          style={{
            fontSize: "17px",
            lineHeight: 1.6,
            color: "#a8a293",
            maxWidth: "520px",
            margin: "26px auto 0",
          }}
        >
          Open a channel, share the code, and read the live state for yourself
          &mdash; offer, answer, ICE, connected.
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
          margin: "96px auto 0",
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
          <span
            style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 800 }}
          >
            WRAP
          </span>
        </div>
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

/* =============================================================== page === */

export default function Theory() {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        fontFamily: "'Archivo',system-ui,sans-serif",
        color: "#efe9da",
        overflowX: "hidden",
      }}
    >
      <Chrome />

      {/* ---- hero ---- */}
      <header
        style={{
          position: "relative",
          zIndex: 4,
          padding: "60px 26px 84px",
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
              maxWidth: "560px",
              margin: "28px 0 0",
              animation: "wrapFade .8s ease .5s both",
            }}
          >
            Wrap moves a file straight from one device to another over an
            encrypted, peer-to-peer channel. Here is exactly how that works
            &mdash; and why a server never gets to read a single byte.
          </p>

          <div style={{ marginTop: "52px", animation: "wrapFade .8s ease .65s both" }}>
            <FlowDiagram />
          </div>
        </div>
      </header>

      {/* ---- 01 · the problem ---- */}
      <Section
        num="01"
        eyebrow="The problem"
        heading="Most transfers park your file on a stranger's computer."
        lede={
          <>
            Upload to a typical sharing service and your file makes a detour: it
            travels up to a company's server, sits there as a complete copy, and
            only then travels back down to whoever you sent it to.
          </>
        }
        dark
      >
        <Prose>
          <P>
            That detour has real costs. Your file now exists on hardware you
            don't control, often for far longer than the transfer itself. It can
            be scanned, logged, retained, subpoenaed, or quietly leaked in a
            breach. You usually hit a size cap. And the round trip is slower than
            it needs to be, because every byte goes up before it can come down.
          </P>
          <P>
            The uncomfortable part is that the server didn't need to see the
            file at all. It was only ever a middleman &mdash; a place to leave
            the file so the other person could pick it up later. Wrap removes the
            middleman.
          </P>
        </Prose>
        <Callout kicker="The core idea" tone="amb">
          If two devices are both online, the file should go directly between
          them. No third computer needs a copy.
        </Callout>
      </Section>

      {/* ---- 02 · peer-to-peer + WebRTC ---- */}
      <Section
        num="02"
        eyebrow="Peer-to-peer"
        heading="A direct line between two browsers — that's WebRTC."
        lede={
          <>
            Peer-to-peer means the two devices talk to each other, not through a
            hub. The browser already ships with the machinery to do this: a
            built-in standard called <Term>WebRTC</Term>.
          </>
        }
      >
        <Prose>
          <P>
            WebRTC was designed for live video calls, where routing every frame
            through a server would be slow and expensive. So browsers learned how
            to open a direct connection between two machines and stream data
            across it. Wrap uses that exact capability &mdash; not for video, but
            for your files.
          </P>
          <P>
            There's a catch that the rest of this page is really about: two
            browsers can't just dial each other out of nowhere. Neither one knows
            the other's address yet, and home and office networks hide their
            devices behind routers. So before the direct line can open, the two
            peers need a brief, carefully limited introduction.
          </P>
        </Prose>
      </Section>

      {/* ---- 03 · signaling handshake ---- */}
      <Section
        num="03"
        eyebrow="The handshake"
        heading="An introduction, not a delivery: SDP offer, answer, and ICE."
        lede={
          <>
            To connect, the peers swap two short text descriptions and a list of
            possible addresses. A small signaling server passes these notes back
            and forth &mdash; and that is the only thing it ever does.
          </>
        }
        dark
      >
        <Prose>
          <P>
            Peer A writes an <Term>SDP offer</Term>: a plain-text summary of how
            it would like to connect &mdash; which codecs, which encryption
            parameters, which capabilities. Peer B replies with an{" "}
            <Term>SDP answer</Term> describing its side. Alongside these, each
            peer emits <Term>ICE candidates</Term>: a running list of network
            addresses where it might be reachable.
          </P>
          <P>
            The signaling server's entire job is to relay those notes from A to B
            and back. It is a switchboard operator connecting a call: it knows two
            parties want to talk and helps them find each other, but it never
            joins the conversation. Once the peers have exchanged offer, answer,
            and candidates, they connect directly and the server's part is over.
          </P>
        </Prose>
        <Callout kicker="What the server sees">
          Connection coordinates &mdash; never content. The offer/answer
          describe <em>how</em> to connect, not <em>what</em> you're sending. The
          file never passes through it.
        </Callout>
      </Section>

      {/* ---- 04 · STUN + NAT ---- */}
      <Section
        num="04"
        eyebrow="NAT traversal"
        heading="Finding a public address with STUN — and being honest when there isn't one."
        lede={
          <>
            Almost no device has a clean public address anymore. They sit behind a
            router doing <Term>NAT</Term>, which is why peers need help working
            out where they actually appear from the outside.
          </>
        }
      >
        <Prose>
          <P>
            A <Term>STUN</Term> server solves the easy half. A peer asks it one
            question &mdash; &ldquo;from out here, what address and port do I look
            like?&rdquo; &mdash; and STUN answers. Armed with that, two peers
            behind ordinary routers can &ldquo;hole-punch&rdquo;: aim packets at
            each other's discovered addresses at the same moment so each router
            accepts the other's traffic. STUN is tiny and cheap, so Wrap uses it
            freely.
          </P>
          <P>
            But some networks &mdash; symmetric NATs, strict corporate firewalls
            &mdash; rewrite ports so unpredictably that hole-punching can't work.
            The only fix is a <Term>TURN</Term> relay: a server that forwards
            every encrypted byte for the whole transfer. That's bandwidth someone
            has to pay for, and it quietly puts a server back in the middle of
            your data.
          </P>
        </Prose>

        <NatDiagram />

        <Callout kicker="The $0 tradeoff" tone="amb">
          Wrap runs no TURN relay. On the rare network where a direct path can't
          form, it tells you plainly instead of routing your file through a paid
          server. Free, honest, and never a middleman by stealth.
        </Callout>
      </Section>

      {/* ---- 05 · DTLS DataChannel ---- */}
      <Section
        num="05"
        eyebrow="Encryption"
        heading="The channel is encrypted before it carries a single byte."
        lede={
          <>
            Once the peers connect, the file rides a WebRTC{" "}
            <Term>DataChannel</Term> &mdash; and every DataChannel is wrapped in{" "}
            <Term>DTLS</Term> by the standard itself. Encryption isn't a feature
            you switch on; it's the only mode there is.
          </>
        }
        dark
      >
        <Prose>
          <P>
            During the handshake, the two peers also negotiate encryption keys
            and verify each other with certificate fingerprints. From that point
            on, the connection is end-to-end encrypted between the two devices.
            Because the bytes are encrypted at the source and decrypted only at
            the destination, anything in between &mdash; your router, your ISP,
            any network hop &mdash; sees only ciphertext.
          </P>
          <P>
            And since the file never touches Wrap's signaling server in the first
            place, end-to-end isn't a promise we ask you to trust. It's a
            consequence of the architecture: there is simply no point at which a
            server holds your readable file.
          </P>
        </Prose>
        <Callout kicker="End-to-end, by default">
          The keys live on the two devices. No server holds them, so no server
          could read the transfer even if it wanted to.
        </Callout>
      </Section>

      {/* ---- 06 · chunking + backpressure ---- */}
      <Section
        num="06"
        eyebrow="Moving the bytes"
        heading="Big files go across as a steady stream of 16 KB chunks."
        lede={
          <>
            You can't hand a multi-gigabyte file to the channel in one piece
            &mdash; it would exhaust memory. Wrap slices the file into small{" "}
            <Term>16 KB chunks</Term> and feeds them through one after another.
          </>
        }
      >
        <Prose>
          <P>
            Chunking keeps memory flat: only a small window of the file is in
            flight at any moment, no matter how large the whole thing is. That's
            why there's no size cap &mdash; the only real limit is free space on
            the receiving device.
          </P>
          <P>
            The second half is <Term>backpressure</Term>. The sender can produce
            chunks far faster than the network can carry them, so Wrap watches the
            channel's outgoing buffer. When it fills past a threshold, the sender
            pauses; when it drains, the sender resumes. The file moves at exactly
            the speed the link can sustain &mdash; fast where the network is fast,
            patient where it isn't, and never overflowing.
          </P>
        </Prose>

        <ChunkDiagram />
      </Section>

      {/* ---- 07 · durable object ---- */}
      <Section
        num="07"
        eyebrow="The server that barely exists"
        heading="A Cloudflare Durable Object that wakes to introduce two peers, then sleeps."
        lede={
          <>
            The one piece of server Wrap needs is the signaling switchboard. It
            runs as a Cloudflare <Term>Durable Object</Term> &mdash; a tiny,
            single-purpose coordinator that hibernates the instant it goes idle.
          </>
        }
        dark
      >
        <Prose>
          <P>
            When you open a transfer, a Durable Object spins up to hold one
            room's worth of signaling: it relays the offer, the answer, and the
            ICE candidates between your two devices. The moment the peers connect
            directly and the room falls quiet, it{" "}
            <Term>hibernates</Term> &mdash; freeing its resources until something
            else needs it.
          </P>
          <P>
            This is what makes Wrap free to run and trustworthy by design. There
            are no fleets of servers, no storage buckets, no file-handling tier to
            pay for or to breach. The only server-side component is a coordinator
            that sees connection notes for a few seconds and then goes back to
            sleep &mdash; while your file travels a path it was never on.
          </P>
        </Prose>
        <Callout kicker="The whole architecture, in one line">
          A server introduces the peers, then disappears. Everything that matters
          &mdash; your file &mdash; goes directly, encrypted, edge to edge.
        </Callout>
      </Section>

      <FooterCta />
    </div>
  );
}
