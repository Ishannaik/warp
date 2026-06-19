import { useEffect, useRef, useState } from "react";

/**
 * Stats — the "03 / speed" stats band.
 * Four cells: 0 servers, ∞ max file size, 256-bit encryption, 2.4 GB/s peak.
 * Numeric cells count up on scroll-into-view; ∞ renders literally.
 */

const COUNT_DURATION = 1500; // ms
const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);

/** Count up from 0 to `target` once `start` flips true. */
function useCountUp(target: number, decimals: number, start: boolean) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const k = Math.min((now - t0) / COUNT_DURATION, 1);
      setValue(target * easeOutCubic(k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start]);

  return value.toFixed(decimals);
}

/** Fires once when the element scrolls into view (~40% visible). */
function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, inView };
}

const cell: React.CSSProperties = { background: "#121110", padding: "40px 28px" };
const num: React.CSSProperties = {
  fontFamily: "'Bricolage Grotesque',sans-serif",
  fontWeight: 800,
  fontSize: "clamp(48px,6vw,84px)",
  lineHeight: 0.9,
  letterSpacing: "-.04em",
};
const label: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: 11,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "#6f6a5d",
  marginTop: 14,
};

export default function Stats() {
  const { ref, inView } = useInView<HTMLDivElement>();

  const servers = useCountUp(0, 0, inView); // 0 — stays 0
  const bits = useCountUp(256, 0, inView); // 256
  const peak = useCountUp(2.4, 1, inView); // 2.4 GB/s

  return (
    <section
      id="speed"
      style={{
        position: "relative",
        zIndex: 4,
        borderTop: "1px solid rgba(239,233,218,.13)",
        padding: "90px 26px",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div
          ref={ref}
          id="wrap-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 1,
            background: "rgba(239,233,218,.14)",
            border: "1px solid rgba(239,233,218,.14)",
          }}
        >
          <div style={cell}>
            <div style={{ ...num, color: "#efe9da" }}>{servers}</div>
            <div style={label}>Servers in the middle</div>
          </div>

          <div style={cell}>
            <div style={{ ...num, color: "var(--acc)" }}>&#8734;</div>
            <div style={label}>Max file size</div>
          </div>

          <div style={cell}>
            <div style={{ ...num, color: "#efe9da" }}>{bits}</div>
            <div style={label}>Bit encryption</div>
          </div>

          <div style={cell}>
            <div style={{ ...num, color: "#efe9da" }}>
              {peak}
              <span style={{ fontSize: ".4em", color: "#6f6a5d", letterSpacing: 0 }}>
                {" "}
                GB/s
              </span>
            </div>
            <div style={label}>Peak throughput</div>
          </div>
        </div>
      </div>
    </section>
  );
}
