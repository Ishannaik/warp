import { useState, type ReactNode } from "react";
import { navigate } from "../router";
import WarpLogo from "../WarpLogo";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * Legal — shared shell for the "/terms" and "/privacy" pages, switched by the
 * `kind` prop. Long-form, plain-English, honest copy (no scary boilerplate);
 * uses only true facts about Warp.
 *
 * Built on the Warp design system — dark palette, Bricolage / Archivo /
 * JetBrains Mono, hairline rules, mono eyebrows, accent var(--acc). The article
 * column is capped at ~720px for readability; nav + footer span a wider rail.
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";
const BODY = "'Archivo',system-ui,sans-serif";
const HAIR = "rgba(239,233,218,.14)";
const HAIR_SOFT = "rgba(239,233,218,.12)";
const PAGE = 1080;
const PROSE = 720;

const UPDATED = "Last updated: June 2026";
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
        <NavLink to="/">&larr; Home</NavLink>
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
          <NavLink to="/brand">Brand</NavLink>
          <NavLink to="/terms">Terms</NavLink>
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

/** Inline text link inside prose. */
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

function termsContent(): { lead: ReactNode; sections: Sec[] } {
  return {
    lead: (
      <>
        Warp is a small, open-source hobby project, and these terms are written in plain English &mdash; no scary
        boilerplate. By using Warp you agree to them. The short version: it&rsquo;s a free tool that connects two
        browsers directly; what you send, and your right to send it, is on you.
      </>
    ),
    sections: [
      {
        n: "01",
        heading: "What Warp is",
        body: (
          <>
            <P>
              Warp is a free, open-source (<A href={REPO}>MIT-licensed</A>) hobby project. It brokers a direct,
              peer-to-peer (WebRTC) connection between two browsers so you can send files straight from one device
              to another.
            </P>
            <P>
              Warp does not host, store, scan, or relay the contents of your files. It is provided{" "}
              <strong style={{ color: "#efe9da", fontWeight: 600 }}>&ldquo;AS IS,&rdquo;</strong> with no warranty
              of any kind. Availability is best-effort and is not guaranteed &mdash; this is a side project, not a
              service-level commitment.
            </P>
          </>
        ),
      },
      {
        n: "02",
        heading: "Your files are your responsibility",
        body: (
          <P>
            You are solely responsible for the files you choose to send and for having the right to send them. Don&rsquo;t
            use Warp for anything illegal or abusive, or to share material that infringes someone else&rsquo;s rights.
            Because Warp never sees your files, this judgement is entirely yours to make.
          </P>
        ),
      },
      {
        n: "03",
        heading: "Transfers are direct and ephemeral",
        body: (
          <P>
            Files travel directly device-to-device and nothing is kept afterwards. That means Warp can&rsquo;t recover,
            resend, or guarantee delivery of any transfer. Transfers can fail &mdash; for example across a strict NAT
            where a direct path can&rsquo;t be formed &mdash; and that&rsquo;s expected behaviour, not a defect. If a
            transfer matters, confirm it arrived.
          </P>
        ),
      },
      {
        n: "04",
        heading: "No warranty, no liability",
        body: (
          <P>
            To the maximum extent permitted by law, Warp and its author accept no liability for any transfer that is
            lost, failed, intercepted, or mis-sent, or for any damages arising from your use of the tool. You use Warp
            at your own risk.
          </P>
        ),
      },
      {
        n: "05",
        heading: "Changes to these terms",
        body: (
          <P>
            These terms may change over time. When they do, the date below updates with them. Continued use of Warp
            means you accept the current version.
          </P>
        ),
      },
      {
        n: "06",
        heading: "Open source",
        body: (
          <P>
            Warp is MIT licensed and fully open. You&rsquo;re free to read, audit, fork, or self-host it &mdash; trust
            the code, not a promise. The licence and the full source live on <A href={REPO}>GitHub</A>.
          </P>
        ),
      },
    ],
  };
}

function privacyContent(): { lead: ReactNode; sections: Sec[] } {
  return {
    lead: (
      <>
        Warp is a small, open-source project, and this policy is written in plain English. The short version:{" "}
        <strong style={{ color: "#efe9da", fontWeight: 600 }}>your files never touch a server.</strong> There are no
        accounts and no tracking. Here&rsquo;s exactly what does and doesn&rsquo;t happen.
      </>
    ),
    sections: [
      {
        n: "01",
        heading: "No accounts, no tracking",
        body: (
          <P>
            There are no accounts, no sign-up, and no logins. Warp uses no analytics, no ad trackers, and no
            third-party tracking cookies &mdash; the app uses only what it needs to function. There&rsquo;s no profile
            of you to build, because nothing is collected to build it from.
          </P>
        ),
      },
      {
        n: "02",
        heading: "Your files never touch a server",
        body: (
          <P>
            Files stream directly between the two devices over an end-to-end encrypted (DTLS) WebRTC channel. No server
            &mdash; including Warp&rsquo;s &mdash; ever receives, stores, or can read your file bytes. The encryption
            keys live only on the two devices, so there is no copy anywhere in between for anyone to read.
          </P>
        ),
      },
      {
        n: "03",
        heading: "What the signaling server sees",
        body: (
          <>
            <P>
              To connect two browsers, Warp needs to introduce them. A small signaling server (a Cloudflare Worker plus
              a Durable Object) brokers only that handshake &mdash; nothing more.
            </P>
            <P>
              To do its job it transiently sees each peer&rsquo;s IP address &mdash; used to route the handshake and to
              group devices on the same network for local discovery &mdash; and the short, ephemeral room code. It does
              not store your files. Room state lives only in the live connections and is discarded when they close; the
              worker hibernates when idle.
            </P>
          </>
        ),
      },
      {
        n: "04",
        heading: "Hosting & fonts",
        body: (
          <P>
            The site and the signaling server run on <A href="https://www.cloudflare.com/">Cloudflare</A>, which
            processes network requests as infrastructure &mdash; standard for any website. Web fonts are loaded from{" "}
            <A href="https://fonts.google.com/">Google Fonts</A>, so Google may receive font requests when you load a
            page. Neither is used to track you by Warp.
          </P>
        ),
      },
      {
        n: "05",
        heading: "Changes to this policy",
        body: (
          <P>
            Like the project, this policy can evolve. The date below always reflects the current version. Because the
            whole thing is open source, you can also read exactly how Warp behaves in the{" "}
            <A href={REPO}>source on GitHub</A>.
          </P>
        ),
      },
    ],
  };
}

/* ================================================================= page === */

export default function Legal({ kind }: { kind: "terms" | "privacy" }) {
  const isMobile = useIsMobile();
  const isTerms = kind === "terms";
  const { lead, sections } = isTerms ? termsContent() : privacyContent();
  const title = isTerms ? "Terms of Service" : "Privacy Policy";
  const eyebrow = isTerms ? "Legal · Terms" : "Legal · Privacy";

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
          {/* header */}
          <div
            style={{
              fontFamily: MONO,
              fontSize: "12px",
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "#908a7b",
            }}
          >
            {eyebrow}
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
            {title}
          </h1>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "12px",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "#6f6a5d",
              margin: "18px 0 0",
            }}
          >
            {UPDATED}
          </div>
          <p
            style={{
              fontFamily: BODY,
              fontSize: isMobile ? "17px" : "19px",
              lineHeight: 1.62,
              color: "#cdc8ba",
              margin: "24px 0 0",
            }}
          >
            {lead}
          </p>

          {/* sections */}
          <div style={{ marginTop: isMobile ? "40px" : "56px" }}>
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
            {UPDATED} &middot; Warp is free &amp; open-source. Read the source on{" "}
            <A href={REPO}>GitHub</A>.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
