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
 * real divide. Warp's own zero-code "Nearby" radar (`web/src/nearby/`,
 * `useNearby.ts`) landed since the competitive-intel doc was written, so
 * this page compares it against PairDrop's LAN discovery directly instead
 * of treating it as a Warp gap.
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
    warp: { value: "✓", ok: true },
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
    heading: "Both do zero-code discovery, differently",
    body: (
      <>
        <P>
          PairDrop's pitch is Snapdrop-style discovery: open the app on two devices on the same network and they
          just find each other, no code to type or read out loud. Its own README puts it plainly — "all peers
          connected with private IPs are discoverable by each other." Warp has its own version of this — the
          "Nearby" radar on the home screen surfaces other devices sharing your public IP and lets you send
          straight to one, no code either.
        </P>
        <P>
          The mechanism differs: PairDrop groups devices by local (private) IP, so it stays accurate through
          double-NAT or carrier-grade setups where several LANs can share one public address. Warp groups by
          public IP, which is right for the common case (one router, one Wi-Fi network) but can occasionally
          surface a device that's on the same public IP but a different local network, or miss one behind its
          own separate NAT.
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
        Both are free, open-source, and give you zero-code discovery between nearby devices without a browser
        extension or account. Where they split is off-network: PairDrop's TURN relay pushes a file through when
        direct WebRTC can't connect, and its private-IP discovery holds up on trickier network topologies. Warp's
        answer is the guarantee that no server — including a relay you didn't choose to trust — ever sees the
        file's bytes, on any network, even when it means the transfer fails instead.
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
          PairDrop and Warp both do zero-code discovery of nearby devices, and both fall back to a room code when
          you're not on the same network — but PairDrop backs its off-network path with its own TURN relay, while
          Warp skips the relay entirely, on every network, at the cost of failing outright on the restrictive
          networks where PairDrop's relay still gets through.
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
