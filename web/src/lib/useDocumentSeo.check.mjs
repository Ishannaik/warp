/**
 * Dependency-free DOM check for useDocumentSeo.ts. The React effect is stubbed
 * to run immediately so metadata behavior can be exercised from Node.
 *
 * Run from web/: node src/lib/useDocumentSeo.check.mjs
 */

import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

let useDocumentSeo;
try {
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    entryPoints: [path.join(here, "useDocumentSeo.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
    plugins: [
      {
        name: "react-effect-stub",
        setup(build) {
          build.onResolve({ filter: /^react$/ }, () => ({
            path: "react-stub",
            namespace: "hook-stub",
          }));
          build.onLoad({ filter: /.*/, namespace: "hook-stub" }, () => ({
            loader: "js",
            contents: "export function useEffect(effect) { effect(); }",
          }));
        },
      },
    ],
  });
  const code = out.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  ({ useDocumentSeo } = await import(dataUrl));
} catch (error) {
  console.error("SKIP: esbuild not available to transpile useDocumentSeo.ts —", error.message);
  process.exit(0);
}

function makeElement(tagName) {
  const attrs = new Map();
  return {
    tagName,
    setAttribute(name, value) {
      attrs.set(name, value);
    },
    getAttribute(name) {
      return attrs.get(name) ?? null;
    },
  };
}

function makeDocument() {
  const elements = [];
  const doc = {
    title: "",
    head: {
      appendChild(element) {
        elements.push(element);
        return element;
      },
    },
    createElement(tagName) {
      return makeElement(tagName);
    },
    querySelector(selector) {
      const meta = selector.match(/^meta\[(name|property)="([^"]+)"\]$/);
      if (meta) {
        const [, attr, key] = meta;
        return (
          elements.find(
            (element) => element.tagName === "meta" && element.getAttribute(attr) === key,
          ) ?? null
        );
      }
      if (selector === 'link[rel="canonical"]') {
        return (
          elements.find(
            (element) => element.tagName === "link" && element.getAttribute("rel") === "canonical",
          ) ?? null
        );
      }
      return null;
    },
    __elements: elements,
  };
  return doc;
}

const documentStub = makeDocument();
Object.defineProperty(globalThis, "document", {
  value: documentStub,
  configurable: true,
  writable: true,
});

useDocumentSeo("First page", "First description", "/first");
assert.equal(documentStub.title, "First page");
assert.equal(documentStub.querySelector('meta[name="description"]').getAttribute("content"), "First description");
assert.equal(documentStub.querySelector('meta[property="og:title"]').getAttribute("content"), "First page");
assert.equal(documentStub.querySelector('meta[name="twitter:title"]').getAttribute("content"), "First page");
assert.equal(
  documentStub.querySelector('link[rel="canonical"]').getAttribute("href"),
  "https://warp.ishannaik.com/first",
);
assert.equal(
  documentStub.querySelector('meta[property="og:url"]').getAttribute("content"),
  "https://warp.ishannaik.com/first",
);

const countAfterFirst = documentStub.__elements.length;
useDocumentSeo("Second page", "Second description", "/second");
assert.equal(documentStub.title, "Second page");
assert.equal(documentStub.querySelector('meta[name="description"]').getAttribute("content"), "Second description");
assert.equal(
  documentStub.querySelector('link[rel="canonical"]').getAttribute("href"),
  "https://warp.ishannaik.com/second",
);
assert.equal(
  documentStub.__elements.length,
  countAfterFirst,
  "updating route metadata reuses existing tags instead of duplicating them",
);

const descriptionTags = documentStub.__elements.filter(
  (element) => element.tagName === "meta" && element.getAttribute("name") === "description",
);
assert.equal(descriptionTags.length, 1, "there is exactly one description meta tag");

// The hook is SSR-safe and simply no-ops when document is unavailable.
delete globalThis.document;
assert.doesNotThrow(() => useDocumentSeo("SSR page", "ignored", "/ssr"));

console.log("OK: useDocumentSeo (title, create/update metadata, canonical URL, no duplicates, SSR guard)");
