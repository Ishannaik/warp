import { useState, type ReactNode } from "react";
import { navigate } from "../router";
import WarpLogo from "../WarpLogo";
import { useIsMobile } from "../lib/useIsMobile";
import { copyToClipboard } from "../lib/copyToClipboard";

/**
 * BrandKit — the "/brand" press / brand-kit page.
 *
 * A polished, gridded reference for the Warp identity: the three logo marks
 * (with SVG + PNG downloads), the colour tokens (click-to-copy hex), the three
 * typefaces, and brief usage do/don'ts.
 *
 * Built entirely on the Warp design system — dark palette, Bricolage / Archivo /
 * JetBrains Mono, hairline borders, mono eyebrows, accent var(--acc) / amber
 * var(--amb). Inline-style-heavy to match the rest of the site. Brand assets are
 * referenced by absolute path from public/ (e.g. /brand/warp-mark.svg).
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";
const BODY = "'Archivo',system-ui,sans-serif";
const HAIR = "rgba(239,233,218,.14)";
const HAIR_SOFT = "rgba(239,233,218,.12)";
const CONTAINER = 1120;

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
        <NavLink href="https://github.com/Ishannaik/warp" external>GitHub</NavLink>
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
          maxWidth: CONTAINER,
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
          <NavLink href="https://github.com/Ishannaik/warp" external>GitHub</NavLink>
        </div>
        <div style={{ fontFamily: MONO, fontSize: "11px", color: "#4a463c", letterSpacing: ".06em", textTransform: "uppercase" }}>
          MIT licensed &middot; open web
        </div>
      </div>
    </footer>
  );
}

/* =========================================================== primitives === */

function Block({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <section
      style={{
        borderTop: `1px solid ${HAIR}`,
        padding: isMobile ? "48px 16px" : "72px 26px",
      }}
    >
      <div style={{ maxWidth: CONTAINER, margin: "0 auto" }}>
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
            fontSize: "clamp(26px,3.4vw,40px)",
            lineHeight: 1.05,
            letterSpacing: "-.025em",
            margin: "12px 0 0",
            color: "#efe9da",
            maxWidth: "20ch",
          }}
        >
          {title}
        </h2>
        {intro && (
          <p
            style={{
              fontFamily: BODY,
              fontSize: "16px",
              lineHeight: 1.6,
              color: "#a8a293",
              maxWidth: "62ch",
              margin: "16px 0 0",
            }}
          >
            {intro}
          </p>
        )}
        <div style={{ marginTop: isMobile ? "30px" : "44px" }}>{children}</div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- logo --- */

function DownloadLink({ href, label }: { href: string; label: string }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={href}
      download
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: MONO,
        fontSize: "11px",
        letterSpacing: ".1em",
        textTransform: "uppercase",
        textDecoration: "none",
        padding: "5px 12px",
        border: `1px solid ${hover ? "var(--acc)" : HAIR}`,
        color: hover ? "#efe9da" : "#a8a293",
        background: hover ? "rgba(83,96,255,.08)" : "transparent",
      }}
    >
      {label}
    </a>
  );
}

function MarkCard({
  stageBg,
  src,
  alt,
  label,
  svg,
  png,
}: {
  stageBg: string;
  src: string;
  alt: string;
  label: string;
  svg: string;
  png: string;
}) {
  const isMobile = useIsMobile();
  return (
    <div style={{ border: `1px solid ${HAIR}`, background: "#15140f", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          background: stageBg,
          height: isMobile ? 140 : 168,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: `1px solid ${HAIR_SOFT}`,
        }}
      >
        <img src={src} alt={alt} width={88} height={88} style={{ display: "block" }} />
      </div>
      <div
        style={{
          padding: "15px 17px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10.5px",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#908a7b",
          }}
        >
          {label}
        </span>
        <span style={{ display: "flex", gap: "8px" }}>
          <DownloadLink href={svg} label="SVG" />
          <DownloadLink href={png} label="PNG" />
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- colour --- */

const SWATCHES: { name: string; hex: string }[] = [
  { name: "bg", hex: "#121110" },
  { name: "darker", hex: "#0e0d0a" },
  { name: "card", hex: "#15140f" },
  { name: "ink", hex: "#efe9da" },
  { name: "body", hex: "#a8a293" },
  { name: "muted", hex: "#6f6a5d" },
  { name: "accent", hex: "#5360ff" },
  { name: "amber", hex: "#ef6a3d" },
];

function Swatch({ name, hex }: { name: string; hex: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copy = () => {
    void copyToClipboard(hex).then((ok) => {
      if (ok) {
        setCopied(true);
        setCopyFailed(false);
        window.setTimeout(() => setCopied(false), 1200);
      } else {
        setCopyFailed(true);
        setCopied(false);
        window.setTimeout(() => setCopyFailed(false), 1800);
      }
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${hex}`}
      style={{
        width: "100%",
        textAlign: "left",
        border: `1px solid ${HAIR}`,
        background: "#15140f",
        padding: 0,
        cursor: "pointer",
        display: "block",
        color: "#efe9da",
        fontFamily: BODY,
      }}
    >
      <div style={{ height: 76, background: hex, borderBottom: `1px solid ${HAIR_SOFT}` }} />
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "15px", letterSpacing: "-.01em" }}>{name}</div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: "12px",
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: copyFailed ? "var(--amb)" : copied ? "var(--acc)" : "#6f6a5d",
            marginTop: "4px",
          }}
        >
          {copyFailed ? "copy failed" : copied ? "Copied ✓" : hex}
        </div>
      </div>
    </button>
  );
}

/* ----------------------------------------------------------------- type --- */

function TypeRow({
  font,
  weight,
  sample,
  size,
  name,
  role,
  weightLabel,
  first,
}: {
  font: string;
  weight: number;
  sample: string;
  size: string;
  name: string;
  role: string;
  weightLabel: string;
  first?: boolean;
}) {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        borderTop: first ? "none" : `1px solid ${HAIR_SOFT}`,
        padding: isMobile ? "26px 0" : "32px 0",
      }}
    >
      <div
        style={{
          fontFamily: font,
          fontWeight: weight,
          fontSize: size,
          lineHeight: 1.2,
          letterSpacing: font === DISPLAY ? "-.02em" : "0",
          color: "#efe9da",
        }}
      >
        {sample}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: isMobile ? "6px 14px" : "26px",
          marginTop: "16px",
          fontFamily: MONO,
          fontSize: "11.5px",
          letterSpacing: ".08em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ color: "var(--acc)" }}>{name}</span>
        <span style={{ color: "#6f6a5d" }}>{role}</span>
        <span style={{ color: "#6f6a5d" }}>{weightLabel}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- usage --- */

function UsageCol({ tone, kicker, items }: { tone: "acc" | "amb"; kicker: string; items: string[] }) {
  const color = tone === "amb" ? "var(--amb)" : "var(--acc)";
  return (
    <div style={{ borderLeft: `2px solid ${color}`, background: "#15140f", padding: "22px 24px" }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: "11px",
          letterSpacing: ".2em",
          textTransform: "uppercase",
          color,
          marginBottom: "16px",
        }}
      >
        {kicker}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "13px" }}>
        {items.map((t) => (
          <li
            key={t}
            style={{
              fontFamily: BODY,
              fontSize: "15px",
              lineHeight: 1.5,
              color: "#cdc8ba",
              paddingLeft: "18px",
              position: "relative",
            }}
          >
            <span style={{ position: "absolute", left: 0, color, fontFamily: MONO }}>
              {tone === "amb" ? "×" : "→"}
            </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ================================================================= page === */

export default function BrandKit() {
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

      {/* hero */}
      <header style={{ padding: isMobile ? "44px 16px 8px" : "76px 26px 16px" }}>
        <div style={{ maxWidth: CONTAINER, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "12px",
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "#908a7b",
            }}
          >
            Press &middot; Brand kit
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobile ? "16px" : "22px",
              margin: "22px 0 0",
            }}
          >
            <WarpLogo size={isMobile ? 52 : 66} />
            <span
              style={{
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: isMobile ? "clamp(44px,16vw,72px)" : "clamp(64px,8vw,104px)",
                letterSpacing: "-.04em",
                lineHeight: 0.9,
                textTransform: "uppercase",
              }}
            >
              Warp
            </span>
          </div>
          <p
            style={{
              fontFamily: BODY,
              fontSize: isMobile ? "18px" : "21px",
              lineHeight: 1.5,
              color: "#cdc8ba",
              maxWidth: "44ch",
              margin: "26px 0 0",
            }}
          >
            The Warp brand kit &mdash; marks, colour, type.
          </p>
        </div>
      </header>

      {/* (b) LOGO */}
      <Block
        eyebrow="01 / Logo"
        title="The mark"
        intro={
          <>
            A sharp accent tile with a forward &raquo; double-chevron &mdash; speed, and a direct
            device-to-device line. Use the variant that fits the surface; don&rsquo;t rebuild or recolour it.
          </>
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))",
            gap: isMobile ? "16px" : "18px",
          }}
        >
          <MarkCard
            stageBg="#121110"
            src="/brand/warp-mark.svg"
            alt="Warp primary mark — accent tile with a black double-chevron"
            label="Primary &middot; accent tile"
            svg="/brand/warp-mark.svg"
            png="/brand/warp-mark.png"
          />
          <MarkCard
            stageBg="#0e0d0a"
            src="/brand/warp-mark-light.svg"
            alt="Warp light glyph — off-white double-chevron for dark surfaces"
            label="Light glyph &middot; on dark"
            svg="/brand/warp-mark-light.svg"
            png="/brand/warp-mark-light.png"
          />
          <MarkCard
            stageBg="#efe9da"
            src="/brand/warp-mark-dark.svg"
            alt="Warp dark glyph — near-black double-chevron for light surfaces"
            label="Dark glyph &middot; on light"
            svg="/brand/warp-mark-dark.svg"
            png="/brand/warp-mark-dark.png"
          />
        </div>
        <p
          style={{
            fontFamily: MONO,
            fontSize: "12px",
            lineHeight: 1.7,
            letterSpacing: ".03em",
            color: "#6f6a5d",
            margin: "24px 0 0",
          }}
        >
          The favicon &amp; app-icon kit ships with the site:{" "}
          <FaviconLink href="/favicon.svg">/favicon.svg</FaviconLink>,{" "}
          <FaviconLink href="/favicon-32.png">/favicon-32.png</FaviconLink>,{" "}
          <FaviconLink href="/apple-touch-icon.png">/apple-touch-icon.png</FaviconLink>,{" "}
          <FaviconLink href="/icon-192.png">/icon-192.png</FaviconLink>,{" "}
          <FaviconLink href="/icon-512.png">/icon-512.png</FaviconLink>.
        </p>
      </Block>

      {/* (c) COLOUR */}
      <Block
        eyebrow="02 / Colour"
        title="Palette"
        intro={
          <>
            Eight tokens carry the whole system. The accent (
            <span style={{ color: "var(--acc)", fontFamily: MONO }}>#5360ff</span>) is the only brand
            colour; amber is reserved for warnings. Click any swatch to copy its hex.
          </>
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))",
            gap: isMobile ? "12px" : "16px",
          }}
        >
          {SWATCHES.map((s) => (
            <Swatch key={s.name} name={s.name} hex={s.hex} />
          ))}
        </div>
      </Block>

      {/* (d) TYPE */}
      <Block
        eyebrow="03 / Type"
        title="Typefaces"
        intro="Three families, each with one job: a confident display face, a steady body face, and a mono for labels and code."
      >
        <div>
          <TypeRow
            first
            font={DISPLAY}
            weight={700}
            size={isMobile ? "30px" : "clamp(30px,4vw,46px)"}
            sample="Send it straight through."
            name="Bricolage Grotesque"
            role="Display &middot; headings"
            weightLabel="700 / 800"
          />
          <TypeRow
            font={BODY}
            weight={400}
            size={isMobile ? "18px" : "22px"}
            sample="Files move directly between two devices over an encrypted channel — no server sits in the middle."
            name="Archivo"
            role="Body &middot; running text"
            weightLabel="400 / 500"
          />
          <TypeRow
            font={MONO}
            weight={500}
            size={isMobile ? "14px" : "17px"}
            sample="PEER-TO-PEER · ROOM/4F2K9Q · #5360FF"
            name="JetBrains Mono"
            role="Mono &middot; labels, code, UI chrome"
            weightLabel="500 / 600"
          />
        </div>
      </Block>

      {/* (e) USAGE */}
      <Block
        eyebrow="04 / Usage"
        title="Using the mark"
        intro="A few rules keep the identity sharp wherever it shows up."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))",
            gap: isMobile ? "16px" : "18px",
          }}
        >
          <UsageCol
            tone="acc"
            kicker="Do"
            items={[
              "Keep clearspace — leave at least half the mark's height clear on every side.",
              "Use the accent (#5360ff) as the one brand colour.",
              "Put the light glyph on dark surfaces, the dark glyph on light ones.",
            ]}
          />
          <UsageCol
            tone="amb"
            kicker="Don't"
            items={[
              "Don't recolour, restyle, or add effects to the mark.",
              "Don't stretch, rotate, crop, or rebuild it.",
              "Don't set it on a busy or low-contrast background.",
            ]}
          />
        </div>
      </Block>

      <Footer />
    </div>
  );
}

function FaviconLink({ href, children }: { href: string; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ color: hover ? "#efe9da" : "#a8a293", textDecoration: "none" }}
    >
      {children}
    </a>
  );
}
