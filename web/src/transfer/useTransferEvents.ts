import { useEffect, useRef, useState, useCallback } from "react";
import type { IncomingOffer, WarpStatus } from "../lib/warp/useWarpTransfer";
import { type TransferItem, formatBytes } from "../lib/warp/transfer";

export function useNotificationPreference() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("warp-notify") === "true";
  });

  const toggle = useCallback(async () => {
    if (!enabled) {
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        if (p !== "granted") return;
      }
      localStorage.setItem("warp-notify", "true");
      setEnabled(true);
    } else {
      localStorage.removeItem("warp-notify");
      setEnabled(false);
    }
  }, [enabled]);

  return { enabled, toggle };
}

export function useTransferEvents({
  incoming,
  items,
  status,
  notificationsEnabled,
}: {
  incoming: IncomingOffer | null;
  items: TransferItem[];
  status: WarpStatus;
  notificationsEnabled: boolean;
}) {
  const prevIncoming = useRef(incoming);
  const prevItems = useRef(items);
  const prevStatus = useRef(status);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    const canNotify =
      notificationsEnabled &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      document.hidden;

    const notify = (title: string, body?: string, tag?: string) => {
      if (!canNotify) return;
      const n = new Notification(title, {
        body,
        icon: "/icon-192.png",
        tag,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    };

    // 1. Incoming offer
    if (incoming && incoming !== prevIncoming.current) {
      const totalSize = incoming.items.reduce((s, i) => s + i.size, 0);
      notify(
        `Warp: ${incoming.items.length} ${incoming.items.length === 1 ? "file" : "files"} offered`,
        `${formatBytes(totalSize)}`,
        "offer"
      );
    }
    prevIncoming.current = incoming;

    // 2. Batch complete (all items in a batch become done)
    const getBatches = (list: TransferItem[]) => {
      const batches = new Map<string, TransferItem[]>();
      for (const item of list) {
        let b = batches.get(item.batchId);
        if (!b) {
          b = [];
          batches.set(item.batchId, b);
        }
        b.push(item);
      }
      return batches;
    };

    const oldBatches = getBatches(prevItems.current);
    const newBatches = getBatches(items);

    for (const [batchId, newGroup] of newBatches.entries()) {
      const isComplete = newGroup.every((i) => i.status === "done");
      if (isComplete) {
        const oldGroup = oldBatches.get(batchId);
        const wasComplete = oldGroup ? oldGroup.every((i) => i.status === "done") : false;
        if (!wasComplete) {
          notify(
            "Warp: Batch complete",
            "All files sent/received",
            "batch-complete"
          );
        }
      }
    }
    prevItems.current = items;

    // 3. Connection lost >5s
    if (status === "reconnecting" && prevStatus.current !== "reconnecting") {
      reconnectTimer.current = window.setTimeout(() => {
        notify("Warp: Connection lost", "Trying to reconnect...", "connection-lost");
      }, 5000);
    } else if (status !== "reconnecting" && prevStatus.current === "reconnecting") {
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    }
    if (status === "error" && prevStatus.current !== "error") {
      notify("Warp: Connection error", "The connection dropped.", "connection-lost");
    }

    prevStatus.current = status;
  }, [incoming, items, status, notificationsEnabled]);
}
