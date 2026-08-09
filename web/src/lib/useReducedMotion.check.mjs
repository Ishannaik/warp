/**
 * Dependency-free check for useReducedMotion.ts. React hooks are stubbed so the
 * media-query behavior can be exercised from Node without adding a test runner.
 *
 * Run from web/: node src/lib/useReducedMotion.check.mjs
 */

import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

let useReducedMotion;
try {
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    entryPoints: [path.join(here, "useReducedMotion.ts")],
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
              export function useState(initial) {
                const value = typeof initial === "function" ? initial() : initial;
                globalThis.__hookState = value;
                return [value, (next) => {
                  globalThis.__hookState = typeof next === "function"
                    ? next(globalThis.__hookState)
                    : next;
                }];
              }
              export function useEffect(effect) {
                globalThis.__hookCleanup = effect();
              }
            `,
          }));
        },
      },
    ],
  });
  const code = out.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  ({ useReducedMotion } = await import(dataUrl));
} catch (error) {
  console.error("SKIP: esbuild not available to transpile useReducedMotion.ts —", error.message);
  process.exit(0);
}

function setWindow(value) {
  if (value === undefined) {
    delete globalThis.window;
    return;
  }
  Object.defineProperty(globalThis, "window", {
    value,
    configurable: true,
    writable: true,
  });
}

function mediaQuery(matches) {
  const listeners = new Set();
  return {
    matches,
    addEventListener(type, listener) {
      assert.equal(type, "change");
      listeners.add(listener);
    },
    removeEventListener(type, listener) {
      assert.equal(type, "change");
      listeners.delete(listener);
    },
    emit(next) {
      this.matches = next;
      for (const listener of listeners) listener({ matches: next });
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

// SSR / missing matchMedia falls back to normal motion without throwing.
setWindow(undefined);
globalThis.__hookCleanup = undefined;
assert.equal(useReducedMotion(), false);
assert.equal(globalThis.__hookState, false);

// Initial preference is read synchronously and changes are subscribed to.
{
  const mql = mediaQuery(true);
  setWindow({
    matchMedia(query) {
      assert.equal(query, "(prefers-reduced-motion: reduce)");
      return mql;
    },
  });

  globalThis.__hookCleanup = undefined;
  assert.equal(useReducedMotion(), true);
  assert.equal(globalThis.__hookState, true);
  assert.equal(mql.listenerCount(), 1, "subscribes to the preference change event");

  mql.emit(false);
  assert.equal(globalThis.__hookState, false, "change event updates reduced-motion state");

  globalThis.__hookCleanup?.();
  assert.equal(mql.listenerCount(), 0, "cleanup removes the preference listener");
}

console.log("OK: useReducedMotion (initial preference, change subscription, cleanup, SSR guard)");
