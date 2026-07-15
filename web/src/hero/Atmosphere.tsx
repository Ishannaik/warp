import type { CSSProperties } from "react";

/**
 * Hero background atmosphere layer: an aceternity-style lamp glow plus a set of
 * magic-ui meteor streaks. Ported verbatim from the Wrap design source
 * (`#warp-atmo`). Pointer-events disabled; sits behind the hero content.
 *
 * The shipped default variant has atmosphere ON, so this is always rendered.
 */

const layer: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "100vh",
  overflow: "hidden",
  zIndex: 1,
};

const lamp: CSSProperties = {
  position: "absolute",
  top: "-130px",
  left: "13%",
  width: "540px",
  height: "360px",
  background:
    "radial-gradient(closest-side,rgba(var(--acc-rgb),.5),transparent 72%)",
  filter: "blur(44px)",
  animation: "warpLamp 5s ease-in-out infinite",
};

interface Meteor {
  top: string;
  left: string;
  height: string;
  grad: string;
  dur: string;
  delay?: string;
}

const meteors: Meteor[] = [
  {
    top: "6%",
    left: "28%",
    height: "60px",
    grad: "linear-gradient(to bottom,transparent,rgba(239,233,218,.55))",
    dur: "4.4s",
  },
  {
    top: "3%",
    left: "40%",
    height: "58px",
    grad: "linear-gradient(to bottom,transparent,rgba(239,233,218,.5))",
    dur: "5.2s",
    delay: "1.1s",
  },
  {
    top: "12%",
    left: "18%",
    height: "64px",
    grad: "linear-gradient(to bottom,transparent,rgba(var(--amb-rgb),.6))",
    dur: "4.8s",
    delay: ".6s",
  },
  {
    top: "8%",
    left: "52%",
    height: "56px",
    grad: "linear-gradient(to bottom,transparent,rgba(239,233,218,.5))",
    dur: "5.6s",
    delay: "2s",
  },
  {
    top: "18%",
    left: "34%",
    height: "62px",
    grad: "linear-gradient(to bottom,transparent,rgba(var(--acc-rgb),.6))",
    dur: "4.2s",
    delay: "1.6s",
  },
  {
    top: "14%",
    left: "46%",
    height: "58px",
    grad: "linear-gradient(to bottom,transparent,rgba(239,233,218,.5))",
    dur: "5s",
    delay: ".9s",
  },
];

export default function Atmosphere() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none"
      id="warp-atmo"
      style={layer}
    >
      <div style={lamp} />
      {meteors.map((m, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: m.top,
            left: m.left,
            width: "1px",
            height: m.height,
            borderRadius: "9999px",
            background: m.grad,
            animation: `warpMeteor ${m.dur} linear infinite${
              m.delay ? ` ${m.delay}` : ""
            }`,
          }}
        />
      ))}
    </div>
  );
}
