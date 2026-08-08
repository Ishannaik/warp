import { useState, type ReactNode } from "react";
import { navigate } from "../router";
import WarpLogo from "../WarpLogo";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * VpnConnectionFailure — standalone explainer for "why won't Warp connect on
 * my VPN / corporate network" (#122), the honest-failure companion to
 * `WhyTransfersFail`. Scaffolding (nav/article/footer) mirrors that page and
 * `legal/Legal.tsx`, since neither the diagnostic-panel issue (#32) nor the
 * architecture-not-policy page has landed yet for this one to link into.
 *
 * Technical claims are checked against `peer.ts` (`everConnected`,
 * `MAX_ICE_RESTARTS`, `attemptRestart`'s nat-failed branch) and
 * `docs/ARCHITECTURE.md` §2 ("STUN-only, and honest about it").
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

function Li({ children }: { children: ReactNode }) {
  return (
    <li style={{ fontFamily: BODY, fontSize: "16.5px", lineHeight: 1.72, color: "#bdb7a8", marginBottom: "8px" }}>
      {children}
    </li>
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
    heading: "Warp needs two devices to find a direct path",
    body: (
      <P>
        Almost no device sits on the open internet with a stable address anymore — it's behind a router doing
        NAT (network address translation). Before Warp can open a peer-to-peer channel, both sides ask a{" "}
        <strong style={{ color: "#efe9da" }}>STUN</strong> server one question — "from out here, what address and
        port do I look like?" — then aim packets at each other's answer at the same moment so each router lets the
        other's traffic in. That's <em>hole-punching</em>, and on an ordinary home or mobile connection it works in
        milliseconds. Warp uses two public Google STUN servers for this and nothing else.
      </P>
    ),
  },
  {
    n: "02",
    heading: "VPNs and CGNAT break the one thing STUN depends on",
    body: (
      <>
        <P>
          Hole-punching only works if the address STUN discovers is the same one the router will actually use for
          your traffic. Two setups routinely break that assumption:
        </P>
        <ul style={{ margin: "0 0 18px", paddingLeft: "20px" }}>
          <Li>
            <strong style={{ color: "#efe9da" }}>Symmetric NAT / CGNAT.</strong> Carrier-grade NAT (common on
            mobile carriers and some ISPs) and many VPN exit nodes share one public IP across a lot of
            subscribers, and assign a <em>different</em> outbound port for every destination instead of reusing
            one. The port STUN just discovered is already wrong for the specific peer trying to reach you back.
          </Li>
          <Li>
            <strong style={{ color: "#efe9da" }}>Corporate/restrictive firewalls.</strong> Some VPN and office
            networks block outbound UDP entirely, or only allow it to a fixed allowlist — STUN itself, or the ICE
            candidate pairs Warp tries next, never get out.
          </Li>
        </ul>
        <P>
          Either way, the fix WebRTC has for this is a <strong style={{ color: "#efe9da" }}>TURN</strong> relay — a
          server that forwards every byte of the transfer when a direct path can't form. Warp doesn't run one.
        </P>
      </>
    ),
  },
  {
    n: "03",
    heading: "Why Warp shows an honest error instead of a relay",
    body: (
      <>
        <P>
          Adding TURN would fix this specific failure — and quietly put a server back in the middle of every file
          that hits it, plus bandwidth costs that break the $0 constraint the project runs on (see{" "}
          <A href={`${REPO}/blob/main/CONTRIBUTING.md#hard-constraints-the-soul-of-the-project`}>
            CONTRIBUTING.md's hard constraints
          </A>
          ). So Warp doesn't retry forever pretending it might still connect: `peer.ts` tracks whether a channel
          has <em>ever</em> come up (`everConnected`). If it never does and the connection state reaches{" "}
          <code style={{ fontFamily: MONO, fontSize: "0.92em" }}>failed</code>, that's a real NAT block, not a
          blip — Warp surfaces `nat-failed` straight away rather than dressing it up as something recoverable. A
          connection that <em>did</em> come up first and then drops is a different, recoverable case (ICE
          restarts up to three times before giving up on that one) — see{" "}
          <InternalLink to="/how">how Warp works</InternalLink> for that path.
        </P>
      </>
    ),
  },
  {
    n: "04",
    heading: "What to actually try",
    body: (
      <>
        <P>The honest list is short, because there's no workaround for symmetric NAT — only ways around it:</P>
        <ul style={{ margin: "0 0 18px", paddingLeft: "20px" }}>
          <Li>
            <strong style={{ color: "#efe9da" }}>Turn the VPN off just for the transfer.</strong> If it's a
            personal VPN app rather than a device-managed corporate one, disconnecting it usually puts you back on
            your ISP's ordinary NAT.
          </Li>
          <Li>
            <strong style={{ color: "#efe9da" }}>Try a mobile hotspot.</strong> A different network path sidesteps
            whatever the VPN or office firewall is doing, even if only for one device.
          </Li>
          <Li>
            <strong style={{ color: "#efe9da" }}>Ask the other person to try from theirs.</strong> A direct path
            only needs <em>one</em> side to be reachable — if you're both behind restrictive networks, having
            either one switch is often enough.
          </Li>
        </ul>
        <P>
          What Warp won't do is silently fall back to routing your file through a server to paper over this — see{" "}
          <InternalLink to="/privacy">privacy</InternalLink> for why that boundary matters.
        </P>
      </>
    ),
  },
];

/* ================================================================= page === */

export default function VpnConnectionFailure() {
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
            Connectivity &middot; honest failure
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
            Why won't Warp connect on my VPN?
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
            Some VPNs and corporate networks make it impossible for two devices to find each other directly — no
            file-sharing tool can fix that without routing your file through a server. Here's exactly why, and
            what Warp does instead.
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
