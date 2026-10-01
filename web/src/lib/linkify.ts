/**
 * Pure helper to split text into plain-text spans and http(s) links.
 * Strips trailing punctuation back into text so sentence-ending marks
 * and closing parentheses do not corrupt the URL.
 */

export interface LinkifyPart {
  kind: "text" | "link";
  value: string;
}

const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCT_RE = /[.,;:!?)]+$/;

export function linkify(text: string): LinkifyPart[] {
  if (!text) return [];

  const parts: LinkifyPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    const matchStart = match.index;
    let rawUrl = match[0];

    // Push preceding plain text if any
    if (matchStart > lastIndex) {
      parts.push({
        kind: "text",
        value: text.slice(lastIndex, matchStart),
      });
    }

    // Strip trailing punctuation from URL back into following text
    const punctMatch = rawUrl.match(TRAILING_PUNCT_RE);
    let trailingPunct = "";
    if (punctMatch) {
      trailingPunct = punctMatch[0];
      rawUrl = rawUrl.slice(0, rawUrl.length - trailingPunct.length);
    }

    if (rawUrl) {
      parts.push({
        kind: "link",
        value: rawUrl,
      });
    }

    if (trailingPunct) {
      parts.push({
        kind: "text",
        value: trailingPunct,
      });
    }

    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({
      kind: "text",
      value: text.slice(lastIndex),
    });
  }

  // Merge adjacent "text" parts if any was pushed (e.g. from trailing punct followed by text)
  const merged: LinkifyPart[] = [];
  for (const part of parts) {
    if (
      merged.length > 0 &&
      merged[merged.length - 1].kind === "text" &&
      part.kind === "text"
    ) {
      merged[merged.length - 1].value += part.value;
    } else {
      merged.push(part);
    }
  }

  return merged;
}
