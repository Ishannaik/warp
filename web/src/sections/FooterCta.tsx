import { useState } from "react";
import { navigate } from "../router";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * FooterCta — closing call-to-action + footer bar.
 * Ported verbatim from the Wrap design export (FOOTER CTA section):
 *  - giant masked <h2> "Send it / straight through." with accent glow
 *  - "Start a transfer →" button
 *  - footer chrome: wordmark, links, "MIT LICENSED · MADE FOR THE OPEN WEB"
 *
 * The source used `style-hover` on the footer links; reimplemented here as
 * React hover state (muted #6f6a5d -> ink #efe9da).
 */

const footerLinks: { label: string; href: string; external?: boolean; to?: string }[] = [
  { label: "How it works", href: "#work" },
  { label: "Security", href: "#trust" },
  { label: "FAQ", href: "#faq" },
  { label: "Brand", href: "/brand", to: "/brand" },
  { label: "Terms", href: "/terms", to: "/terms" },
  { label: "Privacy", href: "/privacy", to: "/privacy" },
  { label: "GitHub", href: "https://github.com/Ishannaik/warp", external: true },
];

function FooterLink({ label, href, external, to }: { label: string; href: string; external?: boolean; to?: string }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onClick={to ? (e) => { e.preventDefault(); navigate(to); } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ color: hover ? "#efe9da" : "#6f6a5d", textDecoration: "none" }}
    >
      {label}
    </a>
  );
}

export default function FooterCta() {
  const isMobile = useIsMobile();
  return (
    <section
      style={{
        position: "relative",
        zIndex: 4,
        borderTop: "1px solid rgba(239,233,218,.13)",
        padding: isMobile ? "72px 18px 0" : "120px 26px 0",
        overflow: "hidden",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", textAlign: "center" }}>
        <h2
          style={{
            fontFamily: "'Bricolage Grotesque',sans-serif",
            fontWeight: 800,
            fontSize: isMobile ? "clamp(34px,11vw,56px)" : "clamp(48px,9vw,140px)",
            lineHeight: 0.88,
            letterSpacing: "-.04em",
            textTransform: "uppercase",
            margin: 0,
            color: "#efe9da",
            overflowWrap: "break-word",
          }}
        >
          Send it
          <br />
          <span
            style={{
              color: "var(--acc)",
              textShadow: "0 0 60px rgba(var(--acc-rgb),.4)",
            }}
          >
            straight through.
          </span>
        </h2>
        <a
          href="/send"
          onClick={(e) => {
            e.preventDefault();
            navigate("/send");
          }}
          style={{
            display: "inline-block",
            marginTop: 40,
            padding: "18px 34px",
            background: "var(--acc)",
            color: "#fff",
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          Start a transfer &nbsp;&rarr;
        </a>
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: "11.5px",
            letterSpacing: ".1em",
            color: "#6f6a5d",
            textTransform: "uppercase",
            marginTop: 20,
          }}
        >
          Free forever &middot; no account &middot; opens in your browser
        </div>
      </div>

      <div
        style={{
          maxWidth: 1320,
          margin: isMobile ? "56px auto 0" : "96px auto 0",
          borderTop: "1px solid rgba(239,233,218,.13)",
          padding: "30px 0",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: isMobile ? 22 : 16,
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            style={{
              width: 22,
              height: 22,
              background: "var(--acc)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 8, height: 8, background: "#121110" }} />
          </div>
          <span
            style={{
              fontFamily: "'Bricolage Grotesque',sans-serif",
              fontSize: 17,
              fontWeight: 800,
            }}
          >
            WARP
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: isMobile ? 18 : 28,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 12,
            color: "#6f6a5d",
            textTransform: "uppercase",
            letterSpacing: ".06em",
          }}
        >
          {footerLinks.map((l) => (
            <FooterLink key={l.label} label={l.label} href={l.href} external={l.external} to={l.to} />
          ))}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 11,
            color: "#4a463c",
            letterSpacing: ".06em",
          }}
        >
          MIT LICENSED &middot; MADE FOR THE OPEN WEB
        </div>
      </div>
    </section>
  );
}
