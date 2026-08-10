import { useState, type ReactNode } from "react";
import { navigate } from "../router";
import WarpLogo from "../WarpLogo";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * WeTransferSizeLimit — pain-point content page for "wetransfer 3gb limit."
 * Part 2 of 3 of #121 (siblings: #154, #156). Neither sibling has landed
 * yet, so this is a standalone component for now, styled off `legal/Legal.tsx`
 * the same way the rest of the site's content pages are — a future shared
 * shell across the series can fold this in without a visual reset.
 *
 * The 3 GB figure is WeTransfer's own stated free-plan cap, checked at
 * https://wetransfer.com/resources/free-file-transfer/wetransfer-file-size-limit
 * on 2026-08-08 ("Free accounts let you send up to 3 GB per transfer.").
 * Claims about Warp's chunking/backpressure are checked against
 * `web/src/lib/warp/peer.ts` (SEND_HIGH_WATER, TARGET_SEND_CHUNK) and
 * `web/src/lib/warp/receiveController.ts` (no server-side storage step).
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
    heading: "The 3 GB cap is the free plan, not a technical wall",
    body: (
      <P>
        WeTransfer's own help pages put it plainly: free accounts can send up to 3 GB per transfer, across up to 10
        transfers in a rolling 30-day window, and the download link expires after 3 days. That's not a limit of the
        internet or of WebRTC &mdash; it's a product decision, because every file you send through WeTransfer sits
        as a full copy on their servers until someone downloads it or the link expires. Storage and bandwidth cost
        money, so the free tier caps how much of it you can use.
      </P>
    ),
  },
  {
    n: "02",
    heading: "Warp doesn't have that wall because there's no copy to store",
    body: (
      <>
        <P>
          Warp streams your file straight from your device to the other person's over a WebRTC data channel &mdash;
          in chunks, sent as fast as the channel's own backpressure allows, with nothing landing on a server in
          between. There's no bucket to fill, so there's no plan tier gating how full it's allowed to get. A 300 MB
          file and a 30 GB file take the same code path, with no plan-tier cap in the way &mdash; though a few
          real-world things still gate it: connection speed, whichever browser storage the receiving end falls back
          to when it can't stream straight to a picked file or folder (Safari doesn't have the File System Access
          API, so it's staging through IndexedDB with its own quota), and getting a direct path between the two
          devices at all &mdash; Warp is STUN-only, so a strict/symmetric NAT on both sides gets an honest failure
          instead of a silent server relay.
        </P>
        <P>
          See the mechanics &mdash; and what the signaling server actually touches &mdash; in{" "}
          <InternalLink to="/how">how Warp works</InternalLink>.
        </P>
      </>
    ),
  },
  {
    n: "03",
    heading: "The trade-off: both people have to be online at once",
    body: (
      <P>
        Being upfront about the other side of this: because Warp never stores your file, there's no 3-day link to
        forward later. Both browsers need their tab open and connected at the same time for the transfer to happen
        &mdash; closer to a phone call than to dropping a package at a locker. If you need "send it now, they grab
        it Thursday," that's exactly the job WeTransfer's server copy is built for. If you're both at your
        computers right now, Warp skips the upload entirely.
      </P>
    ),
  },
];

/* ================================================================= page === */

export default function WeTransferSizeLimit() {
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
            Send files &middot; no size cap
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
            Past WeTransfer's 3 GB free limit? Skip the upload instead
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
            WeTransfer's free plan caps you at 3 GB per transfer because every file passes through their servers.
            Warp doesn't upload anywhere &mdash; it streams the file peer-to-peer, straight to the other device, so
            there's no server copy to cap in the first place.
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
            Warp is free &amp; open-source &mdash; read the source on <A href={REPO}>GitHub</A>.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
