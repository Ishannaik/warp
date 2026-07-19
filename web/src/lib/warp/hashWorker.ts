/**
 * Web Worker: incremental SHA-256, one session per in-flight file.
 *
 * The main thread owns transfer I/O (WebRTC data channel, disk sink); this
 * worker owns hashing. Blocks flow in via postMessage; the digest flows back
 * when the sender/receiver signals the file is complete.
 *
 * Wire (all messages carry an opaque `id` naming the session):
 *   in  { cmd: 'init',     id }
 *   in  { cmd: 'update',   id, block: ArrayBuffer }   — no reply, fire-and-forget
 *   in  { cmd: 'finalize', id }
 *   out { id, digest: string }                          — hex, lower-case
 *   in  { cmd: 'dispose',  id }
 *
 * Buffer ownership: `block` is CLONED into the worker (postMessage without a
 * transfer list). This is deliberate — the send pump still needs the block on
 * the main thread to slice into SCTP messages, and the receive path hands the
 * same buffer to the disk/memory sink. Transferring would detach the buffer
 * under the caller's feet mid-pump.
 *
 * CSP note (issue #48): loaded as a same-origin module worker
 * (`new Worker(new URL('./hashWorker.ts', ...), { type: 'module' })`) so
 * `worker-src 'self'` alone is enough — no need to loosen with `blob:` or
 * inline eval.
 */

import { init, update, finalize, toHex, type Sha256State } from "./sha256";

type InMessage =
  | { cmd: "init"; id: string }
  | { cmd: "update"; id: string; block: ArrayBuffer }
  | { cmd: "finalize"; id: string }
  | { cmd: "dispose"; id: string };

// The tsconfig lib is DOM (main-thread flavored), so `self` types as Window.
// Cast to just the worker surface we touch — no need to pull in the WebWorker
// lib and risk clashing with DOM types elsewhere in the package.
interface WorkerCtx {
  addEventListener(type: "message", listener: (ev: MessageEvent<InMessage>) => void): void;
  postMessage(data: { id: string; digest: string }): void;
}
const ctx = self as unknown as WorkerCtx;

const sessions = new Map<string, Sha256State>();

ctx.addEventListener("message", (ev) => {
  const msg = ev.data;
  switch (msg.cmd) {
    case "init": {
      sessions.set(msg.id, init());
      return;
    }
    case "update": {
      const s = sessions.get(msg.id);
      if (!s) return;
      update(s, new Uint8Array(msg.block));
      return;
    }
    case "finalize": {
      const s = sessions.get(msg.id);
      if (!s) return;
      const digest = toHex(finalize(s));
      sessions.delete(msg.id);
      ctx.postMessage({ id: msg.id, digest });
      return;
    }
    case "dispose": {
      sessions.delete(msg.id);
      return;
    }
  }
});
