/**
 * Copy text to the clipboard, with a fallback for insecure origins
 * (plain http:// on a LAN self-host, where navigator.clipboard is
 * undefined and the Clipboard API throws or doesn't exist at all).
 *
 * Returns true on success, false on failure — never throws, so
 * callers can drive UI state off the boolean instead of a silent
 * no-op.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the execCommand fallback below — some browsers
      // expose navigator.clipboard but still throw on insecure origins
      // or without a user-activation context.
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  // Keep it out of the visible layout and off-screen, but still
  // selectable/focusable — some browsers refuse to copy from a
  // display:none or zero-size element.
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.boxShadow = "none";
  textarea.style.background = "transparent";
  textarea.style.opacity = "0";
  textarea.setAttribute("readonly", "");

  document.body.appendChild(textarea);
  const previousFocus = document.activeElement as HTMLElement | null;

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    // execCommand is deprecated but remains the only working fallback on
    // insecure origins where the Clipboard API is unavailable.
    const ok = document.execCommand("copy");
    return ok;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
    previousFocus?.focus?.();
  }
}
