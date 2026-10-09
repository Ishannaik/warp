import { useState, type ReactNode } from "react";
import { navigate } from "../router";
import WarpLogo from "../WarpLogo";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * ArchitectureNotPolicy — the "architecture, not policy" growth page (#119).
 *
 * The pitch docs/competitive-intel-2026-07.md section 4 calls "the money
 * narrative": Warp's no-server-touches-your-file claim is structural (there's
 * no code path that could send file bytes to a server), not a promise in a
 * ToS that a new owner could edit. Contrasted with two fresh, citable
 * incidents named in docs/ROADMAP.md — WeTransfer's 2025 AI-training clause
 * and the Snapdrop/LimeWire acquisition.
 *
 * Shell follows the ../legal/Legal.tsx pattern (Nav / prose Article / Footer)
 * since this is a long-form editorial page, not a diagram-driven deep-dive
 * like ../theory/Theory.tsx.
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
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "20px" : "28px" }}>
        <NavLink to="/how">How it works</NavLink>
        <NavLink href={REPO} external>GitHub</NavLink>
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

function Code({ children }: { children: ReactNode }) {
  return (
    <code
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
    </code>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        maxWidth: PROSE,
        margin: "26px 0",
        borderLeft: "2px solid var(--acc)",
        background: "#15140f",
        padding: "20px 24px",
      }}
    >
      <p
        style={{
          fontFamily: DISPLAY,
          fontWeight: 600,
          fontSize: "19px",
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

const SECTIONS: Sec[] = [
  {
    n: "01",
    heading: "A privacy promise can change hands. An architecture can't quietly be rewritten.",
    body: (
      <>
        <P>
          Two incidents from 2025 make the difference concrete. In July 2025, WeTransfer published updated
          terms &mdash; effective August 8, 2025 &mdash; whose Clause 6.3 granted a license broad enough to cover
          using uploaded content to improve AI and machine-learning models. Creatives who&rsquo;d used the service
          for confidential, often NDA-protected work reacted immediately; WeTransfer revised the clause on July 15,
          2025, removing the AI/ML wording and stating it had never used uploads for that purpose (
          <A href="https://www.theartnewspaper.com/2025/07/28/wetransfer-artificial-intelligence-terms-service-artists-intellectual-property">
            The Art Newspaper
          </A>
          , <A href="https://www.techradar.com/computing/artificial-intelligence/wetransfer-issues-flurry-of-promises-that-its-not-using-your-data-to-train-ai-models-after-its-new-terms-of-service-aroused-suspicion">
            TechRadar
          </A>
          ).
        </P>
        <P>
          Nothing about WeTransfer&rsquo;s architecture changed in that episode &mdash; files were already sitting
          on their servers before and after. Only a document changed, twice, in two weeks. That&rsquo;s what a
          policy is: a statement of current intent, editable by whoever holds the pen.
        </P>
        <P>
          Snapdrop is the sharper case. It was a genuinely peer-to-peer, browser-based LAN transfer tool &mdash;
          files never left the local network. In early 2025 LimeWire quietly acquired snapdrop.net (along with
          sharedrop.io, file.io, and filetransfer.io); afterward, transfers routed through LimeWire&rsquo;s cloud
          instead of staying local, with no warning to existing users. The project&rsquo;s own issue tracker
          carries the reaction &mdash; &ldquo;
          <A href="https://github.com/SnapDrop/snapdrop/issues/655">Limewire has RUINED Snapdrop</A>
          ,&rdquo; hundreds of upvotes &mdash; and it was widely covered outside the repo too (
          <A href="https://news.ycombinator.com/item?id=43348627">Hacker News</A>).
        </P>
        <Callout>
          Snapdrop didn&rsquo;t get a worse privacy policy. It got a new owner who put a server in the path that
          architecturally wasn&rsquo;t there before.
        </Callout>
      </>
    ),
  },
  {
    n: "02",
    heading: "What &ldquo;no server touches your file&rdquo; means, structurally.",
    body: (
      <>
        <P>
          Warp&rsquo;s claim isn&rsquo;t a promise to look away. There is no code path in this codebase that could
          send file bytes to a server, because the transfer never asks a server to relay them. The two peers open
          a <Code>RTCDataChannel</Code> directly (<Code>web/src/lib/warp/peer.ts</Code>), and WebRTC data channels
          are encrypted with <Code>DTLS</Code> by the standard itself &mdash; not a setting Warp could toggle off
          even if it wanted to. The keys are negotiated between the two browsers; no server is ever a party to
          that negotiation.
        </P>
        <P>
          The one server Warp runs (<Code>server/src/index.js</Code>) does exactly one job: it relays{" "}
          <Code>{"{ type: 'signal', to, data }"}</Code> messages &mdash; SDP offers/answers and ICE candidates
          &mdash; between two sockets in the same room. That handler reads a destination peer ID and an opaque
          signaling payload; it has no branch that reads, stores, or forwards a file chunk, because file chunks
          never touch it. And Warp runs <Code>STUN</Code> only (
          <Code>stun.l.google.com</Code>) &mdash; no <Code>TURN</Code> relay is configured, so there is no fallback
          server in the data path even when a direct connection is hard to establish. On networks where that
          fails, Warp says so plainly instead of quietly routing your file through a server to make it work.
        </P>
        <Callout>
          A ToS clause can change what a company promises to do with a file it already has. It cannot change
          whether Warp&rsquo;s server ever receives that file &mdash; the wiring for that doesn&rsquo;t exist.
        </Callout>
      </>
    ),
  },
  {
    n: "03",
    heading: "Verify it yourself. Don't take our word for it either.",
    body: (
      <>
        <P>
          The honest version of &ldquo;architecture, not policy&rdquo; isn&rsquo;t &ldquo;trust us instead of
          them.&rdquo; It&rsquo;s that you don&rsquo;t have to trust anyone &mdash; Warp is MIT-licensed and fully
          open source, so the claim above is checkable, not asserted. Read <Code>peer.ts</Code> to see the data
          channel never routes through the server; read <Code>server/src/index.js</Code> to see the signaling
          handler's entire surface. Fork it, self-host it, or diff a future release against what&rsquo;s described
          here.
        </P>
        <P>
          That&rsquo;s also the honest limit of this page: it describes what&rsquo;s true of the source on{" "}
          <A href={REPO}>GitHub</A> today. If Warp&rsquo;s architecture ever changed to add a relay, that would be
          a visible code change in a public repository &mdash; not an edit to a legal document nobody reads.
        </P>
      </>
    ),
  },
  {
    n: "04",
    heading: "What the signaling server does see &mdash; stated plainly, not buried in a policy.",
    body: (
      <P>
        To introduce two peers at all, the signaling server transiently sees each peer&rsquo;s IP address (used to
        route the handshake and to group devices on the same network for local discovery) and the short, ephemeral
        room code. That&rsquo;s the complete list &mdash; see{" "}
        <A href="/privacy">the privacy page</A> for the full breakdown. Naming it here isn&rsquo;t a policy
        promise about that data either: it&rsquo;s what the two functions in <Code>server/src/index.js</Code>{" "}
        (<Code>handleJoin</Code>, <Code>handleSignal</Code>) actually read, and nothing more.
      </P>
    ),
  },
];

/* ================================================================= page === */

export default function ArchitectureNotPolicy() {
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
            The moat
          </div>
          <h1
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: isMobile ? "clamp(34px,10vw,46px)" : "clamp(44px,5vw,60px)",
              lineHeight: 1,
              letterSpacing: "-.03em",
              margin: "18px 0 0",
              color: "#efe9da",
            }}
          >
            Architecture,
            <br />
            not policy.
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
            Most file-sharing tools promise not to look at your files. Warp doesn&rsquo;t have a server that could
            look &mdash; the transfer never touches one. That&rsquo;s not a policy choice a new owner could edit
            in an afternoon. It&rsquo;s how the two peers are wired together.
          </p>

          <div style={{ marginTop: isMobile ? "40px" : "56px" }}>
            {SECTIONS.map((s, i) => (
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
            Warp is free &amp; open-source. Read the source on <A href={REPO}>GitHub</A>, or see{" "}
            <A href="/how">how a transfer actually works</A>.
          </p>

          <a
            href="/send"
            onClick={(e) => { e.preventDefault(); navigate("/send"); }}
            style={{
              display: "inline-block",
              marginTop: isMobile ? "36px" : "48px",
              padding: "16px 30px",
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
      </main>

      <Footer />
    </div>
  );
}
