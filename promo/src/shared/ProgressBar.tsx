import { useCurrentFrame } from "remotion";
import { ACC, AMB } from "./theme";

export type BarVariant = "active" | "done" | "stalled";

// 12px-tall progress bar, track rgba(239,233,218,.09), amber while active ->
// accent when done, plus the moving 60px white-gradient "scan" highlight
// that sweeps the fill every ~2s (matches TransferWindow's warpScan).
export default function ProgressBar({
  pct,
  variant = "active",
  height = 12,
}: {
  pct: number;
  variant?: BarVariant;
  height?: number;
}) {
  const frame = useCurrentFrame();
  const fill = variant === "done" ? ACC : variant === "stalled" ? AMB : AMB;
  const opacity = variant === "stalled" ? 0.4 : 1;
  // 2.2s scan loop at 30fps == 66 frames, translated across a padded range
  // so it fully clears the fill edge-to-edge.
  const scanCycle = 66;
  const scanT = (frame % scanCycle) / scanCycle;
  const scanX = interpolateLinear(scanT, -60, 100);

  return (
    <div
      style={{
        position: "relative",
        height,
        background: "rgba(239,233,218,.09)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${pct}%`,
          background: fill,
          opacity,
          overflow: "hidden",
        }}
      >
        {variant !== "stalled" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: 60,
              left: `${scanX}%`,
              background:
                "linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent)",
            }}
          />
        )}
      </div>
    </div>
  );
}

function interpolateLinear(t: number, from: number, to: number) {
  return from + (to - from) * t;
}
