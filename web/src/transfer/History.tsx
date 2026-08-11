import { useEffect, useState } from "react";
import { formatBytes } from "../lib/warp/transfer";

export interface HistoryEntry {
  id: string;
  name: string;
  size: number;
  direction: "send" | "receive";
  mime: string;
  kind: "file" | "text";
  timestamp: number;
}

const MONO = "'JetBrains Mono',monospace";
const HAIRLINE = "rgba(239,233,218,.13)";

function typeGlyph(mime: string, kind: string): string {
  if (kind === "text") return "¶";
  if (mime.startsWith("image/")) return "▦";
  if (mime.startsWith("video/")) return "►";
  if (mime.startsWith("audio/")) return "♪";
  if (mime.startsWith("text/")) return "≡";
  if (mime.includes("zip") || mime.includes("compressed") || mime.includes("tar")) return "❑";
  if (mime.includes("pdf")) return "▤";
  return "◆";
}

export function History({ isMobile }: { isMobile: boolean }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const loadHistory = () => {
    try {
      const stored = localStorage.getItem("warp_history");
      if (stored) {
        setHistory(JSON.parse(stored));
      } else {
        setHistory([]);
      }
    } catch (e) {
      setHistory([]);
    }
  };

  useEffect(() => {
    loadHistory();
    const handleUpdate = () => loadHistory();
    window.addEventListener("warp_history_updated", handleUpdate);
    return () => window.removeEventListener("warp_history_updated", handleUpdate);
  }, []);

  const clearHistory = () => {
    localStorage.removeItem("warp_history");
    setHistory([]);
  };

  if (history.length === 0 && !open) {
    return null; // hide if empty and not already opened
  }

  return (
    <div style={{ border: `1px solid ${HAIRLINE}`, background: "#15140f", marginTop: "18px" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 15px",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10.5px",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#6f6a5d",
          }}
        >
          Transfer History · <span style={{ color: "#efe9da" }}>{history.length}</span>
        </span>
        <span style={{ color: "#a8a293", fontFamily: MONO, fontSize: "12px" }}>
          {open ? "▼" : "▶"}
        </span>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${HAIRLINE}`, overflow: "hidden" }}>
          {history.length === 0 ? (
            <div
              style={{
                padding: "26px 15px",
                textAlign: "center",
                fontFamily: MONO,
                fontSize: "12px",
                color: "#6f6a5d",
              }}
            >
              History is empty.
            </div>
          ) : (
            <>
              <div style={{ maxHeight: "300px", overflow: "auto" }}>
                {history.map((entry) => (
                  <div
                    key={`${entry.id}-${entry.timestamp}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: isMobile ? "10px" : "12px",
                      padding: isMobile ? "12px" : "13px 15px",
                      borderBottom: "1px solid rgba(239,233,218,.07)",
                    }}
                  >
                    <span
                      style={{
                        width: isMobile ? 36 : 40,
                        height: isMobile ? 36 : 40,
                        flexShrink: 0,
                        border: "1px solid rgba(239,233,218,.18)",
                        background: "rgba(239,233,218,.02)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: MONO,
                        fontSize: isMobile ? "13px" : "16px",
                        color: "#a8a293",
                      }}
                    >
                      {typeGlyph(entry.mime, entry.kind)}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        title={entry.name}
                        style={{
                          display: "block",
                          fontSize: "14px",
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: "#efe9da",
                        }}
                      >
                        {entry.kind === "text" ? "Text snippet" : entry.name}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontFamily: MONO,
                          fontSize: "10.5px",
                          letterSpacing: ".04em",
                          color: "#6f6a5d",
                          marginTop: "3px",
                        }}
                      >
                        <span style={{ color: entry.direction === "receive" ? "var(--acc)" : "#908a7b" }}>
                          {entry.direction === "receive" ? "↓ IN" : "↑ OUT"}
                        </span>
                        {entry.kind !== "text" && <span>· {formatBytes(entry.size)}</span>}
                        <span>· {new Date(entry.timestamp).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}</span>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "12px", display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="warp-share"
                  onClick={clearHistory}
                  style={{
                    padding: "7px 14px",
                    background: "transparent",
                    border: "none",
                    color: "#a8a293",
                    fontFamily: MONO,
                    fontSize: "11px",
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Clear history
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
