import type { CSSProperties } from "react";
import Atmosphere from "./Atmosphere";
import TransferWindow from "./TransferWindow";
import { navigate } from "../router";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * Hero composition for the Wrap landing page. Ported verbatim from the design
 * source: corner crosshairs, status strip, nav, the hero grid (copy + the
 * ShareX transfer window), and the marquee ticker. The atmosphere layer (lamp
 * + meteors) is rendered as the background.
 *
 * `:hover` states from the source's `style-hover` attributes are reproduced via
 * a scoped <style> block (inline styles cannot express hover).
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";

const crosshair: CSSProperties = {
  position: "absolute",
  top: "58px",
  width: "13px",
  height: "13px",
  zIndex: 6,
  opacity: 0.45,
};

const tickerItems = (
  <>
    <span style={{ color: "var(--acc)" }}>■</span>
    <span>PEER-TO-PEER CHANNEL, LIVE</span>
    <span style={{ color: "#4a463c" }}>/</span>
    <span>ZERO SERVER HOPS</span>
    <span style={{ color: "#4a463c" }}>/</span>
    <span>CHUNK 16KB</span>
    <span style={{ color: "#4a463c" }}>/</span>
    <span>BACKPRESSURE-AWARE</span>
    <span style={{ color: "#4a463c" }}>/</span>
    <span style={{ color: "#efe9da" }}>AES-256-GCM</span>
    <span style={{ color: "#4a463c" }}>/</span>
    <span>NO SIZE CAP</span>
    <span style={{ color: "#4a463c" }}>/</span>
    <span style={{ color: "var(--acc)" }}>INTEGRITY ✓ SHA-256</span>
    <span style={{ color: "#4a463c" }}>/</span>
    <span>FREE &amp; OPEN-SOURCE</span>
    <span style={{ color: "#4a463c" }}>/</span>
    <span style={{ color: "var(--amb)" }}>NO ACCOUNT, EVER</span>
    <span style={{ color: "#4a463c" }}>/</span>
  </>
);

const tickerTrack: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "16px",
  paddingRight: "16px",
  fontFamily: MONO,
  fontSize: "11px",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "#6f6a5d",
};

const navLink: CSSProperties = { color: "#b6b0a0", textDecoration: "none" };

export default function Hero() {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Archivo',system-ui,sans-serif",
        color: "#efe9da",
      }}
    >
      {/* hover styles (source style-hover attributes) */}
      <style>{`
        .wrap-nav-link:hover{color:#efe9da}
        .wrap-launch:hover{border-color:var(--acc);background:rgba(var(--acc-rgb),.12)}
        .wrap-cta-primary:hover{background:#6470ff}
        .wrap-cta-secondary:hover{background:rgba(239,233,218,.05);border-color:rgba(239,233,218,.55)}
        .wrap-footer-link:hover{color:#efe9da}
      `}</style>

      {/* corner crosshairs */}
      <div style={{ ...crosshair, left: "18px" }}>
        <div style={{ position: "absolute", left: 0, top: "6px", width: "13px", height: "1px", background: "#efe9da" }} />
        <div style={{ position: "absolute", left: "6px", top: 0, width: "1px", height: "13px", background: "#efe9da" }} />
      </div>
      <div style={{ ...crosshair, right: "18px" }}>
        <div style={{ position: "absolute", left: 0, top: "6px", width: "13px", height: "1px", background: "#efe9da" }} />
        <div style={{ position: "absolute", left: "6px", top: 0, width: "1px", height: "13px", background: "#efe9da" }} />
      </div>

      {/* atmosphere background layer */}
      <Atmosphere />

      {/* status strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: isMobile ? "wrap" : "nowrap",
          rowGap: isMobile ? "6px" : undefined,
          padding: isMobile ? "10px 16px" : "11px 22px",
          borderBottom: "1px solid rgba(239,233,218,.13)",
          fontFamily: MONO,
          fontSize: isMobile ? "10px" : "11px",
          letterSpacing: ".13em",
          color: "#908a7b",
          textTransform: "uppercase",
          zIndex: 5,
        }}
      >
        <span>WRAP&nbsp;&nbsp;/&nbsp;&nbsp;free &amp; open&#8209;source file transfer</span>
        <span style={{ display: "flex", flexWrap: isMobile ? "wrap" : "nowrap", gap: isMobile ? "14px" : "26px" }}>
          <span style={{ color: "var(--acc)" }}>● MIT LICENSE</span>
          <span>NO ACCOUNT</span>
          <span>v1.0</span>
        </span>
      </div>

      {/* nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "16px 16px" : "20px 26px",
          zIndex: 5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "26px",
              height: "26px",
              background: "var(--acc)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: "9px", height: "9px", background: "#121110" }} />
          </div>
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: "21px",
              fontWeight: 800,
              letterSpacing: "-.02em",
            }}
          >
            WRAP
          </span>
        </div>
        {!isMobile && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "34px",
              fontFamily: MONO,
              fontSize: "12px",
              letterSpacing: ".05em",
            }}
          >
            <a
              href="/how"
              className="wrap-nav-link"
              style={navLink}
              onClick={(e) => {
                e.preventDefault();
                navigate("/how");
              }}
            >
              HOW IT WORKS
            </a>
            <a href="#trust" className="wrap-nav-link" style={navLink}>
              SECURITY
            </a>
            <a href="#compare" className="wrap-nav-link" style={navLink}>
              COMPARE
            </a>
            <a href="#faq" className="wrap-nav-link" style={navLink}>
              FAQ
            </a>
          </div>
        )}
        <a
          href="/send"
          className="wrap-launch"
          onClick={(e) => {
            e.preventDefault();
            navigate("/send");
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "9px",
            padding: "10px 17px",
            border: "1px solid rgba(239,233,218,.25)",
            fontFamily: MONO,
            fontSize: "12px",
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "#efe9da",
            textDecoration: "none",
          }}
        >
          Launch Wrap <span style={{ color: "var(--acc)" }}>↗</span>
        </a>
      </div>

      {/* main grid */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1.08fr",
          gap: isMobile ? "36px" : "54px",
          alignItems: "center",
          padding: isMobile ? "24px 16px 32px" : "30px 26px 40px",
          zIndex: 4,
        }}
      >
        {/* left copy */}
        <div style={{ maxWidth: isMobile ? "100%" : "560px" }}>
          <div
            style={{
              animation: "wrapFade .8s ease both",
              display: "inline-flex",
              alignItems: "center",
              gap: "11px",
              fontFamily: MONO,
              fontSize: "12px",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "#908a7b",
              marginBottom: "30px",
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                background: "var(--amb)",
                animation: "wrapBlink 1.4s steps(1) infinite",
              }}
            />
            Free forever · no upload · no size cap
          </div>
          <h1
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: isMobile ? "clamp(40px,13vw,64px)" : "clamp(50px,6.6vw,98px)",
              lineHeight: 0.88,
              letterSpacing: "-.03em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            <span style={{ display: "block", overflow: "hidden" }}>
              <span
                style={{
                  display: "inline-block",
                  animation: "wrapRise .7s cubic-bezier(.2,.8,.2,1) both",
                }}
              >
                Send it
              </span>
            </span>
            <span style={{ display: "block", overflow: "hidden" }}>
              <span
                style={{
                  display: "inline-block",
                  color: "var(--acc)",
                  animation: "wrapRise .7s cubic-bezier(.2,.8,.2,1) .09s both",
                }}
              >
                straight
              </span>
            </span>
            <span style={{ display: "block", overflow: "hidden" }}>
              <span
                style={{
                  display: "inline-block",
                  animation: "wrapRise .7s cubic-bezier(.2,.8,.2,1) .18s both",
                }}
              >
                through.
              </span>
            </span>
          </h1>
          <p
            style={{
              animation: "wrapFade .8s ease .5s both",
              fontSize: isMobile ? "16px" : "18.5px",
              lineHeight: 1.55,
              color: "#a8a293",
              maxWidth: isMobile ? "100%" : "430px",
              margin: "28px 0 34px",
            }}
          >
            A direct, encrypted channel opens between two devices and the bytes fly straight
            across — no server ever touches your file. Free, open&#8209;source, no sign&#8209;up.
          </p>
          <div
            style={{
              animation: "wrapFade .8s ease .65s both",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: "14px",
              marginBottom: "26px",
            }}
          >
            <a
              href="/send"
              className="wrap-cta-primary"
              onClick={(e) => {
                e.preventDefault();
                navigate("/send");
              }}
              style={{
                padding: "16px 26px",
                background: "var(--acc)",
                color: "#fff",
                fontFamily: MONO,
                fontSize: "12.5px",
                fontWeight: 600,
                letterSpacing: ".07em",
                textTransform: "uppercase",
                cursor: "pointer",
                display: isMobile ? "block" : "inline-block",
                textAlign: isMobile ? "center" : undefined,
                textDecoration: "none",
              }}
            >
              Start a transfer &nbsp;→
            </a>
            <a
              href="/how"
              className="wrap-cta-secondary"
              onClick={(e) => {
                e.preventDefault();
                navigate("/how");
              }}
              style={{
                padding: "16px 24px",
                background: "transparent",
                border: "1px solid rgba(239,233,218,.25)",
                color: "#efe9da",
                fontFamily: MONO,
                fontSize: "12.5px",
                fontWeight: 500,
                letterSpacing: ".07em",
                textTransform: "uppercase",
                cursor: "pointer",
                display: isMobile ? "block" : "inline-block",
                textAlign: isMobile ? "center" : undefined,
                textDecoration: "none",
              }}
            >
              How it works
            </a>
          </div>
          <div
            style={{
              animation: "wrapFade .8s ease .8s both",
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: ".08em",
              color: "#6f6a5d",
              textTransform: "uppercase",
              display: "flex",
              gap: "18px",
              flexWrap: "wrap",
            }}
          >
            <span>AES&#8209;256&#8209;GCM</span>
            <span style={{ color: "#4a463c" }}>•</span>
            <span>RUNS IN BROWSER</span>
            <span style={{ color: "#4a463c" }}>•</span>
            <span>EVERY PLATFORM</span>
          </div>
        </div>

        {/* right: ShareX-style transfer window */}
        <TransferWindow />
      </div>

      {/* marquee ticker */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderTop: "1px solid rgba(239,233,218,.13)",
          padding: "11px 0",
          zIndex: 5,
          WebkitMaskImage: "linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)",
          maskImage: "linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            whiteSpace: "nowrap",
            animation: "wrapMarquee 30s linear infinite",
          }}
        >
          <span style={tickerTrack}>{tickerItems}</span>
          <span aria-hidden="true" style={tickerTrack}>
            {tickerItems}
          </span>
        </div>
      </div>
    </div>
  );
}
