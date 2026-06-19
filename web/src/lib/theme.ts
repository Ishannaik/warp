import type { CSSProperties } from "react";

/**
 * Accent palettes ported verbatim from the Wrap design source.
 * The shipped default variant is `Ultramarine`.
 */
export interface Palette {
  acc: string;
  accRgb: string;
  amb: string;
  ambRgb: string;
}

export const PALETTES = {
  Ultramarine: { acc: "#5360ff", accRgb: "83,96,255", amb: "#ef6a3d", ambRgb: "239,106,61" },
  Acid: { acc: "#c6f24e", accRgb: "198,242,78", amb: "#5360ff", ambRgb: "83,96,255" },
  Ember: { acc: "#ef6a3d", accRgb: "239,106,61", amb: "#f5c451", ambRgb: "245,196,81" },
  Mono: { acc: "#e9e4d6", accRgb: "233,228,214", amb: "#9a937f", ambRgb: "154,147,127" },
} as const satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;

/**
 * Channel-activity modes ported verbatim from the Wrap design source.
 * The shipped default variant is `Live`.
 *
 * - `i`    : simulation tick interval in ms
 * - `m`    : progress multiplier
 * - `beam` : --beam-dur value (border-beam spin duration)
 * - `tp`   : throughput multiplier
 */
export interface Mode {
  i: number;
  m: number;
  beam: string;
  tp: number;
}

export const MODES = {
  Calm: { i: 240, m: 0.5, beam: "9s", tp: 0.6 },
  Live: { i: 130, m: 1, beam: "6s", tp: 1 },
  Overdrive: { i: 70, m: 2.3, beam: "3s", tp: 1.9 },
} as const satisfies Record<string, Mode>;

export type ModeName = keyof typeof MODES;

/** Shipped default variant. */
export const DEFAULT_PALETTE: PaletteName = "Ultramarine";
export const DEFAULT_MODE: ModeName = "Live";

/**
 * Returns the inline CSS-var style object for a given palette + mode.
 * Foundation sets these on :root for the default variant; this helper exists
 * for a future theme-switcher that scopes vars to a subtree.
 */
export function themeVars(
  palette: PaletteName = DEFAULT_PALETTE,
  mode: ModeName = DEFAULT_MODE,
): CSSProperties {
  const p = PALETTES[palette] ?? PALETTES[DEFAULT_PALETTE];
  const m = MODES[mode] ?? MODES[DEFAULT_MODE];
  return {
    "--acc": p.acc,
    "--acc-rgb": p.accRgb,
    "--amb": p.amb,
    "--amb-rgb": p.ambRgb,
    "--beam-dur": m.beam,
  } as CSSProperties;
}

export default PALETTES;
