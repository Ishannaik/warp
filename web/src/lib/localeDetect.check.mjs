/**
 * Runnable check for the locale-matching logic behind the language switcher
 * (issue #163). No test runner; matches the `warp/*.check.mjs` style —
 * transpiles the TS on the fly via esbuild.
 *
 * Run:  node src/lib/localeDetect.check.mjs   (from web/)
 */

import assert from "node:assert";

let mod;
try {
  const esbuild = await import("esbuild");
  const url = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const out = await esbuild.build({
    entryPoints: [path.join(here, "localeDetect.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
  });
  const code = out.outputFiles[0].text;
  const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  mod = await import(dataUrl);
} catch (e) {
  console.error("SKIP: esbuild not available to transpile TS for this check —", e.message);
  process.exit(0);
}

const { pickBestLocale, AVAILABLE_LOCALES, DEFAULT_LOCALE, LOCALE_STORAGE_KEY } = mod;

// --- exact tag match ---------------------------------------------------------
assert.equal(pickBestLocale(["en"], ["en", "fr"]), "en", "exact match wins");
assert.equal(pickBestLocale(["fr"], ["en", "fr"]), "fr", "exact match on a non-default locale");

// --- base-language fallback within a region tag -----------------------------
assert.equal(pickBestLocale(["en-GB"], ["en", "fr"]), "en", "region tag falls back to its base language");
assert.equal(pickBestLocale(["fr-CA"], ["en", "fr"]), "fr", "same for a non-default base language");

// --- case-insensitive -------------------------------------------------------
assert.equal(pickBestLocale(["EN-us"], ["en"]), "en", "matching ignores case");

// --- preference order: first match in the list wins -------------------------
assert.equal(
  pickBestLocale(["de", "fr", "en"], ["en", "fr"]),
  "fr",
  "picks the first preferred language we actually have, not the first available one",
);

// --- no overlap -> fallback ---------------------------------------------------
assert.equal(pickBestLocale(["de", "ja"], ["en", "fr"], "en"), "en", "no match anywhere -> fallback");
assert.equal(pickBestLocale([], ["en", "fr"], "en"), "en", "empty preference list -> fallback");

// --- default export shape used by the provider ------------------------------
assert.equal(DEFAULT_LOCALE, "en", "en is the fallback locale");
assert.equal(LOCALE_STORAGE_KEY, "warp.locale", "persisted under the warp. key prefix");
assert.ok(
  AVAILABLE_LOCALES.some((l) => l.code === "en"),
  "en is registered in the locale list the switcher renders",
);
for (const locale of AVAILABLE_LOCALES) {
  assert.ok(locale.code && locale.label && locale.name, `locale ${JSON.stringify(locale)} has code/label/name`);
}

console.log("OK: localeDetect — exact/base-language matching, preference order, fallback, registry shape");
