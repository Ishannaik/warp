import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * primitives.tsx — shared building blocks for the /how diagrams.
 *
 * Every diagram in src/theory/diagrams reuses these so the deep-dive reads as
 * one consistent visual language: the same node chrome, the same beams, the
 * same labels, the same scroll-trigger. All pieces are CSS/SVG only (no raster
 * images) and lean on the Wrap palette tokens (--acc, --amb, ink/body/muted/
 * dim) plus the theory.css keyframes.
 *
 * Convention: diagrams import what they need from "./primitives" and wrap their
 * root in <DiagramFrame> (or <DiagramCanvas> for free-positioned SVG/abs nodes).
 */

/* --------------------------------------------------------------- tokens -- */

export const MONO = "'JetBrains Mono',monospace";
export const DISPLAY = "'Bricolage Grotesque',sans-serif";
export const BODY = "'Archivo',system-ui,sans-serif";

export const HAIR = "1px solid rgba(239,233,218,.13)";
export const HAIR_STRONG = "1px solid rgba(239,233,218,.16)";

/** Canonical colors. Use ACC for the success/direct path, AMB for cost/failure. */
export const ACC = "var(--acc)";
export const AMB = "var(--amb)";
export const INK = "#efe9da";
export const BODY_COLOR = "#a8a293";
export const MUTED = "#6f6a5d";
export const DIM = "#4a463c";
export const CARD = "#15140f";
export const DARKER = "#0e0d0a";

export type Tone = "acc" | "amb" | "neutral";

/** Resolve a Tone to its line/accent color. */
export function toneColor(tone: Tone = "acc"): string {
  if (tone === "amb") return AMB;
  if (tone === "neutral") return "rgba(239,233,218,.5)";
  return ACC;
}
export function toneRgb(tone: Tone = "acc"): string {
  if (tone === "amb") return "var(--amb-rgb)";
  return "var(--acc-rgb)";
}

/* --------------------------------------------------- InView scroll hook -- */

/**
 * useInView — fires once when `ref` scrolls into view. Returns `inView`.
 *
 * On mount it checks for reduced-motion / no IntersectionObserver support and
 * resolves immediately to `true` so content is never stranded hidden.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   const inView = useInView(ref);
 *   <div ref={ref} className={inView ? "thy-reveal thy-in" : "thy-reveal"} />
 */
export function useInView(
  ref: RefObject<Element | null>,
  options?: { threshold?: number; rootMargin?: string; once?: boolean },
): boolean {
  const { threshold = 0.2, rootMargin = "0px 0px -10% 0px", once = true } =
    options ?? {};
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) obs.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold, rootMargin, once]);

  return inView;
}

/**
 * useReducedMotion — true when the user asked for reduced motion. Diagrams use
 * this to render a static final state instead of starting timers/animations.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/* ----------------------------------------------------------- ScaleToFit -- */

/**
 * ScaleToFit — shrink-to-fit wrapper that measures the diagram's *actual*
 * natural width and scales it down only as much as needed to fit.
 *
 * Some /how diagrams are authored with mono nowrap rows, min-px node grids and
 * absolutely-positioned beams whose intrinsic content is wider than a phone
 * viewport. Reflowing them would break the carefully tuned absolute layout, so
 * instead we keep the layout intact and uniformly scale it DOWN to fit.
 *
 * Mechanism (ResizeObserver-based, deterministic — no measure/resize feedback):
 *  1. The children render in a content box laid out at the container's own
 *     width (`width: 100%`). Whatever the children's intrinsic layout is —
 *     fluid rows that reflow, or fixed min-px rows that cannot shrink — the
 *     box's `scrollWidth` reports the *true* width the content occupies:
 *     equal to the box width when it fits, or larger when min-px content
 *     overflows. This is the diagram's actual natural width at this container
 *     size. Transforms never change `scrollWidth`, and the box width is the
 *     fixed container width (not derived from the scale), so the measurement
 *     can never feed back into the scale → no oscillation.
 *  2. A ResizeObserver measures the container's available width and the
 *     content's `scrollWidth`.
 *  3. scale = min(1, available / scrollWidth). On desktop (and whenever the
 *     content fits) scrollWidth === available, so scale === 1 and the diagram
 *     is pixel-identical to before. When min-px content overflows, scale < 1
 *     and it shrinks to *exactly* fit — so the full diagram is always visible
 *     and nothing is clipped, whatever its real width.
 *  4. Apply `transform: scale(scale)` with `transform-origin: top left`, and
 *     reserve the scaled height on the wrapper so following content never
 *     overlaps and nothing is clipped.
 */
export function ScaleToFit({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      const available = container.clientWidth;
      if (!available) return;
      // The content's real occupied width at this container size. The box is
      // `width: 100%`, so when content fits this equals `available`; when
      // min-px content overflows, scrollWidth reports the true wider extent.
      // Transforms don't affect scrollWidth and the box width is the fixed
      // container width, so this never feeds back into the scale.
      const natural = content.scrollWidth;
      if (!natural) return;
      // Never enlarge: cap at 1 so desktop stays exactly as authored.
      const next = Math.min(1, available / natural);
      setScale(next);
      // Natural (unscaled) height — scrollHeight ignores the transform.
      setContentHeight(content.scrollHeight);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    // Observe the content too: its size changes as phases/animations toggle
    // and as web fonts finish loading, so the reserved space stays correct.
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const scaled = scale < 1;

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        // Reserve only the visible (scaled) height so nothing below overlaps.
        height:
          scaled && contentHeight != null
            ? `${contentHeight * scale}px`
            : undefined,
        ...style,
      }}
    >
      <div
        ref={contentRef}
        style={{
          // Lay out at the container width; scrollWidth then reports the true
          // occupied width (== width when it fits, larger when min-px content
          // overflows). We scale that down, never reflowing the authored layout.
          width: "100%",
          transform: scaled ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- DiagramFrame -- */

export interface DiagramFrameProps {
  /** Mono label shown top-left, e.g. "FIG · DIRECT P2P". Optional. */
  caption?: string;
  /** Tone of the caption dot/accent. Default neutral. */
  tone?: Tone;
  /** Pad the inner content. Default true. */
  pad?: boolean;
  /** Use the darker (#0e0d0a) inset background instead of card. Default true. */
  inset?: boolean;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

/**
 * DiagramFrame — the standard bordered shell every diagram sits in. Hairline
 * border, dark inset background, an optional mono caption strip. Keeps all
 * diagrams visually flush with the Section/Callout chrome on the page.
 */
export function DiagramFrame({
  caption,
  tone = "neutral",
  pad = true,
  inset = true,
  style,
  className,
  children,
}: DiagramFrameProps) {
  const narrow = useNarrowViewport();
  // Slimmer inner padding on phones gives the scaled stage more usable width
  // (so it shrinks less); desktop padding is unchanged.
  const innerPad = pad ? (narrow ? "14px 12px" : "clamp(18px,3vw,30px)") : 0;
  return (
    <div
      className={className}
      style={{
        position: "relative",
        border: HAIR_STRONG,
        background: inset ? DARKER : CARD,
        // clip (not hidden) keeps any rare sub-pixel scale spill from creating
        // a scrollbar, without disabling position:sticky on the page.
        overflow: "hidden",
        maxWidth: "100%",
        ...style,
      }}
    >
      {caption ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 16px",
            borderBottom: HAIR,
            fontFamily: MONO,
            fontSize: "10.5px",
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              background: toneColor(tone),
              borderRadius: "50%",
              flex: "0 0 auto",
            }}
          />
          {caption}
        </div>
      ) : null}
      <div style={{ padding: innerPad }}>
        <ScaleToFit>{children}</ScaleToFit>
      </div>
    </div>
  );
}

/**
 * useNarrowViewport — SSR-safe phone-width check, mirroring useIsMobile (≤767px)
 * but local to the diagram primitives so they have no app-layer import. Used
 * only to trim padding/gaps; layout correctness comes from ScaleToFit.
 */
export function useNarrowViewport(breakpoint = 767): boolean {
  const query = `(max-width: ${breakpoint}px)`;
  const [narrow, setNarrow] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    setNarrow(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}

/**
 * DiagramCanvas — a positioned stage for diagrams that place nodes/beams with
 * absolute coordinates or draw an SVG overlay. Maintains an aspect ratio so the
 * layout is stable across widths. Children are absolutely positioned within.
 */
export function DiagramCanvas({
  ratio = "16 / 9",
  minHeight,
  style,
  children,
}: {
  ratio?: string;
  minHeight?: number | string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: ratio,
        minHeight,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- labels -- */

/** Eyebrow/label text in mono uppercase. */
export function Label({
  children,
  tone = "neutral",
  style,
}: {
  children: ReactNode;
  tone?: Tone | "muted" | "ink";
  style?: CSSProperties;
}) {
  const color =
    tone === "muted"
      ? MUTED
      : tone === "ink"
        ? INK
        : tone === "neutral"
          ? MUTED
          : toneColor(tone);
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: "10px",
        letterSpacing: ".2em",
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** A monospace numeric/figure chip — for prices, sizes, ports, energy values. */
export function Figure({
  children,
  tone = "neutral",
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  style?: CSSProperties;
}) {
  const c = toneColor(tone);
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: "11px",
        letterSpacing: ".04em",
        color: tone === "neutral" ? INK : c,
        background:
          tone === "neutral"
            ? "rgba(239,233,218,.06)"
            : `rgba(${toneRgb(tone)},.12)`,
        border: `1px solid ${
          tone === "neutral" ? "rgba(239,233,218,.14)" : c
        }`,
        padding: "2px 7px",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- Endpoint -- */

export interface EndpointProps {
  /** Mono label above the name, e.g. "PEER A". */
  label?: string;
  /** Display name, e.g. "sender". */
  name?: ReactNode;
  /** Border/accent tone. acc = sender/success, amb = receiver/cost. */
  tone?: Tone;
  /** Optional glyph/icon node rendered above the label (device, cloud, etc). */
  icon?: ReactNode;
  /** Pulse a status dot (e.g. live/connected). */
  active?: boolean;
  /** Render as a dashed, "ephemeral" box (e.g. signaling server). */
  dashed?: boolean;
  /** Fill the available width (mobile stacking). */
  fluid?: boolean;
  minWidth?: number | string;
  style?: CSSProperties;
}

/**
 * Endpoint — a device / actor node (Peer A, Peer B, server, relay, data
 * center…). The fundamental unit of every topology diagram.
 */
export function Endpoint({
  label,
  name,
  tone = "neutral",
  icon,
  active = false,
  dashed = false,
  fluid = false,
  minWidth = 120,
  style,
}: EndpointProps) {
  const c = tone === "neutral" ? "rgba(239,233,218,.16)" : toneColor(tone);
  return (
    <div
      style={{
        border: dashed ? `1px dashed ${c}` : `1px solid ${c}`,
        background: CARD,
        padding: "16px 18px",
        minWidth: fluid ? 0 : minWidth,
        width: fluid ? "100%" : undefined,
        textAlign: "center",
        ...style,
      }}
    >
      {icon ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "8px",
            color: tone === "neutral" ? BODY_COLOR : toneColor(tone),
          }}
        >
          {icon}
        </div>
      ) : null}
      {label ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "7px",
          }}
        >
          {active ? (
            <span
              className="thy-anim"
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: tone === "neutral" ? ACC : toneColor(tone),
                animation: "wrapBlink 1.1s steps(1) infinite",
              }}
            />
          ) : null}
          <Label tone={tone === "neutral" ? "muted" : tone}>{label}</Label>
        </div>
      ) : null}
      {name ? (
        <div
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: "16px",
            marginTop: label ? "6px" : 0,
            color: INK,
          }}
        >
          {name}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Pipe -- */

export interface PipeProps {
  /** Orientation. Default horizontal. */
  vertical?: boolean;
  /** Thickness in px. Default 14 (horizontal) / track width. */
  thickness?: number;
  /** Length (px or CSS). Defaults to fill the cross axis. */
  length?: number | string;
  /** Color tone of the beam. */
  tone?: Tone;
  /**
   * State:
   *  - "idle": faint, no data path yet (dashed, dim)
   *  - "active": solid striped flow animating (the live channel)
   *  - "broken": severed beam (failed hole-punch) — amber, gapped
   */
  state?: "idle" | "active" | "broken";
  /** Animate the stripe flow when active. Default true. */
  animate?: boolean;
  /** Fade the ends with a mask. Default true. */
  fadeEnds?: boolean;
  style?: CSSProperties;
}

/**
 * Pipe — the connection beam between nodes. The single most reused element:
 * the dashed brokered uplink, the live DTLS channel, the failed hole-punch.
 */
export function Pipe({
  vertical = false,
  thickness = 14,
  length,
  tone = "acc",
  state = "active",
  animate = true,
  fadeEnds = true,
  style,
}: PipeProps) {
  const c = toneColor(tone);
  const axis = vertical ? "180deg" : "90deg";

  let background: string;
  if (state === "idle") {
    background = `repeating-linear-gradient(${axis},rgba(239,233,218,.18) 0 4px,transparent 4px 12px)`;
  } else if (state === "broken") {
    background = `repeating-linear-gradient(${axis},${c} 0 6px,transparent 6px 16px)`;
  } else {
    background = `repeating-linear-gradient(${axis},${c} 0 7px,transparent 7px 20px)`;
  }

  const maskAxis = vertical ? "180deg" : "90deg";
  const mask = fadeEnds
    ? `linear-gradient(${maskAxis},transparent,#000 12%,#000 88%,transparent)`
    : undefined;

  return (
    <div
      className={state === "active" && animate ? "thy-anim" : undefined}
      style={{
        width: vertical ? `${thickness}px` : (length ?? "100%"),
        height: vertical ? (length ?? "100%") : `${thickness}px`,
        background,
        backgroundSize: vertical ? "100% 32px" : "32px 100%",
        animation:
          state === "active" && animate
            ? "thyFlow .9s linear infinite"
            : undefined,
        opacity: state === "broken" ? 0.6 : 1,
        WebkitMaskImage: mask,
        maskImage: mask,
        ...style,
      }}
    />
  );
}

/* -------------------------------------------------------------- FileToken -- */

export interface FileTokenProps {
  /** Tone of the token. */
  tone?: Tone;
  /** Show as encrypted/ciphertext (scrambled fill + shimmer). */
  encrypted?: boolean;
  /** Size in px. Default 22. */
  size?: number;
  /** Optional label inside/under (e.g. "16 KB"). */
  label?: ReactNode;
  style?: CSSProperties;
}

/**
 * FileToken — a unit of payload in motion: a chunk, a whole file, a note card's
 * cargo. Diagrams animate it along a Pipe (commonly via thyTravelX or a CSS
 * transition on `left`). `encrypted` renders it as a scrambled/ciphertext cell.
 */
export function FileToken({
  tone = "acc",
  encrypted = false,
  size = 22,
  label,
  style,
}: FileTokenProps) {
  const c = toneColor(tone);
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size * 1.3,
        border: `1px solid ${c}`,
        background: encrypted
          ? `rgba(${toneRgb(tone)},.14)`
          : `rgba(${toneRgb(tone)},.28)`,
        overflow: "hidden",
        fontFamily: MONO,
        fontSize: "8px",
        color: INK,
        ...style,
      }}
    >
      {encrypted ? (
        <span
          className="thy-anim"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg,transparent,rgba(239,233,218,.5),transparent)",
            animation: "thyShimmer 1.6s ease-in-out infinite",
          }}
        />
      ) : null}
      {label}
    </span>
  );
}

/* ----------------------------------------------------------------- Card --- */

export interface CardProps {
  /** Mono kicker label at the top. */
  kicker?: ReactNode;
  /** Tone for the kicker/left accent. */
  tone?: Tone;
  /** Add a left accent bar (editorial pull-out style). */
  accentBar?: boolean;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

/**
 * Card — a labeled inner panel used inside diagrams (e.g. an SDP note card, a
 * cost breakdown, a law plate). Card-colored fill, optional kicker + accent bar.
 */
export function Card({
  kicker,
  tone = "neutral",
  accentBar = false,
  style,
  className,
  children,
}: CardProps) {
  const c = toneColor(tone);
  return (
    <div
      className={className}
      style={{
        background: CARD,
        border: HAIR_STRONG,
        borderLeft: accentBar ? `2px solid ${c}` : HAIR_STRONG,
        padding: "16px 18px",
        ...style,
      }}
    >
      {kicker ? (
        <div style={{ marginBottom: "10px" }}>
          <Label tone={tone === "neutral" ? "muted" : tone}>{kicker}</Label>
        </div>
      ) : null}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- DepthGauge -- */

export interface DepthLayer {
  /** Layer id, e.g. "L0". */
  id: string;
  /** Short name, e.g. "SURFACE", "THE RELAY", "BEDROCK". */
  name: string;
}

export interface DepthGaugeProps {
  /** Ordered layers, top (surface) to bottom (bedrock). */
  layers: DepthLayer[];
  /** Index of the currently-active layer (highlighted). -1 for none. */
  activeIndex: number;
  /** Click a layer marker (optional scroll-to). */
  onSelect?: (index: number) => void;
  style?: CSSProperties;
}

/**
 * DepthGauge — the vertical rail beside the PART B descent. A continuous spine
 * with a marker per layer (L0..L7); the active layer lights up and a "depth
 * fill" descends as the reader scrolls deeper. Meant to be rendered sticky.
 *
 * The page owns the scroll math (which layer is active); this component is
 * presentational. Pair with section refs + useInView or a scroll listener.
 */
export function DepthGauge({
  layers,
  activeIndex,
  onSelect,
  style,
}: DepthGaugeProps) {
  const pct =
    layers.length > 1
      ? (Math.max(0, activeIndex) / (layers.length - 1)) * 100
      : 0;

  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        minHeight: "320px",
        paddingLeft: "18px",
        ...style,
      }}
    >
      {/* spine */}
      <div
        style={{
          position: "absolute",
          left: "6px",
          top: 0,
          bottom: 0,
          width: "1px",
          background: "rgba(239,233,218,.14)",
        }}
      />
      {/* depth fill */}
      <div
        style={{
          position: "absolute",
          left: "5px",
          top: 0,
          height: `${pct}%`,
          width: "3px",
          background:
            "linear-gradient(180deg,var(--acc),rgba(var(--acc-rgb),.25))",
          transition: "height .5s cubic-bezier(.2,.8,.2,1)",
        }}
      />
      {layers.map((layer, i) => {
        const active = i === activeIndex;
        const passed = i <= activeIndex;
        return (
          <button
            key={layer.id}
            type="button"
            onClick={onSelect ? () => onSelect(i) : undefined}
            style={{
              all: "unset",
              cursor: onSelect ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              position: "relative",
              zIndex: 1,
            }}
          >
            <span
              style={{
                position: "absolute",
                left: "-15px",
                width: active ? "11px" : "7px",
                height: active ? "11px" : "7px",
                borderRadius: "50%",
                background: passed ? ACC : DARKER,
                border: `1px solid ${passed ? ACC : "rgba(239,233,218,.3)"}`,
                transition: "all .35s ease",
                boxShadow: active ? "0 0 14px rgba(var(--acc-rgb),.6)" : "none",
              }}
            />
            <span
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                letterSpacing: ".14em",
                color: active ? INK : passed ? BODY_COLOR : MUTED,
                transition: "color .3s ease",
                whiteSpace: "nowrap",
              }}
            >
              <strong style={{ color: active ? ACC : "inherit" }}>
                {layer.id}
              </strong>
              &nbsp;&middot;&nbsp;{layer.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ Reveal util -- */

/**
 * Reveal — convenience wrapper that fades/rises its children in when scrolled
 * into view (uses useInView + the theory.css .thy-reveal classes). Diagrams or
 * the page can use it to stagger entrances. `descend` uses the L-layer motion.
 */
export function Reveal({
  children,
  descend = false,
  delay = 0,
  style,
}: {
  children: ReactNode;
  descend?: boolean;
  delay?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const base = descend ? "thy-reveal-descend" : "thy-reveal";
  return (
    <div
      ref={ref}
      className={inView ? `${base} thy-in` : base}
      style={{ animationDelay: delay ? `${delay}ms` : undefined, ...style }}
    >
      {children}
    </div>
  );
}
