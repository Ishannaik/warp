import { useEffect } from "react";

const SITE_URL = "https://warp.ishannaik.com";

function setMeta(selector: string, attr: string, value: string, create: () => HTMLMetaElement): void {
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/**
 * Sets the document title, `<meta name="description">`, canonical link, and
 * Open Graph / Twitter card tags for the current route, so JS-rendering
 * crawlers (e.g. Googlebot) and link-unfurlers (Slack, Discord, iMessage)
 * reflect the active page instead of the static homepage tags baked into
 * `index.html`.
 *
 * - On mount/update, sets `document.title`, the meta description, the
 *   canonical `<link>`, and `og:title` / `og:description` / `og:url` /
 *   `twitter:title` / `twitter:description` — creating any tag that doesn't
 *   already exist (it does, from `index.html`'s homepage defaults).
 * - `path` is the route's path (e.g. `/wetransfer-size-limit`), joined onto
 *   `SITE_URL` for canonical + `og:url`. Omit it to leave those two alone
 *   (falls back to whatever `index.html` already set — the homepage's own
 *   values, which is correct there).
 * - Restores nothing on unmount: every route is expected to call this hook
 *   with its own title/description, so the next route overwrites the
 *   previous values.
 * - SSR-safe: guards `document` and does nothing when it is unavailable.
 */
export function useDocumentSeo(title: string, description?: string, path?: string): void {
  useEffect(() => {
    if (typeof document === "undefined") return;

    document.title = title;

    if (description !== undefined) {
      setMeta('meta[name="description"]', "content", description, () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "description");
        return m;
      });
      setMeta('meta[property="og:description"]', "content", description, () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:description");
        return m;
      });
      setMeta('meta[name="twitter:description"]', "content", description, () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "twitter:description");
        return m;
      });
    }

    setMeta('meta[property="og:title"]', "content", title, () => {
      const m = document.createElement("meta");
      m.setAttribute("property", "og:title");
      return m;
    });
    setMeta('meta[name="twitter:title"]', "content", title, () => {
      const m = document.createElement("meta");
      m.setAttribute("name", "twitter:title");
      return m;
    });

    if (path !== undefined) {
      const url = `${SITE_URL}${path}`;

      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", url);

      setMeta('meta[property="og:url"]', "content", url, () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:url");
        return m;
      });
    }
  }, [title, description, path]);
}
