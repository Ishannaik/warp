// Ambient declarations for shared/codewords.js — plain JS on purpose (one
// module for both the Worker and the web bundle), typed here for TS consumers.
declare module "*/shared/codewords.js" {
  /**
   * Canonical 6-char room code → its spoken five-word alias, or null if the
   * input is not a valid code.
   */
  export function codeToAlias(code: string): string | null;
  /**
   * Spoken alias → canonical code (case/separator tolerant), or null if
   * malformed or out of range. Never mints a new room.
   */
  export function aliasToCode(alias: string): string | null;
  /** True when the string is alias-shaped rather than a raw code shape. */
  export function looksLikeAlias(input: unknown): boolean;
  export const CODE_ALPHABET: string;
  export const CODE_LEN: number;
  export const CODE_SPACE: number;
}
