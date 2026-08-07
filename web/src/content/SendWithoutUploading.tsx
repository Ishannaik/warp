import { useState, type ReactNode } from "react";
import { navigate } from "../router";
import WarpLogo from "../WarpLogo";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * SendWithoutUploading — pain-point content page for "send files without
 * uploading to a server." Part 3 of the long-tail SEO series from #121
 * (siblings: #154, #155). Built as a standalone component for now since
 * neither sibling page has landed yet to establish a shared shell; the
 * article/nav/footer scaffolding is lifted from `legal/Legal.tsx` so a
 * future shared component can fold this in without a visual reset.
 *
 * Every claim here is checked against `server/src/index.js` (what the
 * signaling relay actually receives) and `web/src/lib/warp/peer.ts` (the
 * data-channel send path) — see the section bodies for specifics.
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";
const BODY = "'Archivo',system-ui,sans-serif";
const HAIR = "rgba(239,233,218,.14)";
const HAIR_SOFT = "rgba(239,233,218,.12)";
const PAGE = 1080;
const PROSE = 720;
const REPO = "https://github.com/Ishannaik/warp";

/* ============================================================== chrome ==== */

function NavLink({
  to,
  href,
  external,
  children,
}: {
  to?: string;
  href?: string;
  external?: boolean;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const target = to ?? href ?? "#";
  return (
    <a
      href={target}
      onClick={to ? (e) => { e.preventDefault(); navigate(to); } : undefined}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: MONO,
        fontSize: "12px",
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: hover ? "#efe9da" : "#908a7b",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}

function Nav() {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobile ? "16px 16px" : "20px 26px",
        borderBottom: `1px solid ${HAIR}`,
      }}
    >
      <a
        href="/"
        onClick={(e) => { e.preventDefault(); navigate("/"); }}
        style={{ display: "inline-flex", alignItems: "center", gap: "11px", textDecoration: "none", color: "#efe9da" }}
      >
        <WarpLogo size={26} />
        <span style={{ fontFamily: DISPLAY, fontSize: "21px", fontWeight: 800, letterSpacing: "-.02em" }}>
          WARP
        </span>
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "16px" : "24px" }}>
        <NavLink to="/how">How it works</NavLink>
        {!isMobile && <NavLink to="/">&larr; Home</NavLink>}
      </div>
    </div>
  );
}

function Footer() {
  const isMobile = useIsMobile();
  return (
    <footer
      style={{
        borderTop: `1px solid ${HAIR}`,
        padding: isMobile ? "30px 16px" : "34px 26px",
        marginTop: isMobile ? "64px" : "104px",
      }}
    >
      <div
        style={{
          maxWidth: PAGE,
          margin: "0 auto",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: isMobile ? "20px" : "16px",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
          <WarpLogo size={22} />
          <span style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 800 }}>WARP</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: isMobile ? "16px" : "24px" }}>
          <NavLink to="/how">How it works</NavLink>
          <NavLink to="/privacy">Privacy</NavLink>
          <NavLink href={REPO} external>GitHub</NavLink>
        </div>
        <div style={{ fontFamily: MONO, fontSize: "11px", color: "#4a463c", letterSpacing: ".06em", textTransform: "uppercase" }}>
          MIT licensed &middot; open web
        </div>
      </div>
    </footer>
  );
}

/* =========================================================== primitives === */

function P({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", margin: "0 0 18px" }}>
      {children}
    </p>
  );
}

function A({ href, children }: { href: string; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        color: "var(--acc)",
        textDecoration: hover ? "underline" : "none",
        textUnderlineOffset: "3px",
      }}
    >
      {children}
    </a>
  );
}

function InternalLink({ to, children }: { to: string; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={to}
      onClick={(e) => { e.preventDefault(); navigate(to); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        color: "var(--acc)",
        textDecoration: hover ? "underline" : "none",
        textUnderlineOffset: "3px",
      }}
    >
      {children}
    </a>
  );
}

interface Sec {
  n: string;
  heading: string;
  body: ReactNode;
}

function Article({ num, heading, body, first }: { num: string; heading: string; body: ReactNode; first?: boolean }) {
  const isMobile = useIsMobile();
  return (
    <section
      style={{
        borderTop: first ? "none" : `1px solid ${HAIR_SOFT}`,
        paddingTop: first ? 0 : isMobile ? "34px" : "44px",
        marginTop: first ? 0 : isMobile ? "34px" : "44px",
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: "11.5px",
          letterSpacing: ".2em",
          textTransform: "uppercase",
          color: "var(--acc)",
        }}
      >
        {num}
      </div>
      <h2
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: isMobile ? "23px" : "27px",
          lineHeight: 1.15,
          letterSpacing: "-.02em",
          color: "#efe9da",
          margin: "10px 0 18px",
        }}
      >
        {heading}
      </h2>
      {body}
    </section>
  );
}

/* ============================================================== content === */

const sections: Sec[] = [
  {
    n: "01",
    heading: "Nothing was uploaded, because nothing can be",
    body: (
      <P>
        Most "send a file" tools work the same way: your file travels <em>up</em> to a company's server first, sits
        there as a full copy, and only then travels <em>down</em> to whoever you're sending it to. Warp skips that
        detour entirely. The two browsers open a direct WebRTC data channel and the file streams straight from one
        device to the other &mdash; there's no server step in the middle for it to pass through, so there's nothing
        to upload.
      </P>
    ),
  },
  {
    n: "02",
    heading: "What the server does see",
    body: (
      <>
        <P>
          Two browsers on different networks can't just find each other, so Warp still runs a small signaling
          server (a Cloudflare Worker) to introduce them. Being honest about what that step touches:
        </P>
        <ul style={{ margin: "0 0 18px", paddingLeft: "20px" }}>
          <li style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", marginBottom: "8px" }}>
            The room code (a random 6-character string used to pair the two devices).
          </li>
          <li style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", marginBottom: "8px" }}>
            The SDP and ICE candidates exchanged during connection setup &mdash; opaque connection-negotiation
            data, not file content.
          </li>
          <li style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", marginBottom: "8px" }}>
            Each device's IP address, briefly, so the server can route the handshake and group devices on the
            same network for local discovery.
          </li>
        </ul>
        <P>
          That's the whole list. The server forwards those messages between the two browsers and otherwise ignores
          them &mdash; it has no code path that reads, stores, or understands a filename, a file byte, or anything
          about what's being sent. Once the two browsers are connected, the server isn't part of the transfer at
          all. See the full breakdown in <InternalLink to="/how">how Warp works</InternalLink>.
        </P>
      </>
    ),
  },
  {
    n: "03",
    heading: "The STUN-only trade-off",
    body: (
      <P>
        Warp uses STUN to discover a direct path and never falls back to relaying your file through a server, even
        when a direct connection is hard to establish. That's a deliberate trade-off: on some restrictive networks
        &mdash; strict corporate firewalls, certain symmetric NATs &mdash; a direct peer-to-peer path can't be
        formed, and Warp shows an honest connection error instead of quietly uploading your file somewhere to make
        the transfer work anyway. Most home and mobile networks connect directly without issue; when one doesn't,
        that's the cost of the "nothing was uploaded" guarantee actually holding.
      </P>
    ),
  },
];

/* ================================================================= page === */

export default function SendWithoutUploading() {
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        fontFamily: BODY,
        color: "#efe9da",
        overflowX: "hidden",
      }}
    >
      <Nav />

      <main style={{ padding: isMobile ? "44px 16px 0" : "72px 26px 0" }}>
        <div style={{ maxWidth: PROSE, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "12px",
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "#908a7b",
            }}
          >
            Send files &middot; no upload
          </div>
          <h1
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: isMobile ? "clamp(30px,9vw,40px)" : "clamp(40px,4.6vw,54px)",
              lineHeight: 1.04,
              letterSpacing: "-.03em",
              margin: "18px 0 0",
              color: "#efe9da",
            }}
          >
            Send files without uploading them to a server
          </h1>
          <p
            style={{
              fontFamily: BODY,
              fontSize: isMobile ? "17px" : "19px",
              lineHeight: 1.62,
              color: "#cdc8ba",
              margin: "24px 0 0",
            }}
          >
            Every cloud sharing tool puts a full copy of your file on a company's server before the other person can
            get it. Warp doesn't &mdash; it opens a direct, encrypted connection between two browsers and streams
            the file across it. The server that helps the two browsers find each other never touches a file byte.
          </p>

          <div style={{ marginTop: isMobile ? "36px" : "44px" }}>
            <a
              href="/send"
              onClick={(e) => { e.preventDefault(); navigate("/send"); }}
              style={{
                display: "inline-block",
                padding: "16px 28px",
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
          </div>

          <div style={{ marginTop: isMobile ? "44px" : "60px" }}>
            {sections.map((s, i) => (
              <Article key={s.n} num={s.n} heading={s.heading} body={s.body} first={i === 0} />
            ))}
          </div>

          <p
            style={{
              fontFamily: MONO,
              fontSize: "12px",
              lineHeight: 1.7,
              letterSpacing: ".03em",
              color: "#6f6a5d",
              margin: isMobile ? "44px 0 0" : "60px 0 0",
            }}
          >
            Warp is free &amp; open-source. Read the source on <A href={REPO}>GitHub</A>.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
