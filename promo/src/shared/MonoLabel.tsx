import type { CSSProperties, ReactNode } from "react";
import { MONO } from "./theme";

// JetBrains Mono, uppercase, tracked-out label — the UI-chrome text style
// used for every status line / column header / tag across the site.
export default function MonoLabel({
  children,
  size = 22,
  tracking = ".14em",
  color = "#6f6a5d",
  style,
}: {
  children: ReactNode;
  size?: number;
  tracking?: string;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: size,
        letterSpacing: tracking,
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
