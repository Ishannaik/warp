import { useEffect, useRef } from "react";
import type { TransferItem } from "./warp/transfer";

export function useLiveTransferTitle(items: TransferItem[] | undefined) {
  const lastWriteSec = useRef<number>(0);
  const originalTitle = useRef<string | null>(null);

  useEffect(() => {
    if (!items || items.length === 0) {
      if (originalTitle.current !== null) {
        document.title = originalTitle.current;
        originalTitle.current = null;
      }
      return;
    }

    let transferred = 0;
    let size = 0;
    let sending = false;
    let receiving = false;
    let hasInFlight = false;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === "transferring" || item.status === "reconnecting") {
        hasInFlight = true;
        transferred += item.transferred;
        size += item.size;
        if (item.direction === "send") sending = true;
        if (item.direction === "receive") receiving = true;
      }
    }

    if (!hasInFlight) {
      if (originalTitle.current !== null) {
        document.title = originalTitle.current;
        originalTitle.current = null;
      }
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec === lastWriteSec.current) {
      return;
    }

    if (originalTitle.current === null) {
      originalTitle.current = document.title;
    }

    const pct = size === 0 ? 0 : Math.floor((transferred / size) * 100);
    const arrow = sending && receiving ? "⇅" : sending ? "↑" : "↓";

    document.title = `${arrow} ${pct}% · Warp`;
    lastWriteSec.current = nowSec;

  }, [items]);

  useEffect(() => {
    return () => {
      if (originalTitle.current !== null) {
        document.title = originalTitle.current;
      }
    };
  }, []);
}
