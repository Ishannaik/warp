import { navigate } from "./router";
import WarpLogo from "./WarpLogo";
import { useIsMobile } from "./lib/useIsMobile";

/**
 * NotFound — unmatched routes. Keeps the receive-page chrome (dark grid, mono
 * labels, wordmark) so a typo'd URL doesn't silently look like the homepage.
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";
const HAIR = "rgba(239,233,218,.14)";

export default function NotFound() {
  const isMobile = useIsMobile();

  const link = (href: string, label: string) => (
    <a
      href={href}
      className="nf-link"
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
      style={{
        display: isMobile ? "block" : "inline-block",
        padding: "13px 20px",
        border: "1px solid rgba(239,233,218,.22)",
        color: "#a8a293",
        fontFamily: MONO,
        fontSize: "12px",
        letterSpacing: ".07em",
        textTransform: "uppercase",
        textDecoration: "none",
        textAlign: "center",
        background: "rgba(239,233,218,.03)",
        boxSizing: "border-box",
      }}
    >
      {label}
    </a>
  );

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Archivo',system-ui,sans-serif",
        color: "#efe9da",
        overflowX: "hidden",
        background:
          "repeating-linear-gradient(0deg,transparent 0,transparent 31px,rgba(239,233,218,.035) 31px,rgba(239,233,218,.035) 32px),repeating-linear-gradient(90deg,transparent 0,transparent 31px,rgba(239,233,218,.035) 31px,rgba(239,233,218,.035) 32px),#121110",
      }}
    >
      <style>{`
        .nf-link:hover{border-color:var(--acc);color:#efe9da}
        .nf-back:hover{color:#efe9da}
      `}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "14px 16px" : "18px 26px",
          borderBottom: `1px solid ${HAIR}`,
        }}
      >
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "11px",
            textDecoration: "none",
            color: "#efe9da",
          }}
        >
          <WarpLogo size={24} />
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: "19px",
              fontWeight: 800,
              letterSpacing: "-.02em",
            }}
          >
            WARP
          </span>
        </a>

        <a
          href="/"
          className="nf-back"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          style={{
            fontFamily: MONO,
            fontSize: "12px",
            letterSpacing: ".06em",
            color: "#908a7b",
            textDecoration: "none",
          }}
        >
          ← HOME
        </a>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? "32px 16px" : "48px 26px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "460px", animation: "warpFade .5s ease both" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "11.5px",
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "#6f6a5d",
              marginBottom: "12px",
            }}
          >
            404 · page not found
          </div>
          <h1
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: isMobile ? "clamp(32px,9vw,44px)" : "clamp(36px,5vw,52px)",
              lineHeight: 1,
              letterSpacing: "-.03em",
              margin: "0 0 16px",
            }}
          >
            This page doesn’t exist
          </h1>
          <p
            style={{
              fontSize: "15.5px",
              lineHeight: 1.55,
              color: "#a8a293",
              margin: "0 0 30px",
            }}
          >
            The link may be mistyped. Head home, or open a send / receive channel.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            {link("/", "← Home")}
            {link("/send", "Send a file")}
            {link("/receive", "Receive a file")}
          </div>
        </div>
      </div>
    </div>
  );
}
