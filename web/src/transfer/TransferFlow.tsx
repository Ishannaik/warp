import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import QRCode from "qrcode";
import { navigate } from "../router";
import WarpLogo from "../WarpLogo";
import { useWarpTransfer, type Connection } from "../lib/warp/useWarpTransfer";
import { formatBytes } from "../lib/warp/transfer";
import { useIsMobile } from "../lib/useIsMobile";
import { AcceptModal, SessionView } from "./SessionView";

/**
 * Wrap Transfer flow — a real, WebRTC-backed transfer surface.
 *
 * Review-before-receive redesign: there are now two pre-connect screens and then
 * one PERSISTENT session view shared with the LAN flow:
 *
 *   01 Select   — drag-drop + picker, queue, "Open secure channel"
 *   02 Pair     — big room code, copy-link / QR / Web Share, waiting ping
 *   --          — SESSION (status "connected"): composer + tray, both directions,
 *                 with an accept-modal overlay for inbound offers. The channel
 *                 stays open; either peer can keep sending. No auto-download.
 *
 * Receiver entry (`joinCode` set): skip Select, auto-join, show "connecting" in
 * the Pair view, then drop into the same session once the channel is open.
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";

interface QueuedFile {
  id: string;
  file: File;
}

const HAIRLINE = "rgba(239,233,218,.13)";

export default function TransferFlow({ joinCode }: { joinCode?: string }) {
  const wrap = useWarpTransfer(joinCode);
  const { mode, code, shareUrl, status, items, incoming, error, connections } = wrap;
  const isMobile = useIsMobile();

  // Local file queue (sender only). Each gets a stable id for list keys/removal.
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // "reconnecting" keeps the session view up (with a banner) instead of
  // bouncing the user back to a pre-connect step — transfers auto-resume.
  const reconnecting = status === "reconnecting";
  const connected = status === "connected" || reconnecting;

  // Drive the visible pre-connect step off the hook status + role. Once
  // "connected", we render the session view instead of a step.
  const showSession = connected;
  const showPair = !connected && (status === "connecting" || status === "waiting");

  const files = useMemo(() => queue.map((q) => q.file), [queue]);
  const totalBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);
  const fileCount = String(files.length).padStart(2, "0");

  const addFiles = useCallback((list: FileList | File[]) => {
    const incomingList = Array.from(list);
    if (!incomingList.length) return;
    setQueue((prev) => [...prev, ...incomingList.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const browse = () => fileInput.current?.click();

  const inSelect = !showSession && !showPair && !error;

  // ---- window-level drag overlay (Select step only) ----
  const onWinDragEnter = (e: DragEvent) => {
    if (!inSelect) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onWinDragOver = (e: DragEvent) => {
    if (inSelect) e.preventDefault();
  };
  const onWinDragLeave = (e: DragEvent) => {
    if (!inSelect) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onWinDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (!inSelect) return;
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  const openChannel = () => {
    if (!files.length) return;
    // Open the channel ONLY. The queue stays editable while pairing; nothing is
    // offered until the user hits "Send" in the session (ShareX stay-in-control).
    wrap.createRoom();
  };

  // Header label for the single-device (1-to-1) case + a sensible fallback. In a
  // mesh room SessionView renders the per-device chips from `connections` itself.
  const peerLabel = useMemo(() => {
    const others = wrap.peers;
    if (others.length) return others[0].slice(0, 8);
    return mode === "receive" ? "the sender" : "your peer";
  }, [wrap.peers, mode]);

  // The accept modal names the exact device an offer came from (mesh-aware).
  const incomingPeerLabel = useMemo(() => {
    if (!incoming) return peerLabel;
    const match = connections.find((c) => c.peerId === incoming.peerId);
    return match?.label ?? incoming.peerId.slice(0, 8);
  }, [incoming, connections, peerLabel]);

  return (
    <div
      onDragEnter={onWinDragEnter}
      onDragOver={onWinDragOver}
      onDragLeave={onWinDragLeave}
      onDrop={onWinDrop}
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Archivo',system-ui,sans-serif",
        color: "#efe9da",
        background:
          "repeating-linear-gradient(0deg,transparent 0,transparent 31px,rgba(239,233,218,.035) 31px,rgba(239,233,218,.035) 32px),repeating-linear-gradient(90deg,transparent 0,transparent 31px,rgba(239,233,218,.035) 31px,rgba(239,233,218,.035) 32px),#121110",
      }}
    >
      <style>{`
        .warp-drop:hover{border-color:var(--acc) !important;background:rgba(var(--acc-rgb),.05) !important}
        .warp-remove:hover{color:var(--amb) !important}
        .warp-exit:hover{color:#efe9da !important}
        .warp-ghost:hover{background:rgba(var(--acc-rgb),.16) !important;border-color:var(--acc) !important}
        .warp-share:hover{border-color:var(--acc) !important;color:#efe9da !important}
        .warp-cta:hover{filter:brightness(1.08)}
        .warp-rowbtn:hover{border-color:var(--amb) !important;color:var(--amb) !important}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
      `}</style>

      <TopBar
        label={showSession ? "Session" : showPair ? "Pair" : error ? "Error" : "Select"}
        isMobile={isMobile}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: showSession ? "flex-start" : "center",
          justifyContent: "center",
          padding: isMobile ? "28px 16px" : "48px 26px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "720px" }}>
          {error ? (
            <ErrorPanel message={error.message} onRetry={wrap.retry} isMobile={isMobile} />
          ) : showSession ? (
            <>
              {reconnecting && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "14px",
                    padding: "10px 14px",
                    border: "1px solid rgba(239,106,61,.45)",
                    background: "rgba(239,106,61,.08)",
                    fontFamily: MONO,
                    fontSize: "12px",
                    letterSpacing: ".06em",
                    color: "var(--amb)",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--amb)",
                      animation: "pulse 1.2s ease-in-out infinite",
                    }}
                  />
                  CONNECTION DROPPED — RECONNECTING… TRANSFERS RESUME AUTOMATICALLY
                </div>
              )}
              <SessionView
                peerLabel={peerLabel}
                connections={connections}
                items={items}
                onSendFiles={wrap.sendFiles}
                onSendText={wrap.sendText}
                onCancel={wrap.cancel}
                onDownloadOne={wrap.downloadOne}
                onDownloadAll={wrap.downloadAll}
                isMobile={isMobile}
                heading={
                  reconnecting
                    ? "Reconnecting…"
                    : mode === "receive"
                      ? "Connected to sender"
                      : "Connected"
                }
                // Sender only: the staged queue stays editable until they hit Send.
                // The receiver has no pre-queue, so these stay undefined.
                pending={mode === "send" ? queue : undefined}
                onAddFiles={mode === "send" ? addFiles : undefined}
                onRemovePending={mode === "send" ? removeFile : undefined}
                onSendPending={
                  mode === "send"
                    ? () => {
                        void wrap.sendFiles(queue.map((q) => q.file));
                        setQueue([]);
                      }
                    : undefined
                }
              />
            </>
          ) : showPair ? (
            <PairStep
              mode={mode}
              code={code}
              shareUrl={shareUrl}
              queue={queue}
              fileCount={fileCount}
              totalBytes={totalBytes}
              connecting={status === "connecting"}
              connections={connections}
              onBrowse={browse}
              onDropFiles={addFiles}
              onRemove={removeFile}
              isMobile={isMobile}
            />
          ) : (
            <SelectStep
              files={files}
              queue={queue}
              fileCount={fileCount}
              totalBytes={totalBytes}
              onBrowse={browse}
              onDropFiles={addFiles}
              onRemove={removeFile}
              onOpenChannel={openChannel}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {dragging && <DropOverlay />}

      {/* Accept modal overlays the whole page whenever an inbound offer is pending. */}
      {incoming && (
        <AcceptModal
          items={incoming.items}
          onAccept={wrap.accept}
          onDecline={wrap.decline}
          peerName={incomingPeerLabel}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ top bar */

function TopBar({ label, isMobile }: { label: string; isMobile: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobile ? "14px 16px" : "18px 26px",
        borderBottom: `1px solid ${HAIRLINE}`,
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          fontFamily: MONO,
          fontSize: isMobile ? "10.5px" : "11px",
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "#efe9da",
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            background: "var(--acc)",
          }}
        />
        {label}
      </div>

      <a
        href="/"
        className="warp-exit"
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
        ← EXIT
      </a>
    </div>
  );
}

const stepLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: "11.5px",
  letterSpacing: ".2em",
  textTransform: "uppercase",
  color: "#6f6a5d",
};

/* --------------------------------------------------- shared editable queue */

/** The queue header + file rows with per-row remove. Reused by Select + Pair. */
function QueueList({
  queue,
  fileCount,
  totalBytes,
  onRemove,
  isMobile,
  style,
}: {
  queue: QueuedFile[];
  fileCount: string;
  totalBytes: number;
  onRemove: (id: string) => void;
  isMobile: boolean;
  style?: CSSProperties;
}) {
  return (
    <div style={{ border: "1px solid rgba(239,233,218,.14)", ...style }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 15px",
          borderBottom: "1px solid rgba(239,233,218,.12)",
          fontFamily: MONO,
          fontSize: "10.5px",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "#6f6a5d",
        }}
      >
        <span>Queue</span>
        <span>
          <span style={{ color: "#efe9da" }}>{fileCount}</span> files · {formatBytes(totalBytes)}
        </span>
      </div>

      {queue.length === 0 ? (
        <div
          style={{
            padding: "24px 15px",
            textAlign: "center",
            fontFamily: MONO,
            fontSize: "12px",
            color: "#6f6a5d",
          }}
        >
          Nothing queued yet — drop files above to begin.
        </div>
      ) : (
        queue.map((q) => (
          <div
            key={q.id}
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "28px 1fr auto 26px" : "34px 1fr auto 30px",
              gap: isMobile ? "8px" : "12px",
              alignItems: "center",
              padding: isMobile ? "12px" : "13px 15px",
              borderBottom: "1px solid rgba(239,233,218,.07)",
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: "30px",
                height: "30px",
                border: "1px solid var(--acc)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: "8px", height: "8px", background: "var(--acc)" }} />
            </div>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {q.file.name}
            </span>
            <span style={{ fontFamily: MONO, fontSize: "11.5px", color: "#908a7b" }}>
              {formatBytes(q.file.size)}
            </span>
            <span
              className="warp-remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(q.id);
              }}
              style={{
                fontFamily: MONO,
                fontSize: "15px",
                color: "#6f6a5d",
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              ✕
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- step 01 */

function SelectStep({
  files,
  queue,
  fileCount,
  totalBytes,
  onBrowse,
  onDropFiles,
  onRemove,
  onOpenChannel,
  isMobile,
}: {
  files: File[];
  queue: QueuedFile[];
  fileCount: string;
  totalBytes: number;
  onBrowse: () => void;
  onDropFiles: (l: FileList) => void;
  onRemove: (id: string) => void;
  onOpenChannel: () => void;
  isMobile: boolean;
}) {
  return (
    <div style={{ animation: "warpFade .5s ease both" }}>
      <div style={{ ...stepLabel, marginBottom: "10px" }}>Step 01 / Select</div>
      <h1
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: "clamp(30px,5vw,46px)",
          lineHeight: 1,
          letterSpacing: "-.03em",
          margin: "0 0 28px",
        }}
      >
        What are you sending?
      </h1>

      <div
        className="warp-drop"
        onClick={onBrowse}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer?.files?.length) onDropFiles(e.dataTransfer.files);
        }}
        style={{
          border: "1.5px dashed rgba(239,233,218,.28)",
          background: "rgba(239,233,218,.02)",
          padding: isMobile ? "36px 16px" : "48px 26px",
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", gap: "7px", marginBottom: "18px" }}>
          <div style={{ width: "20px", height: "26px", border: "1px solid rgba(239,233,218,.45)" }} />
          <div
            style={{
              width: "20px",
              height: "26px",
              border: "1px solid rgba(239,233,218,.45)",
              transform: "translateY(-4px)",
            }}
          />
          <div
            style={{
              width: "20px",
              height: "26px",
              border: "1px solid var(--acc)",
              background: "rgba(var(--acc-rgb),.25)",
            }}
          />
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "20px" }}>Drop files here</div>
        <div style={{ fontFamily: MONO, fontSize: "12px", color: "#6f6a5d", marginTop: "8px" }}>
          or click to browse · any size, any type
        </div>
      </div>

      <QueueList
        queue={queue}
        fileCount={fileCount}
        totalBytes={totalBytes}
        onRemove={onRemove}
        isMobile={isMobile}
        style={{ marginTop: "22px" }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: isMobile ? "16px" : undefined,
          marginTop: "26px",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: "11.5px",
            color: "#6f6a5d",
            textAlign: isMobile ? "center" : "left",
          }}
        >
          Files stay on your device until a peer accepts.
        </span>
        <span
          className={files.length ? "warp-cta" : undefined}
          onClick={onOpenChannel}
          style={{
            display: isMobile ? "block" : "inline-block",
            padding: "15px 26px",
            background: files.length ? "var(--acc)" : "rgba(239,233,218,.12)",
            color: "#fff",
            fontFamily: MONO,
            fontSize: "12.5px",
            fontWeight: 600,
            letterSpacing: ".07em",
            textTransform: "uppercase",
            textAlign: isMobile ? "center" : undefined,
            cursor: files.length ? "pointer" : "not-allowed",
          }}
        >
          Open secure channel &nbsp;→
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- step 02 */

function PairStep({
  mode,
  code,
  shareUrl,
  queue,
  fileCount,
  totalBytes,
  connecting,
  connections,
  onBrowse,
  onDropFiles,
  onRemove,
  isMobile,
}: {
  mode: "send" | "receive";
  code: string | null;
  shareUrl: string | null;
  queue: QueuedFile[];
  fileCount: string;
  totalBytes: number;
  connecting: boolean;
  connections: Connection[];
  onBrowse: () => void;
  onDropFiles: (l: FileList) => void;
  onRemove: (id: string) => void;
  isMobile: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>("");
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!shareUrl) return;
    let alive = true;
    QRCode.toString(shareUrl, { type: "svg", margin: 1 })
      .then((svg) => {
        if (alive) setQrSvg(svg);
      })
      .catch(() => {
        /* QR is decorative; ignore generation failures */
      });
    return () => {
      alive = false;
    };
  }, [shareUrl]);

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const share = () => {
    if (shareUrl && canShare) {
      navigator.share({ title: "Warp", url: shareUrl }).catch(() => {});
    }
  };

  const isReceiver = mode === "receive";
  // Devices that have joined the room but whose channel isn't open yet (sender
  // side, while pairing). Once a channel opens, status flips to "connected" and
  // we leave this screen entirely — so everything here is still "connecting".
  const joiners = connections;
  const waitingText = isReceiver
    ? connecting
      ? "Joining channel"
      : "Waiting for sender"
    : joiners.length === 1
      ? "1 device joining — opening channel"
      : joiners.length > 1
        ? `${joiners.length} devices joining — opening channels`
        : "Waiting for devices to join";

  return (
    <div style={{ animation: "warpFade .5s ease both", textAlign: "center" }}>
      <div style={{ ...stepLabel, marginBottom: "30px" }}>Step 02 / Pair</div>

      <div
        style={{
          position: "relative",
          width: isMobile ? "140px" : "180px",
          height: isMobile ? "140px" : "180px",
          margin: "0 auto 18px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "1px solid rgba(var(--acc-rgb),.5)",
            borderRadius: "50%",
            animation: "warpPing 2.4s ease-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "1px solid rgba(var(--acc-rgb),.5)",
            borderRadius: "50%",
            animation: "warpPing 2.4s ease-out infinite 1.2s",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: "56px",
            height: "56px",
            background: "var(--acc)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: "18px", height: "18px", background: "#121110" }} />
        </div>
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "9px",
          fontFamily: MONO,
          fontSize: "11.5px",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "#a8a293",
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            background: "var(--amb)",
            animation: "warpBlink 1.2s steps(1) infinite",
          }}
        />
        {waitingText}
      </div>

      <h1
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: "clamp(28px,4vw,40px)",
          lineHeight: 1,
          letterSpacing: "-.02em",
          margin: "18px 0 6px",
        }}
      >
        {isReceiver ? "Connecting you in" : "Share this code"}
      </h1>

      <div
        style={{
          fontFamily: MONO,
          fontSize: "clamp(30px,6vw,56px)",
          fontWeight: 700,
          letterSpacing: ".08em",
          color: "var(--acc)",
          margin: "10px 0 4px",
          wordBreak: "break-all",
        }}
      >
        {code ?? "········"}
      </div>

      {isReceiver ? (
        <div style={{ fontFamily: MONO, fontSize: "12px", color: "#6f6a5d" }}>
          Hold tight — opening a direct channel to the sender.
        </div>
      ) : (
        <>
          <div style={{ fontFamily: MONO, fontSize: "12px", color: "#6f6a5d" }}>
            {fileCount} files · {formatBytes(totalBytes)} ready to offer
          </div>

          {/* JOINERS — devices show up here the instant they enter the room, even
              before the channel finishes opening. Add a few; send to them all. */}
          {joiners.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                justifyContent: "center",
                marginTop: "18px",
              }}
            >
              {joiners.map((c) => (
                <span
                  key={c.peerId}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    padding: "6px 12px",
                    border: "1px solid rgba(var(--acc-rgb),.45)",
                    background: "rgba(var(--acc-rgb),.06)",
                    fontFamily: MONO,
                    fontSize: "11.5px",
                    color: "#efe9da",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "var(--acc)",
                      animation: "warpBlink 1.6s steps(1) infinite",
                    }}
                  />
                  {c.label}
                  {!c.connected && <span style={{ color: "#6f6a5d" }}>· linking</span>}
                </span>
              ))}
            </div>
          )}

          {/* SHARE ROW */}
          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              flexWrap: "wrap",
              gap: "12px",
              justifyContent: "center",
              alignItems: isMobile ? "stretch" : "center",
              marginTop: "26px",
            }}
          >
            <span
              className="warp-share"
              onClick={copy}
              style={isMobile ? { ...shareBtn, display: "block", textAlign: "center" } : shareBtn}
            >
              {copied ? "✓ copied!" : "⧉ Copy link"}
            </span>
            {canShare && (
              <span
                className="warp-share"
                onClick={share}
                style={isMobile ? { ...shareBtn, display: "block", textAlign: "center" } : shareBtn}
              >
                ↗ Share
              </span>
            )}
          </div>

          {qrSvg && (
            <div
              style={{
                margin: "26px auto 0",
                width: "150px",
                height: "150px",
                padding: "10px",
                background: "#efe9da",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="QR code linking to this transfer"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          )}

          {shareUrl && (
            <div
              style={{
                fontFamily: MONO,
                fontSize: "11px",
                color: "#6f6a5d",
                marginTop: "14px",
                wordBreak: "break-all",
              }}
            >
              {shareUrl}
            </div>
          )}

          {/* EDITABLE QUEUE — keep adding / removing while you wait. Nothing is
              offered until the peer connects and you hit Send in the session. */}
          <div style={{ marginTop: "30px", textAlign: "left" }}>
            <div
              className="warp-drop"
              onClick={onBrowse}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer?.files?.length) onDropFiles(e.dataTransfer.files);
              }}
              style={{
                border: "1.5px dashed rgba(239,233,218,.28)",
                background: "rgba(239,233,218,.02)",
                padding: isMobile ? "18px 16px" : "20px 22px",
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "16px" }}>
                Add more files
              </div>
              <div style={{ fontFamily: MONO, fontSize: "11px", color: "#6f6a5d", marginTop: "6px" }}>
                drop or click — edit the queue until your peer joins
              </div>
            </div>

            <QueueList
              queue={queue}
              fileCount={fileCount}
              totalBytes={totalBytes}
              onRemove={onRemove}
              isMobile={isMobile}
              style={{ marginTop: "16px" }}
            />
          </div>
        </>
      )}
    </div>
  );
}

const shareBtn: CSSProperties = {
  display: "inline-block",
  padding: "13px 20px",
  border: "1px solid rgba(239,233,218,.22)",
  color: "#a8a293",
  fontFamily: MONO,
  fontSize: "12px",
  letterSpacing: ".07em",
  textTransform: "uppercase",
  cursor: "pointer",
  background: "rgba(239,233,218,.03)",
};

/* -------------------------------------------------------------- error panel */

function ErrorPanel({
  message,
  onRetry,
  isMobile,
}: {
  message: string;
  onRetry: () => void;
  isMobile: boolean;
}) {
  return (
    <div style={{ animation: "warpFade .5s ease both", textAlign: "center" }}>
      <div
        style={{
          width: "72px",
          height: "72px",
          margin: "0 auto 24px",
          border: "1px solid var(--amb)",
          background: "rgba(var(--amb-rgb),.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MONO,
          fontSize: "32px",
          color: "var(--amb)",
        }}
      >
        !
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: "11.5px",
          letterSpacing: ".2em",
          textTransform: "uppercase",
          color: "var(--amb)",
          marginBottom: "12px",
        }}
      >
        Channel failed
      </div>
      <h1
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: "clamp(28px,4vw,40px)",
          lineHeight: 1,
          letterSpacing: "-.02em",
          margin: "0 0 12px",
        }}
      >
        No direct route.
      </h1>
      <p style={{ fontSize: "15px", color: "#a8a293", margin: "0 auto 30px", maxWidth: "440px" }}>
        {message} Warp is STUN-only — there's no relay fallback, so some networks simply can't be
        bridged.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: "12px",
          justifyContent: "center",
          alignItems: isMobile ? "stretch" : undefined,
        }}
      >
        <span
          className="warp-cta"
          onClick={onRetry}
          style={{
            display: isMobile ? "block" : "inline-block",
            padding: "15px 26px",
            background: "var(--acc)",
            color: "#fff",
            fontFamily: MONO,
            fontSize: "12.5px",
            fontWeight: 600,
            letterSpacing: ".07em",
            textTransform: "uppercase",
            textAlign: isMobile ? "center" : undefined,
            cursor: "pointer",
          }}
        >
          Try again
        </span>
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          style={{
            display: isMobile ? "block" : "inline-block",
            padding: "15px 24px",
            border: "1px solid rgba(239,233,218,.22)",
            color: "#efe9da",
            fontFamily: MONO,
            fontSize: "12.5px",
            fontWeight: 500,
            letterSpacing: ".07em",
            textTransform: "uppercase",
            textAlign: isMobile ? "center" : undefined,
            textDecoration: "none",
          }}
        >
          Back to Warp
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- drop overlay */

function DropOverlay() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,10,14,.45)",
        backdropFilter: "blur(13px)",
        WebkitBackdropFilter: "blur(13px)",
        animation: "warpFade .18s ease both",
      }}
    >
      <div
        style={{
          border: "2px dashed var(--acc)",
          background: "rgba(var(--acc-rgb),.1)",
          padding: "54px 84px",
          textAlign: "center",
          boxShadow: "0 40px 120px -30px rgba(0,0,0,.8)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", gap: "9px", marginBottom: "22px" }}>
          <div style={{ width: "26px", height: "34px", border: "1px solid rgba(239,233,218,.6)" }} />
          <div
            style={{
              width: "26px",
              height: "34px",
              border: "1px solid rgba(239,233,218,.6)",
              transform: "translateY(-6px)",
            }}
          />
          <div
            style={{
              width: "26px",
              height: "34px",
              border: "1px solid var(--acc)",
              background: "rgba(var(--acc-rgb),.3)",
            }}
          />
        </div>
        <div
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: "36px",
            letterSpacing: "-.02em",
            textTransform: "uppercase",
          }}
        >
          Drop to send
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: "12px",
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "var(--acc)",
            marginTop: "10px",
          }}
        >
          Release anywhere
        </div>
      </div>
    </div>
  );
}
