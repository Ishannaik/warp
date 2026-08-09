# Warp competitive intelligence

Generated 2026-08-09. Every claim tagged `[Data]` fetched and citable,
`[Estimate]` derived with arithmetic shown, `[Assumption]` asserted, `[Opinion]`
judged.

## Executive summary

Warp's exact niche, browser-based no-install P2P transfer, is genuinely
stagnant: ToffeeShare last shipped a feature in 2023, Wormhole's team moved to
another product, Snapdrop was acquired and degraded. But the adjacent space is
not stagnant at all, and that is where the real competition sits: croc released
three days ago, LocalSend was pushed today with 87k stars. Warp has 10 stars
[Data, 2026-08-09], so the constraint is not features and not competitor
strength. Every product in this market is free, which means there is no pricing
whitespace to attack, only an attention problem. The one defensible claim Warp
has is that it never stores a byte, and Wormhole, its closest polished
competitor, does store files up to 5 GB server-side for 24 hours.

## The belief being tested

"Nobody else does truly serverless, $0, open-source browser file transfer."

**Verdict: mostly true, and less valuable than it sounds.** PairDrop, Snapdrop
and FilePizza are all open source and browser based. What none of them combine
is open source, actively maintained, and no relay. The gap is real but narrow,
and no user is searching for it.

## Market concentration

**Fragmented, with a dominant adjacent player.** [Data]

| Project | Stars | Last push | Open issues | Licence | Latest release |
|---|---:|---|---:|---|---|
| localsend/localsend | 87,118 | 2026-08-09 | 1,051 | Apache-2.0 | v1.17.0 (2025-02-20) |
| schollz/croc | 39,544 | 2026-08-08 | 6 | MIT | v11.0.2 (2026-08-06) |
| magic-wormhole | 22,797 | 2026-07-26 | 178 | MIT | — |
| RobinLinus/snapdrop | 19,706 | 2025-02-10 | 288 | GPL-3.0 | — |
| schlagmichdoch/PairDrop | 11,138 | 2026-04-22 | 107 | GPL-3.0 | v1.11.2 (2025-02-24) |
| kern/filepizza | 10,130 | 2026-08-05 | 48 | BSD-3 | none |
| timvisee/ffsend | 7,366 | 2025-11-20 | 33 | GPL-3.0 | — |
| **Ishannaik/warp** | **10** | 2026-08-09 | 126 | MIT | — |

All figures from `gh api` on 2026-08-09. ToffeeShare and Wormhole are closed
source and have no repo to measure.

## Correction to an earlier claim

I previously told Ishan "your competitors have stopped shipping, all of them."
**That was too strong and I am striking it.** [Data]

- croc released **v11.0.2 on 2026-08-06**, three days ago.
- LocalSend was **pushed today**, 2026-08-09.
- PairDrop's last tagged release is 2025-02-24, but its last push is 2026-04-22,
  so code is moving even though releases stopped.

The accurate statement is narrower: **tagged releases have stopped in the
browser-based niche, while the native and CLI tools are shipping normally.**
That distinction matters because it changes who Warp is actually losing to.

## Pass 1: product and pricing

**Every product in this market is free.** [Data] No paid tier exists anywhere in
the set. PairDrop, Snapdrop, LocalSend, FilePizza and croc take donations.
ToffeeShare runs non-personalised ads. Wormhole has mentioned a future Pro plan
with no live pricing.

**There is no pricing whitespace.** [Opinion] A pricing analysis of a market
where the price is universally zero has one finding: competing on price is not
available, and neither is monetisation without breaking the category norm.

**Wormhole stores files.** [Data] Files up to 5 GB are encrypted and cached on
their servers for 24 hours; only larger transfers go direct P2P. This is the
single most useful finding in the report, because Warp's "no server ever holds a
byte" is literally true and Wormhole's is not.

## Pass 2: what customers say

The complaint that recurs across every closed-source competitor is
verifiability, not capability.

> "wormhole.app is closed source, we actually dont know what they are doing with the data"
> — r/webdev, January 2026

> "It's blazingly fast. But, it's not open source."
> — r/opensource, on ToffeeShare

Snapdrop draws the reliability complaints:

> "Snapdrop used to be the go-to alternative, but it's been really unreliable lately."
> — r/UMT_, March 2026

> "it's local-only which means it falls apart when one phone is on cellular and the other on wifi."
> — r/SideProject, May 2026

That last quote describes a problem Warp already solves, since Warp uses STUN to
punch across networks rather than requiring a shared LAN. [Data]

**Language map.** The words real users type: "AirDrop for Windows and Android",
"Snapdrop alternative", "Firefox Send replacement", "send large files browser to
browser no limit", "transfer file between iPhone and Android". [Data] Nobody
searches for "serverless" or "peer to peer" as a benefit. They search for a
device pair and a size problem.

## Pass 3: go-to-market

**Discovery is migration traffic.** [Data] The highest-intent queries are
alternative-seeking: people whose previous tool died. Firefox Send shut down and
its refugees still generate search volume; Snapdrop degraded after the LimeWire
acquisition and PairDrop absorbed that traffic.

**Nobody in this market runs ads.** [Data] Growth is organic search plus
recommendation threads in r/selfhosted, r/privacy, r/software and r/androidapps.

**Channel assessment.** [Opinion] Warp's 8 SEO landing pages, currently sitting
in open PRs, are aimed at exactly the right queries. The `/vs/` comparison pages
target migration traffic, which is the one channel this market demonstrably has.
That is an argument for merging them that I did not have before this research.

Do not launch on Hacker News or Product Hunt. Both are dead as distribution in
2026. The attention in this category lives in subreddit recommendation threads
and in search results for a competitor's name.

## Where to compete

1. **Never storing a byte, said plainly.** [Opinion] It is true for Warp and
   false for Wormhole under 5 GB. This is the only claim in the set that is both
   differentiated and checkable.
2. **Cross-network transfer.** [Data] Snapdrop's loudest complaint is LAN-only
   failure. Warp already works phone-on-cellular to laptop-on-wifi.
3. **Open source and actively maintained together.** [Data] PairDrop is open but
   has not tagged a release in 18 months. ToffeeShare and Wormhole are polished
   but closed.

## Where not to compete

1. **Feature parity with PairDrop.** [Opinion] Warp's board already has issues
   for every gap except HEIC conversion. Building more features does not fix 10
   stars.
2. **Against croc or LocalSend.** [Opinion] Different category, vastly more
   traction, and both actively maintained. A browser tool does not beat an
   installed CLI on the CLI's ground.
3. **On price.** Everything is already free.

## Moat assessment

**Weak.** [Opinion] Warp's architecture is replicable in a weekend by anyone who
has read the WebRTC data channel docs. The $0 constraint is a discipline, not a
barrier. What compounds instead is the contributor base: 20 merged PRs in two
days is a real signal, and an active repo is harder to copy than a feature.

## DATA GAPS

- **Team size for every competitor.** No employee counts are published for any
  of them. Not inventable.
- **Actual traffic.** No usage numbers for ToffeeShare, Wormhole or PairDrop.
  Stars are a proxy for developer attention, not for users.
- **Conversion of `/vs/` pages.** Untestable until they ship.

### Gap now closed: Warp's own search traffic

Pulled from Google Search Console, 2026-07-10 to 2026-08-08. [Data]

| Metric | Value |
|---|---|
| Impressions, 30 days | **10** |
| Clicks | 1 |
| Average position | 20.8 |

The only two queries that surfaced Warp at all were "warp share" (1 impression,
position 50) and "warp share session" (1 impression, position 29). Both are
people looking for a session-sharing feature in the Warp **terminal**, not for
file transfer.

For scale, `ishannaik.com/projects/minions-plugin` drew 187 impressions in the
same window. A side project page outperforms the product by 19x.

**This changes the priority order.** [Opinion] Warp is not losing a ranking
contest, it is absent from the index for every query that matters. Zero of the
high-intent terms in the language map ("Snapdrop alternative", "AirDrop for
Windows and Android", "send large files browser to browser") return it at all.
There is no traffic to protect and nothing to lose by publishing comparison
pages aimed squarely at those queries.

It also means the brand name is working against the product: "warp" is dominated
by the terminal emulator, so unqualified brand search will not find it.

## What would have to be true for this analysis to be wrong

The report assumes GitHub stars and push dates proxy for product health. That
breaks for closed-source products, so ToffeeShare and Wormhole are judged on
blog and npm dates instead, which is weaker evidence. If ToffeeShare has a
private roadmap and ships without blogging, "stagnant" is wrong about them.

It also assumes this market's users care about open source. The r/webdev and
r/opensource quotes are from developer subreddits, which is exactly where that
opinion concentrates. If Warp's real audience is non-technical people moving a
video between a phone and a laptop, the open-source claim is worth nothing to
them and the positioning should be cross-device convenience instead.

## Red flags

- **10 stars against a field of 7k to 87k.** [Data] The gap is three orders of
  magnitude and no feature closes it.
- **126 open issues on a 10-star repo.** [Data] croc has 6 open issues at 39k
  stars. Warp's board is being filled faster than it is being cleared, and a
  large issue count on a tiny project reads as abandonment risk to a visitor.

## Yellow flags

- Contributor volume is concentrated: one account opened 20 of 28 recent PRs.
- The `/vs/` pages depend on competitor names for traffic, which means the
  strategy is only as durable as those competitors' relevance.

## Sources

- `gh api` for all star, push, issue and release figures, fetched 2026-08-09
- ToffeeShare blog index, most recent post 2024-11-04 (verified by direct fetch)
- npm `wormhole-crypto`, last publish 2021-06-25
- PairDrop releases page, latest v1.11.2, 2025-02-24
- r/webdev (Jan 2026), r/opensource, r/UMT_ (Mar 2026), r/SideProject (May 2026)

## The three things users are asking for, which Warp already has

From the voice-of-customer pass. Every quote fetched live with a link. [Data]

**1. Cross-network transfer without VPN or port forwarding.**

> "Both were uninstalled within an hour because they require you to be on or
> setup some sort of network."
> — r/androidapps, on Blip and LocalSend

Warp punches across networks with STUN. No install, no LAN requirement.

**2. Resume that actually continues.**

> "if you stop a migration halfway through and then 'resume' it starts the
> entire thing over again"
> — r/selfhosted

> "I wanna be able to resume file transfer as soon as I reconnect."
> — r/selfhosted

Warp resumes from a durable byte offset and re-sends only the tail. The harness
asserts exactly this: "resume streamed only the 4-byte tail, not the whole file".

**3. One-shot send, not a sync engine.**

> "It's really not made for unidirectional data transfer. That last part is the
> biggest issue."
> — r/privacy, on Syncthing

Warp is a one-way push by design.

**The conclusion this forces.** [Opinion] Warp already answers the three most
articulated unmet needs in this market, and drew **10 search impressions in 30
days**. This is not a product gap. Every hour spent on features is an hour not
spent on the only problem that is actually binding.
