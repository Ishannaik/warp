# Warp promo video — production plan & storyboard

> ~26s square MP4 for social/launch, built in **Remotion** (React programmatic video).
> Handed to a builder: everything below is concrete and buildable with `remotion` + `@remotion/google-fonts` — no invented APIs.

**Format decision: 1080×1080 @ 30fps, 780 frames (26.0s).** Square wins for launch: it's the max feed real estate on X and Instagram simultaneously (16:9 gets letterboxed to a strip on phones, 9:16 gets cropped on X), one render covers both, and Warp's UI mock (a single dark panel) composes naturally centered in a square. If a 16:9 variant is wanted later, the scenes are all centered layouts — re-rendering at 1920×1080 with wider side padding is a config change, not a redesign.

---

## Brand constants (single `theme.ts` in the Remotion project)

```ts
export const BG = "#121110";      // page background
export const PANEL = "#15140f";   // UI window background (from TransferWindow)
export const INK = "#efe9da";     // headings / bright text
export const BODY = "#a8a293";    // body text
export const MUTED = "#6f6a5d";   // mono chrome / labels
export const ACC = "#5360ff";     // accent (blue)
export const AMB = "#ef6a3d";     // amber (active/warning)
export const HAIRLINE = "rgba(239,233,218,.14)";
```

Fonts (all three are on Google Fonts, so `@remotion/google-fonts` covers them):

```ts
import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

const bricolage = loadBricolage("normal", { weights: ["700", "800"] });
const archivo = loadArchivo("normal", { weights: ["400", "500"] });
const jetbrains = loadJetBrains("normal", { weights: ["400", "600"] });
// use bricolage.fontFamily etc. in styles
```

Type roles (mirrors the site): **Bricolage Grotesque 800, uppercase, letter-spacing -0.03em, line-height 0.9** for display lines; **Archivo** for sentences; **JetBrains Mono, uppercase, letter-spacing .12–.16em, 20–26px** for all UI-chrome labels/status text.

Reusable visual language (steal directly from `web/src/hero/`):

- **Logo**: copy `web/src/WarpLogo.tsx` into the Remotion project, replace `var(--acc)` with `#5360ff` and stroke `#121110` stays (no CSS vars in Remotion).
- **UI window**: `#15140f` panel, `1px solid rgba(239,233,218,.22)` border, hairline row dividers, mono column headers at 9.5px-equivalent (scale ×2 for 1080px canvas → ~20px), square corners everywhere (the brand has **zero border-radius** — keep it that way).
- **Progress bars**: 12px tall, track `rgba(239,233,218,.09)`, fill amber `#ef6a3d` while active → accent `#5360ff` when done, plus the moving 60px white-gradient "scan" highlight (`linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent)` translated across the fill each ~2s).
- **Status dots**: 12–14px hard squares (not circles), blinking via `steps(1)`-style frame math: `opacity: Math.floor(frame / 12) % 2`.
- **Corner crosshairs**: the landing page's 13px `+` marks in the four canvas corners at 0.45 opacity — cheap, instantly "Warp".

Motion vocabulary: one spring for pop-ins everywhere — `spring({ frame, fps, config: { damping: 200 } })` driving `scale: 0.9→1` + `opacity 0→1`, and the hero's "rise" for display lines: `translateY: interpolate(sp, [0,1], [60, 0])` inside an `overflow: hidden` wrapper (this is the `warpRise` effect from `Hero.tsx`). Stagger sibling elements by 4–6 frames.

---

## 1 · Storyboard (6 scenes, 780 frames total)

Copy priority order (from competitive intel): **never touches a server** → **no signup/app** → **drag → QR → accept → done** → **it never dies (resume, not restart)**.

### S1 — Cold open: the mark (0.0–2.5s · frames 0–74)

- **Copy:** `WARP` (display, ~180px) · mono sub-line `PEER-TO-PEER FILE TRANSFER`
- **Visual:** Pure `#121110`. Frame 0–12: the accent logo tile (WarpLogo, 140px) springs in center-screen (scale 0.5→1, damping 200). Frame 10: the four W-A-R-P letters rise from behind a clip mask beside it, staggered 4 frames each (warpRise). Frame 40: mono sub-line fades in below at `MUTED`, letter-spacing .16em. Corner crosshairs fade to 0.45 opacity over frames 0–20 and persist for the whole video.
- **Transition out:** frames 66–74, the whole lockup scales to 0.92 and fades as S2's window pops over it (8-frame overlap).

### S2 — Drag it in (2.5–6.5s · frames 75–194)

- **Copy:** display line `NO SIGNUP.` / `NO APP.` (two rising lines) · mono corner tag `01 / DROP`
- **Visual:** The Warp transfer window (title bar `■ WARP — TRANSFER QUEUE`, mono, hairline borders) springs in, ~800px wide, lower two-thirds. Inside: an empty drop zone — 1px dashed `rgba(239,233,218,.25)` rectangle, mono hint `DROP FILES HERE`. Frames 105–140: a file chip (`album-masters.zip · 12.4 GB`, Archivo 500 + mono size) glides in from top-right along an eased curve with a slight -4° tilt, "drops" at frame 140 — dashed border flashes `ACC` for 6 frames, chip snaps into a queue row (row #01, square status icon, 0% bar). Display copy rises top-left frames 80–100.
- **Transition out:** window stays; copy block cross-fades to S3's copy (frames 186–198). The window is the persistent stage for S2→S5 — continuity sells the "one flow" story.

### S3 — Share the code (6.5–10.5s · frames 195–314)

- **Copy:** display `SHARE A LINK.` / `OR A QR.` · mono: room code `K7XW2Q` + `WARP.ISHANNAIK.COM/R/K7XW2Q`
- **Visual:** A side panel unfolds from the window's right edge (width interpolates 0→320px, frames 195–215): white-on-`PANEL` **QR code** (pre-generated SVG asset — see §2, don't render QR at runtime) springs in, with the 6-char room code below it in JetBrains Mono 600 at ~44px, letters typed on 2-frames-per-char. Frame 260: a second, smaller device frame (phone outline, 1px `HAIRLINE` stroke) pops in at right; a mono status line under the QR flips `WAITING FOR PEER…` (blinking amber square) → `● PEER JOINED` in `ACC` at frame 290. Receiver-consent nod: tiny mono `THEY REVIEW → ACCEPT` under the phone.
- **Transition out:** hard cut on the beat at frame 315 (QR panel collapses in 6 frames).

### S4 — The architecture claim (10.5–15.5s · frames 315–464)

- **Copy:** display `YOUR FILE NEVER` / `TOUCHES A SERVER.` · mono sub `PRIVACY IS ARCHITECTURE — NOT POLICY.`
- **Visual:** The window shrinks to a bottom strip (progress context stays visible: bar starts filling, amber, mono throughput `2.1 GB/S` counting with jitter every 6 frames, tabular numerals). Main stage: two 120px device squares left & right (each holding a small logo tile), a **server glyph** (rack outline, 1px stroke) center. Frames 330–360: an animated dashed line tries to route through the server — then the server glyph gets struck through (1px `AMB` line draws across it, frames 360–370), greys to 0.25 opacity and drops 40px down; simultaneously a **straight accent line** draws directly device-to-device across the top (`strokeDashoffset` interpolated over frames 365–395), with 8px square "packets" traveling along it (3 packets, looping, `translateX` via frame modulo). Display copy rises frames 340–365; mono sub fades in at 400.
- **Transition out:** devices + line slide down to merge with the window strip as it grows back to full size (frames 456–470, 8-frame overlap into S5).

### S5 — It never dies (15.5–21.5s · frames 465–644) — **the money beat**

- **Copy:** mono status sequence `▮ 90%` → `RECONNECTING…` → `RESUMED @ 90%` · display `IT NEVER DIES.` · mono footnote `BYTE-EXACT RESUME. OTHERS RESTART AT 0.`
- **Visual:** Full window again, one big progress bar. Frames 465–520: bar runs 62%→90% (amber, scan highlight, % counter in mono). **Frame 520 — the drop:** scan highlight freezes, bar desaturates to 40% opacity, status flips to blinking amber `RECONNECTING…`, a subtle 2px horizontal jitter on the window (`translateX: ±2` alternating every 3 frames, frames 520–545), throughput reads `— GB/S`. Hold the tension ~1.2s. **Frame 556 — the resume:** a clean accent flash sweeps the bar left→right (12 frames), status snaps to `● RESUMED @ 90%` in `ACC`, bar instantly *continues from 90*, throughput numbers return. Frames 560–590: below the bar, a small greyed comparison row slides in: muted bar snapping from 87% back to `0%` labeled `EVERYONE ELSE` in `MUTED` strikethrough — 1.5s on screen, understated, no competitor names. Display line `IT NEVER DIES.` rises at frame 570 above the window; footnote fades in at 600.
- **Transition out:** bar reaches 100% exactly at frame 640 → hard cut.

### S6 — Done + CTA (21.5–26.0s · frames 645–779)

- **Copy:** mono `✓ DONE — 12.4 GB · DIRECT · ENCRYPTED` · display `WARP` (wordmark + tile) · mono CTA `WARP.ISHANNAIK.COM` · mono tags `FREE · OPEN-SOURCE · NO ACCOUNT`
- **Visual:** Frames 645–665: the bar's fill snaps amber→`ACC`, an accent square check-chip springs in, the done-line stamps in mono. Frames 670–700: UI window scales down/fades; the S1 logo lockup springs back center (bigger, 160px tile), URL types on underneath in JetBrains Mono ~40px (2 frames/char), tag line fades in at `MUTED` with the `•` separators from the hero. Frames 700–770: everything holds (breathing 1.00→1.01 scale loop) — a full 2s+ static hold so the URL is screenshot-able and legible on loop platforms. Frames 770–779: fade to `#121110` (also makes the loop point clean against S1's black open).

---

## 2 · Remotion architecture

**Project:** a new `promo/` workspace folder (keep it out of `web/`'s build) — `pnpm create video` (Remotion template, TypeScript), or add `remotion`, `@remotion/cli`, `@remotion/google-fonts` to a fresh package. Register in workspace as `@warp/promo`.

**Composition (Root.tsx):**

```tsx
<Composition
  id="WarpPromo"
  component={WarpPromo}
  durationInFrames={780}
  fps={30}
  width={1080}
  height={1080}
/>
```

**Component tree:**

```
WarpPromo.tsx                 // <AbsoluteFill bg=#121110> + <Audio> + crosshairs overlay
├─ <Series>
│   ├─ <Series.Sequence durationInFrames={75}>  <S1LogoOpen/>
│   ├─ <Series.Sequence durationInFrames={120} offset={-8}> <S2Drop/>      // 8-frame overlap
│   ├─ <Series.Sequence durationInFrames={120}> <S3ShareQr/>
│   ├─ <Series.Sequence durationInFrames={150}> <S4Direct/>
│   ├─ <Series.Sequence durationInFrames={180} offset={-8}> <S5NeverDies/>
│   └─ <Series.Sequence durationInFrames={143}> <S6Cta/>    // 135 + 8 to compensate offsets
├─ shared/theme.ts            // tokens above
├─ shared/WarpLogo.tsx        // copied from web/src/WarpLogo.tsx, hex literals
├─ shared/Window.tsx          // title bar + hairline chrome, children = panel body
├─ shared/ProgressBar.tsx     // pct prop, active|done|stalled variant, scan highlight
├─ shared/RiseText.tsx        // warpRise: clip-mask + spring translateY, stagger prop
├─ shared/MonoLabel.tsx       // JetBrains Mono uppercase tracking label
└─ shared/Crosshairs.tsx      // 4 corner marks
```

Each `<Series.Sequence>` resets `useCurrentFrame()` to 0 for its scene — all scene-internal frame numbers in the storyboard are local. Adjust the `offset` bookkeeping so total stays 780.

**Primitives used (all core Remotion, nothing exotic):**

- `useCurrentFrame()` + `useVideoConfig()` (fps for springs) — every scene.
- `spring({ frame, fps, config: { damping: 200 } })` — all pop-ins/rises (damping 200 = the site's snappy no-wobble ease).
- `interpolate(frame, [a, b], [x, y], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })` — bars, counters, fades, line draws. `Easing.bezier(0.2, 0.8, 0.2, 1)` matches the site's cubic-bezier.
- `<Series>` / `<Sequence>` — scene sequencing (above). Plain negative `offset` overlaps + opacity interpolation for the two cross-fades; no extra transition package needed.
- `<Audio src={staticFile("music.mp3")} volume={(f) => …} />` — music with frame-function volume (see §3).
- `staticFile()` — music + QR asset from `promo/public/`.
- Counters: derive text from frame math (`Math.round(interpolate(...))`), render in JetBrains Mono with `fontVariantNumeric: "tabular-nums"` so digits don't jitter layout.

**QR code:** do **not** render a QR library inside components per-frame. Generate once ahead of build — `npx qrcode -o public/qr.png -w 512 "https://warp.ishannaik.com/r/K7XW2Q"` (the `qrcode` npm CLI) or reuse the site's QR generation — commit the PNG/SVG to `promo/public/`, recolor via CSS filter or generate with `--color` options to `#efe9da` on `#15140f`, and place it with `<Img src={staticFile("qr.png")}/>`.

**Preview loop:** `npx remotion studio` for scrub-preview while building; check every scene at frame boundaries.

---

## 3 · Music

**Vibe:** clean modern electronic — bright synth chords, tight percussive pulse, forward momentum, zero corporate-cheese ukulele/whistle. Future-bass/electronica energy suits "warp speed" without being aggressive.

**Primary track (verified real, license-clear):**

> **"Bright Energetic Electronica" — penguinmusic** (Pixabay Music)
> https://pixabay.com/music/future-bass-penguinmusic-bright-energetic-electronica-12635/
> Future bass · 1:26 · **Pixabay Content License** — free for commercial use, no attribution required, cleared for social posting. Download the MP3 from that page into `promo/public/music.mp3` (Pixabay also lets you download a license confirmation from the track page — save it next to the file as `music-license.pdf` for the record).

**Backup (same artist, same license, calmer):** "Modern Chillout (Future Calm)" — penguinmusic, https://pixabay.com/music/upbeat-penguinmusic-modern-chillout-future-calm-12641/ — use if the primary feels too hot against the reconnect beat.

**Audio timing** (`<Audio>` `volume` as a frame function):

- Use the track from its start (`startFrom={0}`); it's 1:26, we take the first 26s.
- **Fade in** frames 0–15 (0→0.85). Master level 0.85, never 1.0 (leave headroom; the mix should never clip after encode).
- **Cut sync:** after importing, scrub the waveform in Remotion Studio and nudge the S3→S4 (frame ~315) and S5→S6 (frame ~645) cuts by ±5 frames to land on the nearest downbeat — the storyboard durations have that slack built in; keep total at 780 by adjusting the neighbor scene.
- **The drop beat:** duck volume to 0.45 across S5 frames 520–556 (the `RECONNECTING…` stretch) with 8-frame ramps, then pop back to 0.85 exactly on the resume flash — the music itself performs the "it never dies" recovery.
- **Fade out** frames 735–779 (0.85→0) so the end card resolves quietly.

Hard rule restated for the builder: **only this track or the named backup** — both Pixabay Content License. No YouTube-library rips, no "found" tracks, nothing needing attribution negotiation.

---

## 4 · Render settings

```bash
npx remotion render WarpPromo out/warp-promo.mp4 \
  --codec=h264 \
  --crf=20 \
  --audio-bitrate=192k
```

- **Container/codec:** MP4 / h264, `yuv420p` (Remotion default — universally playable on X/IG/Discord).
- **Dimensions/fps/duration:** 1080×1080 · 30fps · 780 frames = 26.0s.
- **Quality/size:** CRF 20. This content is dark flat panels + type — extremely compressible; expect **6–12 MB**, comfortably under the 25 MB Discord cap. Verify with `ls -lh`; if it somehow exceeds ~20 MB, re-render at `--crf=23` (still visually clean on this material). Do not go below CRF 18 (pointless size) or above 26 (hairlines and 1px strokes start smearing).
- **Audio:** AAC 192 kbps (flag above).
- **QC pass before posting:** play at 1× on a phone-sized screen — check (1) mono labels legible, (2) the 90% resume beat reads in one viewing, (3) URL end-card holds ≥2s, (4) no clipped audio at the drop, (5) file < 25 MB.

---

*Reference sources for visual parity while building: `web/src/hero/Hero.tsx` (warpRise, ticker, crosshairs, status strip), `web/src/hero/TransferWindow.tsx` (window chrome, queue rows, progress/scan, peer rows), `web/src/WarpLogo.tsx` (mark), `docs/competitive-intel-2026-07.md` §1 + §4 (messaging).*
