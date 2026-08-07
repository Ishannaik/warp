import VsPage, { A, P, type VsFeatureRow, type VsSection } from "./VsPage";

/**
 * /vs/pairdrop — Warp vs PairDrop (#152, part 2 of 3 of #120).
 *
 * Every claim about PairDrop traces to its own repository
 * (https://github.com/schlagmichdoch/PairDrop), fetched 2026-08-08: the
 * README's own words are "devices outside of your local network that are
 * behind a NAT are auto-connected via the PairDrop TURN server," and "all
 * peers connected with private IPs are discoverable by each other." License
 * is GPL-3.0, confirmed via the GitHub API. That TURN relay for
 * off-LAN devices — the exact thing Warp refuses to run, ever — is the
 * whole story here, alongside PairDrop owning the zero-code LAN-discovery
 * experience Warp doesn't have yet (docs/competitive-intel-2026-07.md §1,
 * §5 item 6).
 */

const FEATURES: VsFeatureRow[] = [
  {
    label: "Server never touches your file bytes",
    warp: { value: "✓", ok: true },
    rival: { value: "Only on your LAN", ok: false },
  },
  {
    label: "Works on a restrictive/symmetric NAT",
    warp: { value: "✗", ok: false },
    rival: { value: "✓ via TURN relay", ok: true },
  },
  {
    label: "Zero-code auto-discovery of nearby devices",
    warp: { value: "✗", ok: false },
    rival: { value: "✓", ok: true },
  },
  {
    label: "Installable as a PWA",
    warp: { value: "✗", ok: false },
    rival: { value: "✓", ok: true },
  },
  {
    label: "No account needed",
    warp: { value: "✓", ok: true },
    rival: { value: "✓", ok: true },
  },
  {
    label: "Free & open-source",
    warp: { value: "✓", ok: true },
    rival: { value: "✓", ok: true },
  },
];

const SECTIONS: VsSection[] = [
  {
    n: "01",
    heading: "The LAN experience is genuinely better",
    body: (
      <>
        <P>
          PairDrop's whole pitch is Snapdrop-style discovery: open the app on two devices on the same network and
          they just find each other, no code to type or read out loud. Its own README puts it plainly — "all peers
          connected with private IPs are discoverable by each other." Warp doesn't have that yet. Every transfer
          starts with a room code, on every network, LAN or not.
        </P>
        <P>
          If you're moving a file between your own laptop and phone on the same Wi-Fi, PairDrop's zero-code flow is
          the faster path today.
        </P>
      </>
    ),
  },
  {
    n: "02",
    heading: "What happens once you leave the LAN",
    body: (
      <P>
        That's also where the two tools diverge. PairDrop's own docs say it directly: "devices outside of your local
        network that are behind a NAT are auto-connected via the PairDrop TURN server." Off-LAN, the file stops being
        a pure browser-to-browser transfer and routes through PairDrop's relay infrastructure — the same public
        instance at pairdrop.net, unless you self-host your own. Warp never does this. It's STUN-only by design, so
        a Warp transfer either goes direct or fails outright — there's no relay path for it to fall back to, on any
        network.
      </P>
    ),
  },
  {
    n: "03",
    heading: "Where Warp gives something up",
    body: (
      <P>
        The trade-off is the flip side of the same design decision. On a restrictive or symmetric NAT — some
        corporate networks, some carrier-grade NAT setups — PairDrop's TURN relay gets the file through where Warp
        just fails, honestly, with an error instead of a silent retry. That's the deliberate cost of never running a
        relay: a real category of connections Warp can't currently complete.
      </P>
    ),
  },
  {
    n: "04",
    heading: "Verdict",
    body: (
      <P>
        Both are free, open-source, and ask nothing of you but a browser. If you want zero-code discovery between
        devices on the same network, or a relay that'll push a file through when direct WebRTC can't connect,
        PairDrop covers that today. If you want the guarantee that no server — including a relay you didn't choose
        to trust — ever sees the file's bytes, on any network, that's what Warp is built to hold to, even when it
        means the transfer fails instead.
      </P>
    ),
  },
];

export default function PairDrop() {
  return (
    <VsPage
      rivalName="PairDrop"
      eyebrow="Comparison · Warp vs PairDrop"
      title="Warp vs PairDrop"
      lead={
        <P>
          PairDrop nails zero-code discovery between devices on the same network, and falls back to its own TURN
          relay once you leave it. Warp skips the relay entirely, on every network — at the cost of failing outright
          on the restrictive networks where PairDrop's relay still gets through, and not yet having PairDrop's
          same-network auto-discovery.
        </P>
      }
      features={FEATURES}
      sections={SECTIONS}
      sourcesNote={
        <>
          PairDrop facts checked against its own{" "}
          <A href="https://github.com/schlagmichdoch/PairDrop">GitHub repository</A> and README (fetched
          2026-08-08). Warp's architecture: <A href="https://github.com/Ishannaik/warp/blob/main/docs/ARCHITECTURE.md">docs/ARCHITECTURE.md</A>.
        </>
      }
    />
  );
}
