/**
 * Dependency-free check for useIsMobile.ts. React's two hooks are stubbed so
 * the hook can be driven from Node without adding a browser test framework.
 *
 * Run from web/: node src/lib/useIsMobile.check.mjs
 */

import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const esbuild = await import("esbuild");
const out = await esbuild.build({
  entryPoints: [path.join(here, "useIsMobile.ts")],
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
const { useIsMobile } = await import(dataUrl);

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

// SSR: no window means a safe desktop default.
setWindow(undefined);
globalThis.__hookCleanup = undefined;
assert.equal(useIsMobile(), false);
assert.equal(globalThis.__hookState, false);
assert.equal(globalThis.__hookCleanup, undefined);

// Browser-like environment where window exists but matchMedia is unavailable.
setWindow({});
globalThis.__hookCleanup = undefined;
assert.equal(useIsMobile(), false);
assert.equal(globalThis.__hookState, false);
assert.equal(globalThis.__hookCleanup, undefined);

// Boundary is inclusive and read synchronously on the first render.
{
  const mql = mediaQuery(true);
  setWindow({
    matchMedia(query) {
      assert.equal(query, "(max-width: 767px)");
      return mql;
    },
  });

  globalThis.__hookCleanup = undefined;
  assert.equal(useIsMobile(767), true);
  assert.equal(globalThis.__hookState, true);
  assert.equal(mql.listenerCount(), 1, "subscribes to one change listener");

  mql.emit(false);
  assert.equal(globalThis.__hookState, false, "change event updates mobile state");

  globalThis.__hookCleanup?.();
  assert.equal(mql.listenerCount(), 0, "cleanup removes the change listener");
}

// A custom breakpoint is reflected in the media query.
{
  const mql = mediaQuery(false);
  setWindow({
    matchMedia(query) {
      assert.equal(query, "(max-width: 420px)");
      return mql;
    },
  });
  assert.equal(useIsMobile(420), false);
  globalThis.__hookCleanup?.();
}

console.log("OK: useIsMobile (initial state, breakpoint, change subscription, cleanup, SSR + missing-matchMedia guards)");
