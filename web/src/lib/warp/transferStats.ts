/**
 * transferStats.ts — pure helpers for the live speed + ETA readout.
 *
 * The engine already surfaces per-item progress (`TransferItem.transferred`);
 * this module turns that into a SMOOTHED throughput figure and an honest ETA:
 *
 *   - `SpeedTracker` keeps a ~5 s rolling window of (time, bytes) samples and
 *     reports bytes/second as (newest − oldest) / span. A window average is
 *     jitter-free without the lag a long EMA has, and it self-heals after a
 *     stall: old samples age out, so a resumed transfer re-ramps in seconds.
 *   - `formatSpeed` / `formatDuration` render those numbers in the design's
 *     mono-chrome style ("12.4 MB/s", "1m 12s") with no Infinity/NaN leaks.
 *
 * Everything here is dependency-free and side-effect-free so the math can be
 * exercised by `scripts/run-checks.mjs` without a DOM.
 */

import { formatBytes } from "./transfer";

/** The rolling window's length — long enough to smooth chunk bursts, short
 *  enough that a mid-transfer stall shows up quickly. */
export const SPEED_WINDOW_MS = 5_000;

/** How long a sample stays authoritative when no new progress arrives (a
 *  stalled channel). Past this the tracker reports 0 instead of pretending
 *  the last window still applies. */
const STALE_AFTER_MS = 2_500;

/** A rolling-window throughput sampler over cumulative byte counts. */
export class SpeedTracker {
  private samples: { t: number; b: number }[] = [];

  /**
   * Feed a cumulative byte count. Duplicate counts are still recorded (they
   * age the window correctly during a stall); a RESET count (smaller than the
   * newest sample — e.g. a salvaged send restarting from byte 0) discards the
   * history so the old, higher bytes can't produce a negative speed.
   */
  add(bytes: number, now: number = Date.now()): void {
    const last = this.samples[this.samples.length - 1];
    if (last && bytes < last.b) this.samples = [];
    this.samples.push({ t: now, b: bytes });
    this.prune(now);
  }

  /**
   * Smoothed throughput in bytes/second over the trailing window. 0 when
   * there's no usable span yet, the window has gone stale (stalled), or the
   * math would be nonsense — the UI never sees NaN/Infinity from here.
   */
  speed(now: number = Date.now()): number {
    this.prune(now);
    const n = this.samples.length;
    if (n < 2) return 0;
    const oldest = this.samples[0];
    const newest = this.samples[n - 1];
    if (now - newest.t > STALE_AFTER_MS) return 0; // stalled: honest zero
    const dt = (newest.t - oldest.t) / 1000;
    const db = newest.b - oldest.b;
    if (dt <= 0 || db <= 0 || !Number.isFinite(dt) || !Number.isFinite(db)) return 0;
    return db / dt;
  }

  /** Seconds until `remaining` bytes are done at the current speed; null when
   *  the speed can't produce a finite answer (the UI shows a placeholder). */
  etaSeconds(remaining: number, now: number = Date.now()): number | null {
    const v = this.speed(now);
    if (v <= 0 || !Number.isFinite(v)) return null;
    const s = remaining / v;
    return Number.isFinite(s) ? s : null;
  }

  /** Drop everything (new session / retry). */
  reset(): void {
    this.samples = [];
  }

  /** Discard samples older than the window (keeps one extra just outside the
   *  edge so the span reaches back the full window length). */
  private prune(now: number): void {
    const cutoff = now - SPEED_WINDOW_MS;
    let i = 0;
    while (i < this.samples.length - 1 && this.samples[i + 1].t <= cutoff) i++;
    if (i > 0) this.samples.splice(0, i);
  }
}

/** "12.4 MB/s" — reuses the design's byte formatter for the magnitude. */
export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "0 B/s";
  return `${formatBytes(Math.round(bytesPerSec))}/s`;
}

/**
 * Compact duration for the ETA readout: "45s", "1m 12s", "1h 05m". Minutes
 * and hours carry a padded sub-unit so the readout stays a stable width
 * instead of jumping between "1m 5s" and "1m 12s" every tick.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}
