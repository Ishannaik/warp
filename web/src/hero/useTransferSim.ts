import { useEffect, useRef, useState } from "react";

/**
 * Live-mode transfer simulation (the "ShareX queue" behaviour).
 *
 * Ported verbatim from the Wrap design export's vanilla-JS `tick()`:
 *   - interval 130ms, multiplier 1, throughput multiplier 1  (Live mode)
 *   - uploading rows advance pct by (bytes>3000 ? 0.9 : 1.7) * (0.6 + rand*0.9) * mult
 *   - when fewer than 2 rows are uploading, the next queued row is promoted
 *   - once everything is done, a fresh batch is kicked off (loop)
 *   - throughput = (1.9 + rand*0.9) * tp  GB/s
 *   - footer totals derive from per-row bytes * pct
 *
 * State lives in React useState so the component re-renders each tick. The
 * entrance animations live on the OUTER window wrapper (owned by Hero) and on
 * static chrome — the per-row markup carries no entrance animation, so these
 * sim re-renders never restart any `wrapRise`/`wrapFade` etc.
 */

export type RowStatus = "up" | "done" | "queued";

export interface SimRow {
  name: string;
  size: string;
  /** size in "MB-equivalent" units used purely for sim math (from source). */
  bytes: number;
  pct: number;
  status: RowStatus;
}

export interface SimTotals {
  /** "02" style zero-padded count of completed rows. */
  doneLabel: string;
  /** "8.6" style GB sent (one decimal). */
  sentLabel: string;
  /** overall percent 0..100 for the footer bar width. */
  overallPct: number;
  /** "00:04" style ETA. */
  etaLabel: string;
}

export interface TransferSim {
  rows: SimRow[];
  /** "2.41 GB/s" style live throughput shown in the title bar. */
  throughput: string;
  totals: SimTotals;
}

// Live mode constants (the only variant we ship).
const TICK_MS = 130;
const MULT = 1;
const TP_MULT = 1;

// The 5 exact rows from the design source.
const INITIAL_ROWS: SimRow[] = [
  { name: "keynote-final.key", size: "2.4 GB", bytes: 2400, pct: 71, status: "up" },
  { name: "shoot-raws.zip", size: "6.1 GB", bytes: 6100, pct: 34, status: "up" },
  { name: "site-backup.tar", size: "880 MB", bytes: 880, pct: 100, status: "done" },
  { name: "contract-v3.pdf", size: "1.2 MB", bytes: 2, pct: 100, status: "done" },
  { name: "render-proxy.mp4", size: "420 MB", bytes: 420, pct: 0, status: "queued" },
];

function cloneRows(rows: SimRow[]): SimRow[] {
  return rows.map((r) => ({ ...r }));
}

function advance(prev: SimRow[]): SimRow[] {
  const rows = cloneRows(prev);

  for (const r of rows) {
    if (r.status === "up") {
      r.pct += (r.bytes > 3000 ? 0.9 : 1.7) * (0.6 + Math.random() * 0.9) * MULT;
      if (r.pct >= 100) {
        r.pct = 100;
        r.status = "done";
      }
    }
  }

  // Promote next queued row when a slot frees / nothing uploading.
  if (rows.filter((r) => r.status === "up").length < 2) {
    const q = rows.find((r) => r.status === "queued");
    if (q) {
      q.status = "up";
      q.pct = Math.max(q.pct, 1);
    }
  }

  // Loop: once everything's done, kick off a fresh batch.
  if (rows.every((r) => r.status === "done")) {
    rows[0].pct = 6;
    rows[0].status = "up";
    rows[1].pct = 0;
    rows[1].status = "up";
    rows[4].pct = 0;
    rows[4].status = "queued";
  }

  return rows;
}

function computeTotals(rows: SimRow[]): SimTotals {
  const done = rows.filter((r) => r.status === "done").length;
  const totalBytes = rows.reduce((s, r) => s + r.bytes, 0);
  const sentBytes = rows.reduce((s, r) => s + (r.bytes * r.pct) / 100, 0);
  const overallPct = Math.round((sentBytes / totalBytes) * 100);
  const remEta = Math.max(0, Math.round((totalBytes - sentBytes) / 480));
  return {
    doneLabel: String(done).padStart(2, "0"),
    sentLabel: (sentBytes / 1000).toFixed(1),
    overallPct,
    etaLabel: "00:" + String(remEta).padStart(2, "0"),
  };
}

function nextThroughput(): string {
  return ((1.9 + Math.random() * 0.9) * TP_MULT).toFixed(2) + " GB/s";
}

export function useTransferSim(): TransferSim {
  const [rows, setRows] = useState<SimRow[]>(() => cloneRows(INITIAL_ROWS));
  const [throughput, setThroughput] = useState<string>("2.41 GB/s");
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    const id = window.setInterval(() => {
      setRows((prev) => advance(prev));
      setThroughput(nextThroughput());
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return { rows, throughput, totals: computeTotals(rows) };
}
