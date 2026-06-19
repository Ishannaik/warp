import { useState } from "react";
import type { CSSProperties } from "react";
import { useTransferSim } from "./useTransferSim";
import type { RowStatus } from "./useTransferSim";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * ShareX-style transfer-queue window for the hero (right column).
 * Ported verbatim from the Wrap design source: magic-ui border beam,
 * Queue / History / Peers tabs, the animated queue rows, and the footer
 * totals. Tab switching is reimplemented here as React state; the Live-mode
 * queue simulation lives in the useTransferSim() hook.
 *
 * Shipped default variant = Live channel mode:
 *   tick 130ms · multiplier 1 · throughput (1.9+rand*0.9)*1 GB/s.
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";

const ACC = "var(--acc)";
const AMB = "var(--amb)";
const DIM = "#6f6a5d";

function barColor(s: RowStatus) {
  return s === "done" ? ACC : s === "up" ? AMB : "rgba(239,233,218,.18)";
}
function iconColor(s: RowStatus) {
  return s === "done" ? ACC : s === "up" ? AMB : DIM;
}
function statusLabel(s: RowStatus) {
  return s === "done" ? "DONE" : s === "up" ? "UPLOADING" : "QUEUED";
}

const ROW_GRID = "26px 1fr 64px 1.3fr 92px";
const HIST_GRID = "28px 1fr 70px 92px";

// Tighter column tracks for narrow phones so the queue/history rows fit ~360px
// without horizontal scroll: drop the SIZE column min, shrink # / STATUS / WHEN.
const ROW_GRID_M = "20px 1fr 1.1fr 64px";
const HIST_GRID_M = "20px 1fr 56px 64px";

const colHeadCell: CSSProperties = {
  fontFamily: MONO,
  fontSize: "9.5px",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "#6f6a5d",
};

const footerBar: CSSProperties = {
  padding: "14px 15px",
  borderTop: "1px solid rgba(239,233,218,.16)",
  background: "rgba(239,233,218,.02)",
};

type Tab = "queue" | "history" | "peers";

export default function TransferWindow() {
  const [tab, setTab] = useState<Tab>("queue");
  const isMobile = useIsMobile();

  // Mobile column tracks (SIZE column dropped from the queue rows to fit ~360px).
  const rowGrid = isMobile ? ROW_GRID_M : ROW_GRID;
  const histGrid = isMobile ? HIST_GRID_M : HIST_GRID;
  const cellPad = isMobile ? "11px 12px" : "13px 15px";
  const headPad = isMobile ? "9px 12px" : "9px 15px";
  const cellGap = isMobile ? "8px" : "10px";

  // Live-mode queue simulation (tick 130ms · multiplier 1). The hook holds the
  // row + throughput state; rows carry no entrance animation, so the per-tick
  // re-renders never restart any entrance animation.
  const { rows, throughput: tp, totals } = useTransferSim();
  const doneCount = totals.doneLabel;
  const sentLabel = totals.sentLabel;
  const overall = totals.overallPct;
  const etaLabel = totals.etaLabel;

  const tabStyle = (name: Tab): CSSProperties => ({
    padding: "10px 15px",
    color: tab === name ? "#efe9da" : "#6f6a5d",
    borderBottom: `2px solid ${tab === name ? "var(--acc)" : "transparent"}`,
    cursor: "pointer",
  });

  return (
    <div
      style={{
        position: "relative",
        animation: "wrapFade .9s ease .35s both",
        ...(isMobile ? { width: "100%", maxWidth: "100%" } : null),
      }}
    >
      {/* magic-ui border beam */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "150%",
            aspectRatio: "1",
            transform: "translate(-50%,-50%)",
            background:
              "conic-gradient(from 0deg,transparent 0 66%,rgba(var(--acc-rgb),0) 66%,var(--acc) 82%,#aab2ff 89%,var(--amb) 95%,transparent 99%)",
            animation: "wrapSpin var(--beam-dur,6s) linear infinite",
          }}
        />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          margin: "1px",
          border: "1px solid rgba(239,233,218,.22)",
          background: "#15140f",
          boxShadow: "0 40px 90px -30px rgba(0,0,0,.8)",
          ...(isMobile ? { overflowX: "hidden" } : null),
        }}
      >
        {/* title bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: isMobile ? "wrap" : "nowrap",
            gap: isMobile ? "4px 10px" : 0,
            padding: isMobile ? "11px 12px" : "12px 15px",
            borderBottom: "1px solid rgba(239,233,218,.16)",
            background: "rgba(239,233,218,.025)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontFamily: MONO,
              fontSize: isMobile ? "10px" : "11px",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "#b6b0a0",
            }}
          >
            <span style={{ width: "8px", height: "8px", background: "var(--acc)" }} />
            WRAP — TRANSFER QUEUE
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: isMobile ? "9.5px" : "10.5px",
              letterSpacing: ".1em",
              color: "#6f6a5d",
              textTransform: "uppercase",
            }}
          >
            DIRECT · ENCRYPTED · <span style={{ color: "#efe9da" }}>{tp}</span>
          </div>
        </div>

        {/* tab row */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid rgba(239,233,218,.12)",
            fontFamily: MONO,
            fontSize: "11px",
            letterSpacing: ".1em",
            textTransform: "uppercase",
          }}
        >
          <span style={tabStyle("queue")} onClick={() => setTab("queue")}>
            QUEUE <span style={{ color: "#6f6a5d" }}>05</span>
          </span>
          <span style={tabStyle("history")} onClick={() => setTab("history")}>
            HISTORY
          </span>
          <span style={tabStyle("peers")} onClick={() => setTab("peers")}>
            PEERS <span>02</span>
          </span>
        </div>

        {/* QUEUE panel */}
        {tab === "queue" && (
          <div>
            {/* column header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: rowGrid,
                gap: cellGap,
                padding: headPad,
                borderBottom: "1px solid rgba(239,233,218,.1)",
                ...colHeadCell,
              }}
            >
              <span>#</span>
              <span>NAME</span>
              {!isMobile && <span>SIZE</span>}
              <span>PROGRESS</span>
              <span style={{ textAlign: "right" }}>STATUS</span>
            </div>

            {/* rows */}
            <div>
              {rows.map((r, i) => {
                const ic = iconColor(r.status);
                const w = `${Math.round(r.pct)}%`;
                return (
                  <div
                    key={r.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: rowGrid,
                      gap: cellGap,
                      alignItems: "center",
                      padding: cellPad,
                      borderBottom: "1px solid rgba(239,233,218,.07)",
                    }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: "11px", color: "#6f6a5d" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "9px",
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          width: "18px",
                          height: "18px",
                          flex: "none",
                          border: `1px solid ${ic}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span style={{ width: "6px", height: "6px", background: ic }} />
                      </span>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {r.name}
                      </span>
                    </span>
                    {!isMobile && (
                      <span style={{ fontFamily: MONO, fontSize: "11px", color: "#a8a293" }}>
                        {r.size}
                      </span>
                    )}
                    <span style={{ display: "flex", alignItems: "center", gap: isMobile ? "6px" : "9px" }}>
                      <span
                        style={{
                          flex: 1,
                          height: "6px",
                          background: "rgba(239,233,218,.09)",
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            height: "100%",
                            width: w,
                            background: barColor(r.status),
                          }}
                        />
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: "10.5px",
                          color: "#a8a293",
                          width: "34px",
                          textAlign: "right",
                        }}
                      >
                        {w}
                      </span>
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: "10px",
                        letterSpacing: ".08em",
                        textAlign: "right",
                        color: ic,
                      }}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* footer totals */}
            <div style={isMobile ? { ...footerBar, padding: "12px 12px" } : footerBar}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: isMobile ? "wrap" : "nowrap",
                  gap: isMobile ? "2px 10px" : 0,
                  fontFamily: MONO,
                  fontSize: isMobile ? "9.5px" : "10.5px",
                  letterSpacing: isMobile ? ".04em" : ".08em",
                  textTransform: "uppercase",
                  color: "#6f6a5d",
                  marginBottom: "9px",
                }}
              >
                <span>
                  <span style={{ color: "#efe9da" }}>{doneCount}</span> / 05 COMPLETE
                </span>
                <span>
                  <span style={{ color: "#efe9da" }}>{sentLabel}</span> / 11.0 GB
                </span>
                <span>
                  ETA <span style={{ color: "var(--amb)" }}>{etaLabel}</span>
                </span>
              </div>
              <div
                style={{
                  position: "relative",
                  height: "8px",
                  background: "rgba(239,233,218,.09)",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${overall}%`,
                    background: "var(--acc)",
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      width: "40px",
                      background:
                        "linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent)",
                      animation: "wrapScan 2.2s linear infinite",
                    }}
                  />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* HISTORY panel */}
        {tab === "history" && (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: histGrid,
                gap: cellGap,
                padding: headPad,
                borderBottom: "1px solid rgba(239,233,218,.1)",
                ...colHeadCell,
              }}
            >
              <span>✓</span>
              <span>NAME</span>
              <span>SIZE</span>
              <span style={{ textAlign: "right" }}>WHEN</span>
            </div>
            {(
              [
                ["portfolio-2024.zip", "1.8 GB", "2m ago"],
                ["invoice-final.pdf", "240 KB", "1h ago"],
                ["album-masters.zip", "12.4 GB", "yesterday"],
                ["design-system.fig", "88 MB", "yesterday"],
              ] as const
            ).map(([name, size, when]) => (
              <div
                key={name}
                style={{
                  display: "grid",
                  gridTemplateColumns: histGrid,
                  gap: cellGap,
                  alignItems: "center",
                  padding: cellPad,
                  borderBottom: "1px solid rgba(239,233,218,.07)",
                }}
              >
                <span style={{ color: "var(--acc)", fontFamily: MONO }}>✓</span>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {name}
                </span>
                <span style={{ fontFamily: MONO, fontSize: "11px", color: "#a8a293" }}>
                  {size}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: "10.5px",
                    color: "#6f6a5d",
                    textAlign: "right",
                  }}
                >
                  {when}
                </span>
              </div>
            ))}
            <div
              style={{
                ...footerBar,
                ...(isMobile ? { padding: "12px 12px" } : null),
                fontFamily: MONO,
                fontSize: isMobile ? "9.5px" : "10.5px",
                letterSpacing: isMobile ? ".04em" : ".08em",
                textTransform: "uppercase",
                color: "#6f6a5d",
              }}
            >
              14.5 GB sent this week · 0 failed
            </div>
          </div>
        )}

        {/* PEERS panel */}
        {tab === "peers" && (
          <div>
            <PeerRow
              name="this-mac"
              meta="macOS · this device"
              tagColor="var(--acc)"
              tag="● HOST"
              dotBorder="var(--acc)"
              dotBg="var(--acc)"
            />
            <PeerRow
              name="priya-iphone"
              meta="iOS · Safari"
              tagColor="var(--acc)"
              tag="● CONNECTED"
              dotBorder="var(--acc)"
              dotBg="var(--acc)"
            />
            <PeerRow
              name="unknown-device"
              meta="discovering on local network…"
              tagColor="var(--amb)"
              tag="● PAIRING"
              dotBorder="rgba(239,233,218,.3)"
              dotBg="var(--amb)"
              dotBlink
            />
            <div
              style={{
                ...footerBar,
                ...(isMobile ? { padding: "12px 12px" } : null),
                fontFamily: MONO,
                fontSize: isMobile ? "9.5px" : "10.5px",
                letterSpacing: isMobile ? ".04em" : ".08em",
                textTransform: "uppercase",
                color: "#6f6a5d",
              }}
            >
              2 connected · up to 8 peers per room
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface PeerRowProps {
  name: string;
  meta: string;
  tag: string;
  tagColor: string;
  dotBorder: string;
  dotBg: string;
  dotBlink?: boolean;
}

function PeerRow({ name, meta, tag, tagColor, dotBorder, dotBg, dotBlink }: PeerRowProps) {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "30px 1fr auto" : "36px 1fr auto",
        gap: isMobile ? "10px" : "12px",
        alignItems: "center",
        padding: isMobile ? "12px 12px" : "14px 15px",
        borderBottom: "1px solid rgba(239,233,218,.07)",
      }}
    >
      <div
        style={{
          width: "30px",
          height: "30px",
          border: `1px solid ${dotBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "8px",
            height: "8px",
            background: dotBg,
            animation: dotBlink ? "wrapBlink 1s steps(1) infinite" : undefined,
          }}
        />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 600,
            fontFamily: DISPLAY,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: "10.5px",
            color: "#6f6a5d",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {meta}
        </div>
      </div>
      <span
        style={{
          fontFamily: MONO,
          fontSize: "10px",
          letterSpacing: ".08em",
          color: tagColor,
          whiteSpace: "nowrap",
        }}
      >
        {tag}
      </span>
    </div>
  );
}
