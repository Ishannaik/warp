import { useEffect } from "react";
import type { CSSProperties } from "react";
import { navigate } from "../router";
import { useIsMobile } from "../lib/useIsMobile";
import { AcceptModal, SessionView } from "../transfer/SessionView";
import { useNearbyTransfer, type NearbyDevice } from "./useNearbyTransfer";

/**
 * "On your network" — LAN auto-discovery surface for the landing page.
 *
 * Lists other Wrap devices on the same Wi-Fi (no code needed). Tap a device to
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
  const { devices, crowded, deviceName, session, incoming } = nearby;

  const sendToDevice = (peerId: string, list: FileList | File[] | null) => {
    if (!list || !("length" in list) || !list.length) return;
    nearby.sendTo(peerId, Array.from(list));
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
        .wrap-ghost:hover{background:rgba(var(--acc-rgb),.16) !important;border-color:var(--acc) !important}
        .wrap-share:hover{border-color:var(--acc) !important;color:#efe9da !important}
        .wrap-cta:hover{filter:brightness(1.08)}
        .wrap-rowbtn:hover{border-color:var(--amb) !important;color:var(--amb) !important}
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
                animation: "wrapBlink 1.6s steps(1) infinite",
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
          <span
            style={{
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: ".06em",
              color: "#6f6a5d",
            }}
          >
            You appear as <span style={{ color: "#a8a293" }}>{deviceName}</span>
          </span>
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
                onPickFiles={(list) => sendToDevice(d.peerId, list)}
              />
            ))}
          </div>
        )}
      </div>

      {/* incoming FILE offer -> shared accept modal (manifest + thumbnails) */}
      {incoming && (
        <AcceptModal
          items={incoming.items}
          peerName={incoming.peerName}
          onAccept={nearby.acceptIncoming}
          onDecline={nearby.declineIncoming}
          isMobile={isMobile}
        />
      )}

      {/* live session (send + receive, stays open) */}
      {session && (
        <SessionModal onClose={nearby.dismissSession}>
          {session.errorMessage ? (
            <SessionError message={session.errorMessage} onClose={nearby.dismissSession} isMobile={isMobile} />
          ) : (
            <SessionView
              peerLabel={session.peerName}
              items={session.items}
              onSendFiles={(files) => nearby.sendTo(session.peerId, files)}
              onSendText={nearby.sendText}
              onCancel={nearby.cancel}
              onDownloadOne={nearby.downloadOne}
              onDownloadAll={nearby.downloadAll}
              isMobile={isMobile}
              heading={session.connected ? "Connected" : "Opening channel"}
            />
          )}
        </SessionModal>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- device card */

function DeviceCard({
  device,
  onPickFiles,
}: {
  device: NearbyDevice;
  onPickFiles: (list: FileList | null) => void;
}) {
  return (
    <label
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
      <input
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          onPickFiles(e.target.files);
          e.target.value = "";
        }}
      />
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
        <span style={{ width: "10px", height: "10px", background: "var(--acc)" }} />
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
            animation: "wrapBlink 1.8s steps(1) infinite",
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
          Tap to send
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
              animation: "wrapBlink 1.8s steps(1) infinite",
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "17px", marginBottom: "6px" }}>
        No other devices yet
      </div>
      <div style={{ fontFamily: MONO, fontSize: "12px", color: "#6f6a5d", lineHeight: 1.6 }}>
        Open Wrap on another device on the same Wi-Fi.
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
        {message} Wrap is STUN-only — some networks can't be bridged directly.
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
    animation: "wrapRise .35s cubic-bezier(.2,.8,.2,1) both",
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
        animation: "wrapFade .18s ease both",
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
