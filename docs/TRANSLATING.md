# Translating Warp

Warp's UI strings live in one typed dictionary (`web/src/lib/i18n.ts` — see
that file's header comment for the full contract, `#37`). This doc is the
practical walkthrough: fork, add a locale file, test it, open a PR.

There's no translation framework, no SaaS, and no runtime fetch — a locale is
just a TypeScript object checked in next to `en.ts`. Adding one is a genuinely
good first PR: it touches one file, and `tsc` catches typos in the keys for
you.

## Workflow

1. **Fork and branch** as usual (see [`CONTRIBUTING.md`](../CONTRIBUTING.md)),
   branch name like `i18n/pt-br`.
2. **Copy the English dictionary** as your starting point:
   ```bash
   cp web/src/locales/en.ts web/src/locales/<code>.ts
   ```
   `<code>` is a lowercase [BCP 47](https://en.wikipedia.org/wiki/IETF_language_tag)
   tag — `fr`, `de`, `pt-br`, `zh-hant`. Match what `Intl` and
   `navigator.languages` already use; don't invent your own scheme.
3. **Keep every key, translate every value.** The keys (`receive_heading`,
   `transfer_status_done`, …) are the contract with the rest of the app —
   don't rename or reorder them. `web/src/locales/id.ts` (Bahasa Indonesia)
   is a complete example to copy the shape from.
4. **Template functions keep their signature.** Some values aren't plain
   strings — they're functions, because English word order (`"3 files"`)
   doesn't hold in every language:
   ```ts
   // en.ts
   transfer_fanout: (n: number) => ` to ${n} devices`,
   // your locale — same parameter, translated template
   transfer_fanout: (n: number) => ` ke ${n} perangkat`,
   ```
   Keep the parameter count and order; only the string around it changes.
   If your language needs different grammar for different counts (plurals
   aren't just "singular vs. everything else" in every language), branch
   inside the function body — it's plain TypeScript.
5. **Export it as a `Partial<Strings>`:**
   ```ts
   import type { Strings } from "../lib/i18n";

   const pt = {
     receive_heading: "Receber um arquivo",
     // ...
   } satisfies Partial<Strings>;

   export default pt;
   ```
   `Partial` means you don't have to finish every key before shipping — a
   key you haven't translated yet just falls back to English at runtime
   (see `LocaleProvider` in `i18n.ts`). Ship a real, honest subset rather
   than blocking on 100% coverage.
6. **Register it in two places** (the app checks at startup that these two
   stay in sync and logs an error to the console if they don't):
   - `web/src/lib/i18n.ts` — import the file and add it to
     `localeDictionaries`.
   - `web/src/lib/localeDetect.ts` — add a `{ code, label, name }` entry to
     `AVAILABLE_LOCALES` (`label` is the short chip shown in the switcher,
     e.g. `"PT"`; `name` is the full name used for the `aria-label`).
7. **Run the app against it.** Fastest way: open the footer language
   switcher (`FooterCta.tsx`) — once your locale is registered, it appears
   there and picking it flips the whole session. To check autodetection
   instead of the manual switcher, set your browser's preferred language to
   match your locale code before loading the page (`navigator.languages`
   is what `pickBestLocale` matches against). Walk `/`, `/send` (or
   `/r/<code>` from a second tab/device), and `/receive` — those are the
   surfaces currently wired to the dictionary (`ReceiveEntry.tsx`,
   `TransferFlow.tsx`, `SessionView.tsx`, `NearbyDevices.tsx`).
8. **Check string length at 360–430px.** Warp is mobile-first
   ([`CONTRIBUTING.md`](../CONTRIBUTING.md) hard constraint #4) and some
   languages run noticeably longer than English (German, Finnish). If a
   translated string overflows or wraps badly at phone width, it's fine to
   shorten it — a slightly less literal translation that fits beats a
   literal one that breaks layout.
9. **Verify and open the PR:**
   ```bash
   pnpm lint && pnpm typecheck && pnpm --filter @warp/web build
   ```
   Link the parent issue ([`#37`](https://github.com/Ishannaik/warp/issues/37))
   and say which surfaces you walked through by hand.

## What NOT to translate

- **The Warp wordmark** (`WARP` / the brand name anywhere it appears as a
  proper noun) — a brand name doesn't get localized.
- **Room codes and their format hint characters** (`A–Z`, `2–9`, the
  excluded `I`, `L`, `O`) — the code alphabet itself is fixed by the
  signaling server (see the room-code regex in
  [`ARCHITECTURE.md`](./ARCHITECTURE.md)); only the sentence explaining it
  should be translated.
- **Design-token / UI-chrome glyphs baked into a string** — arrows (`→`,
  `←`, `↓`, `↑`), the copy/download icons (`⧉`, `⤓`), checkmarks (`✓`,
  `✕`). These are visual, not linguistic; leave them as-is around your
  translated text.
- **Anything outside the dictionary.** The `/how` theory long-form and the
  landing-page marketing sections (`web/src/sections/**`, `web/src/legal/**`)
  are explicitly out of scope for now (see `#37`) — don't hardcode
  translated strings there yet.

## A note on quality over speed

Machine-translated strings passed off as a finished locale get rejected in
review — they read wrong to native speakers in ways that are hard to catch
otherwise, and Warp's copy leans on specific tone (terse, a little dry) that
translation tools flatten. If you're not confident in a full translation,
open an honest partial locale instead: translate what you're sure of, leave
the rest for English fallback, and note in the PR which keys still need a
native speaker. That's a real, useful contribution — a stub said out loud
beats fake fluency.

## Claiming a language

Comment on [`#37`](https://github.com/Ishannaik/warp/issues/37) with the
language you're adding before you start, so two people don't translate the
same one. If nobody's claimed your language yet, it's yours.
