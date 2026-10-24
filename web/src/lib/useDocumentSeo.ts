import { useEffect } from "react";

/**
 * Sets the per-route document metadata: title, `<meta name="description">`,
 * the canonical link, and the Open Graph / Twitter title/description/URL —
 * so JS-rendering crawlers (e.g. Googlebot) and link unfurlers see the active
 * page, not the static index.html defaults for every route.
 *
 * - On mount/update, sets `document.title` and updates the existing tags from
 *   index.html in place (creating any that are missing).
 * - `path` is the route's CANONICAL path (session URLs like /r/<code> map to
 *   their stable page before being passed in). The canonical origin is fixed:
 *   mirrors (the Pages preview host, warp.pixalabs.net) deliberately point at
 *   the one canonical domain instead of self-canonicalizing.
 * - Restores nothing on unmount: every route calls this hook with its own
 *   values, so the next route overwrites the previous ones.
 * - SSR-safe: guards `document` and does nothing when it is unavailable.
 */

const CANONICAL_ORIGIN = "https://warp.ishannaik.com";

function setMeta(attr: "name" | "property", key: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function useDocumentSeo(
  title: string,
  description?: string,
  path?: string,
  jsonLd?: Record<string, unknown>
): void {
  useEffect(() => {
    if (typeof document === "undefined") return;

    document.title = title;
    setMeta("property", "og:title", title);
    setMeta("name", "twitter:title", title);

    if (description !== undefined) {
      setMeta("name", "description", description);
      setMeta("property", "og:description", description);
      setMeta("name", "twitter:description", description);
    }

    if (path !== undefined) {
      const canonical = CANONICAL_ORIGIN + (path === "/" ? "/" : path);
      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", canonical);
      setMeta("property", "og:url", canonical);
    }

    if (jsonLd !== undefined) {
      let script = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"][data-route="true"]');
      if (!script) {
        script = document.createElement("script");
        script.setAttribute("type", "application/ld+json");
        script.setAttribute("data-route", "true");
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else {
      const script = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"][data-route="true"]');
      if (script) {
        script.remove();
      }
    }
  }, [title, description, path, jsonLd]);
}
