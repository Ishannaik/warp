import { useMemo, useState } from "react";
import { navigate } from "../router";
import WarpLogo from "../WarpLogo";
import { useIsMobile } from "../lib/useIsMobile";
import { CODE_LEN, VALID_RE, sanitize } from "../lib/warp/roomCode";

/**
 * ReceiveEntry — the "/receive" page. The second device needs a way to *enter*
 * a room code by hand (when the sender shares the code verbally or the link
 * isn't tappable). One field, auto-uppercased and sanitised to the server's
 * code alphabet, then `navigate("/r/<CODE>")` hands off to TransferFlow.
 *
 * Built from the existing Wrap design system — same dark palette, hairline
 * borders, mono labels, Bricolage/Archivo/JetBrains Mono fonts, accent button.
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";
const HAIR = "rgba(239,233,218,.14)";

export default function ReceiveEntry({
  initialCode = "",
}: {
  /** Prefill from a malformed `/r/:code` deep link (already sanitized). */
  initialCode?: string;
}) {
  const isMobile = useIsMobile();
  const [code, setCode] = useState(() => sanitize(initialCode));

  const valid = useMemo(() => VALID_RE.test(code), [code]);
  // Only nag once they've typed a full-length code that still doesn't match.
  const showHint = code.length === CODE_LEN && !valid;

  const connect = () => {
    if (!valid) return;
    navigate("/r/" + code);
  };

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
        .rcv-back:hover{color:#efe9da}
        .rcv-input:focus{border-color:var(--acc);outline:none}
        .rcv-cta:not([data-disabled="true"]):hover{background:#6470ff}
      `}</style>

      {/* top bar — wordmark + exit, mirrors TransferFlow chrome */}
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
          style={{ display: "flex", alignItems: "center", gap: "11px", textDecoration: "none", color: "#efe9da" }}
        >
          <WarpLogo size={24} />
          <span style={{ fontFamily: DISPLAY, fontSize: "19px", fontWeight: 800, letterSpacing: "-.02em" }}>
            WARP
          </span>
        </a>

        <a
          href="/"
          className="rcv-back"
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
          ← BACK
        </a>
      </div>

      {/* center card */}
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
            Receive · enter a code
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
            Receive a file
          </h1>
          <p
            style={{
              fontSize: "15.5px",
              lineHeight: 1.55,
              color: "#a8a293",
              margin: "0 0 30px",
            }}
          >
            Enter the 6-character code from the sending device, or open their link / scan their QR.
          </p>

          {/* code input */}
          <label
            htmlFor="rcv-code"
            style={{
              display: "block",
              fontFamily: MONO,
              fontSize: "10.5px",
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: "#6f6a5d",
              marginBottom: "10px",
            }}
          >
            Room code
          </label>
          <input
            id="rcv-code"
            className="rcv-input"
            value={code}
            onChange={(e) => setCode(sanitize(e.target.value))}
            onPaste={(e) => {
              e.preventDefault();
              const next = sanitize(e.clipboardData.getData("text"));
              setCode(next);
              // Full valid paste → connect immediately (typing the 6th char does not).
              if (VALID_RE.test(next)) navigate("/r/" + next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") connect();
            }}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={CODE_LEN}
            aria-invalid={showHint}
            aria-describedby={showHint ? "rcv-hint" : undefined}
            placeholder="••••••"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: isMobile ? "16px 18px" : "18px 22px",
              background: "rgba(239,233,218,.02)",
              border: `1px solid ${showHint ? "var(--amb)" : HAIR}`,
              color: "var(--acc)",
              fontFamily: MONO,
              fontSize: isMobile ? "clamp(26px,8vw,34px)" : "34px",
              fontWeight: 700,
              letterSpacing: ".34em",
              textAlign: "center",
              textTransform: "uppercase",
              caretColor: "var(--acc)",
            }}
          />

          {/* inline validity hint */}
          <div
            id="rcv-hint"
            style={{
              minHeight: "16px",
              marginTop: "10px",
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: ".04em",
              color: showHint ? "var(--amb)" : "#6f6a5d",
            }}
          >
            {showHint
              ? "That doesn't look like a valid code — check the sending device."
              : "Letters A–Z (no I, L, O) and digits 2–9."}
          </div>

          {/* connect button */}
          <button
            type="button"
            className="rcv-cta"
            onClick={connect}
            disabled={!valid}
            data-disabled={!valid}
            style={{
              display: "block",
              width: "100%",
              marginTop: "20px",
              padding: "16px 26px",
              border: "none",
              background: valid ? "var(--acc)" : "rgba(239,233,218,.12)",
              color: valid ? "#fff" : "#6f6a5d",
              fontFamily: MONO,
              fontSize: "12.5px",
              fontWeight: 600,
              letterSpacing: ".07em",
              textTransform: "uppercase",
              cursor: valid ? "pointer" : "not-allowed",
            }}
          >
            Connect &nbsp;→
          </button>

          <div
            style={{
              marginTop: "22px",
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: ".04em",
              color: "#6f6a5d",
              textAlign: "center",
            }}
          >
            Got a link instead? Just open it — it connects you automatically.
          </div>
        </div>
      </div>
    </div>
  );
}
