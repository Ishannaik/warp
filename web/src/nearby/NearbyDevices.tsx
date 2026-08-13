import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { navigate } from "../router";
import { useIsMobile } from "../lib/useIsMobile";
import { useTransferTitle } from "../lib/useTransferTitle";
import { AcceptModal, SessionView } from "../transfer/SessionView";
import { useNearbyTransfer, type NearbyDevice } from "./useNearbyTransfer";
import type { DeviceType } from "../lib/warp/useNearby";

/**
 * "On your network" — LAN auto-discovery surface for the landing page.
 *
 * Lists other Warp devices on the same Wi-Fi (no code needed). Tap a device to
 * pick files and offer them across. Review-before-receive redesign: an inbound
 * FILE offer raises the SAME accept modal as the code-room flow (with the file
 * manifest, thumbnails, sizes), and on accept the files land in an in-app TRAY
 * to download on demand — nothing auto-saves. The channel stays OPEN, so the
 * session panel doubles as a composer to send again or send back.
 *
 * Discovery + transfer live in `useNearbyTransfer`. This component is pure
 * presentation + a hidden file input.
 */

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "'Bricolage Grotesque',sans-serif";
const HAIRLINE = "rgba(239,233,218,.13)";

export default function NearbyDevices() {
  const isMobile = useIsMobile();
  const nearby = useNearbyTransfer();
  const { devices, crowded, deviceName, sessions, incoming, rename } = nearby;

  // #15: live progress in the tab title while a nearby transfer is in flight.
  useTransferTitle(
    sessions.flatMap((session) => session.items),
  );

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(deviceName);

  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const isSavingRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      setDraftName(deviceName);
    }
  }, [deviceName, isEditing]);

  const handleStartEdit = () => {
    setDraftName(deviceName);
    isSavingRef.current = false;
    setIsEditing(true);
  };

  const handleSave = () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    rename(draftName);
    setIsEditing(false);
  };

  const handleCancel = () => {
    isSavingRef.current = true;
    setDraftName(deviceName);
    setIsEditing(false);
  };

  const sendToDevice = (peerId: string, list: FileList | File[] | null) => {
    if (!list || !("length" in list) || !list.length) return;
    nearby.sendTo(peerId, Array.from(list));
  };
  const togglePeer = (peerId: string) => {
    setSelectedPeers((prev) =>
      prev.includes(peerId)
        ? prev.filter((id) => id !== peerId)
        : [...prev, peerId],
    );
  };

  const handleMultiSelectFiles = (list: FileList | null) => {
    if (!list || !list.length || !selectedPeers.length) return;

    setSelectedFiles(Array.from(list));
  };

  const sendToSelected = () => {
    if (!selectedPeers.length || !selectedFiles.length) return;

    nearby.sendTo(selectedPeers, selectedFiles);

    setSelectedFiles([]);
    setSelectedPeers([]);
  };

  return (
    <section
      id="nearby"
      style={{
        position: "relative",
        zIndex: 5,
        borderBottom: `1px solid ${HAIRLINE}`,
        padding: isMobile ? "30px 16px 34px" : "44px 26px 48px",
        fontFamily: "'Archivo',system-ui,sans-serif",
        color: "#efe9da",
      }}
    >
      <style>{`
        .nearby-card:hover{border-color:var(--acc) !important;background:rgba(var(--acc-rgb),.06) !important}
        .nearby-card:hover .nearby-go{color:var(--acc) !important;transform:translateX(2px)}
        .nearby-link:hover{color:#efe9da !important}
        .nearby-cta:hover{filter:brightness(1.08)}
        .nearby-ghost:hover{border-color:rgba(239,233,218,.45) !important;color:#efe9da !important}
        .nearby-edit-btn:hover{color:var(--acc) !important}
        .warp-ghost:hover{background:rgba(var(--acc-rgb),.16) !important;border-color:var(--acc) !important}
        .warp-share:hover{border-color:var(--acc) !important;color:#efe9da !important}
        .warp-cta:hover{filter:brightness(1.08)}
        .warp-rowbtn:hover{border-color:var(--amb) !important;color:var(--amb) !important}
      `}</style>

      <div style={{ maxWidth: "1080px", margin: "0 auto" }}>
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            flexDirection: isMobile ? "column" : "row",
            gap: isMobile ? "10px" : undefined,
            marginBottom: isMobile ? "18px" : "22px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                background: "var(--acc)",
                animation: "warpBlink 1.6s steps(1) infinite",
              }}
            />
            <span
              style={{
                fontFamily: MONO,
                fontSize: "11.5px",
                letterSpacing: ".2em",
                textTransform: "uppercase",
                color: "#6f6a5d",
              }}
            >
              On your network
            </span>
          </div>
          {isEditing ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: MONO,
                fontSize: "11px",
                letterSpacing: ".06em",
                color: "#6f6a5d",
              }}
            >
              <span>You appear as</span>
              <input
                ref={(el) => el?.focus()}
                type="text"
                value={draftName}
                maxLength={40}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancel();
                  }
                }}
                style={{
                  fontFamily: MONO,
                  fontSize: "11px",
                  color: "#efe9da",
                  background: "rgba(239,233,218,.06)",
                  border: "1px solid var(--acc)",
                  padding: "2px 6px",
                  width: "140px",
                }}
              />
            </div>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: MONO,
                fontSize: "11px",
                letterSpacing: ".06em",
                color: "#6f6a5d",
              }}
            >
              <span>You appear as</span>
              <span style={{ color: "#a8a293" }}>{deviceName}</span>
              <button
                type="button"
                className="nearby-edit-btn"
                onClick={handleStartEdit}
                title="Rename device"
                aria-label="Rename device"
                style={{
                  background: "none",
                  border: "none",
                  padding: "0 2px",
                  cursor: "pointer",
                  color: "#6f6a5d",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color .15s ease",
                  font: "inherit",
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            </span>
          )}
        </div>

        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: isMobile ? "clamp(26px,7vw,34px)" : "clamp(30px,3.4vw,44px)",
            lineHeight: 1,
            letterSpacing: "-.03em",
            margin: "0 0 8px",
          }}
        >
          Devices nearby.
        </h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMultiSelect((prev) => !prev);
              setSelectedPeers([]);
              setSelectedFiles([]);
            }}
            style={{
              padding: "9px 13px",
              border: `1px solid ${
                multiSelect ? "var(--acc)" : "rgba(239,233,218,.22)"
              }`,
              background: multiSelect
                ? "rgba(var(--acc-rgb),.10)"
                : "transparent",
              color: multiSelect ? "var(--acc)" : "#a8a293",
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {multiSelect ? "✓ Multi-select on" : "Select multiple"}
          </button>

          {multiSelect && selectedFiles.length > 0 && selectedPeers.length > 0 && (
            <>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "11px",
                  color: "#6f6a5d",
                }}
              >
                {selectedPeers.length} device
                {selectedPeers.length !== 1 ? "s" : ""} selected
              </span>

              <label
                style={{
                  padding: "9px 13px",
                  border: "1px solid var(--acc)",
                  color: "#efe9da",
                  fontFamily: MONO,
                  fontSize: "11px",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                + Pick files
                <input
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    handleMultiSelectFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          )}
        </div>

        {multiSelect && selectedFiles.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: isMobile ? "stretch" : "center",
              flexDirection: isMobile ? "column" : "row",
              gap: "10px",
              marginBottom: "18px",
              padding: "12px 14px",
              border: "1px solid rgba(var(--acc-rgb),.25)",
              background: "rgba(var(--acc-rgb),.05)",
            }}
          >
            <span
              style={{
                flex: 1,
                fontFamily: MONO,
                fontSize: "11px",
                color: "#a8a293",
              }}
            >
              {selectedFiles.length} file
              {selectedFiles.length !== 1 ? "s" : ""} ready ·{" "}
              {selectedPeers.length} recipient
              {selectedPeers.length !== 1 ? "s" : ""}
            </span>

            <button
              type="button"
              onClick={sendToSelected}
              style={{
                padding: "11px 16px",
                border: "1px solid var(--acc)",
                background: "var(--acc)",
                color: "#121110",
                fontFamily: MONO,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Send to {selectedPeers.length} device
              {selectedPeers.length !== 1 ? "s" : ""}
            </button>
          </div>
        )}
        <p
          style={{
            fontSize: isMobile ? "14.5px" : "15.5px",
            lineHeight: 1.5,
            color: "#a8a293",
            margin: "0 0 24px",
            maxWidth: "560px",
          }}
        >
          Same Wi-Fi, no code. Tap a device to offer files straight across — they review and accept
          before anything moves, and the bytes go peer-to-peer, never touching a server.
        </p>

        {crowded ? (
          <CrowdedNote isMobile={isMobile} />
        ) : devices.length === 0 ? (
          <EmptyState isMobile={isMobile} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(240px,1fr))",
              gap: isMobile ? "10px" : "14px",
            }}
          >
            {devices.map((d) => (
              <DeviceCard
                key={d.peerId}
                device={d}
                multiSelect={multiSelect}
                selected={selectedPeers.includes(d.peerId)}
                onSelect={() => togglePeer(d.peerId)}
                onPickFiles={(list) => sendToDevice(d.peerId, list)}
              />
            ))}
          </div>
        )}
      </div>

      {sessions.length > 0 && (
        <SessionModal
          onClose={() => nearby.dismissSession(sessions[0].peerId)}
        >
          {sessions[0].errorMessage ? (
            <SessionError
              message={sessions[0].errorMessage}
              onClose={() => nearby.dismissSession(sessions[0].peerId)}
              isMobile={isMobile}
            />
          ) : (
            <SessionView
              peerLabel={sessions[0].peerName}
              items={sessions[0].items}
              onSendFiles={(files) =>
                nearby.sendTo(sessions[0].peerId, files)
              }
              onSendText={(text) =>
                nearby.sendText(sessions[0].peerId, text)
              }
              onCancel={(id) =>
                nearby.cancel(sessions[0].peerId, id)
              }
              onPause={() => {}}
              onResume={() => {}}
              onDownloadOne={(id) =>
                nearby.downloadOne(sessions[0].peerId, id)
              }
              onDownloadAll={() =>
                nearby.downloadAll(sessions[0].peerId)
              }
              isMobile={isMobile}
            />
          )}
        </SessionModal>
      )}
      {/* incoming FILE offer — MUST BE AFTER SessionModal */}
      {incoming.map((request) => (
        <AcceptModal
          key={`${request.peerId}:${request.batchId}`}
          items={request.items}
          peerName={request.peerName}
          onAccept={() => nearby.acceptIncoming(request.peerId)}
          onDecline={() => nearby.declineIncoming(request.peerId)}
          isMobile={isMobile}
        />
      ))}
    </section>
  );
}

/* ----------------------------------------------------------------- device icon */

/**
 * Phone / tablet / desktop glyph, guessed client-side from the announcing
 * device's UA (see `useNearby.ts`). Unrecognized types already normalize to
 * "desktop" upstream, so this always has a shape to draw.
 */
function DeviceTypeIcon({ type }: { type: DeviceType }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--acc)",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (type === "mobile") {
    return (
      <svg {...common}>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <line x1="11" y1="18" x2="13" y2="18" />
      </svg>
    );
  }

  if (type === "tablet") {
    return (
      <svg {...common}>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <line x1="11" y1="17.5" x2="13" y2="17.5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  );
}

/* ----------------------------------------------------------------- device card */

function DeviceCard({
  device,
  multiSelect,
  selected,
  onSelect,
  onPickFiles,
}: {
  device: NearbyDevice;
  multiSelect: boolean;
  selected: boolean;
  onSelect: () => void;
  onPickFiles: (list: FileList | null) => void;
}) {
  return (
    <label
      onClick={(e) => {
        if (multiSelect) {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={multiSelect ? 0 : undefined}
      role={multiSelect ? "checkbox" : undefined}
      aria-checked={multiSelect ? selected : undefined}
      onKeyDown={(e) => {
        if (multiSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className="nearby-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "13px",
        width: "100%",
        textAlign: "left",
        padding: "16px 17px",
        border: `1px solid ${HAIRLINE}`,
        background: "rgba(239,233,218,.02)",
        color: "#efe9da",
        cursor: "pointer",
        transition: "border-color .15s ease, background .15s ease",
        font: "inherit",
      }}
    >
      {!multiSelect && (
        <input
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            onPickFiles(e.target.files);
            e.target.value = "";
          }}
        />
      )}

      {multiSelect && (
        <span
          style={{
            flexShrink: 0,
            width: "20px",
            height: "20px",
            border: `1px solid ${
              selected ? "var(--acc)" : "rgba(239,233,218,.3)"
            }`,
            background: selected
              ? "var(--acc)"
              : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#121110",
            fontFamily: MONO,
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          {selected ? "✓" : ""}
        </span>
      )}
      {/* device glyph */}
      <span
        style={{
          position: "relative",
          flexShrink: 0,
          width: "34px",
          height: "34px",
          border: "1px solid var(--acc)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <DeviceTypeIcon type={device.deviceType} />
        <span
          style={{
            position: "absolute",
            top: "-4px",
            right: "-4px",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "var(--acc)",
            boxShadow: "0 0 0 2px #121110",
            animation: "warpBlink 1.8s steps(1) infinite",
          }}
        />
      </span>

      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: "block",
            fontFamily: MONO,
            fontSize: "14px",
            fontWeight: 500,
            color: "#efe9da",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {device.name}
        </span>
        <span
          style={{
            display: "block",
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "#6f6a5d",
            marginTop: "3px",
          }}
        >
          {multiSelect
            ? selected
              ? "Selected"
              : "Tap to select"
            : "Tap to send"}
        </span>
      </span>

      <span
        className="nearby-go"
        style={{
          fontFamily: MONO,
          fontSize: "15px",
          color: "#6f6a5d",
          transition: "color .15s ease, transform .15s ease",
        }}
      >
        →
      </span>
    </label>
  );
}

/* ----------------------------------------------------------------- empty / crowded */

function EmptyState({ isMobile }: { isMobile: boolean }) {
  return (
    <div
      style={{
        border: `1px dashed rgba(239,233,218,.18)`,
        background: "rgba(239,233,218,.02)",
        padding: isMobile ? "26px 18px" : "34px 26px",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "16px" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: "9px",
              height: "9px",
              borderRadius: "50%",
              border: "1px solid rgba(239,233,218,.3)",
              animation: "warpBlink 1.8s steps(1) infinite",
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "17px", marginBottom: "6px" }}>
        No other devices yet
      </div>
      <div style={{ fontFamily: MONO, fontSize: "12px", color: "#6f6a5d", lineHeight: 1.6 }}>
        Open Warp on another device on the same Wi-Fi.
      </div>
    </div>
  );
}

function CrowdedNote({ isMobile }: { isMobile: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: isMobile ? "14px" : "18px",
        border: `1px solid ${HAIRLINE}`,
        background: "rgba(239,233,218,.02)",
        padding: isMobile ? "18px" : "20px 22px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "13px", minWidth: 0 }}>
        <span
          style={{
            flexShrink: 0,
            width: "30px",
            height: "30px",
            border: "1px solid var(--amb)",
            background: "rgba(var(--amb-rgb),.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: MONO,
            color: "var(--amb)",
            fontSize: "16px",
          }}
        >
          !
        </span>
        <span style={{ fontFamily: MONO, fontSize: "12px", lineHeight: 1.55, color: "#a8a293" }}>
          Too many devices on this network to auto-list — use a code instead.
        </span>
      </div>
      <a
        href="/receive"
        className="nearby-ghost"
        onClick={(e) => {
          e.preventDefault();
          navigate("/receive");
        }}
        style={{
          flexShrink: 0,
          display: "inline-block",
          padding: "11px 18px",
          border: "1px solid rgba(239,233,218,.25)",
          fontFamily: MONO,
          fontSize: "11.5px",
          letterSpacing: ".07em",
          textTransform: "uppercase",
          color: "#a8a293",
          textDecoration: "none",
          transition: "border-color .15s ease, color .15s ease",
          textAlign: "center",
        }}
      >
        Use a code →
      </a>
    </div>
  );
}

/* ----------------------------------------------------------------- session error */

function SessionError({
  message,
  onClose,
  isMobile,
}: {
  message: string;
  onClose: () => void;
  isMobile: boolean;
}) {
  return (
    <div style={{ padding: isMobile ? "26px 20px" : "32px 28px", textAlign: "center" }}>
      <div
        style={{
          width: "56px",
          height: "56px",
          margin: "0 auto 18px",
          border: "1px solid var(--amb)",
          background: "rgba(var(--amb-rgb),.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MONO,
          fontSize: "26px",
          color: "var(--amb)",
        }}
      >
        !
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: "11px",
          letterSpacing: ".2em",
          textTransform: "uppercase",
          color: "var(--amb)",
          marginBottom: "10px",
        }}
      >
        Channel failed
      </div>
      <p style={{ fontSize: "14px", color: "#a8a293", margin: "0 0 22px", lineHeight: 1.55 }}>
        {message} Warp is STUN-only — some networks can't be bridged directly.
      </p>
      <button
        type="button"
        className="nearby-ghost"
        onClick={onClose}
        style={{
          padding: "13px 26px",
          background: "transparent",
          border: "1px solid rgba(239,233,218,.22)",
          color: "#a8a293",
          fontFamily: MONO,
          fontSize: "12.5px",
          fontWeight: 500,
          letterSpacing: ".07em",
          textTransform: "uppercase",
          cursor: "pointer",
          transition: "border-color .15s ease, color .15s ease",
        }}
      >
        Close
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- modal shell */

function SessionModal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  // Lock background scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const card: CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: "560px",
    maxHeight: "90vh",
    overflow: "auto",
    background: "#121110",
    border: "1px solid rgba(239,233,218,.18)",
    boxShadow: "0 40px 120px -30px rgba(0,0,0,.85)",
    animation: "warpRise .35s cubic-bezier(.2,.8,.2,1) both",
    padding: "18px",
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
      <div style={card}>
        <button
          type="button"
          className="nearby-link"
          onClick={onClose}
          aria-label="Close session"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            zIndex: 1,
            width: "30px",
            height: "30px",
            background: "rgba(18,17,16,.8)",
            border: `1px solid ${HAIRLINE}`,
            fontFamily: MONO,
            fontSize: "14px",
            color: "#6f6a5d",
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
