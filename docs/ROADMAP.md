# Warp Roadmap

> **North star: effortless + seamless.** No signup, no app, no config — pick a file, share a link or QR, hit accept, done. Nothing to learn.
>
> Everything below is sorted by **how much it makes Warp easier and more invisible** — not by how clever it is. Power and security features ride along *by default*, never adding a step. Grounded in [`docs/competitive-intel-2026-07.md`](./competitive-intel-2026-07.md).

---

## ✅ Shipped — the seamless foundation

- **Resume-from-last-byte + never-give-up reconnect + dual-drop room reclaim** → *"it just doesn't die on you."* This is the single biggest seamlessness win: every browser rival makes you restart a dropped transfer at 0; Warp reconnects and continues byte-exact.
- Mesh multi-device · review-before-receive · QR + link pairing · **LAN nearby discovery** (same-Wi-Fi devices appear, zero code) · straight-to-disk streaming (no size limit) · live reconnect/resume status UI · IndexedDB OOM fallback.

## 🥇 Now — make it *even more* effortless (ease-of-use first)

1. **[#41] Persistent device pairing** — your laptop ↔ phone skip the code entirely next time.
2. **[#42] Word-based code alias** — say `otter-maple-fox` out loud instead of spelling `K7P2QR`.
3. **[#9] Drop-to-QR** — the room opens the instant you drop a file (no extra click).
4. **[#26] Friendly device names** — real names, not hex peer-id prefixes.
5. Tiny frictions gone: **[#22] copy code · [#15] tab-title progress · [#14] warn-before-closing-mid-transfer**.
6. **[#32] NAT-failure diagnostic panel** — when it genuinely *can't* connect (STUN-only trade), tell the user *why* (VPN/CGNAT/symmetric NAT) and what to try — honest, never a silent dead end.

## 🥈 Next — trust & power, invisible by default

- **[#6] SHA-256 verify + badge → [#8] safety number → [#39] PAKE pairing** — security you never have to think about (the relay becomes provably unable to MITM).
- **[#10] folder structure · [#36] reload/crash resume · [#28]/[#33] service-worker streamed zip** — quietly removes limits (folders, tab-crash, RAM ceiling).
- **[#40] one-to-many broadcast** — opt-in mode, never in the 1-to-1 path.
- **[#7] live speed/ETA · [#27] LAN-vs-internet badge · [#31] DO rate-limit** — clarity + hygiene.

## 🥉 Later — polish, a11y, DX, growth

- **Accessibility:** [#18] real buttons · [#19] focus outlines · [#20] accessible accept dialog · [#21] aria-live · [#16] clipboard paste · [#17] dedupe queue · [#25] in-app QR scanner.
- **DX / quality:** [#23] run the check harnesses in CI · [#38] Playwright two-tab e2e · [#13] configurable signaling URL · [#24] self-hosting guide · [#29] background-tab notifications.
- **Reach:** [#34] installable PWA · [#35] Web Share Target · [#37] i18n.
- **Growth (from the intel report):** an "architecture, not policy" page · vs-competitor pages (WeTransfer / ToffeeShare / PairDrop / wormhole.app) · pain-point long-tail SEO ("file transfer keeps failing", "send files without uploading to a server", "snapdrop alternative").

## 🚫 Explicitly NOT building — this is the moat

TURN / any relay · hosted storage tier · WebTransport (client-server shaped) · WebCodecs · native apps / CLI. Every rival that added a relay bought reliability with **money or trust** — refusing that trade is precisely what makes Warp *"privacy is architecture, not policy."*

---

*Ordering favours seamlessness over cleverness. If a feature would add a step, a setting, or a decision to the core flow, it goes behind a default or gets cut. Contributions welcome — see [`CONTRIBUTING.md`](../CONTRIBUTING.md) and the [good-first-issues](https://github.com/Ishannaik/warp/issues?q=is:open+label:%22good%20first%20issue%22).*
