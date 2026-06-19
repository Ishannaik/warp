import type { CSSProperties } from "react";
import { useIsMobile } from "../lib/useIsMobile";

const labelMono: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

const cardBase: CSSProperties = {
  border: "1px solid rgba(239,233,218,.14)",
  padding: "22px",
};

const cardLabel: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "11px",
  letterSpacing: ".16em",
  color: "var(--acc)",
  marginBottom: "10px",
};

const cardBody: CSSProperties = {
  fontSize: "14px",
  lineHeight: 1.5,
  color: "#a8a293",
  margin: 0,
};

export default function Architecture() {
  const isMobile = useIsMobile();
  return (
    <section
      id="trust"
      style={{
        position: "relative",
        zIndex: 4,
        borderTop: "1px solid rgba(239,233,218,.13)",
        padding: isMobile ? "64px 18px" : "96px 26px",
        background: "#0e0d0a",
      }}
    >
      <div style={{ maxWidth: "1320px", margin: "0 auto" }}>
        <div
          style={{
            ...labelMono,
            fontSize: "11.5px",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "#6f6a5d",
          }}
        >
          02 / Architecture
        </div>
        <h2
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontWeight: 700,
            fontSize: "clamp(32px,4vw,54px)",
            lineHeight: 1,
            letterSpacing: "-.025em",
            margin: "14px 0 0",
            color: "#efe9da",
            maxWidth: "820px",
          }}
        >
          Your files never touch our servers.
        </h2>
        <p
          style={{
            fontSize: "17px",
            lineHeight: 1.55,
            color: "#a8a293",
            maxWidth: "560px",
            margin: "18px 0 0",
          }}
        >
          The relay exists for one job: to introduce two devices. The moment
          they shake hands, every byte flows directly between them &mdash;
          encrypted the whole way.
        </p>

        <div
          style={{
            position: "relative",
            border: "1px solid rgba(239,233,218,.18)",
            background: "#121110",
            padding: isMobile ? "28px 18px 32px" : "44px 40px 48px",
            marginTop: isMobile ? "32px" : "48px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                border: "1px dashed rgba(239,233,218,.35)",
                padding: "12px 18px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "11.5px",
                letterSpacing: ".1em",
                color: "#b6b0a0",
                textTransform: "uppercase",
              }}
            >
              WARP RELAY &nbsp;
              <span style={{ color: "#6f6a5d" }}>
                &middot; handshake only, sees no content
              </span>
            </div>
            <div
              style={{
                width: "1px",
                height: "40px",
                background:
                  "repeating-linear-gradient(180deg,rgba(239,233,218,.35) 0 5px,transparent 5px 10px)",
              }}
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1.6fr 1fr",
              alignItems: "center",
              gap: "18px",
            }}
          >
            <div
              style={{
                border: "1px solid var(--acc)",
                background: "#15140f",
                padding: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    border: "1px solid var(--acc)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      background: "var(--acc)",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "10px",
                    letterSpacing: ".2em",
                    color: "#6f6a5d",
                  }}
                >
                  SOURCE
                </span>
              </div>
              <div
                style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontWeight: 700,
                  fontSize: "18px",
                }}
              >
                your device
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10.5px",
                  color: "#6f6a5d",
                  marginTop: "4px",
                }}
              >
                holds the original file
              </div>
            </div>
            <div style={{ position: "relative", textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10.5px",
                  letterSpacing: ".16em",
                  textTransform: "uppercase",
                  color: "var(--acc)",
                  marginBottom: "8px",
                }}
              >
                &#9679; Direct P2P channel &middot; AES-256-GCM
              </div>
              <div
                style={{
                  height: isMobile ? "40px" : "18px",
                  width: isMobile ? "18px" : undefined,
                  margin: isMobile ? "0 auto" : undefined,
                  background: isMobile
                    ? "repeating-linear-gradient(180deg,var(--acc) 0 7px,transparent 7px 20px)"
                    : "repeating-linear-gradient(90deg,var(--acc) 0 7px,transparent 7px 20px)",
                  backgroundSize: isMobile ? "100% 32px" : "32px 100%",
                  animation: "wrapFlow .9s linear infinite",
                  WebkitMaskImage: isMobile
                    ? "linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent)"
                    : "linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)",
                  maskImage: isMobile
                    ? "linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent)"
                    : "linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)",
                }}
              />
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10.5px",
                  color: "#6f6a5d",
                  marginTop: "8px",
                }}
              >
                encrypted bytes, edge to edge
              </div>
            </div>
            <div
              style={{
                border: "1px solid var(--amb)",
                background: "#15140f",
                padding: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    border: "1px solid var(--amb)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      background: "var(--amb)",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "10px",
                    letterSpacing: ".2em",
                    color: "#6f6a5d",
                  }}
                >
                  TARGET
                </span>
              </div>
              <div
                style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontWeight: 700,
                  fontSize: "18px",
                }}
              >
                their device
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10.5px",
                  color: "#6f6a5d",
                  marginTop: "4px",
                }}
              >
                decrypts on arrival
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
            gap: "18px",
            marginTop: "18px",
          }}
        >
          <div style={cardBase}>
            <div style={cardLabel}>DTLS + AES-256-GCM</div>
            <p style={cardBody}>
              Transport is encrypted by default, with an authenticated cipher
              layered on top of every chunk.
            </p>
          </div>
          <div style={cardBase}>
            <div style={cardLabel}>ZERO RETENTION</div>
            <p style={cardBody}>
              No copy is ever written to disk on our side. When the tab closes,
              the channel is gone for good.
            </p>
          </div>
          <div style={cardBase}>
            <div style={cardLabel}>RELAY FALLBACK</div>
            <p style={cardBody}>
              If a direct path can&rsquo;t form, an encrypted relay finishes the
              job &mdash; still unreadable to us.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
