# Wrap — Explainer Content

> Source of truth for the `/how` deep-dive page (`web/src/theory/Theory.tsx`).
> Two parts. **PART A** explains *how Wrap works* (7 concepts, A1–A7). **PART B**
> explains *why a relay can never be completely free* as a descent through eight
> layers (L0–L7) plus a closing synthesis.
>
> Each concept/layer carries: an eyebrow, a heading, a lede, body prose, an
> optional pull-quote ("callout"), the verified figures, and a **DIAGRAM SPEC**
> describing exactly what the self-contained diagram component should render and
> animate. Diagram agents must follow the DIAGRAM SPEC. All diagrams are real
> CSS/SVG — no raster images — and must respect `prefers-reduced-motion`.
>
> Palette tokens available: `--acc` (#5360ff ultramarine), `--amb` (#ef6a3d
> amber), ink #efe9da, body #a8a293, muted #6f6a5d, dim #4a463c, card #15140f,
> darker #0e0d0a. Fonts: Bricolage Grotesque (display), Archivo (body),
> JetBrains Mono (mono/labels/eyebrows). Hairlines rgba(239,233,218,.12–.16).

---

## HERO

- **Eyebrow:** THE THEORY — IN PLAIN LANGUAGE
- **Headline:** No server / in the middle.
- **Sub:** Wrap moves a file straight from one device to another over an
  encrypted, peer-to-peer channel. Here is exactly how that works — and, at the
  end, the honest reason a relay-based service can never be truly free.
- **Signature diagram (hero):** the two-phase Flow diagram. Phase 1 — both peers
  reach *up* to a signaling server over dashed, content-free links ("brokering
  the handshake"). Phase 2 — the server dims and a solid, flowing, encrypted
  channel lights up *directly* between the two peers ("DTLS · your bytes, edge to
  edge"). The phases auto-toggle so the reader watches the relay step aside.

---

# PART A — How Wrap works

A literal walkthrough of the lifecycle of one transfer. Numbering 01–07 is real:
it traces the order things actually happen.

---

## A1 — Cloud vs. direct

- **Eyebrow:** 01 / THE PROBLEM
- **Heading:** Most transfers park your file on a stranger's computer.
- **Lede:** Upload to a typical sharing service and your file makes a detour: it
  travels *up* to a company's server, sits there as a complete copy, and only
  then travels *down* to whoever you sent it to.

**Body.**
That detour has real costs. Your file now exists on hardware you don't control,
often for far longer than the transfer itself — it can be scanned, logged,
retained, subpoenaed, or quietly leaked in a breach. You usually hit a size cap.
And the round trip is slower than it needs to be, because every byte goes up
before it can come down.

The uncomfortable part is that the server didn't need to see the file at all. It
was only ever a middleman — a place to leave the file so the other person could
pick it up later. Wrap removes the middleman: if two devices are both online,
the file goes directly between them.

- **Callout (amber):** If two devices are both online, the file should go
  directly between them. No third computer needs a copy.

**DIAGRAM SPEC — `CloudVsDirect`.**
A side-by-side comparison that animates the contrast.
- *Left panel ("CLOUD"):* sender → up to a cloud/server box → down to receiver.
  A file token rides the **two-leg** path: it climbs to the server, the server
  shows a persistent "stored copy" badge that lingers, then a second token
  descends to the receiver. Two hops, doubled distance, a copy left behind.
  Tint the cloud box amber to read as the cost/risk.
- *Right panel ("DIRECT"):* sender → receiver with **one** straight beam; a
  single token crosses once, accent-colored, no copy retained.
- Loop slowly. On `prefers-reduced-motion`, show both paths in their resting
  state (cloud copy visible, direct beam lit) with no token motion.

---

## A2 — WebRTC + the encrypted channel

- **Eyebrow:** 02 / PEER-TO-PEER
- **Heading:** A direct line between two browsers — that's WebRTC.
- **Lede:** Peer-to-peer means the two devices talk to each other, not through a
  hub. The browser already ships with the machinery to do this: a built-in
  standard called **WebRTC**.

**Body.**
WebRTC was designed for live video calls, where routing every frame through a
server would be slow and expensive. So browsers learned how to open a direct
connection between two machines and stream data across it. Wrap uses that exact
capability — not for video, but for your files, over a **DataChannel** that is
wrapped in **DTLS** encryption by the standard itself. Encryption isn't a
feature you switch on; it's the only mode there is.

There's a catch the rest of this page is about: two browsers can't just dial
each other out of nowhere. Neither knows the other's address yet, and home and
office networks hide their devices behind routers. So before the direct line can
open, the two peers need a brief, carefully limited introduction.

- **Callout (accent):** The keys live on the two devices. No server holds them,
  so no server could read the transfer even if it wanted to.

**DIAGRAM SPEC — `WebRtcChannel`.**
Feature the **official WebRTC logo** (the rounded-square loop/spinner mark — use
the `WebRtcLogo` component, `currentColor`) as the memorable centerpiece, set in
accent. Around/beneath it, render the encrypted DataChannel as a beam between two
endpoints with a small **DTLS lock** glyph riding on it; show the payload as
ciphertext (animated scrambling hex/dots) in transit, decrypting only at the
receiving endpoint. Ambient: the logo's loop slowly rotates (slow, ~8s);
ciphertext shimmer flows along the beam. Reduced-motion: logo static, lock shown
closed, ciphertext shown as a static scrambled block.

---

## A3 — SDP / ICE signaling handshake

- **Eyebrow:** 03 / THE HANDSHAKE
- **Heading:** An introduction, not a delivery: SDP offer, answer, and ICE.
- **Lede:** To connect, the peers swap two short text descriptions and a list of
  possible addresses. A small signaling server passes these notes back and forth
  — and that is the only thing it ever does.

**Body.**
Peer A writes an **SDP offer**: a plain-text summary of how it would like to
connect — which codecs, which encryption parameters, which capabilities. Peer B
replies with an **SDP answer** describing its side. Alongside these, each peer
emits **ICE candidates**: a running list of network addresses where it might be
reachable.

The signaling server's entire job is to relay those notes from A to B and back.
It is a switchboard operator connecting a call: it knows two parties want to talk
and helps them find each other, but it never joins the conversation. Once the
peers have exchanged offer, answer, and candidates, they connect directly and
the server's part is over.

- **Callout (accent):** Connection coordinates — never content. The
  offer/answer describe *how* to connect, not *what* you're sending. The file
  never passes through it.

**DIAGRAM SPEC — `Handshake`.**
A timed, three-actor sequence (Peer A · Signaling server · Peer B). Animate
"note cards" hopping along the path in order:
1. A → server → B: **OFFER** (small SDP card, shows a couple of mock `m=` /
   `fingerprint` lines).
2. B → server → A: **ANSWER**.
3. Both ⇄ server: a trickle of **ICE** candidate chips (host / srflx) bouncing
   across.
After the exchange completes, the server box dims and a **direct** link snaps lit
between A and B (callback to the hero). The note cards visibly contain
coordinates, never a file. Loop the sequence. Reduced-motion: show the final
state — all three notes delivered, direct link lit, server dimmed — statically.

---

## A4 — NAT + STUN (full-cone vs symmetric / CGNAT)

- **Eyebrow:** 04 / NAT TRAVERSAL
- **Heading:** Finding a public address with STUN — and being honest when there
  isn't one.
- **Lede:** Almost no device has a clean public address anymore. They sit behind
  a router doing **NAT**, which is why peers need help working out where they
  actually appear from the outside.

**Body.**
A **STUN** server solves the easy half. A peer asks it one question — "from out
here, what address and port do I look like?" — and STUN answers. Armed with
that, two peers behind ordinary (full-cone / address-restricted) routers can
**hole-punch**: aim packets at each other's discovered addresses at the same
moment so each router accepts the other's traffic. STUN is tiny and cheap, so
Wrap uses it freely.

But some networks — **symmetric NATs**, **CGNAT** (carrier-grade NAT shared
across many subscribers), strict corporate firewalls — rewrite the port
unpredictably for every new destination. The address STUN discovered no longer
matches the one the peer will actually use, so hole-punching can't work. The
only fix is a **TURN** relay: a server that forwards every encrypted byte for the
whole transfer. That's bandwidth someone has to pay for, and it quietly puts a
server back in the middle of your data. This is the hinge into PART B.

- **Callout (amber):** Wrap runs no TURN relay. On the rare network where a
  direct path can't form, it tells you plainly instead of routing your file
  through a paid server. Free, honest, and never a middleman by stealth.

**DIAGRAM SPEC — `NatStun`.**
Two contrasting scenarios, ideally toggling or stacked:
- *Full-cone / open (accent, success):* peer asks STUN "what do I look like?",
  STUN returns one stable `IP:port`; the same mapping is reused, so a
  hole-punched **direct** beam forms between the peers. Show the consistent port
  number persisting.
- *Symmetric / CGNAT (amber, failure):* the NAT assigns a **different** outbound
  port per destination (animate the port number changing each attempt — e.g.
  :51001 → :51002 → :51003). The address STUN learned no longer matches; the
  hole-punch beam fails to connect (a broken/severed beam). Caption: only a TURN
  relay could bridge this — and Wrap won't.
Reduced-motion: show both scenarios at rest — open path connected, symmetric path
broken with mismatched ports labeled.

---

## A5 — 16 KB chunking + backpressure

- **Eyebrow:** 05 / MOVING THE BYTES
- **Heading:** Big files go across as a steady stream of 16 KB chunks.
- **Lede:** You can't hand a multi-gigabyte file to the channel in one piece — it
  would exhaust memory. Wrap slices the file into small **16 KB chunks** and
  feeds them through one after another.

**Body.**
Chunking keeps memory flat: only a small window of the file is in flight at any
moment, no matter how large the whole thing is. That's why there's no size cap —
the only real limit is free space on the receiving device.

The second half is **backpressure**. The sender can produce chunks far faster
than the network can carry them, so Wrap watches the channel's outgoing buffer
(`bufferedAmount`). When it fills past a high-water threshold, the sender pauses;
when it drains below a low-water mark, the sender resumes. The file moves at
exactly the speed the link can sustain — fast where the network is fast, patient
where it isn't, and never overflowing.

- **Callout (accent):** No size cap. Only a small window is ever in memory, so
  the real limit is free space on the receiving device.

**DIAGRAM SPEC — `Chunking`.**
A big FILE block (e.g. "4.2 GB") on the left being sliced into a **train of 16 KB
chunk cells** that stream rightward across a channel into a PEER B "reassembles"
block. The centerpiece is **backpressure**: render the channel's send **buffer**
as a fill meter. As chunks pour in, the buffer rises toward a HIGH-WATER line —
when it crosses, the sender visibly **PAUSES** (chunk emission stops, a "paused"
state). As the buffer drains past the LOW-WATER line, the sender **RESUMES**.
Loop this fill→pause→drain→resume cycle so the throttle is legible. Label "16 KB
chunks · sent only while the buffer has room." Reduced-motion: static snapshot
with the buffer partway full, high/low-water lines labeled, a few chunks in
flight.

---

## A6 — LAN discovery (public IP + IPv6 /64)

- **Eyebrow:** 06 / NEARBY
- **Heading:** Devices on the same network find each other automatically.
- **Lede:** When two devices sit on the same network, Wrap can let them discover
  each other with no code at all — grouped by the public address they share.

**Body.**
Every device that connects to Wrap's signaling server arrives from some public
address. Two devices on the same home or office network almost always egress from
the **same public IPv4 address**, so Wrap can group connections by that address
and quietly show you the other devices that appear to be sitting right next to
you — Snapdrop-style, no room code to type.

IPv6 needs a gentler grouping. A single subscriber line is typically handed a
whole **/64 prefix**, and individual devices take different addresses within it
(privacy extensions rotate them, too). Matching on the full 128-bit address would
split a household apart, so Wrap groups by the **/64 prefix** instead — the part
that identifies the network, not the device. Same network, same group; discovery
just works, and the actual transfer still happens directly and encrypted between
the two peers.

- **Callout (accent):** Same network, no code. Group by shared public IPv4, or by
  the IPv6 /64 prefix — then transfer directly, edge to edge.

**DIAGRAM SPEC — `LanDiscovery`.**
A cluster of device nodes that the signaling server **buckets by public
address**. Show two groups:
- Group A: three devices behind one router, all sharing public IPv4
  `203.0.113.7` — they snap into a "nearby" cluster and a "no code needed" badge
  lights; a direct beam can form between any two.
- Group B (IPv6): devices whose full addresses differ
  (`2001:db8:ac10:fe01::…`) but whose **/64 prefix** (`2001:db8:ac10:fe01::/64`)
  matches — highlight the matching prefix portion and the differing suffix in a
  dimmer tone, then bucket them together.
Animate devices arriving and snapping into the correct bucket; emphasize the
shared-address match (accent). Reduced-motion: show the final bucketed state with
the matching prefix highlighted.

---

## A7 — The hibernating Durable Object

- **Eyebrow:** 07 / THE SERVER THAT BARELY EXISTS
- **Heading:** A Cloudflare Durable Object that wakes to introduce two peers,
  then sleeps.
- **Lede:** The one piece of server Wrap needs is the signaling switchboard. It
  runs as a Cloudflare **Durable Object** — a tiny, single-purpose coordinator
  that hibernates the instant it goes idle.

**Body.**
When you open a transfer, a Durable Object spins up to hold one room's worth of
signaling: it relays the offer, the answer, and the ICE candidates between your
two devices. The moment the peers connect directly and the room falls quiet, it
**hibernates** (WebSocket Hibernation keeps the socket open while the object
itself is evicted from memory) — freeing its resources until something else needs
it.

This is what makes Wrap cheap to run and trustworthy by design. There are no
fleets of servers, no storage buckets, no file-handling tier to pay for or to
breach. The only server-side component is a coordinator that sees connection
notes for a few seconds and then goes back to sleep — while your file travels a
path it was never on.

- **Callout (accent):** A server introduces the peers, then disappears.
  Everything that matters — your file — goes directly, encrypted, edge to edge.

**DIAGRAM SPEC — `DurableObject`.**
A lifecycle loop of a single Durable Object box with three legible states:
1. **DORMANT** (dim, "hibernating" — a sleep glyph, very low glow).
2. **AWAKE / BROKERING** (accent glow; two peer sockets attached; offer/answer/
   ICE notes flicker through it for a few seconds).
3. Peers connect directly → the DO **returns to DORMANT** (glow fades, "back to
   sleep").
Make the brokering window feel *brief* relative to the long dormant rest. A small
ambient "breathing"/pulse while dormant. Reduced-motion: show the awake state
with notes in place, plus a dim label that it hibernates when idle — no flicker.

---

# PART B — Why a relay can never be completely free

A descent. We start at the surface, where Wrap lives, and go down one layer at a
time toward bedrock. Each layer answers "but couldn't the layer below absorb the
cost?" — and the answer keeps being *no*. The sticky **DepthGauge** rail on the
side marks L0…L7 as the reader descends.

- **PART B intro eyebrow:** PART B / THE ECONOMICS OF A BYTE
- **PART B intro heading:** Why a relay can never be completely free.
- **PART B intro lede:** Wrap is free because, in the common case, it relays
  nothing — it reuses pipes you've *already* paid for. The moment a service
  relays your bytes for you, it inherits a cost that doesn't disappear no matter
  how deep you push it. Follow it down.

---

## L0 — Direct P2P (the surface): free because it reuses paid pipes

- **Depth:** L0 — SURFACE
- **Heading:** At the top, it really is free — because nothing is relayed.
- **Lede:** A direct peer-to-peer transfer reuses the internet access both people
  are *already* paying for. No new pipe, no third party in the data path, no
  marginal cost to anyone but the two peers.

**Body.**
When Wrap connects two peers directly, your bytes ride your existing broadband
and the receiver's existing connection. Those are sunk costs — already paid,
flat-rate, sitting idle. Wrap adds a few seconds of tiny, content-free signaling
on top, which is cheap enough to give away. That's the whole trick: **free**
isn't magic, it's the absence of a relay.

The rest of PART B is what happens the instant that assumption breaks — when a
network won't allow a direct path and *something* has to carry the bytes for you.

- **Callout (accent):** Free is the absence of a relay. Reuse pipes that are
  already paid for and the marginal cost really is zero.

**DIAGRAM SPEC — `L0Direct`.**
The calm baseline. Two peers, a single direct beam, a "$0 marginal" tag. Show the
two peers' **already-paid** access links as faint, pre-existing pipes that the
beam simply reuses (subtle "sunk cost / flat rate" labels). Serene, accent-toned,
slow ambient flow. This is the top of the DepthGauge. Reduced-motion: static lit
beam.

---

## L1 — TURN: a relay copies every byte

- **Depth:** L1 — THE RELAY
- **Heading:** A relay has to carry every byte twice.
- **Lede:** When the direct path fails, a **TURN** relay steps in. Now your file
  goes *up* to the relay and *down* to the peer — the relay both receives and
  re-sends the entire transfer.

**Body.**
A relay isn't a clever shortcut; it's literally a machine in the middle copying
every packet. Send 4 GB through TURN and the relay handles ~8 GB of traffic — in
and back out. That bandwidth is metered, and it scales **linearly** with every
byte every user sends. There's no caching trick, no amortization: relayed traffic
is pure, recurring, per-byte cost. This is the first place "free" breaks.

- **Callout (amber):** A relay's cost scales one-to-one with traffic. Every byte
  in is a byte out — there is nothing to amortize.

**DIAGRAM SPEC — `L1Turn`.**
Reprise A1's cloud shape but now framed as cost. File token climbs to a TURN
relay box and descends to the peer; annotate the relay with an **ingress +
egress** counter visibly doubling (e.g. "4 GB in / 4 GB out = 8 GB billed"). A
running per-byte meter ticks up. Amber, slightly tense pacing. Reduced-motion:
static doubled-counter state.

---

## L2 — Not cacheable: edge egress still costs

- **Depth:** L2 — THE EDGE
- **Heading:** "Just put it on a CDN" doesn't help — this traffic can't be
  cached.
- **Lede:** CDNs make *popular, repeated* content cheap by serving one cached
  copy to millions. A private one-to-one transfer is the opposite: unique,
  encrypted, requested exactly once.

**Body.**
The CDN economic model is amortization — pay once to cache, serve many times for
nearly nothing. But a personal file transfer has a cache hit rate of zero: every
transfer is a distinct, end-to-end-encrypted payload going to exactly one
recipient. There's nothing to reuse. So even at the edge you pay full **egress**
for every byte — and egress is one of the most aggressively priced lines on any
cloud bill. The edge can't rescue a relay.

- **Callout (amber):** Caching amortizes *repeated* bytes. A private transfer is
  requested once — hit rate zero, full egress every time.

**DIAGRAM SPEC — `L2Edge`.**
Contrast two workloads through an edge/CDN node:
- *Cacheable (cheap):* one origin fetch, then many cache **HITs** fanning out to
  many clients — show the hit counter climbing, cost-per-delivery collapsing.
- *Wrap-style transfer (not cacheable):* every request is a **MISS** / unique
  encrypted blob; the egress meter climbs one-for-one with deliveries.
Animate the divergence (one line flat-and-cheap, the other linear). Reduced-
motion: show both end states with HIT vs MISS labels and the two cost curves.

---

## L3 — Paid transit (~$0.05–$0.80 / Mbps)

- **Depth:** L3 — TRANSIT
- **Heading:** Bytes between networks ride paid transit and peering.
- **Lede:** The internet is many separate networks. To move bytes from one to
  another, somebody buys **transit** or negotiates **peering** — and transit is
  sold by committed bandwidth, not goodwill.
- **Verified figure:** IP transit commonly runs roughly **$0.05–$0.80 per Mbps
  per month**, varying widely by region, volume, and how remote the market is
  (cheapest in major hubs; far higher in remote or under-connected regions).

**Body.**
Even your "free" direct transfer quietly uses this — it's bundled into the
flat-rate access fees both peers already pay, which is exactly why L0 stays free.
But a *relay* operator buys transit explicitly, by the committed Mbps, every
month. Push more relayed traffic and you climb the transit bill in lockstep.
Peering can cut the per-bit price between two willing networks, but peering isn't
free either — it requires ports, cross-connects, and presence in the same
facility. Cost doesn't vanish; it moves down a layer.

- **Callout (amber):** Transit is sold by committed Mbps, every month. ~$0.05 in
  a major hub, up to ~$0.80 or more where the fiber is scarce.

**DIAGRAM SPEC — `L3Transit`.**
A small map of distinct **Autonomous Systems** (network clouds) with bytes
crossing the boundaries between them. At each inter-network hop, surface a price
tag in the **$0.05–$0.80/Mbps** range; show a "committed bandwidth" gauge. Convey
that remote/under-connected regions sit at the high end (a dimmer, farther node
priced near $0.80) while a hub node is near $0.05. Animate a packet traversing
several ASes, accruing transit cost at each crossing. Reduced-motion: static map
with priced boundaries.

---

## L4 — Physical interconnect (subsea fiber ~$25k/km, transatlantic ~$250M)

- **Depth:** L4 — THE PHYSICAL LAYER
- **Heading:** Under the transit price is glass, steel, and ships.
- **Lede:** Transit is only cheap because the physical link already exists. That
  link is fiber-optic cable — including the subsea cables that carry nearly all
  intercontinental traffic — and laying it costs real money in the physical
  world.
- **Verified figures:** Subsea cable construction runs on the order of
  **~$25,000 per kilometer** (varies with depth, terrain, and landing works); a
  major **transatlantic** system lands around **~$250 million** to build.

**Body.**
You cannot relay a byte across an ocean without a cable under that ocean. These
systems take years to plan, require cable-laying ships, repeaters every ~80 km to
re-amplify the light, and shore landing stations — then decades of maintenance
and repair when anchors and earthquakes break them. The capital is enormous and
finite; capacity on a given route is bounded by the glass that's actually in the
water. Transit prices are, ultimately, this concrete poured back out per bit.
There is no software layer beneath the cable.

- **Callout (amber):** ~$25k per kilometer of subsea cable; ~$250M for a
  transatlantic system. You can't relay a byte across an ocean without one.

**DIAGRAM SPEC — `L4Physical`.**
A cross-section/seabed view: two continents with a **subsea fiber** spanning the
ocean floor between them, **repeaters** spaced along it, landing stations at each
shore. Animate a pulse of light traveling the fiber, brightening at each
repeater. Surface the cost figures (**~$25,000/km**, **~$250M transatlantic**) as
annotations along the cable. Tone: grave, physical, amber-tinged. Reduced-motion:
static cable with light shown mid-span and figures labeled.

---

## L5 — Capital + electricity (PUE ~1.56)

- **Depth:** L5 — POWER & IRON
- **Heading:** The machines run on electricity that is never free.
- **Lede:** Relays and the networks under them live in **data centers** — capital
  poured into buildings, servers, and cooling, drawing continuous power that's
  billed by the kilowatt-hour.
- **Verified figure:** Industry-average data-center **PUE ≈ 1.56** — for every
  watt delivered to the computing equipment, roughly **0.56 W extra** is spent on
  cooling, power conversion, and overhead. (Best-in-class hyperscalers approach
  ~1.1; the industry average has hovered near ~1.5–1.6 for years.)

**Body.**
A server doing relay work draws power continuously, and so does everything keeping
it alive: cooling, UPS, lighting, power conversion. PUE captures that overhead —
at ~1.56, you pay for about 1.56 W at the meter for every 1 W of actual
computation. None of this is amortizable away; it's a recurring utility bill
denominated in electricity. The relayed byte you didn't want to pay for is, at
this layer, a measurable quantity of joules pulled off a grid.

- **Callout (amber):** PUE ~1.56 means ~56% overhead on top of the compute
  itself — every relayed byte is metered electricity, billed continuously.

**DIAGRAM SPEC — `L5Power`.**
A data-center energy-flow diagram. Grid power flows **in**; split it: ~1.0 unit
reaches the **servers** (compute), ~0.56 unit bleeds to **cooling / conversion /
overhead**. Visualize the **PUE 1.56** ratio as proportional flows or a stacked
bar (compute vs overhead). Add a slow utility-meter spin and heat shimmer off the
racks. Reduced-motion: static stacked bar at the 1.00 : 0.56 split with PUE 1.56
labeled.

---

## L6 — Energy from finite resources

- **Depth:** L6 — THE SOURCE
- **Heading:** That electricity comes from somewhere finite.
- **Lede:** Power isn't conjured. It's generated from fuel, sun, wind, or water —
  all of which are bounded by physical supply, infrastructure, and cost.

**Body.**
Trace the kilowatt-hour back and it lands on a finite source: gas and coal burned
out of the ground, uranium mined and enriched, dams and turbines and panels built
from mined materials on land someone owns. Even renewables are capped by how much
generation and storage humanity has actually built. Energy is therefore a *scarce
economic good* — it has a price because supply is limited and demand competes for
it. A relay's appetite for joules is real demand on that finite pool. There is no
layer here that lets bytes move for nothing.

- **Callout (amber):** Energy is a scarce, priced good drawn from finite sources.
  A relay's joules are real demand competing against everyone else's.

**DIAGRAM SPEC — `L6Energy`.**
Generation sources feeding a shared grid: fossil (finite, draining reserve gauge),
nuclear, plus renewables (sun/wind/hydro, capped by built capacity). Show each
feeding a common bus that powers the data center from L5. Emphasize **finitude** —
a depleting reserve meter for fossil, a "max built capacity" ceiling on
renewables. A relay's demand draws a visible slice from the bus. Reduced-motion:
static sources → grid with the finite/ceiling indicators shown.

---

## L7 — Bedrock: thermodynamics + information theory + scarcity

- **Depth:** L7 — BEDROCK
- **Heading:** At the bottom: physics doesn't let a bit move for free.
- **Lede:** Strip away every layer of business and infrastructure and you reach
  laws, not policies. Moving and erasing information has a hard physical floor,
  and economics has a hard scarcity floor. Neither is negotiable.
- **Verified figures:**
  - **Landauer's limit:** erasing one bit of information dissipates at least
    **kT·ln2 ≈ 2.75 × 10⁻²¹ joules** at room temperature (~300 K). It's a tiny
    number — but it is a hard, nonzero floor set by thermodynamics, and real
    hardware operates orders of magnitude above it.
  - **Shannon:** a channel has a finite capacity `C = B·log₂(1 + S/N)`; you cannot
    push information faster than that limit without more bandwidth or more power.
    Reliable communication has an irreducible cost.
  - **Scarcity:** the founding axiom of economics — finite resources against
    competing wants. A genuinely zero-cost relay would be a free, infinite good,
    and those do not exist.

**Body.**
This is bedrock; there is no L8. **Landauer** says erasing a bit costs energy —
 logically irreversible operations dissipate at least ~2.75 × 10⁻²¹ J per bit, a
floor written into thermodynamics itself. **Shannon** says a channel can carry
only so much information per second for a given bandwidth and signal-to-noise
ratio; beyond that, you must spend more spectrum or more power. And **scarcity**
says any finite resource against unlimited wants must carry a price. Stack these
and the conclusion is forced: relaying information is a physical process, physical
processes cost energy, energy is finite, and finite things are never free. The
only way to pay nothing is to relay nothing.

- **Callout (accent):** A truly free relay would have to break thermodynamics,
  Shannon, or scarcity. The only winning move is to not relay at all.

**DIAGRAM SPEC — `L7Bedrock`.**
The deepest, stillest panel — the floor of the descent. Three "laws" carved as
distinct plates:
1. **Landauer** — a single bit being erased, releasing a quantum of heat;
   annotate **≥ 2.75 × 10⁻²¹ J / bit @ 300 K**.
2. **Shannon** — a channel with a capacity ceiling `C = B·log₂(1 + S/N)`; show
   throughput pressing against the ceiling and unable to pass.
3. **Scarcity** — finite supply vs. infinite demand (a small/bounded resource
   against many reaching hands).
Treat it as the bedrock stratum at the bottom of the DepthGauge — heavy,
inevitable, minimal motion (a single slow bit-erasure pulse). Reduced-motion:
fully static plates with all three figures/laws labeled.

---

## CLOSING — Synthesis

- **Eyebrow:** THE WHOLE STORY, IN ONE BREATH
- **Heading:** So Wrap is free by refusing to relay.
- **Lede:** Every layer of the descent said the same thing: a relayed byte costs
  something, all the way down to physics. Wrap's answer is to not relay.

**Body.**
In the common case, two devices connect directly and the file rides pipes that are
already paid for — marginal cost zero, no server in the path, end-to-end
encrypted by the standard itself. On the rare network where a direct path can't
form, Wrap doesn't quietly route you through a paid relay and eat a cost it would
eventually have to recover. It tells you the truth. That honesty is the product:
free where free is real, and never a middleman by stealth.

- **Closing line / pull-quote (accent):** Free where free is real. Honest where
  it isn't. Never a middleman by stealth.
- **CTA:** Start a transfer → (navigates to `/send`); secondary ← Back to home
  (`/`).

**DIAGRAM SPEC — closing:** no new heavy diagram required; the closing reprises
the hero's direct-channel motif at rest (peers connected, server gone), letting
the page resolve back to its opening image. The Assemble step may reuse `L0Direct`
or the hero flow at rest here.

---

## Verified figures — quick reference

| Layer | Figure | Value |
|------|--------|-------|
| A5 | Chunk size | 16 KB |
| A6 | IPv6 grouping | /64 prefix |
| L3 | IP transit | ~$0.05–$0.80 / Mbps / month |
| L4 | Subsea cable build | ~$25,000 / km |
| L4 | Transatlantic system | ~$250 million |
| L5 | Data-center PUE (industry avg) | ~1.56 |
| L7 | Landauer's limit @ 300 K | ≥ kT·ln2 ≈ 2.75 × 10⁻²¹ J / bit |
| L7 | Shannon capacity | C = B·log₂(1 + S/N) |
