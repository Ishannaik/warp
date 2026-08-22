// Boot `wrangler dev` for the signaling Worker on a fixed port and keep it up
// for the Playwright webServer manager. Exits non-zero if the server never
// becomes healthy. Kept separate from test.js (which spawns + tears down its
// own instance) so the E2E harness owns exactly one lifecycle.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.SIGNALING_PORT ?? "8787";

const proc = spawn("pnpm", ["exec", "wrangler", "dev", "--port", PORT], {
  cwd: new URL("../../server/", import.meta.url).pathname,
  stdio: ["ignore", "pipe", "pipe"],
});

const forward = (stream, tag) =>
  stream.on("data", (d) => process.stderr.write(`[${tag}] ${d}`));
forward(proc.stdout, "signaling");
forward(proc.stderr, "signaling");

let up = false;
for (let i = 0; i < 120 && !up; i++) {
  try {
    const res = await fetch(`http://localhost:${PORT}/health`);
    if (res.ok) up = true;
  } catch {
    /* not yet */
  }
  if (!up) await sleep(500);
}

if (!up) {
  console.error("e2e-signaling: wrangler dev never became healthy");
  proc.kill("SIGKILL");
  process.exit(1);
}

console.error(`e2e-signaling: healthy on :${PORT}`);

const shutdown = () => {
  proc.kill("SIGTERM");
  setTimeout(() => proc.kill("SIGKILL"), 3000);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
