/**
 * Dependency-free lifecycle check for useTransferTitle.ts. A tiny React hook
 * runtime preserves refs/effect dependencies across renders so the hook can be
 * exercised from Node without adding a browser test framework.
 *
 * Run from web/: node src/lib/useTransferTitle.check.mjs
 */

import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const esbuild = await import("esbuild");
const out = await esbuild.build({
  entryPoints: [path.join(here, "useTransferTitle.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
  plugins: [
    {
      name: "react-hook-stub",
      setup(build) {
        build.onResolve({ filter: /^react$/ }, () => ({
          path: "react-stub",
          namespace: "hook-stub",
        }));
        build.onLoad({ filter: /.*/, namespace: "hook-stub" }, () => ({
          loader: "js",
          contents: `
            const slots = [];
            let cursor = 0;

            function beginRender() {
              cursor = 0;
            }

            export function useRef(initial) {
              const index = cursor++;
              if (!slots[index]) {
                slots[index] = { kind: "ref", value: { current: initial } };
              }
              return slots[index].value;
            }

            export function useEffect(effect, deps) {
              const index = cursor++;
              const previous = slots[index];
              const changed = !previous ||
                previous.kind !== "effect" ||
                previous.deps.length !== deps.length ||
                deps.some((dep, i) => !Object.is(dep, previous.deps[i]));

              if (!changed) return;
              previous?.cleanup?.();
              const cleanup = effect();
              slots[index] = {
                kind: "effect",
                deps: [...deps],
                cleanup: typeof cleanup === "function" ? cleanup : undefined,
              };
            }

            function unmount() {
              for (const slot of slots) {
                if (slot?.kind === "effect") slot.cleanup?.();
              }
              slots.length = 0;
              cursor = 0;
            }

            globalThis.__transferTitleReact = { beginRender, unmount };
          `,
        }));
      },
    },
  ],
});
const code = out.outputFiles[0].text;
const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const { useTransferTitle } = await import(dataUrl);
const hookRuntime = globalThis.__transferTitleReact;
assert.ok(hookRuntime, "React hook stub should expose its render lifecycle");

const originalDocument = globalThis.document;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

const intervals = new Set();
Object.defineProperty(globalThis, "document", {
  value: { title: "Send files · Warp" },
  configurable: true,
  writable: true,
});
globalThis.setInterval = (callback, delay) => {
  assert.equal(delay, 1000, "transfer title refresh stays throttled to one second");
  const token = { callback };
  intervals.add(token);
  return token;
};
globalThis.clearInterval = (token) => {
  intervals.delete(token);
};

function file(status, overrides = {}) {
  return {
    id: "file-1",
    batchId: "batch-1",
    name: "report.pdf",
    size: 100,
    mime: "application/pdf",
    kind: "file",
    direction: "send",
    status,
    transferred: 25,
    progress: 25,
    ...overrides,
  };
}

function render(items) {
  hookRuntime.beginRender();
  useTransferTitle(items);
}

try {
  // Inactive items must not disturb the static route title or start a timer.
  render([file("done", { transferred: 100, progress: 100 })]);
  assert.equal(document.title, "Send files · Warp");
  assert.equal(intervals.size, 0);

  // A transferring file writes live progress and starts exactly one refresh loop.
  render([file("transferring")]);
  assert.equal(document.title, "↑ 25% · Warp");
  assert.match(document.title, /%/, "active title exposes transfer progress");
  assert.equal(intervals.size, 1);

  // Returning to an inactive state restores the title captured at transfer start.
  render([file("done", { transferred: 100, progress: 100 })]);
  assert.equal(document.title, "Send files · Warp");
  assert.equal(intervals.size, 0, "inactive transition clears the refresh loop");

  // A fresh mount captures its own route title and restores it on unmount.
  hookRuntime.unmount();
  document.title = "Receive files · Warp";
  render([
    file("transferring", {
      direction: "receive",
      size: 80,
      transferred: 40,
      progress: 50,
    }),
  ]);
  assert.equal(document.title, "↓ 50% · Warp");
  assert.equal(intervals.size, 1);

  hookRuntime.unmount();
  assert.equal(document.title, "Receive files · Warp");
  assert.equal(intervals.size, 0, "unmount clears the refresh loop");
} finally {
  hookRuntime.unmount();
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
}

console.log("OK: useTransferTitle (inactive, active progress, inactive restore, unmount restore)");
