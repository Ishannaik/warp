import { useEffect, useRef } from "react";
import type { TransferItem } from "./warp/transfer";

/**
 * #15 — Show live transfer progress in the tab title.
 *
 * While any file transfer is in flight, `document.title` becomes
 * `↑ 42% · Warp` (arrow = direction: ↑ sending, ↓ receiving, ⇅ both), so a
 * user who switched tabs gets glanceable progress without tabbing back.
 *
 * - Reads the LATEST items from a ref inside a 1s interval; the effect itself
 *   depends only on the inactive→active flip, so it never re-runs on progress
 *   ticks (and never clobbers the route title with a stale capture).
 * - Captures the pre-transfer title when the transfer starts and restores it
 *   when the last item finishes/errors or the component unmounts, so it plays
 *   nicely with `useDocumentSeo`'s static per-route title.
 * - Throttled to ~1 write/second (title churn hammers some browsers).
 */
export function useTransferTitle(items: TransferItem[]): void {
  const itemsRef = useRef(items);
  // eslint-disable-next-line react-hooks/refs -- Latest-ref pattern
  itemsRef.current = items;
  const lastWritten = useRef(0);

  const hasActive = items.some(
    (t) => t.kind === "file" && (t.status === "transferring" || t.status === "reconnecting" || t.status === "paused"),
  );

  useEffect(() => {
    if (!hasActive) return;
    const prev = document.title;

    const write = () => {
      const now = Date.now();
      if (now - lastWritten.current < 1000) return;
      lastWritten.current = now;

      const active = itemsRef.current.filter(
        (t) => t.kind === "file" && (t.status === "transferring" || t.status === "reconnecting" || t.status === "paused"),
      );
      if (!active.length) return;

      const sending = active.some((t) => t.direction === "send");
      const receiving = active.some((t) => t.direction === "receive");
      const arrow = sending && receiving ? "⇅" : sending ? "↑" : "↓";

      const total = active.reduce((s, t) => s + t.size, 0);
      const done = active.reduce((s, t) => s + t.transferred, 0);
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

      document.title = `${arrow} ${pct}% · Warp`;
    };

    write();
    const id = setInterval(write, 1000);
    return () => {
      clearInterval(id);
      document.title = prev;
    };
  }, [hasActive]);
}
