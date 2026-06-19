const FEATURES: { label: string; body: React.ReactNode }[] = [
  {
    label: "NO SIZE LIMIT",
    body: (
      <>
        Send 50&nbsp;GB as easily as 50&nbsp;KB. You&rsquo;re only bound by the
        other device&rsquo;s disk.
      </>
    ),
  },
  {
    label: "NO ACCOUNT",
    body: <>No sign-up, no email, no install. Open the tab and send.</>,
  },
  {
    label: "END-TO-END ENCRYPTED",
    body: (
      <>
        AES-256-GCM on every byte. Unreadable to anyone in between &mdash;
        including us.
      </>
    ),
  },
  {
    label: "WORKS EVERYWHERE",
    body: (
      <>
        Any modern browser on any OS. Mac to Windows, phone to laptop, no app.
      </>
    ),
  },
  {
    label: "MULTI-PEER",
    body: (
      <>Beam the same files to up to eight devices in a single session.</>
    ),
  },
  {
    label: "OPEN SOURCE",
    body: (
      <>MIT licensed and fully auditable. Trust the code, not a promise.</>
    ),
  },
];

export default function Features() {
  return (
    <section
      id="features"
      style={{
        position: "relative",
        zIndex: 4,
        borderTop: "1px solid rgba(239,233,218,.13)",
        padding: "96px 26px",
      }}
    >
      <div style={{ maxWidth: "1320px", margin: "0 auto" }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: "11.5px",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "#6f6a5d",
          }}
        >
          03 / What you get
        </div>
        <h2
          style={{
            fontFamily: "'Bricolage Grotesque',sans-serif",
            fontWeight: 700,
            fontSize: "clamp(32px,4vw,54px)",
            lineHeight: 1,
            letterSpacing: "-.025em",
            margin: "14px 0 52px",
            color: "#efe9da",
            maxWidth: "680px",
          }}
        >
          No accounts. No limits. No catch.
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: "1px",
            background: "rgba(239,233,218,.14)",
            border: "1px solid rgba(239,233,218,.14)",
          }}
        >
          {FEATURES.map((f) => (
            <div key={f.label} style={{ background: "#121110", padding: "30px" }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: "11px",
                  letterSpacing: ".16em",
                  color: "var(--acc)",
                  marginBottom: "14px",
                }}
              >
                {f.label}
              </div>
              <div style={{ fontSize: "15px", color: "#cdc8ba", lineHeight: 1.5 }}>
                {f.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
