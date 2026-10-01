/**
 * Dependency-free check for linkify.ts.
 *
 * Run from web/: node src/lib/linkify.check.mjs
 */

import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const esbuild = await import("esbuild");
const out = await esbuild.build({
  entryPoints: [path.join(here, "linkify.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});

const code = out.outputFiles[0].text;
const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const { linkify } = await import(dataUrl);

// 1. Plain text without URLs
assert.deepEqual(linkify("plain text"), [
  { kind: "text", value: "plain text" },
]);

// 2. One URL
assert.deepEqual(linkify("https://example.com"), [
  { kind: "link", value: "https://example.com" },
]);

// 3. URL with trailing period
assert.deepEqual(linkify("Visit https://example.com."), [
  { kind: "text", value: "Visit " },
  { kind: "link", value: "https://example.com" },
  { kind: "text", value: "." },
]);

// 4. Two URLs
assert.deepEqual(linkify("Check http://one.com and https://two.org!"), [
  { kind: "text", value: "Check " },
  { kind: "link", value: "http://one.com" },
  { kind: "text", value: " and " },
  { kind: "link", value: "https://two.org" },
  { kind: "text", value: "!" },
]);

// 5. javascript:alert(1) stays text (no http:// or https://)
assert.deepEqual(linkify("javascript:alert(1)"), [
  { kind: "text", value: "javascript:alert(1)" },
]);

// 6. "http://a.com)" keeps ")" as text
assert.deepEqual(linkify("http://a.com)"), [
  { kind: "link", value: "http://a.com" },
  { kind: "text", value: ")" },
]);

// 7. Trailing punctuation variants (.,;:!?)]
assert.deepEqual(linkify("See https://example.com/foo,;:!?"), [
  { kind: "text", value: "See " },
  { kind: "link", value: "https://example.com/foo" },
  { kind: "text", value: ",;:!?" },
]);

// 8. Other non-http schemes stay text
assert.deepEqual(linkify("data:text/plain;base64,SGVsbG8="), [
  { kind: "text", value: "data:text/plain;base64,SGVsbG8=" },
]);
assert.deepEqual(linkify("file:///etc/passwd"), [
  { kind: "text", value: "file:///etc/passwd" },
]);

// 9. Empty text
assert.deepEqual(linkify(""), []);

console.log("OK: linkify check passed");
