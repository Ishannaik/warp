import { useEffect, useState } from "react";

/**
 * Tiny history-based client router (no router library).
 *
 * - `navigate(path)` pushes a new history entry and notifies subscribers.
 * - `useRoute()` returns `{ path, code }`. For `/r/<CODE>` paths the room
 *   code segment is decoded and exposed as `code`; otherwise `code` is null.
 */

const EVENT = "warp:navigate";

export function navigate(path: string): void {
  if (path === window.location.pathname + window.location.search) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event(EVENT));
}

function parseCode(path: string): string | null {
  const m = path.match(/^\/r\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function useRoute(): { path: string; code: string | null } {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(EVENT, update);
    };
  }, []);

  return { path, code: parseCode(path) };
}
