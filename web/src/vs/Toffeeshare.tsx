import VsPage, { A, P, type VsFeatureRow, type VsSection } from "./VsPage";

/**
 * /vs/toffeeshare — Warp vs ToffeeShare (#151, part 1 of 3 of #120).
 *
 * ToffeeShare is Warp's closest architectural twin: browser WebRTC over
 * STUN, no server storage, no size limit (docs/competitive-intel-2026-07.md
 * §1). Claims below are cross-checked against ToffeeShare's own site and
 * FAQ (https://toffeeshare.com, https://toffeeshare.com/faq — fetched
 * 2026-08-08): peer-to-peer over WebRTC/STUN, no file-size limit stated for
 * Firefox/Chrome/Edge (Safari capped around 4 GB by the browser itself, not
 * ToffeeShare's own limit), and its own troubleshooting entry for a
 * transfer that stalls mid-way is "restarting the transfer usually
 * resolves it" — there's no reconnect/resume path, you start over. A
 * repository search turned up no official ToffeeShare source repo, only
 * unrelated third-party clones, so it's treated as closed-source here.
 */

const FEATURES: VsFeatureRow[] = [
  {
    label: "Direct peer-to-peer, no server storage",
    warp: { value: "✓", ok: true },
    rival: { value: "✓", ok: true },
  },
  {
    label: "No file-size limit",
    warp: { value: "✓", ok: true },
    rival: { value: "✓", ok: true },
  },
  {
    label: "Recovers automatically after a dropped connection",
    warp: { value: "✓", ok: true },
    rival: { value: "Restart manually", ok: false },
  },
  {
    label: "No account needed",
    warp: { value: "✓", ok: true },
    rival: { value: "✓", ok: true },
  },
  {
    label: "Free & open-source",
    warp: { value: "✓", ok: true },
    rival: { value: "Closed-source", ok: false },
  },
];

const SECTIONS: VsSection[] = [
  {
    n: "01",
    heading: "The closest thing Warp has to a twin",
    body: (
      <P>
        ToffeeShare runs on the same core idea as Warp: WebRTC, browser-to-browser, no upload step, no size cap.
        Per its own <A href="https://toffeeshare.com/faq">FAQ</A>, it's built on WebRTC with STUN underneath — the
        same NAT-traversal layer Warp uses. Neither tool ever stores your file on a server. If you're comparing
        architectures, not feature lists, these two start from the same place.
      </P>
    ),
  },
  {
    n: "02",
    heading: "What happens when a transfer stalls",
    body: (
      <P>
        This is where the two diverge. ToffeeShare's own FAQ entry for "it says 100% but I don't see the file(s)"
        and "it starts downloading but then it stops halfway" both land on the same fix: restart the transfer from
        scratch. Warp treats a dropped connection as something to recover from, not restart from: signaling
        auto-reconnects, the sender attempts an ICE restart, and an unfinished send is automatically re-offered once
        the peer is back — the transfer picks up rather than starting over.
      </P>
    ),
  },
  {
    n: "03",
    heading: "Where Warp gives something up",
    body: (
      <P>
        ToffeeShare has been running longer and reports moving over 50 TB a month, with a dedicated app as a
        fallback to keeping a browser tab open. Warp is browser-only by design, so a transfer only survives as long
        as the tab stays open. And Warp is STUN-only with no TURN relay, ever — ToffeeShare's FAQ doesn't document a
        relay fallback either, so a hostile network (symmetric NAT, locked-down corporate Wi-Fi) can stall both
        tools the same way. Neither one hides that trade; Warp just says it up front.
      </P>
    ),
  },
  {
    n: "04",
    heading: "Verdict",
    body: (
      <P>
        If you want an established service with a mobile app and don't mind restarting a stalled transfer by hand,
        ToffeeShare gets the job done. If you want the source you can read, a transfer that survives a dropped
        Wi-Fi signal without you touching anything, and the same architectural guarantee — no server ever holds your
        file — Warp is built to be the one you don't have to trust blindly.
      </P>
    ),
  },
];

export default function Toffeeshare() {
  return (
    <VsPage
      rivalName="ToffeeShare"
      eyebrow="Comparison · Warp vs ToffeeShare"
      title="Warp vs ToffeeShare"
      lead={
        <P>
          ToffeeShare is Warp's closest architectural relative — WebRTC, peer-to-peer, no size limit, no server
          holding your files. The difference shows up the moment a connection drops: ToffeeShare's own fix is
          "restart the transfer," Warp's is to reconnect and pick up where it left off.
        </P>
      }
      features={FEATURES}
      sections={SECTIONS}
      sourcesNote={
        <>
          ToffeeShare facts checked against its own{" "}
          <A href="https://toffeeshare.com">site</A> and <A href="https://toffeeshare.com/faq">FAQ</A> (fetched
          2026-08-08). Warp's architecture:{" "}
          <A href="https://github.com/Ishannaik/warp/blob/main/docs/ARCHITECTURE.md">docs/ARCHITECTURE.md</A>.
        </>
      }
    />
  );
}
