/**
 * Runnable check for copyToClipboard.ts (no test runner; same esbuild-transpile
 * pattern as web/src/lib/warp/transfer.check.mjs). Stubs navigator.clipboard and
 * document so the execCommand fallback path can be driven from Node.
 *
 * Run:  node src/lib/copyToClipboard.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- stub document: a fake textarea + a body that tracks append/remove ----
function makeDocument({ execCommandResult }) {
  const textarea = {
    style: {},
    value: "",
    focused: false,
    setAttribute() {},
    focus() {
      this.focused = true;
    },
    select() {},
    setSelectionRange() {},
  };
  const body = {
    appended: false,
    appendChild(el) {
      assert.equal(el, textarea, "only the copy textarea is appended to body");
      this.appended = true;
    },
    removeChild(el) {
      assert.equal(el, textarea, "only the copy textarea is removed from body");
      assert.ok(this.appended, "textarea must be appended before it's removed");
      this.appended = false;
    },
  };
  const previousFocus = { focused: false, focus: () => (previousFocus.focused = true) };
  return {
    activeElement: previousFocus,
    createElement: (tag) => {
      assert.equal(tag, "textarea", "fallback creates a textarea");
      return textarea;
    },
    body,
    execCommand: (cmd) => {
      assert.equal(cmd, "copy", "execCommand is called with 'copy'");
      return execCommandResult;
    },
    // exposed for assertions below
    __textarea: textarea,
    __previousFocus: previousFocus,
  };
}

// --- transpile copyToClipboard.ts on the fly (esbuild if present) ---------
let copyToClipboard;
try {
  const esbuild = await import("esbuild");
  const url = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const out = await esbuild.build({
    entryPoints: [path.join(here, "copyToClipboard.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
  });
  const code = out.outputFiles[0].text;
  const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  ({ copyToClipboard } = await import(dataUrl));
} catch (e) {
  console.error("SKIP: esbuild not available to transpile TS for this check —", e.message);
  process.exit(0);
}

// --- Clipboard API succeeds -> true, execCommand fallback untouched -------
{
  let execCommandCalled = false;
  const doc = makeDocument({ execCommandResult: true });
  doc.execCommand = () => {
    execCommandCalled = true;
    return true;
  };
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true,
    writable: true,
  });

  const ok = await copyToClipboard("hello");
  assert.equal(ok, true, "Clipboard API success returns true");
  assert.equal(execCommandCalled, false, "execCommand fallback is not used when the Clipboard API succeeds");
}

// --- Clipboard API throws -> falls back to execCommand -> true ------------
{
  const doc = makeDocument({ execCommandResult: true });
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      clipboard: {
        writeText: async () => {
          throw new Error("insecure origin");
        },
      },
    },
    configurable: true,
    writable: true,
  });

  const ok = await copyToClipboard("hello");
  assert.equal(ok, true, "execCommand fallback succeeds after the Clipboard API throws");
  assert.equal(doc.__textarea.focused, true, "fallback focuses the textarea before copying");
  assert.equal(doc.body.appended, false, "textarea is removed from the DOM again after copying");
  assert.equal(doc.__previousFocus.focused, true, "focus is restored to the previously-focused element");
}

// --- Both paths fail -> false, and copyToClipboard never throws -----------
{
  const doc = makeDocument({ execCommandResult: false });
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      clipboard: {
        writeText: async () => {
          throw new Error("insecure origin");
        },
      },
    },
    configurable: true,
    writable: true,
  });

  let ok;
  await assert.doesNotReject(async () => {
    ok = await copyToClipboard("hello");
  }, "copyToClipboard never throws, even when both paths fail");
  assert.equal(ok, false, "both paths failing returns false");
  assert.equal(doc.body.appended, false, "textarea is still cleaned up when execCommand reports failure");
}

// --- No Clipboard API at all -> straight to the execCommand fallback ------
{
  const doc = makeDocument({ execCommandResult: true });
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true, writable: true });

  const ok = await copyToClipboard("hello");
  assert.equal(ok, true, "no Clipboard API on navigator still succeeds via the execCommand fallback");
}

console.log("OK: copyToClipboard (Clipboard API success, execCommand fallback after throw, total failure -> false)");
