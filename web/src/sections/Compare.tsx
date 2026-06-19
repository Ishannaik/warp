import type { CSSProperties, ReactNode } from "react";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * Section 04 — "How it compares".
 * Comparison table of Wrap vs AirDrop / WeTransfer / Wormhole.
 * Ported verbatim from the Wrap design source (#compare).
 */

const CHECK = "✓"; // ✓
const CROSS = "✗"; // ✗

const sectionStyle: CSSProperties = {
  position: "relative",
  zIndex: 4,
  borderTop: "1px solid rgba(239,233,218,.13)",
  padding: "96px 26px",
  background: "#0e0d0a",
};

const eyebrowStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "11.5px",
  letterSpacing: ".2em",
  textTransform: "uppercase",
  color: "#6f6a5d",
};

const headingStyle: CSSProperties = {
  fontFamily: "'Bricolage Grotesque',sans-serif",
  fontWeight: 700,
  fontSize: "clamp(32px,4vw,54px)",
  lineHeight: 1,
  letterSpacing: "-.025em",
  margin: "14px 0 48px",
  color: "#efe9da",
  maxWidth: "680px",
};

const tableStyle: CSSProperties = {
  border: "1px solid rgba(239,233,218,.16)",
  fontFamily: "'JetBrains Mono',monospace",
};

const gridTemplate = "1.7fr 1fr 1fr 1fr 1fr";

const headerRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: gridTemplate,
  background: "#15140f",
  borderBottom: "1px solid rgba(239,233,218,.16)",
};

const headCapStyle: CSSProperties = {
  padding: "16px 18px",
  fontSize: "11px",
  letterSpacing: ".14em",
  color: "#6f6a5d",
};

const headWrapStyle: CSSProperties = {
  padding: "16px 12px",
  fontSize: "12px",
  letterSpacing: ".08em",
  color: "#efe9da",
  textAlign: "center",
  background: "rgba(var(--acc-rgb),.1)",
  borderLeft: "1px solid var(--acc)",
  borderRight: "1px solid var(--acc)",
};

const headOtherStyle: CSSProperties = {
  padding: "16px 12px",
  fontSize: "12px",
  letterSpacing: ".08em",
  color: "#908a7b",
  textAlign: "center",
};

const labelCellStyle: CSSProperties = {
  padding: "15px 18px",
  fontSize: "13px",
  color: "#cdc8ba",
  letterSpacing: 0,
};

// Wrap (highlighted) cell — base styles. The last row adds a bottom accent border.
const wrapCellStyle: CSSProperties = {
  padding: "15px",
  textAlign: "center",
  color: "var(--acc)",
  background: "rgba(var(--acc-rgb),.06)",
  borderLeft: "1px solid rgba(var(--acc-rgb),.4)",
  borderRight: "1px solid rgba(var(--acc-rgb),.4)",
};

const accCellStyle: CSSProperties = {
  padding: "15px",
  textAlign: "center",
  color: "var(--acc)",
};

const dimCellStyle: CSSProperties = {
  padding: "15px",
  textAlign: "center",
  color: "#5a5648",
};

/** A non-Wrap cell value + whether it renders affirmatively (accent) or muted (dim). */
type Cell = { value: ReactNode; ok: boolean };

interface Row {
  label: string;
  wrap: ReactNode; // Wrap column is always affirmative in the source
  airdrop: Cell;
  wetransfer: Cell;
  wormhole: Cell;
}

const ROWS: Row[] = [
  {
    label: "Direct peer-to-peer",
    wrap: CHECK,
    airdrop: { value: CHECK, ok: true },
    wetransfer: { value: CROSS, ok: false },
    wormhole: { value: CHECK, ok: true },
  },
  {
    label: "No file-size limit",
    wrap: CHECK,
    airdrop: { value: CHECK, ok: true },
    wetransfer: { value: "2 GB", ok: false },
    wormhole: { value: "10 GB", ok: false },
  },
  {
    label: "No account needed",
    wrap: CHECK,
    airdrop: { value: CHECK, ok: true },
    wetransfer: { value: CROSS, ok: false },
    wormhole: { value: CHECK, ok: true },
  },
  {
    label: "Works cross-platform",
    wrap: CHECK,
    airdrop: { value: "Apple", ok: false },
    wetransfer: { value: CHECK, ok: true },
    wormhole: { value: CHECK, ok: true },
  },
  {
    label: "Free & open-source",
    wrap: CHECK,
    airdrop: { value: CROSS, ok: false },
    wetransfer: { value: CROSS, ok: false },
    wormhole: { value: CHECK, ok: true },
  },
];

function otherCellStyle(ok: boolean): CSSProperties {
  return ok ? accCellStyle : dimCellStyle;
}

export default function Compare() {
  const isMobile = useIsMobile();

  // On mobile, scale down the section padding so nothing crushes against the edges.
  const sectionStyleResolved: CSSProperties = isMobile
    ? { ...sectionStyle, padding: "64px 18px" }
    : sectionStyle;

  // On mobile, give the table a sensible min-width so its 5 columns stay readable;
  // the wrapper below scrolls horizontally instead of overflowing the page.
  const tableStyleResolved: CSSProperties = isMobile
    ? { ...tableStyle, minWidth: "640px" }
    : tableStyle;

  // Horizontal-scroll wrapper, only needed on mobile.
  const tableWrapStyle: CSSProperties = isMobile
    ? { overflowX: "auto", WebkitOverflowScrolling: "touch" }
    : {};

  return (
    <section id="compare" style={sectionStyleResolved}>
      <div style={{ maxWidth: "1320px", margin: "0 auto" }}>
        <div style={eyebrowStyle}>04 / How it compares</div>
        <h2 style={headingStyle}>Pick the one that gives up nothing.</h2>

        <div style={tableWrapStyle}>
          <div style={tableStyleResolved}>
            {/* header */}
            <div style={headerRowStyle}>
              <div style={headCapStyle}>CAPABILITY</div>
              <div style={headWrapStyle}>WARP</div>
              <div style={headOtherStyle}>AIRDROP</div>
              <div style={headOtherStyle}>WETRANSFER</div>
              <div style={headOtherStyle}>WORMHOLE</div>
            </div>

            {/* rows */}
            {ROWS.map((row, i) => {
              const isLast = i === ROWS.length - 1;
              const rowStyle: CSSProperties = {
                display: "grid",
                gridTemplateColumns: gridTemplate,
                ...(isLast ? {} : { borderBottom: "1px solid rgba(239,233,218,.08)" }),
              };
              const wrapStyle: CSSProperties = isLast
                ? { ...wrapCellStyle, borderBottom: "1px solid var(--acc)" }
                : wrapCellStyle;
              return (
                <div key={row.label} style={rowStyle}>
                  <div style={labelCellStyle}>{row.label}</div>
                  <div style={wrapStyle}>{row.wrap}</div>
                  <div style={otherCellStyle(row.airdrop.ok)}>{row.airdrop.value}</div>
                  <div style={otherCellStyle(row.wetransfer.ok)}>{row.wetransfer.value}</div>
                  <div style={otherCellStyle(row.wormhole.ok)}>{row.wormhole.value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
