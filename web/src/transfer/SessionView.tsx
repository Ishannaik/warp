/**
 * Shared SESSION UI for the review-before-receive redesign.
 *
 * Both the code-room flow (TransferFlow) and the LAN flow (NearbyDevices) funnel
 * into the SAME persistent session surface once a data channel is open:
 *   - a COMPOSER: pick files (multi + folder) or send a text snippet,
 *   - a TRAY: every item we've sent or received (both directions) with
 *     thumbnails / type-icons, per-file progress + cancel, per-file download,
 *     copy-for-text, and a "Download all (.zip)" action,
 *   - an ACCEPT MODAL overlay shown when an inbound offer is pending.
 *
 * Driven entirely off the engine's `TransferItem[]` and the hook's
 * `IncomingOffer`. No transfer logic lives here — pure presentation + the file
 * input plumbing. Mobile-first; design tokens matched; reduced-motion safe via
 * the global keyframes media query.
 */

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { formatBytes, type OfferItem, type TransferItem } from "../lib/warp/transfer";
import type { Connection } from "../lib/warp/useWarpTransfer";

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";
const HAIRLINE = "rgba(239,233,218,.13)";

/* ------------------------------------------------------------------ helpers */

/** A compact type-icon glyph for a non-image file, derived from its mime. */
function typeGlyph(mime: string, kind: TransferItem["kind"]): string {
  if (kind === "text") return "¶";
  if (mime.startsWith("image/")) return "▦";
  if (mime.startsWith("video/")) return "►";
  if (mime.startsWith("audio/")) return "♪";
  if (mime.startsWith("text/")) return "≡";
  if (mime.includes("zip") || mime.includes("compressed") || mime.includes("tar")) return "❑";
  if (mime.includes("pdf")) return "▤";
  return "◆";
}

/** Aggregate size label for a manifest. */
function totalBytes(items: { size: number }[]): number {
  return items.reduce((s, i) => s + i.size, 0);
}

/* ----------------------------------------------------------------- thumbnail */

function Thumb({ item, size = 40 }: { item: { thumb?: string; mime: string; kind?: TransferItem["kind"] }; size?: number }) {
  if (item.thumb) {
    return (
      <img
        src={item.thumb}
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: "cover",
          border: "1px solid rgba(239,233,218,.18)",
          flexShrink: 0,
          display: "block",
        }}
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        border: "1px solid var(--acc)",
        background: "rgba(var(--acc-rgb),.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: MONO,
        fontSize: size > 36 ? "16px" : "13px",
        color: "var(--acc)",
      }}
    >
      {typeGlyph(item.mime, item.kind ?? "file")}
    </span>
  );
}

/* ----------------------------------------------------------------- tray row */

const STATUS_COPY: Record<TransferItem["status"], string> = {
  offered: "WAITING",
  transferring: "MOVING",
  reconnecting: "RESUMING",
  done: "DONE",
  declined: "DECLINED",
  cancelled: "CANCELLED",
  error: "ERROR",
};

function statusColor(status: TransferItem["status"]): string {
  if (status === "done") return "var(--acc)";
  if (status === "transferring") return "var(--amb)";
  if (status === "declined" || status === "cancelled" || status === "error") return "#6f6a5d";
  return "#908a7b";
}

function ItemRow({
  item,
  onCancel,
  onDownload,
  isMobile,
  peerLabel,
}: {
  item: TransferItem;
  onCancel: (id: string) => void;
  onDownload: (id: string) => void;
  isMobile: boolean;
  /** Which device this item is to/from — shown only in a multi-device room. */
  peerLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const col = statusColor(item.status);
  const transferring = item.status === "transferring";
  const isText = item.kind === "text";
  // Items streamed straight to disk have no in-memory blob — they're already
  // saved, so they show a "saved to disk" badge instead of a Download button.
  const savedToDisk =
    item.direction === "receive" && item.kind === "file" && item.status === "done" && !!item.savedToDisk;
  const canDownload =
    item.direction === "receive" &&
    item.kind === "file" &&
    item.status === "done" &&
    !item.savedToDisk &&
    !!item.blob;

  const copyText = async () => {
    if (!item.text) return;
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: isMobile ? "12px" : "13px 15px",
        borderBottom: "1px solid rgba(239,233,218,.07)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "10px" : "12px" }}>
        <Thumb item={item} size={isMobile ? 36 : 40} />

        <span style={{ minWidth: 0, flex: 1 }}>
          <span
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
            {isText ? "Text snippet" : item.name}
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
            <span style={{ color: item.direction === "receive" ? "var(--acc)" : "#908a7b" }}>
              {item.direction === "receive" ? "↓ IN" : "↑ OUT"}
            </span>
            {peerLabel && (
              <span style={{ color: "#908a7b" }}>
                · {item.direction === "receive" ? "from" : "to"}{" "}
                <span style={{ color: "var(--acc)" }}>{peerLabel}</span>
              </span>
            )}
            {!isText && <span>· {formatBytes(item.size)}</span>}
            <span style={{ color: col }}>· {STATUS_COPY[item.status]}</span>
          </span>
        </span>

        {/* row actions */}
        <span style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {transferring && (
            <button
              type="button"
              className="warp-rowbtn"
              onClick={() => onCancel(item.id)}
              aria-label="Cancel transfer"
              style={iconBtn}
            >
              ✕
            </button>
          )}
          {canDownload && (
            <button
              type="button"
              className="warp-cta"
              onClick={() => onDownload(item.id)}
              style={{
                padding: "8px 14px",
                background: "var(--acc)",
                color: "#fff",
                border: "none",
                fontFamily: MONO,
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Download
            </button>
          )}
          {savedToDisk && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "8px 12px",
                border: "1px solid rgba(var(--acc-rgb),.4)",
                background: "rgba(var(--acc-rgb),.08)",
                color: "var(--acc)",
                fontFamily: MONO,
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              ✓ Saved to disk
            </span>
          )}
        </span>
      </div>

      {/* text snippet body + copy */}
      {isText && item.text && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "12.5px",
              lineHeight: 1.55,
              color: "#cfc9ba",
              background: "rgba(239,233,218,.03)",
              border: `1px solid ${HAIRLINE}`,
              padding: "10px 12px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "160px",
              overflow: "auto",
            }}
          >
            {item.text}
          </div>
          <button
            type="button"
            className="warp-share"
            onClick={copyText}
            style={{
              alignSelf: "flex-start",
              padding: "7px 14px",
              background: "rgba(239,233,218,.03)",
              border: `1px solid ${HAIRLINE}`,
              color: copied ? "var(--acc)" : "#a8a293",
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {copied ? "✓ copied" : "⧉ copy"}
          </button>
        </div>
      )}

      {/* progress bar while transferring */}
      {transferring && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                width: `${item.progress}%`,
                background: col,
                transition: "width .12s linear",
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
            {item.progress}%
          </span>
        </div>
      )}
    </div>
  );
}

const iconBtn: CSSProperties = {
  width: "30px",
  height: "30px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: `1px solid ${HAIRLINE}`,
  color: "#908a7b",
  fontFamily: MONO,
  fontSize: "13px",
  cursor: "pointer",
  lineHeight: 1,
};

/* ----------------------------------------------------------------- composer */

function Composer({
  onSendFiles,
  onSendText,
  isMobile,
  pending,
  onAddFiles,
  onRemovePending,
  onSendPending,
  deviceCount = 1,
}: {
  onSendFiles: (files: File[]) => void;
  onSendText: (text: string) => void;
  isMobile: boolean;
  pending?: PendingFile[];
  onAddFiles?: (files: File[]) => void;
  onRemovePending?: (id: string) => void;
  onSendPending?: () => void;
  /** Connected devices a send fans out to (>1 in a mesh room). */
  deviceCount?: number;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  // When staging callbacks are provided (TransferFlow), file pickers ADD to the
  // editable pending queue instead of offering immediately. The nearby flow
  // passes none, so picks fall through to the original direct-offer behavior.
  const staging = !!onAddFiles;
  const acceptFiles = staging ? onAddFiles! : onSendFiles;
  const pendingList = pending ?? [];
  // " to N devices" suffix shown only in a mesh room (>1 connected device).
  const fanout = deviceCount > 1 ? ` to ${deviceCount} devices` : "";

  const pickFiles = () => fileInput.current?.click();
  const pickFolder = () => folderInput.current?.click();

  const submitText = () => {
    const t = text.trim();
    if (!t) return;
    onSendText(t);
    setText("");
  };

  return (
    <div style={{ border: `1px solid ${HAIRLINE}`, background: "#15140f" }}>
      <div
        style={{
          padding: "11px 15px",
          borderBottom: `1px solid ${HAIRLINE}`,
          fontFamily: MONO,
          fontSize: "10.5px",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "#6f6a5d",
        }}
      >
        Compose
      </div>

      <div style={{ padding: isMobile ? "14px" : "16px 15px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* file pickers */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: "10px" }}>
          <button type="button" className="warp-ghost" onClick={pickFiles} style={composerBtn(isMobile)}>
            ＋ {staging ? "Add files" : "Send files"}
          </button>
          <button type="button" className="warp-ghost" onClick={pickFolder} style={composerBtn(isMobile)}>
            ▤ {staging ? "Add a folder" : "Send a folder"}
          </button>
        </div>

        {/* staged "ready to send" queue — editable until you hit Send */}
        {staging && pendingList.length > 0 && onRemovePending && onSendPending && (
          <PendingTray
            pending={pendingList}
            onRemovePending={onRemovePending}
            onSendPending={onSendPending}
            isMobile={isMobile}
            fanout={fanout}
          />
        )}

        {/* text snippet */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="…or paste a link / note to send as text"
            rows={isMobile ? 3 : 2}
            onKeyDown={(e) => {
              // Cmd/Ctrl+Enter sends, like a chat composer.
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submitText();
              }
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              padding: "11px 13px",
              background: "rgba(239,233,218,.02)",
              border: `1px solid ${HAIRLINE}`,
              color: "#efe9da",
              fontFamily: MONO,
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          />
          <button
            type="button"
            className={text.trim() ? "warp-cta" : undefined}
            onClick={submitText}
            disabled={!text.trim()}
            style={{
              alignSelf: isMobile ? "stretch" : "flex-end",
              padding: "11px 22px",
              background: text.trim() ? "var(--acc)" : "rgba(239,233,218,.12)",
              color: text.trim() ? "#fff" : "#6f6a5d",
              border: "none",
              fontFamily: MONO,
              fontSize: "11.5px",
              fontWeight: 600,
              letterSpacing: ".07em",
              textTransform: "uppercase",
              cursor: text.trim() ? "pointer" : "not-allowed",
            }}
          >
            Send text{fanout} →
          </button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.length) acceptFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        // @ts-expect-error — non-standard but widely supported directory picker attrs
        webkitdirectory=""
        directory=""
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.length) acceptFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* --------------------------------------------------- pending ("ready to send") */

export interface PendingFile {
  id: string;
  file: File;
}

/**
 * The "ready to send" staging region inside the composer: every file queued
 * locally but NOT yet offered. Editable right up until the user hits Send —
 * remove any item, add more, then offer the whole batch in one shot. This is
 * what keeps the sender in control (ShareX-style) instead of locking the queue
 * the moment a channel opens.
 */
function PendingTray({
  pending,
  onRemovePending,
  onSendPending,
  isMobile,
  fanout = "",
}: {
  pending: PendingFile[];
  onRemovePending: (id: string) => void;
  onSendPending: () => void;
  isMobile: boolean;
  /** " to N devices" suffix for the send button (mesh room); "" when 1-to-1. */
  fanout?: string;
}) {
  const total = pending.reduce((s, p) => s + p.file.size, 0);
  const count = pending.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "10px",
          fontFamily: MONO,
          fontSize: "10.5px",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "#6f6a5d",
        }}
      >
        <span>
          Ready to send · <span style={{ color: "#efe9da" }}>{String(count).padStart(2, "0")}</span>
        </span>
        <span style={{ letterSpacing: ".06em", color: "#908a7b" }}>{formatBytes(total)}</span>
      </div>

      <div
        style={{
          border: `1px solid ${HAIRLINE}`,
          background: "rgba(239,233,218,.02)",
          maxHeight: "208px",
          overflow: "auto",
        }}
      >
        {pending.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobile ? "10px" : "12px",
              padding: isMobile ? "10px 11px" : "11px 13px",
              borderBottom: "1px solid rgba(239,233,218,.07)",
            }}
          >
            <Thumb item={{ mime: p.file.type, kind: "file" }} size={isMobile ? 34 : 38} />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: "13.5px",
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "#efe9da",
              }}
            >
              {p.file.name}
            </span>
            <span style={{ fontFamily: MONO, fontSize: "11px", color: "#908a7b", flexShrink: 0 }}>
              {formatBytes(p.file.size)}
            </span>
            <button
              type="button"
              className="warp-rowbtn"
              onClick={() => onRemovePending(p.id)}
              aria-label={`Remove ${p.file.name}`}
              style={{ ...iconBtn, flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="warp-cta"
        onClick={onSendPending}
        disabled={count === 0}
        style={{
          width: "100%",
          padding: "13px 24px",
          background: "var(--acc)",
          color: "#fff",
          border: "none",
          fontFamily: MONO,
          fontSize: "12.5px",
          fontWeight: 600,
          letterSpacing: ".07em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Send {count} {count === 1 ? "file" : "files"}{fanout} →
      </button>
    </div>
  );
}

function composerBtn(isMobile: boolean): CSSProperties {
  return {
    flex: isMobile ? undefined : 1,
    padding: "13px 16px",
    background: "rgba(var(--acc-rgb),.08)",
    border: "1px solid rgba(var(--acc-rgb),.4)",
    color: "#efe9da",
    fontFamily: MONO,
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "background .15s ease, border-color .15s ease",
  };
}

/* ------------------------------------------------------------------ the tray */

function Tray({
  items,
  onCancel,
  onDownload,
  onDownloadAll,
  isMobile,
  labelForPeer,
}: {
  items: TransferItem[];
  onCancel: (id: string) => void;
  onDownload: (id: string) => void;
  onDownloadAll: () => void;
  isMobile: boolean;
  /** Resolve a row's peer label; returns undefined to hide the tag (1-to-1). */
  labelForPeer?: (peerId?: string) => string | undefined;
}) {
  // "Download all (.zip)" only zips in-memory items — disk-streamed items are
  // already on disk and carry no blob, so they're excluded here.
  const receivedFiles = items.filter(
    (t) => t.direction === "receive" && t.kind === "file" && t.status === "done" && !t.savedToDisk && t.blob,
  ).length;

  return (
    <div style={{ border: `1px solid ${HAIRLINE}`, background: "#15140f" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          padding: "11px 15px",
          borderBottom: `1px solid ${HAIRLINE}`,
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
          Tray · <span style={{ color: "#efe9da" }}>{String(items.length).padStart(2, "0")}</span>
        </span>
        {receivedFiles > 0 && (
          <button
            type="button"
            className="warp-share"
            onClick={onDownloadAll}
            style={{
              padding: "7px 14px",
              background: "rgba(239,233,218,.03)",
              border: `1px solid ${HAIRLINE}`,
              color: "#a8a293",
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            ⤓ Download all (.zip)
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: "26px 15px",
            textAlign: "center",
            fontFamily: MONO,
            fontSize: "12px",
            color: "#6f6a5d",
          }}
        >
          Nothing yet — send files or text, or wait for the other side.
        </div>
      ) : (
        items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            onCancel={onCancel}
            onDownload={onDownload}
            isMobile={isMobile}
            peerLabel={labelForPeer?.(item.peerId)}
          />
        ))
      )}
    </div>
  );
}

/* --------------------------------------------------------------- accept modal */

// Mirrors LARGE_THRESHOLD in useWarpTransfer: large batches stream straight to
// disk via a folder/file picker instead of accumulating in memory.
const LARGE_THRESHOLD = 256 * 1024 * 1024;

export function AcceptModal({
  items,
  onAccept,
  onDecline,
  peerName,
  isMobile,
}: {
  items: OfferItem[];
  onAccept: () => void;
  onDecline: () => void;
  peerName?: string;
  isMobile: boolean;
}) {
  const total = totalBytes(items);
  // A large batch will surface a native folder/file picker on Accept (the hook
  // streams it to disk), so we tell the user to expect that and to choose a spot.
  const large =
    typeof window !== "undefined" &&
    ("showSaveFilePicker" in window || "showDirectoryPicker" in window) &&
    (total >= LARGE_THRESHOLD || items.some((it) => it.size >= LARGE_THRESHOLD));
  const pickTarget = items.length > 1 ? "folder" : "file";

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onDecline();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(10,10,14,.55)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        animation: "warpFade .18s ease both",
        fontFamily: "'Archivo',system-ui,sans-serif",
        color: "#efe9da",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#15140f",
          border: "1px solid rgba(239,233,218,.18)",
          boxShadow: "0 40px 120px -30px rgba(0,0,0,.85)",
          animation: "warpRise .35s cubic-bezier(.2,.8,.2,1) both",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: isMobile ? "22px 18px 14px" : "26px 26px 16px" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "var(--acc)",
              marginBottom: "10px",
            }}
          >
            Incoming · review before receiving
          </div>
          <h3
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: isMobile ? "22px" : "26px",
              letterSpacing: "-.02em",
              lineHeight: 1.12,
              margin: 0,
            }}
          >
            {peerName ? (
              <>
                <span style={{ fontFamily: MONO, color: "var(--acc)" }}>{peerName}</span> wants to send you{" "}
                {items.length} {items.length === 1 ? "item" : "items"}
              </>
            ) : (
              <>Accept {items.length} {items.length === 1 ? "item" : "items"}?</>
            )}
          </h3>
          <p style={{ fontSize: "13.5px", color: "#a8a293", margin: "8px 0 0", lineHeight: 1.5 }}>
            {large ? (
              <>
                {formatBytes(total)} total —{" "}
                <span style={{ color: "var(--acc)" }}>large transfer</span>. On Accept you'll choose a{" "}
                {pickTarget} to save to, and it streams straight to disk.
              </>
            ) : (
              <>
                {formatBytes(total)} total. Nothing is saved to disk — accepted files land in your tray to
                download when you're ready.
              </>
            )}
          </p>
        </div>

        {/* manifest list */}
        <div style={{ overflow: "auto", borderTop: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}` }}>
          {items.map((it) => (
            <div
              key={it.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: isMobile ? "11px 18px" : "12px 26px",
                borderBottom: "1px solid rgba(239,233,218,.07)",
              }}
            >
              <Thumb item={it} size={isMobile ? 34 : 38} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "13.5px",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {it.name}
              </span>
              <span style={{ fontFamily: MONO, fontSize: "11px", color: "#908a7b", flexShrink: 0 }}>
                {formatBytes(it.size)}
              </span>
            </div>
          ))}
        </div>

        {/* actions */}
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: "12px",
            justifyContent: "flex-end",
            padding: isMobile ? "16px 18px" : "18px 26px",
          }}
        >
          <button
            type="button"
            className="warp-share"
            onClick={onDecline}
            style={{
              order: isMobile ? 1 : 0,
              padding: "13px 22px",
              background: "transparent",
              border: "1px solid rgba(239,233,218,.22)",
              color: "#a8a293",
              fontFamily: MONO,
              fontSize: "12px",
              fontWeight: 500,
              letterSpacing: ".07em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Decline
          </button>
          <button
            type="button"
            className="warp-cta"
            onClick={onAccept}
            style={{
              order: isMobile ? 0 : 1,
              padding: "13px 26px",
              background: "var(--acc)",
              border: "none",
              color: "#fff",
              fontFamily: MONO,
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: ".07em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {large ? <>Accept &amp; choose {pickTarget}</> : <>Accept &amp; receive</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- device chip */

/** One device in the mesh header: status dot + short label. */
function DeviceChip({ label, connected }: { label: string; connected: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 9px",
        border: `1px solid ${connected ? "rgba(var(--acc-rgb),.5)" : HAIRLINE}`,
        background: connected ? "rgba(var(--acc-rgb),.08)" : "transparent",
        fontFamily: MONO,
        fontSize: "11px",
        color: connected ? "#efe9da" : "#6f6a5d",
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          flexShrink: 0,
          borderRadius: "50%",
          background: connected ? "var(--acc)" : "#6f6a5d",
          animation: connected ? "warpBlink 1.6s steps(1) infinite" : undefined,
        }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
        {!connected && <span style={{ color: "#6f6a5d" }}> · linking</span>}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------- session view */

/**
 * The persistent session surface: header (connected peer) + composer + tray.
 * The accept modal is rendered by the parent (so it can overlay the whole page),
 * not here.
 */
export function SessionView({
  peerLabel,
  items,
  onSendFiles,
  onSendText,
  onCancel,
  onDownloadOne,
  onDownloadAll,
  isMobile,
  heading = "Session open",
  pending,
  onAddFiles,
  onRemovePending,
  onSendPending,
  connections,
}: {
  peerLabel: string;
  items: TransferItem[];
  onSendFiles: (files: File[]) => void;
  onSendText: (text: string) => void;
  onCancel: (id: string) => void;
  onDownloadOne: (id: string) => void;
  onDownloadAll: () => void;
  isMobile: boolean;
  heading?: string;
  /** Files staged but not yet offered. Editable until onSendPending fires. */
  pending?: PendingFile[];
  /** Add picked/dropped files to the pending queue. */
  onAddFiles?: (files: File[]) => void;
  /** Remove one staged file from the pending queue. */
  onRemovePending?: (id: string) => void;
  /** Offer every staged file now (receiver then sees the accept modal). */
  onSendPending?: () => void;
  /**
   * Devices in the room (mesh). When provided with >1 device, the header shows
   * a device list, sends say "to N devices", and tray rows are tagged with the
   * to/from device. Omitted (or a single device) keeps the clean 1-to-1 header.
   */
  connections?: Connection[];
}) {
  const liveConnections = connections ?? [];
  const connectedCount = liveConnections.filter((c) => c.connected).length;
  // Mesh chrome (device list + per-row tags + fan-out copy) only when there are
  // genuinely several devices. One device looks exactly like the old 1-to-1 UI.
  const multiDevice = liveConnections.length > 1;
  // Map peerId -> label, so tray rows can name their to/from device.
  const labelForPeer = multiDevice
    ? (peerId?: string): string | undefined =>
        peerId ? liveConnections.find((c) => c.peerId === peerId)?.label ?? peerId.slice(0, 8) : undefined
    : undefined;

  return (
    <div style={{ animation: "warpFade .5s ease both", display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* connected header */}
      <div
        style={{
          display: "flex",
          alignItems: multiDevice ? "flex-start" : "center",
          gap: "11px",
          padding: isMobile ? "13px 14px" : "14px 16px",
          border: `1px solid ${HAIRLINE}`,
          background: "rgba(var(--acc-rgb),.05)",
        }}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            flexShrink: 0,
            marginTop: multiDevice ? "4px" : 0,
            background: "var(--acc)",
            animation: "warpBlink 1.6s steps(1) infinite",
          }}
        />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: "block",
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "#6f6a5d",
            }}
          >
            {multiDevice
              ? `${connectedCount} of ${liveConnections.length} devices connected · direct P2P`
              : `${heading} · direct P2P`}
          </span>

          {multiDevice ? (
            <span
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                marginTop: "8px",
              }}
            >
              {liveConnections.map((c) => (
                <DeviceChip key={c.peerId} label={c.label} connected={c.connected} />
              ))}
            </span>
          ) : (
            <span
              style={{
                display: "block",
                fontFamily: MONO,
                fontSize: "13px",
                color: "#efe9da",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginTop: "2px",
              }}
            >
              {peerLabel}
            </span>
          )}
        </span>
      </div>

      <Composer
        onSendFiles={onSendFiles}
        onSendText={onSendText}
        isMobile={isMobile}
        pending={pending}
        onAddFiles={onAddFiles}
        onRemovePending={onRemovePending}
        onSendPending={onSendPending}
        deviceCount={multiDevice ? connectedCount : 1}
      />

      <Tray
        items={items}
        onCancel={onCancel}
        onDownload={onDownloadOne}
        onDownloadAll={onDownloadAll}
        isMobile={isMobile}
        labelForPeer={labelForPeer}
      />

      <div
        style={{
          fontFamily: MONO,
          fontSize: "11px",
          letterSpacing: ".05em",
          color: "#6f6a5d",
          textAlign: "center",
        }}
      >
        Channel stays open — send again or send back any time · do not close this tab
      </div>
    </div>
  );
}
