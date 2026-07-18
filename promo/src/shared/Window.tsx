import type { CSSProperties, ReactNode } from "react";
import { HAIRLINE, INK, MONO, MUTED, PANEL, ACC } from "./theme";

// The Warp transfer-window chrome (TransferWindow.tsx): title bar with the
// accent square + "WARP — TRANSFER QUEUE" label, hairline border, square
// corners. `right` renders the small mono status on the title bar's right.
export default function Window({
  width = 800,
  children,
  right,
  style,
}: {
  width?: number;
  children: ReactNode;
  right?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        border: `1px solid rgba(239,233,218,.22)`,
        background: PANEL,
        boxShadow: "0 40px 90px -30px rgba(0,0,0,.8)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: `1px solid ${HAIRLINE}`,
          background: "rgba(239,233,218,.025)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontFamily: MONO,
            fontSize: 18,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "#b6b0a0",
          }}
        >
          <span style={{ width: 13, height: 13, background: ACC }} />
          WARP — TRANSFER QUEUE
        </div>
        {right && (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 16,
              letterSpacing: ".1em",
              color: MUTED,
              textTransform: "uppercase",
            }}
          >
            {right}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export const windowInk = INK;
