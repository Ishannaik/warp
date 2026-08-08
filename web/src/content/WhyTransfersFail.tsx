import { useState, type ReactNode } from "react";
import { navigate } from "../router";
import WarpLogo from "../WarpLogo";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * WhyTransfersFail — pain-point content page for "why does my file transfer
 * keep failing." Part 1 of the long-tail SEO series from #121 (siblings:
 * #155, #156). Built as a standalone component since neither sibling page
 * has landed yet; the article/nav/footer scaffolding is lifted from
 * `legal/Legal.tsx`, matching the pattern the sibling pages settled on.
 *
 * Every claim about Warp is checked against `docs/ARCHITECTURE.md` §3-4
 * (backpressure math, reconnect/rejoin, ICE restart, resume handshake) and
 * `web/src/lib/warp/useWarpTransfer.ts` (salvage/re-offer on channel close).
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
    heading: "It's rarely your connection — it's the upload",
    body: (
      <P>
        Most cloud share tools ask your browser to hold a tab open while it pushes the entire file up to a server,
        then a second copy has to come back down before the other person can even start. That's two full transfers
        of the same file, both gated behind a tab that can't be backgrounded, throttled, or closed. A dropped Wi-Fi
        signal, a laptop lid closing, or a phone locking mid-upload kills the job — and on most of these tools,
        "resume" means starting the whole upload over from byte zero.
      </P>
    ),
  },
  {
    n: "02",
    heading: "The specific ways it dies",
    body: (
      <>
        <P>The failure isn't random. It's usually one of three things:</P>
        <ul style={{ margin: "0 0 18px", paddingLeft: "20px" }}>
          <li style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", marginBottom: "8px" }}>
            <strong style={{ color: "#efe9da" }}>Tab limits.</strong> The upload only exists while that tab is
            active — switch apps on mobile, let the screen lock, or the OS reclaims the tab's memory, and the
            in-flight upload is gone.
          </li>
          <li style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", marginBottom: "8px" }}>
            <strong style={{ color: "#efe9da" }}>Size caps.</strong> Free tiers cap what a single transfer can hold;
            past that line the upload is rejected outright, not slowed down.
          </li>
          <li style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", marginBottom: "8px" }}>
            <strong style={{ color: "#efe9da" }}>Server timeouts.</strong> A large file on a slow or flaky
            connection can outlast the server's patience for a single request — it gives up mid-upload and the
            partial copy is discarded.
          </li>
        </ul>
        <P>
          None of these are edge cases. They're the direct, predictable cost of routing a file through a server
          that has to receive the whole thing before it can send any of it onward.
        </P>
      </>
    ),
  },
  {
    n: "03",
    heading: "Warp doesn't upload, so it doesn't have an upload to lose",
    body: (
      <P>
        Warp streams your file straight from one browser to the other over a direct, encrypted WebRTC data channel
        — there's no intermediate copy sitting on a server, no size cap tied to a storage tier, and no single
        request that has to survive start to finish. The file moves in a stream of chunks with backpressure
        (`SEND_HIGH_WATER = 8 MiB`, kept safely under Chrome's 16 MiB SCTP send-buffer ceiling — see{" "}
        <A href={`${REPO}/blob/main/docs/ARCHITECTURE.md`}>ARCHITECTURE.md §3</A> for the "frozen at 40%" bug this
        fixed), so a slow link stalls the pump instead of corrupting the transfer.
      </P>
    ),
  },
  {
    n: "04",
    heading: "What happens when the network actually drops",
    body: (
      <>
        <P>Warp is built assuming the network will flake, and it recovers at every layer instead of failing once:</P>
        <ul style={{ margin: "0 0 18px", paddingLeft: "20px" }}>
          <li style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", marginBottom: "8px" }}>
            <strong style={{ color: "#efe9da" }}>Signaling drop.</strong> The socket that helped the two devices
            find each other reconnects and rejoins the same room on a capped backoff — a session that's ever
            joined keeps retrying for the life of the tab, as long as the room itself is still there. If both
            devices lose signaling at once, the room only holds the code open for 3 minutes before it's released;
            past that, reconnecting gets an honest "room's gone" instead of silently working forever.
          </li>
          <li style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", marginBottom: "8px" }}>
            <strong style={{ color: "#efe9da" }}>Wi-Fi flap or a locked phone.</strong> The data connection gets a
            few seconds' grace to self-heal, then restarts ICE and re-offers automatically — the transfer just
            stalls on backpressure and resumes byte-exact once the link is back, because SCTP delivery is
            reliable and nothing sent was lost.
          </li>
          <li style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", marginBottom: "8px" }}>
            <strong style={{ color: "#efe9da" }}>The channel actually closes.</strong> Not every drop is
            recoverable in place. When it isn't, Warp keeps the tray item, rebuilds the connection, and re-offers
            the unfinished file — the receiver's already-written bytes are the resume point, so the transfer picks
            up where it left off instead of restarting.
          </li>
        </ul>
        <P>
          The progress bar reflects that: a paused transfer reads as <em>reconnecting</em>, not <em>failed</em>,
          and it continues from wherever it stopped rather than from zero. See the full mechanism in{" "}
          <InternalLink to="/how">how Warp works</InternalLink>.
        </P>
      </>
    ),
  },
];

/* ================================================================= page === */

export default function WhyTransfersFail() {
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
            Transfers &middot; reliability
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
            Why does my file transfer keep failing?
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
            Cloud share tools upload your file to a server before it can go anywhere, and that upload is exactly
            what a dropped connection or a locked phone kills. Warp sends the file directly between devices and
            recovers from a dropped connection instead of dying mid-transfer.
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
