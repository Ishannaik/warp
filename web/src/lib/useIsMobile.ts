import { useEffect, useState } from "react";

/**
 * Returns `true` when the viewport width is at or below `breakpoint` (default 767px).
 *
 * The state is initialized synchronously from `matchMedia` so the very first
 * render is already correct on mobile (no desktop -> mobile flash). Subscribes
 * to the MediaQueryList `change` event and cleans up on unmount.
 */
export function useIsMobile(breakpoint = 767): boolean {
  const query = `(max-width: ${breakpoint}px)`;

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mql = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    // Sync in case the viewport changed between initial render and effect.
    setIsMobile(mql.matches);
    mql.addEventListener("change", handleChange);

    return () => {
      mql.removeEventListener("change", handleChange);
    };
  }, [query]);

  return isMobile;
}
