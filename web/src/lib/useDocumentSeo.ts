import { useEffect } from "react";

/**
 * Sets the document title and `<meta name="description">` content for the
 * current route, so JS-rendering crawlers (e.g. Googlebot) and the browser tab
 * reflect the active page.
 *
 * - On mount/update, sets `document.title` and the meta description content,
 *   creating the `<meta name="description">` tag if it does not exist.
 * - Restores nothing on unmount: every route is expected to call this hook with
 *   its own title/description, so the next route overwrites the previous values.
 * - SSR-safe: guards `document` and does nothing when it is unavailable.
 */
export function useDocumentSeo(title: string, description?: string): void {
  useEffect(() => {
    if (typeof document === "undefined") return;

    document.title = title;

    if (description !== undefined) {
      let meta = document.querySelector<HTMLMetaElement>(
        'meta[name="description"]',
      );
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", description);
    }
  }, [title, description]);
}
