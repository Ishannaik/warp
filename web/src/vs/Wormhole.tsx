import VsPage, { A, P, type VsFeatureRow, type VsSection } from "./VsPage";

/**
 * /vs/wormhole — Warp vs Wormhole.app (#153, part 3 of 3 of #120).
 *
 * Every claim about Wormhole.app traces to its own public FAQ
 * (https://wormhole.app/faq), fetched 2026-08-08. The FAQ splits behaviour
 * by file size: files up to 5 GB are uploaded to Wormhole's own servers and
 * held there for 24 hours; files over 5 GB switch to a direct
 * browser-to-browser transfer instead, with the sender's tab required to
 * stay open until the recipient finishes downloading. That server-storage
 * default for the common case is the whole story here — it's why the intel
 * report (docs/competitive-intel-2026-07.md §1) calls Wormhole.app "P2P
 * marketing over a storage relay."
 */

const FEATURES: VsFeatureRow[] = [
  {
    label: "Server never touches your file bytes",
    warp: { value: "✓", ok: true },
    rival: { value: "Only over 5 GB", ok: false },
  },
  {
    label: "No file-size limit",
    warp: { value: "✓", ok: true },
    rival: { value: "✗", ok: false },
  },
  {
    label: "Works on a restrictive/symmetric NAT",
    warp: { value: "✗", ok: false },
    rival: { value: "✓", ok: true },
  },
  {
    label: "Sender can close the tab mid-transfer",
    warp: { value: "✗", ok: false },
    rival: { value: "Under 5 GB only", ok: false },
  },
  {
    label: "No account needed",
    warp: { value: "✓", ok: true },
    rival: { value: "✓", ok: true },
  },
  {
    label: "Free & open-source",
    warp: { value: "✓", ok: true },
    rival: { value: "✗", ok: false },
  },
];

const SECTIONS: VsSection[] = [
  {
    n: "01",
    heading: "What actually happens to your file",
    body: (
      <>
        <P>
          Per Wormhole's own <A href="https://wormhole.app/faq">FAQ</A>, anything up to 5 GB is uploaded to
          Wormhole's servers and stored there for 24 hours before the link expires. That's the path almost every
          transfer takes — most files people send are well under 5 GB. Only once a file crosses that 5 GB line does
          Wormhole switch to a direct browser-to-browser transfer, and even then the sender has to keep their tab
          open until the recipient finishes downloading.
        </P>
        <P>
          Warp doesn't have a size threshold that changes the architecture. Every transfer, of any size, is a direct
          WebRTC connection between the two browsers — Warp's signaling server only ever brokers the handshake (room
          code, ICE candidates), never the file itself.
        </P>
      </>
    ),
  },
  {
    n: "02",
    heading: "Encryption is real either way",
    body: (
      <P>
        Wormhole encrypts files with 128-bit AES-GCM in the browser before upload, so the company can't read what's
        stored on its own servers for that 24-hour window. That's a genuine privacy design. It's just a different
        guarantee than "the file was never on a server" — Warp's DTLS-encrypted WebRTC channel means there's no
        server-held copy to encrypt in the first place, for any file size.
      </P>
    ),
  },
  {
    n: "03",
    heading: "Where Warp gives something up",
    body: (
      <P>
        Warp is STUN-only by design — no TURN relay, ever, for any file. That's what makes "your file never touches
        a server" true instead of a policy promise. The trade is that on a restrictive or symmetric NAT (some
        corporate networks, some carrier-grade NAT setups), Warp can fail to establish a direct connection at all.
        Wormhole's server-storage path for files under 5 GB sidesteps that problem entirely, at the cost of the file
        sitting on its infrastructure for a day. Pick based on which trade you'd rather make.
      </P>
    ),
  },
  {
    n: "04",
    heading: "Verdict",
    body: (
      <P>
        If your file is under 5 GB and you're on a network where WebRTC struggles, Wormhole's server hop will get it
        there when Warp can't. If you want the guarantee that no third party — including the tool you're using — ever
        holds a copy of the file, even briefly, Warp's the one built so that isn't optional.
      </P>
    ),
  },
];

export default function Wormhole() {
  return (
    <VsPage
      rivalName="Wormhole.app"
      eyebrow="Comparison · Warp vs Wormhole.app"
      title="Warp vs Wormhole.app"
      lead={
        <P>
          Wormhole.app markets itself as peer-to-peer, but for most transfers it isn't: files up to 5 GB are
          uploaded to Wormhole's own servers and held there for 24 hours. Warp skips the server entirely, for files
          of any size — at the cost of failing outright on some restrictive networks where Wormhole's server hop
          still works.
        </P>
      }
      features={FEATURES}
      sections={SECTIONS}
      sourcesNote={
        <>
          Wormhole.app facts checked against its own{" "}
          <A href="https://wormhole.app/faq">FAQ</A> (fetched 2026-08-08). Warp's architecture:{" "}
          <A href="https://github.com/Ishannaik/warp/blob/main/docs/ARCHITECTURE.md">docs/ARCHITECTURE.md</A>.
        </>
      }
    />
  );
}
