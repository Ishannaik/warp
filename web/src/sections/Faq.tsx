import { useState, type CSSProperties } from "react";

/**
 * Section 05 — "Questions".
 * Accordion of the five honest answers, ported verbatim from the Wrap
 * design source (#faq).
 *
 * The source used a vanilla-JS max-height toggle; here a single open index is
 * held in React state. Open/close animates smoothly via a grid-template-rows
 * 0fr -> 1fr transition, and the "+" rotates 45deg into a "×" when open.
 */

const sectionStyle: CSSProperties = {
  position: "relative",
  zIndex: 4,
  borderTop: "1px solid rgba(239,233,218,.13)",
  padding: "96px 26px",
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
  margin: "14px 0 44px",
  color: "#efe9da",
};

const itemStyle: CSSProperties = {
  borderBottom: "1px solid rgba(239,233,218,.16)",
};

const triggerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "20px",
  padding: "22px 2px",
  cursor: "pointer",
  width: "100%",
  background: "transparent",
  border: "none",
  textAlign: "left",
  font: "inherit",
};

const questionStyle: CSSProperties = {
  fontFamily: "'Bricolage Grotesque',sans-serif",
  fontWeight: 600,
  fontSize: "19px",
  color: "#efe9da",
};

const baseSignStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "22px",
  color: "var(--acc)",
  transition: "transform .3s ease",
  flex: "none",
  lineHeight: 1,
};

const answerStyle: CSSProperties = {
  fontSize: "15.5px",
  lineHeight: 1.6,
  color: "#a8a293",
  margin: "0 0 22px",
};

interface Item {
  q: string;
  a: string;
}

const ITEMS: Item[] = [
  {
    q: "Is it really peer-to-peer?",
    a: "Yes. Once two devices pair, the file travels directly between them over an encrypted WebRTC channel. Our relay only helps them find each other — it never sees the contents.",
  },
  {
    q: "What’s the maximum file size?",
    a: "There isn’t one. Because nothing is uploaded to a server, you’re only limited by the receiving device’s available storage.",
  },
  {
    q: "Do I need an account or an app?",
    a: "Neither. No sign-up, no email, no install. Open Wrap in any browser, drop a file, and share the code.",
  },
  {
    q: "What if the direct connection fails?",
    a: "Wrap falls back to an encrypted relay so the transfer still completes. The bytes stay encrypted end-to-end the whole way — the relay only forwards ciphertext.",
  },
  {
    q: "Is it actually free?",
    a: "Completely. Wrap is free and open-source under the MIT license. No tiers, no “pro” upsell, no ads.",
  },
];

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" style={sectionStyle}>
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <div style={eyebrowStyle}>05 / Questions</div>
        <h2 style={headingStyle}>The honest answers.</h2>

        <div style={{ borderTop: "1px solid rgba(239,233,218,.16)" }}>
          {ITEMS.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={item.q} style={itemStyle}>
                <button
                  type="button"
                  aria-expanded={open}
                  style={triggerStyle}
                  onClick={() => setOpenIndex(open ? null : i)}
                >
                  <span style={questionStyle}>{item.q}</span>
                  <span
                    aria-hidden="true"
                    style={{
                      ...baseSignStyle,
                      transform: open ? "rotate(45deg)" : "rotate(0deg)",
                    }}
                  >
                    +
                  </span>
                </button>
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: open ? "1fr" : "0fr",
                    transition: "grid-template-rows .35s ease",
                  }}
                >
                  <div style={{ overflow: "hidden" }}>
                    <p style={answerStyle}>{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
