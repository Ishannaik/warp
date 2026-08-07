import { useState, type CSSProperties, type ReactNode } from "react";
import { navigate } from "../router";
import WarpLogo from "../WarpLogo";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * VsPage — shared template for the `/vs/<rival>` comparison pages (#120 part
 * 1-3). Takes all rival-specific content as props; individual pages (e.g.
 * `Wormhole.tsx`) supply the copy and change nothing here.
 *
 * Chrome (Nav/Footer/prose primitives) matches `legal/Legal.tsx` and
 * `content/WhyTransfersFail.tsx` so the three content surfaces read as one
 * design system.
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
        <NavLink to="/send">Send a file</NavLink>
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

/** Inline text link inside prose. */
export function A({ href, children }: { href: string; children: ReactNode }) {
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

export interface VsSection {
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

/* ========================================================= feature grid === */

/** A single cell's value plus whether it reads as a Warp win (accent) or a give-up (muted). */
export interface VsCell {
  value: ReactNode;
  ok: boolean;
}

export interface VsFeatureRow {
  label: string;
  warp: VsCell;
  rival: VsCell;
}

function FeatureTable({ rivalName, rows }: { rivalName: string; rows: VsFeatureRow[] }) {
  const isMobile = useIsMobile();
  const gridTemplate = "1.6fr 1fr 1fr";

  const tableStyle: CSSProperties = {
    border: `1px solid ${HAIR}`,
    fontFamily: MONO,
    minWidth: isMobile ? "480px" : undefined,
  };

  return (
    <div style={isMobile ? { overflowX: "auto", WebkitOverflowScrolling: "touch" } : {}}>
      <div style={tableStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
            background: "#15140f",
            borderBottom: `1px solid ${HAIR}`,
          }}
        >
          <div style={{ padding: "14px 16px", fontSize: "10.5px", letterSpacing: ".14em", color: "#6f6a5d" }}>
            CAPABILITY
          </div>
          <div
            style={{
              padding: "14px 10px",
              fontSize: "11px",
              letterSpacing: ".08em",
              color: "#efe9da",
              textAlign: "center",
              background: "rgba(var(--acc-rgb),.1)",
              borderLeft: "1px solid var(--acc)",
              borderRight: "1px solid var(--acc)",
            }}
          >
            WARP
          </div>
          <div style={{ padding: "14px 10px", fontSize: "11px", letterSpacing: ".08em", color: "#908a7b", textAlign: "center" }}>
            {rivalName.toUpperCase()}
          </div>
        </div>

        {rows.map((row, i) => {
          const isLast = i === rows.length - 1;
          return (
            <div
              key={row.label}
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate,
                ...(isLast ? {} : { borderBottom: "1px solid rgba(239,233,218,.08)" }),
              }}
            >
              <div style={{ padding: "13px 16px", fontSize: "12.5px", color: "#cdc8ba" }}>{row.label}</div>
              <div
                style={{
                  padding: "13px",
                  textAlign: "center",
                  color: "var(--acc)",
                  background: "rgba(var(--acc-rgb),.06)",
                  borderLeft: "1px solid rgba(var(--acc-rgb),.4)",
                  borderRight: "1px solid rgba(var(--acc-rgb),.4)",
                  ...(isLast ? { borderBottom: "1px solid var(--acc)" } : {}),
                }}
              >
                {row.warp.value}
              </div>
              <div style={{ padding: "13px", textAlign: "center", color: row.rival.ok ? "var(--acc)" : "#5a5648" }}>
                {row.rival.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================= page === */

export interface VsPageProps {
  /** Display name of the rival, e.g. "Wormhole.app". */
  rivalName: string;
  /** Short eyebrow suffix, e.g. "Comparison · Warp vs Wormhole.app". */
  eyebrow: string;
  /** H1 text. */
  title: string;
  /** Opening paragraph(s) under the H1. */
  lead: ReactNode;
  /** Feature comparison rows, rendered as a two-column table against Warp. */
  features: VsFeatureRow[];
  /** Prose sections below the table (how it works, honest caveats, verdict). */
  sections: VsSection[];
  /** Sources line at the bottom of the article, e.g. links to the rival's own docs. */
  sourcesNote: ReactNode;
}

export default function VsPage({ eyebrow, title, lead, features, rivalName, sections, sourcesNote }: VsPageProps) {
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
            {eyebrow}
          </div>
          <h1
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: isMobile ? "clamp(30px,9vw,42px)" : "clamp(40px,4.6vw,54px)",
              lineHeight: 1.05,
              letterSpacing: "-.03em",
              margin: "18px 0 0",
              color: "#efe9da",
            }}
          >
            {title}
          </h1>
          <div style={{ margin: isMobile ? "24px 0 0" : "28px 0 0" }}>{lead}</div>

          <div style={{ marginTop: isMobile ? "32px" : "40px" }}>
            <FeatureTable rivalName={rivalName} rows={features} />
          </div>

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
            {sourcesNote}
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export { P };
