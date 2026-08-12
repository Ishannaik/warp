#!/usr/bin/env node
/**
 * Run every engine check harness (`web/src/lib/warp/*.check.mjs`) in sequence,
 * failing fast on the first non-zero exit. These harnesses are the engine's
 * dependency-free regression net (see CONTRIBUTING.md) — this runner is the
 * one-line form used locally and in CI (issue #23), so a new harness dropped
 * next to a module is picked up automatically with no manifest to maintain.
 *
 * Portable on purpose: plain `node:fs` + `node:child_process`, no glob dep and
 * no shell `for` loop, so it behaves identically on Linux, macOS, and Windows.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const engineDir = join(webRoot, "src", "lib", "warp");

const checks = readdirSync(engineDir)
  .filter((f) => f.endsWith(".check.mjs"))
  .sort()
  .map((f) => join(engineDir, f));

if (!checks.length) {
  console.error("run-checks: no *.check.mjs harnesses found under", relative(webRoot, engineDir));
  process.exit(1);
}

for (const check of checks) {
  const label = relative(webRoot, check);
  const res = spawnSync(process.execPath, [check], { stdio: "inherit", cwd: webRoot });
  if (res.status !== 0) {
    console.error(`\nrun-checks: FAILED ${label} (exit ${res.status ?? "signal"})`);
    process.exit(res.status ?? 1);
  }
}

console.log(`run-checks: all ${checks.length} engine harnesses passed`);
