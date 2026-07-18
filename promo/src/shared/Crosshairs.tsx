import type { CSSProperties } from "react";
import { INK } from "./theme";

// The landing page's 13px corner "+" marks (Hero.tsx), at 0.45 opacity.
// `opacity` prop lets scenes fade them in over the opening frames.
export default function Crosshairs({ opacity = 0.45 }: { opacity?: number }) {
  const mark: CSSProperties = {
    position: "absolute",
    width: "26px",
    height: "26px",
    zIndex: 6,
    opacity,
  };
  const positions: CSSProperties[] = [
    { top: "36px", left: "36px" },
    { top: "36px", right: "36px" },
    { bottom: "36px", left: "36px" },
    { bottom: "36px", right: "36px" },
  ];
  return (
    <>
      {positions.map((pos, i) => (
        <div key={i} style={{ ...mark, ...pos }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "12px",
              width: "26px",
              height: "2px",
              background: INK,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "12px",
              top: 0,
              width: "2px",
              height: "26px",
              background: INK,
            }}
          />
        </div>
      ))}
    </>
  );
}
