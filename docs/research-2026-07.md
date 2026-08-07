# Warp research: browser P2P file transfer

Date: 2026-07-30
Scope: literature and primary-source review for the Warp engine (`web/src/lib/warp/`).
Constraints held throughout: $0 infrastructure with no credit card (Cloudflare free tier only); STUN-only with no TURN or relay, ever; a signaling server that is a dumb relay and never sees a file byte; server-minted room codes; mobile-first UI at roughly 360 to 430 px.

Method: five parallel research tracks fetched primary sources (RFCs, W3C/WHATWG specs, MDN, web.dev, WebKit and Chromium sources, measurement papers, and dated practitioner writeups). Two claims were re-verified against source code during synthesis: the 16 MiB `bufferedAmount` cap (Section 1) and the OPFS support matrix (Section 4). Every claim below carries a citation. The reference list at the end gives full detail and links. Where sources disagree, the disagreement is stated rather than resolved.

A note on dates: spec and browser-support facts are stated as of July 2026 and shift over time. Treat version numbers as a snapshot.

## 1. SCTP and WebRTC data channel throughput

Warp sends files over a single reliable, ordered `RTCDataChannel` named `warp` (`peer.ts`, constructor: `createDataChannel("warp", { ordered: true })`). The send pump reads files in 4 MiB gulps (`READ_BLOCK`), slices them into 256 KiB SCTP messages (`TARGET_SEND_CHUNK`) capped at the negotiated `pc.sctp.maxMessageSize` and floored at 16 KiB (`MIN_SEND_CHUNK`), and applies `bufferedAmount` backpressure with an 8 MiB high-water mark (`SEND_HIGH_WATER`) and a 1 MiB low-water mark (`LOW_WATER_MARK` in `transfer.ts`). This section checks each of those choices against the literature.

### Three distinct size limits

The codebase and its comments refer to a single "16 MiB SCTP send buffer." The primary sources show three separate numbers at three layers, and conflating them invites confusion.

1. **64 KiB default `maxMessageSize`.** RFC 8841 §6.1 defines the SDP `a=max-message-size` attribute as the largest SCTP user message an endpoint will receive, and states that "if the SDP 'max-message-size' attribute is not present, the default value is 64K" [1]. A value of zero means "any size, subject to memory capacity." The W3C WebRTC Recommendation operationalizes this: the `RTCSctpTransport` `[[MaxMessageSize]]` slot initializes to 65536 and is set from the SDP attribute on answer, defaulting to 65536 when absent [6]. So 64 KiB is the real per-message default, not 16 MiB.

2. **256 KiB SCTP association send buffer.** usrsctp sets `SCTPCTL_MAXDGRAM_DEFAULT` to 262144 (256 KiB) [13], and Chromium's WebRTC SCTP transport mirrors this with `kSendBufferSize = 256 * 1024`, commented as "the usrsctp default," with a backpressure threshold at half the send space [14]. This is the SCTP-layer buffer, distinct from the JavaScript-facing cap below.

3. **16 MiB `bufferedAmount` (send-queue) cap.** This is the number Warp's backpressure actually depends on, and it is real. libwebrtc defines `DataChannelInterface::MaxSendQueueSize()` to return `16 * 1024 * 1024` with the comment "16 MiB" [15]. Blink's `RTCDataChannel::ValidateSendLength()` checks `buffered_amount_ + length` against `MaxSendQueueSize()` and throws a `DOMException` with code `OperationError` and message "RTCDataChannel send queue is full" when it would be exceeded [16]. So `send()` throws before `bufferedAmount` can ever reach or pass 16 MiB.

**Verdict on Warp's claim.** The behavioral claim in `CLAUDE.md` and the `peer.ts` comments is correct: `bufferedAmount` can never exceed 16 MiB because `send()` throws first, so a high-water mark at or above 16 MiB disables backpressure entirely. The label is imprecise. The 16 MiB figure is the send-queue / `bufferedAmount` cap, not "the SCTP send buffer," which is 256 KiB. See Section 7 for the recommended comment fix.

### Chunk and message size

The most-cited measurement is Nurminen and Eskola, "Performance Evaluation of WebRTC Data Channels," IEEE ISCC 2015 [9]. Their central finding is that browser implementations "do not adjust the SCTP window size from the default setting," which "results in bad performance when latency is not close to perfect," and that changing the window helps high-latency links though throughput "is still not ideal" [9, 10]. The SCTP window is not exposed to JavaScript, so Warp cannot tune it; this finding explains why real throughput falls short of link rate on high-latency paths but offers no lever Warp can pull.

On message size, practitioner measurement clusters on 16 KiB for compatibility. Mladenov, "WebRTC Data Channel Message Size" (viblast, 2015), found "a 16 Kbyte message size is the one allowing for the highest throughput, while also being the most portable one," and measured browser asymmetries: Chrome-to-Chrome and Chrome-to-Firefox capped at 64 KiB, Firefox-to-Chrome at 16 KiB, Firefox-to-Firefox above 64 KiB [11]. The webrtc.link guide recommends "around 16 KiB" as "most stable cross-browser," warns that above 64 KiB is "often infeasible or causes serious blocking," and notes that with full End-of-Record support the "effective payload limit can reach 256 KiB," though "even 256 KiB may bring noticeable delay when handling bursts" [12].

Warp's `TARGET_SEND_CHUNK` of 256 KiB sits at the aggressive edge of this range. The defensive shape around it is correct: `sendChunkSize()` caps to the negotiated `pc.sctp.maxMessageSize` at runtime and floors at `MIN_SEND_CHUNK` of 16 KiB (`peer.ts`), so on a stack that reports the 64 KiB default Warp sends 64 KiB messages, and on an old or odd stack it falls back toward 16 KiB, matching the conservative consensus.

One honest tension: RFC 8831 §6.6 says that "as long as message interleaving is not supported, the sender SHOULD limit the maximum message size to 16 KB to avoid monopolization" [2]. Warp sends up to 256 KiB, which exceeds this SHOULD. The deviation is defensible for a single-file bulk transfer, where monopolization of the association by one data stream is the goal rather than a hazard, and Warp still respects the negotiated peer limit. But it is a deviation from a normative SHOULD and the code does not document it. RFC 9260 §3.3.1 and RFC 8831 both point to RFC 8260 message interleaving as the fix for large-message monopolization [2, 4, 5].

### Backpressure water marks

The W3C spec defines `bufferedAmount` as bytes queued by `send()` but not yet transmitted, and `bufferedAmountLowThreshold` (default 0) which fires `bufferedamountlow` when the buffer falls from above the threshold to at or below it [6, 7]. No standard prescribes high or low water marks; they are application-tuned. Practitioner guidance uses small thresholds: webrtc.link sets `bufferedAmountLowThreshold` to 32 KiB and pauses with loops like `while (channel.bufferedAmount > (1 << 16))` (64 KiB) [12].

Warp's 8 MiB high-water and 1 MiB low-water are far larger than these examples. Given the 16 MiB hard cap, 8 MiB is safe and leaves genuine headroom, and the check counts the chunk about to be sent (`bufferedAmount + sendChunk > SEND_HIGH_WATER` in `streamFile`) so the buffer cannot be pushed toward the cap. The trade is reaction latency for throughput: a large high-water mark keeps the pipe full but notices a stalled link later. For bulk file transfer that trade is reasonable. No literature validates 8 MiB specifically; it is a sound heuristic, not a standard.

### Ordered versus unordered

For reliable bulk file transfer the literature supports ordered plus reliable with no `maxRetransmits` or `maxPacketLifeTime`. The webrtc.link guide states for "file/important data" to use "ordered: true + reliable (don't set max*)" and handle chunking yourself [12]. Unordered delivery with bounded retransmits suits real-time state sync, where it "can reduce head-of-line blocking," not file integrity [12]. RFC 8831 §6.1 confirms a message "can be sent ordered or unordered and with partial or full reliability," and that zero retransmits combined with unordered "provides a UDP-like service" [2]; RFC 8832 §5.1 encodes the channel types and requires the Reliability Parameter to be zero and ignored for reliable channels [3].

Warp's `createDataChannel("warp", { ordered: true })` with no reliability options matches the recommendation. Unordered delivery would remove head-of-line blocking between messages but would force Warp to reorder and reassemble chunks in JavaScript for no integrity gain on a single reliable stream. Ordered is the correct, lower-risk choice here.

## 2. NAT traversal success rates with STUN only

Warp lists two public Google STUN servers and no TURN (`ICE_SERVERS` in `peer.ts`). When traversal fails it emits an honest `nat-failed` error rather than relaying. This section quantifies the cost of that choice.

### The modern NAT taxonomy

The legacy RFC 3489 vocabulary (full cone, restricted cone, port-restricted cone, symmetric) is deprecated. RFC 5389 states that "classic STUN's algorithm for classification of NAT types was found to be faulty" and that the address learned through classic STUN is "sometimes usable for communications with a peer, and sometimes not" [18]. RFC 4787 replaces it with two independent axes: mapping behavior (Endpoint-Independent Mapping, Address-Dependent, or Address-and-Port-Dependent) and filtering behavior (Endpoint-Independent Filtering, Address-Dependent, or Address-and-Port-Dependent) [19]. RFC 5780 operationalizes these definitions and warns its results are only "upper bounds," since "an application must assume that NAT behavior can become more restrictive at any time" [20]. The old "symmetric" NAT corresponds to Address-and-Port-Dependent Mapping.

The load-bearing standards fact is RFC 4787 REQ-1, which makes Endpoint-Independent Mapping a MUST and justifies it plainly: "Failure to meet REQ-1 will force the use of a UDP relay, which is very often impractical" [19]. That is the standards-level admission that symmetric NAT is unrecoverable without a relay. RFC 5389 is equally blunt that "STUN is not a NAT traversal solution by itself" [18].

ICE (RFC 8445) gathers host, server-reflexive (STUN-derived), and relayed (TURN) candidates and runs connectivity checks over candidate pairs [17]. STUN-only gathering yields only host and server-reflexive candidates. If no candidate pair passes a check, "ICE fails for that checklist" [17]. So STUN-only succeeds exactly when a host or reflexive pair is mutually reachable, and fails when both peers' mappings or filtering block inbound packets.

### Measured success rates

The recent large-scale measurement is Trautwein, Ihle, Schubotz and Gipp, "Challenging Tribal Knowledge: Large Scale Measurement Campaign on Decentralized NAT Traversal," arXiv:2510.27500 (2025) [21]. Their DCUtR hole-punching campaign measured a "success rate of 70% ± 7.1% for the hole-punching stage" with a "persistent ~30% failure rate." They cite prior work that roughly 64% of peers sit behind a NAT or firewall, roughly 11% behind symmetric (EDM) NATs, and that CGNAT "employed EDM translation in 40% of cases as of 2016." From the 11% symmetric figure they derive expected pair combinations of about 19.6% mixed symmetric/non-symmetric and about 1.2% symmetric-on-both-sides, the latter being effectively hopeless without a relay [21].

Older work, cited within [21], reports higher success: Halkes and Pouwelse (2011) reported over 80% of hole-punching attempts succeeding, and Guha and Francis (2005) reported an "88% average success rate for TCP connection establishment with NATs in the wild." These two are reported secondhand in [21] and their exact original venues were not independently re-verified here, so treat them as secondary.

**Honest synthesis.** STUN-only and hole-punch success in the wild clusters around 70 to 88%, leaving a stubborn 12 to 30% of peer pairs that cannot connect without a relay. The residual is dominated by symmetric NAT, especially symmetric-on-both-sides pairs.

### How often real WebRTC sessions need TURN

Practitioner numbers disagree. A figure of about 8% of traffic relayed is attributed to Google/libjingle via a 2011 Stack Overflow answer [22]. ExpressTURN's 2025 engineering post states "roughly 10 to 25% of real-world connections need a relay to complete" [23]. webrtc.org says TURN is needed for "most" WebRTC applications but gives no figure [24]. The spread reflects audience (desktop-heavy versus mobile-heavy), whether "relay" includes TCP-TURN fallback, and measurement year. A defensible planning figure is 10 to 20%, rising on mobile.

### Mobile carrier NAT, CGNAT, and IPv6-only networks

RFC 6888 (CGNAT requirements) inherits RFC 4787 REQ-1 and recommends Endpoint-Independent Filtering, noting "some games and peer-to-peer applications require EIF for the NAT traversal to work," but warns that under carrier-grade NAT "some [applications] may not function at all" [25]. In practice CGNATs frequently use address-and-port-dependent mapping and filtering to conserve ports; the ExpressTURN post notes "many carrier NATs use a different external port for each destination" behind a single public IP "shared among hundreds or thousands of subscribers" [23].

The sharpest citation for a mobile-first app is RFC 6877 (464XLAT for IPv6-only cellular). The RFC states outright that 464XLAT "only supports IPv4 in the client-server model" and "is not fit for IPv4 peer-to-peer communication or inbound IPv4 connections" [26]. The PLAT is stateful N-to-1 IPv4 sharing, so the device never gets a unique public IPv4. RFC 6877 concedes ICE "may be used to support peer-to-peer" in §6.6, but the architecture itself provides no native inbound IPv4 path [26]. On IPv6-only cellular, common on carriers such as T-Mobile and Reliance Jio, STUN-only IPv4 P2P is structurally broken. This is the hardest failure mode for Warp, and it lands on exactly the mobile platforms Warp targets first.

### Same-LAN success

When both peers share a LAN, ICE host candidates (RFC 8445) provide a direct local path that bypasses NAT entirely, so success is effectively complete absent a local firewall [17]. ICE "favors direct connections when possible" and tries them before relay [27]. No measurement study publishing a same-LAN success percentage surfaced; this is a design consequence of host candidates plus practitioner consensus, not a measured statistic. Enterprise VLAN or client isolation can still break it. Warp's `useNearby.ts` LAN discovery rides this host-candidate path.

### Failure modes that are unrecoverable without TURN

1. Symmetric (Address-and-Port-Dependent) mapping on both sides. Each side's reflexive address is valid only toward the STUN server, not the peer. RFC 4787 REQ-1's rationale says this "will force the use of a UDP relay" [19].
2. IPv6-only cellular with 464XLAT. RFC 6877 §1: "not fit for IPv4 peer-to-peer" [26].
3. Strict symmetric UDP filtering with short binding timers, causing mid-session drops when "a NAT timeout expires" [23]. Warp's initiator-only ICE restart (`attemptRestart`, `MAX_ICE_RESTARTS = 3` in `peer.ts`) handles transient drops but cannot recover a mapping that is gone for good.

## 3. Integrity and resumption

Warp computes a whole-file SHA-256 in a Web Worker (`hash.ts`, `hashWorker.ts`; issue #6/#88) and does tus-style byte-offset resume: the receiver reports its durable `bytesWritten`, the sender validates and echoes the offset in `file-begin`, and the receiver requires the echo to match before appending (`transfer.ts`, `peer.ts`). Issue #137 proposes a per-chunk hash manifest with targeted re-request. This section reviews the state of the art and what to build.

### Merkle trees

The construction originates with Ralph C. Merkle. The seed idea is his 1979/1980 Stanford thesis, *Secrecy, Authentication, and Public Key Systems* [30]. The data-certification form most relevant here is "A Certified Digital Signature," CRYPTO '89 (LNCS 435, 1990) [29], building on the one-time-signature framing of "A Digital Signature Based on a Conventional Encryption Function," CRYPTO '87 (LNCS 293, 1988) [28]. A Merkle tree authenticates each leaf by a hash path to a signed root, so a verifier checks any leaf by recomputing O(log N) nodes rather than re-hashing the whole file [28, 29].

The relevance to Warp is direct. A flat whole-file hash (Warp's current SHA-256 session) forces a full re-hash to locate corruption and cannot drive targeted re-request. A Merkle tree lets the receiver verify each piece independently against the root and localize a bad piece to one leaf, so only that piece is re-requested. That is precisely the goal of issue #137.

### BLAKE3

The BLAKE3 spec, "BLAKE3: one function, fast everywhere," by O'Connor, Aumasson, Neves, and Wilcox-O'Hearn (spec v20211102, original 2020) [31], splits input into 1 KiB chunks as leaves of a binary Merkle tree, so it is intrinsically a tree hash. The spec says the tree "supports new use cases, such as verified streaming and incremental updates," and that "each chunk is compressed independently" so "throughput scales almost linearly with the number of threads," at roughly 12 times SHA-256 single-threaded on x86 [31]. For a per-piece manifest this is attractive: the per-chunk chaining values are the Merkle nodes, so a piece manifest is just a tree layer.

One verified caveat: BLAKE3 is not in the Web Crypto API. `SubtleCrypto.digest()` supports only SHA-1, SHA-256, SHA-384, and SHA-512 [32]. Using BLAKE3 in the browser requires a JavaScript or WebAssembly dependency. SHA-256 via the existing `hashWorker.ts` remains the zero-dependency path.

### The BitTorrent piece model

BEP 3 (Cohen, "The BitTorrent Protocol Specification") splits each file into fixed-size pieces, default 2^18 = 256 KiB, and the `.torrent` `pieces` field is "a string whose length is a multiple of 20," each 20 bytes being "the SHA1 hash of the piece at the corresponding index" [33]. Peers "refer to pieces by index starting at zero," and a `request` carries `(index, begin, length)` with 16 KiB sub-pieces, so request-missing-by-index is native to the protocol [33]. Piece selection is rarest-first with a random first piece and an endgame mode, per Cohen, "Incentives Build Robustness in BitTorrent," P2PECON 2003 [34]; note BEP 3's own text says only "random order," so rarest-first is the documented strategy, not the wire spec.

BEP 52 (BitTorrent v2) replaces the flat SHA-1 list with a per-file SHA-256 Merkle tree over 16 KiB blocks [35]. Each file carries a `pieces root`, and a top-level `piece layers` dictionary supplies "concatenated hashes of one layer within that merkle tree," chosen so one hash covers `piece length` bytes [35]. This is the textbook mapping to issue #137: the manifest is a Merkle layer, a corrupt piece fails its layer hash, and the root still verifies the rest.

### tus resumable uploads

The tus core protocol resumes via `HEAD`, where the server returns `Upload-Offset` (the durable byte count); the client then `PATCH`es with a matching `Upload-Offset` (a mismatch yields `409 Conflict`) and `Content-Type: application/offset+octet-stream`; creation uses `POST` with `Upload-Length` [36]. This matches Warp's resume handshake almost one-to-one: receiver reports `bytesWritten`, sender echoes the offset in `file-begin`. tus is the byte-offset model formalized.

tus also defines a Checksum extension: `Upload-Checksum: <alg> <base64>` per `PATCH`, with `460 Checksum Mismatch` discarding the chunk without advancing the offset [36]. That is per-chunk integrity layered on byte-offset resume, the same composition Warp wants for #137.

### Other protocols

RFC 9530 (Polli and Pardue, February 2024) defines `Content-Digest` and `Repr-Digest` using `sha-256` and `sha-512`, but warns the mechanism "is not intended to be a general protection against malicious tampering" [37]. That caveat is acceptable for Warp because DTLS already authenticates the channel. IPFS/UnixFS chunks files (recommended 256 KiB to 1 MiB) into content-addressed blocks in a `dag-pb` Merkle DAG, where each link hash is a CID and `blocksizes` enables byte-range-to-chunk lookup for sparse fetch [38]. Hypercore (the dat protocol) is a signed append-only log: an Ed25519 key signs the Merkle `treeHash`, blocks are verified by a tree proof, and missing blocks are fetched by index with sparse replication [39]. Hypercore is the closest existing model to "per-piece proof plus request-by-index over a reliable channel." S3 multipart ETags are MD5-of-MD5s, non-Merkle and weak; mentioned only to exclude.

### What to build

Because Warp's channel is a reliable, ordered, DTLS-authenticated SCTP data channel, in-transit bit flips are already impossible. Per-piece hashing therefore targets storage and implementation corruption plus targeted resume, not an adversarial wire. Stating this plainly keeps the threat model honest: #137 is about resume granularity and corruption localization, not wire security.

A design converging on BEP 52, Hypercore, and the tus Checksum extension:

- At `file-begin`, the sender transmits a manifest of one hash per piece plus the root. This is a Merkle layer in the BEP 52 sense [35].
- Piece size scales with file size. BEP 3's floor is 256 KiB [33]; libtorrent's auto rule picks a power of two from a 16 KiB minimum up to 128 MiB [40]. For browser memory and re-transfer waste, 256 KiB to 1 MiB is a sane default. Warp's 256 KiB `TARGET_SEND_CHUNK` aligns naturally with a 256 KiB piece size.
- The receiver hashes each piece on arrival, compares it to the manifest entry, and on mismatch or gap re-requests by index (BitTorrent `request(index, ...)`, Hypercore `get(index)`) [33, 39].
- Resume reports the highest contiguous *verified* offset, or a verified bitfield, rather than merely written bytes, so a half-written corrupt tail is not trusted. This is the refinement Warp's current `bytesWritten` needs (Section 7).
- Prefer SHA-256 via the existing `hashWorker.ts` for the first version, since it is dependency-free and already wired. Reach for BLAKE3 via WebAssembly later only if hashing becomes a measured bottleneck, since BLAKE3 is tree-native and parallel but absent from Web Crypto [31, 32].

## 4. Browser storage limits for large receives

Warp streams large receives straight to disk via the File System Access API on Chromium (`diskSink` in `receiveController.ts`), and falls back to staging chunks as Blob rows in IndexedDB on browsers without that API (`idbStage.ts`), assembling a Blob-of-Blobs at the end. It gates oversized offers with `estimateFits()` using `navigator.storage.estimate()` and a hard 1 GiB iOS cap (`IOS_HARD_CAP`). This section reviews the current options and finds one genuine improvement.

### File System Access API

The File System Access API extends the WHATWG File System Standard; `showSaveFilePicker()` returns a `FileSystemFileHandle` whose `createWritable()` yields a stream that "operates on a single file on disk" with positional write, seek, and truncate [41, 43]. Transient user activation is required: MDN states the call throws a `SecurityError` "if it was not called via a user interaction such as a button press" [42], which is why Warp opens the save picker from the accept gesture.

Support is still not Baseline. caniuse shows Chrome and Edge supported from v105 (partial 86 to 104), Firefox "Not supported" through v156, and Safari and iOS Safari "Not supported" through 26.5 [44]. MDN labels it Experimental [43]. So Warp's disk-streaming path stays Chromium-only for now, and the fallback matters.

Handles are serializable into IndexedDB, but the permission is not persistent: the Chrome blog on persistent permissions states that on the next visit the app must retrieve a stored `FileSystemHandle` from IndexedDB and call `requestPermission()`, which shows the three-way prompt and itself requires transient user activation [45, 46]. The handle survives reload; the permission must be re-requested.

### Origin Private File System (the real finding)

OPFS is the File System Standard's bucket file system, entered via `navigator.storage.getDirectory()` [41]. web.dev lists support as Chrome 86, Edge 86, Firefox 111, and Safari 15.2 [47]. The WebKit blog confirms OPFS "is available in Safari on macOS 12.2 and above, iOS 15.2 and above," that its "storage lifetime is the same as other persistent storage types like IndexedDB and localStorage," and that it "will conform to the Storage Standard" [48].

The key member is `FileSystemSyncAccessHandle`, which the spec marks `[Exposed=DedicatedWorker, SecureContext]` [41]. It exposes synchronous read, write, truncate, getSize, flush, and close "for higher performance," and WebKit confirms it "is only available in Worker" [48]. Because an OPFS file can be streamed and seeked in place without materializing a Blob in RAM, OPFS is the better large-file fallback than IndexedDB Blob rows on both iOS Safari (15.2+) and Firefox (111+). It avoids the Blob-of-Blobs assembly step that pressures the iOS memory ceiling.

The caveats: OPFS counts against the same quota as IndexedDB and is best-effort evictable by default [47, 49], and `FileSystemSyncAccessHandle` requires a DedicatedWorker, so the receive path would move into a worker. The Storage Foundation API, which Chrome once pitched for "large temporary files," did not ship as a separate API; it was folded into OPFS, specifically the Worker-only sync access handle [50, 51]. So OPFS is the shipped successor and the current best practice for multi-GB receives on non-File-System-Access browsers.

**This contradicts Warp's current implementation.** `idbStage.ts` falls back to IndexedDB Blob staging on exactly the browsers (iOS Safari since 15.2 in 2021, Firefox since 111 in 2023) that support OPFS with the faster, RAM-avoiding sync access handle. The Blob-of-Blobs assembly in `idbSink.finalize()` is precisely the in-RAM step that pressures the iOS jetsam ceiling the file exists to avoid. Section 7 proposes an OPFS sink as the primary fallback.

### IndexedDB quotas and eviction

The WHATWG Storage Standard sets bucket mode to "best-effort" initially; "persistent" requires the `persistent-storage` permission; under storage pressure the user agent "should clear buckets whose mode is 'best-effort'"; and a cleared bucket "must be cleared in its entirety" [49]. Quotas are "an implementation-defined conservative estimate" and "must not be a function of the available storage space," to avoid fingerprinting [49].

MDN gives the per-browser numbers [52]: Chrome and Chromium allow up to 60% of total disk per origin with a browser-wide cap near 80%; Firefox best-effort is the smaller of 10% of disk and a 10 GiB group limit, with persistent at 50% of disk capped at 8 TiB; Safari on macOS 14 / iOS 17+ gives browser apps about 60% of disk and embedded WKWebView about 15%, with an overall cap of 80% for browsers. "In earlier versions of Safari, an origin is given an initial 1 GiB quota" and then prompts to grow [52]. Eviction is LRU across best-effort origins, and Safari additionally proactively evicts script-written data after 7 days without user interaction [52]. Exceeding quota throws `QuotaExceededError`. Warp's `estimateFits()` reads `navigator.storage.estimate()`, which adapts to the current formula, and its 24-hour `gcOrphanStaging()` TTL sits well inside Safari's 7-day eviction window.

### iOS and Safari memory ceilings

There is no fixed, Apple-published per-tab number; the limit is device-RAM-dependent and enforced by iOS jetsam. WebKit bug 277848 states: "WebContent processes on iPhone are subject to a 'soft' limit of around 1.5GB; if they use more they are subject to getting killed by 'jetsam'," and advises designing "to not exceed the 1.5GB limit," noting "it will be somewhat lower on iPhone models with less RAM" [53]. The same bug reports a transient roughly 3 GB on iPhone 15 Pro and Pro Max right after reboot, falling back to about 1.5 GB under memory pressure, corroborated by an Apple Developer Forums thread [53, 54]. The kill is not catchable; the tab simply reloads.

Warp's `IOS_HARD_CAP` of 1 GiB is conservative relative to the roughly 1.5 GB soft ceiling, and that conservatism is the right call given the uncatchable failure mode. It could be raised toward 1.5 GiB on newer devices, but an honest refusal beats a silent crash, and the current value respects the constraint.

### Blob handling

A `Blob` is "a file-like object of immutable, raw data"; `new Blob([parts])` "contains a concatenation of all of the data in the array"; the spec sets no maximum Blob size or part count, so limits are memory- and quota-bound [55]. Critically, persisted IndexedDB Blobs are file-backed in Chromium, not RAM-resident: the Chromium IndexedDB docs state "most Blobs in Chrome point to on-disk files," with the exception that in incognito mode "blobs are never written to disk" [56, 57]. The RAM cost arrives at assembly and read time, not storage. Mobile JS heaps are roughly 256 to 512 MB [58]. So storing chunks as Blob rows is cheap, which validates Warp's choice in `idbSink` to store Blobs rather than ArrayBuffers; the dangerous step is the final in-RAM Blob-of-Blobs assembly, which is exactly what OPFS streaming removes.

## 5. Newer developments in 2025 and 2026

The question is whether anything new changes the calculus for browser P2P bulk transfer. The short answer is no, with two complementary exceptions. Anything client-server shaped is off-limits for Warp and is flagged as such.

### WebTransport: client-server, off-limits

WebTransport is not peer-to-peer and cannot be made so in a browser. The W3C Working Draft (6 July 2026) exists "to allow data to be sent and received between a browser and server," and a session "is a session of WebTransport over an HTTP/3 or HTTP/2 underlying connection" [59]. The IETF binding, draft-ietf-webtrans-http3-16 (6 July 2026), is still an Internet-Draft, not an RFC, and defines WebTransport as a binding to HTTP/3 so "application clients constrained by the Web security model [can] communicate with a remote application server," providing "a secure framework for client-server communication" [60]. The framework doc draft-ietf-webtrans-overview-13 defines a session as "a single communication context established between a client and a server" and mentions peer-to-peer only as background [61]. Browser support only just became cross-browser: caniuse shows Chrome 97+, Edge 98+, Firefox 114+, and newly Safari 26.4+ and iOS Safari 26.4+ [62]. The browser is always the client and the endpoint is an HTTP/3 server you must run and keep in the data path. There is no browser listener role, so WebTransport is structurally incompatible with a $0, TURN-refusing P2P app. The old `w3c.github.io/p2p-webtransport` draft is stale and abandoned, still referencing the long-removed `QuicTransport` class, and defines no P2P variant [63].

### WebRTC NV and data channel changes: nothing material

The core W3C WebRTC spec is now a Recommendation dated 13 March 2025 [6]. It still defines `RTCDataChannel`, `RTCSctpTransport`, and the "Update max message size" algorithm driven by the SDP `max-message-size` attribute. The message-size cap remains negotiated and implementation-defined, with no change to any ceiling [6]. `RTCSctpTransport.maxMessageSize` is "Baseline widely available since May 2023" and merely reports the negotiated send limit [64]. The WebRTC Extended Use Cases document is only a W3C Group Draft Note from 14 December 2023, explicitly "not endorsed by W3C," listing aspirational requirements like a single-operation large-file transfer and backpressure that are not shipped features [65]. A 2025 browser-by-browser roundup reports no data-channel API, SCTP, throughput, buffer, or `maxMessageSize` changes in Chrome M131 to M134, Firefox 132 to 134, or Safari 18 [66]. The only data-channel mention: Chrome M133 exempts tabs with open data channels from background-tab freezing [66], a small lifecycle win relevant to Warp's long transfers. The data channel API and its SCTP limits are frozen.

### WebCodecs: the wrong tool

MDN describes WebCodecs as a way to "encode and decode video and audio using hardware acceleration on a per-frame basis," for "browser-based video and audio editing, live-streaming and video conferencing" [67]. It processes media frames, not arbitrary bytes, and offers no generic file read or write. It is irrelevant to bulk file transfer.

### No peer-to-peer QUIC

No IETF work on "QUIC over data channels" or "P2P QUIC" surfaced in targeted searches. QUIC in the web stack is HTTP/3-only and therefore server-terminated. The "WebTransport over WebSocket" draft is also client-server [68]. There is no browser-native P2P QUIC.

### Two genuinely useful, complementary additions

- **Compression Streams API.** Baseline widely available since May 2023 for gzip and deflate; zstd was added in Chrome 123 (March 2024), Firefox 126 (2024), and Safari 18 (September 2024) [69, 70]. It lets Warp compress a file stream before handing chunks to the data channel, a client-side throughput win for compressible payloads. The version numbers for zstd rest on an MDN compat-data issue plus contemporaneous coverage, so treat them as medium-confidence [70].
- **OPFS sync access handle.** Covered in Section 4: the modern sink for multi-GB receives on non-File-System-Access browsers [47, 48, 51].

### Verdict

Nothing new in 2025 or 2026 changes the transport calculus. WebTransport is client-server and off-limits, WebCodecs is media-only, no P2P QUIC exists or is being drafted, and the WebRTC data channel API has been a frozen Recommendation since March 2025. WebRTC data channels remain the right and effectively the only browser-native choice for strict P2P bulk file transfer. The only helpful additions are complementary: compress before sending with Compression Streams (zstd), and use OPFS as a fast large-file sink. Any "WebTransport replaces WebRTC" framing is hype relative to Warp's constraints.

## 6. What this means for Warp

Findings mapped to the real files and to existing issue numbers.

### Throughput (`peer.ts`, `transfer.ts`)

- **The 8 MiB high-water mark is sound and now primary-sourced.** `bufferedAmount` caps at 16 MiB because libwebrtc's `MaxSendQueueSize()` returns 16 MiB and Blink's `ValidateSendLength()` throws `OperationError` above it [15, 16]. `SEND_HIGH_WATER = 8 MiB` leaves real headroom, and the check in `streamFile` counts the chunk about to be sent. Keep it.
- **The comment is imprecise, the behavior is right.** `CLAUDE.md` and the `peer.ts` header call this "Chrome's SCTP send buffer hard-caps at 16 MiB." The 16 MiB is the send-queue / `bufferedAmount` cap. The SCTP association send buffer is 256 KiB [13, 14], and the default `maxMessageSize` is 64 KiB [1, 6]. Recommend tightening the wording (Proposed issue P3).
- **256 KiB messages are at the aggressive edge but defensively wrapped.** Literature consensus is 16 KiB for compatibility, up to 256 KiB only with End-of-Record support on both peers [11, 12]. `sendChunkSize()` caps to the negotiated `maxMessageSize` and floors at 16 KiB, which is the correct adaptive shape. RFC 8831 §6.6 says a sender SHOULD limit messages to 16 KB to avoid monopolization [2]; Warp deviates, defensibly for single-file bulk transfer, but should document the deviation (Proposed issue P3).
- **Ordered plus reliable is correct.** The literature recommends ordered plus reliable with no `maxRetransmits` for file transfer [2, 3, 12]. `createDataChannel("warp", { ordered: true })` matches. Do not switch to unordered.
- **The SCTP window is not tunable from JavaScript.** Nurminen and Eskola found the untuned window hurts high-latency throughput [9, 10]. Warp cannot act on this; it explains throughput shortfalls on high-latency links and belongs in the honest-expectations copy, not the code.

### NAT honesty (`peer.ts`, `useNearby.ts`; issue #32)

- **The honest cost of STUN-only is large: roughly 12 to 30% of peer pairs fail without a relay** [21, 22, 23]. The `nat-failed` error is the right call given the constraint, but the magnitude makes the NAT-failure diagnostic panel (#32) genuinely important rather than cosmetic.
- **The hardest failure mode is mobile cellular**, via symmetric-on-both-sides NAT (RFC 4787 REQ-1 rationale [19]) and IPv6-only 464XLAT (RFC 6877 §1 [26]). Warp is mobile-first, so the honest-error UX must name these cases. Extend #32 to distinguish them using ICE candidate-type introspection and RFC 5780-style behavior discovery [20] (Proposed issue P4).
- **Same-LAN transfers succeed via host candidates** [17, 27], which `useNearby.ts` already exploits. No change needed.
- **ICE restart coverage is appropriate.** Initiator-only restart with `MAX_ICE_RESTARTS = 3` handles transient drops; RFC 8445 connectivity checks govern the rest [17]. Nothing in the literature suggests changing this.

### Integrity and resume (`hash.ts`, `transfer.ts`, `peer.ts`; issues #6, #137, #36)

- **Whole-file SHA-256 (#6) is a flat hash.** It cannot localize corruption or drive targeted re-request. Issue #137 (per-chunk manifest) is the right upgrade, and BEP 52's per-file SHA-256 Merkle "piece layers" is the direct template [35].
- **Frame #137 as resume granularity and corruption localization, not wire security.** The DTLS-authenticated reliable channel already makes in-transit bit flips impossible. Per-piece hashing targets storage and implementation corruption plus targeted resume. Stating this keeps the threat model honest.
- **Resume should report the highest contiguous verified offset, not just written bytes.** Warp's `bytesWritten` (`receiveController.ts`) is durable-written but not hash-verified, so a half-written corrupt tail could be trusted on resume. Layering the piece manifest closes this. Fold into #137/#36 (Proposed issue P5).
- **Use SHA-256 via the existing `hashWorker.ts` for the first manifest version.** It is dependency-free and already wired. BLAKE3 is tree-native and parallel but absent from Web Crypto and needs a WebAssembly dependency [31, 32]; defer it until hashing is a measured bottleneck.
- **A 256 KiB piece size aligns with `TARGET_SEND_CHUNK`.** BEP 3's floor is 256 KiB and libtorrent scales power-of-two up to 128 MiB [33, 40]; 256 KiB to 1 MiB is a sane browser default.

### Storage (`receiveController.ts`, `idbStage.ts`, `useWarpTransfer.ts`)

- **OPFS should replace IndexedDB as the primary large-receive fallback.** `FileSystemSyncAccessHandle` is supported on iOS Safari 15.2+ and Firefox 111+ [47, 48], the exact browsers `idbStage.ts` targets, and it streams and seeks in place without the in-RAM Blob-of-Blobs assembly that pressures the iOS jetsam ceiling [53]. This is the highest-value change the research justifies (Proposed issue P1). Keep `idbStage.ts` as the last resort for browsers without OPFS sync access.
- **The 1 GiB iOS cap is conservative and correct.** The soft ceiling is roughly 1.5 GB and device-dependent, and the kill is uncatchable [53, 54]. Keep `IOS_HARD_CAP` where it is.
- **The File System Access disk path stays Chromium-only.** Firefox and Safari still show no support [44], so the fallback (now OPFS) carries the mobile and Firefox load.
- **The Blob-row choice in `idbSink` is validated.** Persisted Blobs are file-backed in Chromium [56, 57], so staging is cheap and only assembly is expensive. OPFS removes the assembly cost entirely.
- **Safari's quota model changed at macOS 14 / iOS 17** from "initial 1 GiB then prompt" to about 60% of disk, and Safari evicts script-written data after 7 days idle [52]. `estimateFits()` adapts via `estimate()`, and the 24-hour `gcOrphanStaging()` TTL is safe. No change needed.

### Newer tech

- **WebTransport, WebCodecs, and P2P QUIC are all off-limits or irrelevant** [59, 60, 61, 67, 63]. The competitive-intel report's call to skip them is confirmed by primary sources.
- **Compression Streams (zstd) is a cheap, client-side throughput win** for compressible payloads [69, 70] (Proposed issue P2).
- **Chrome M133's exemption of data-channel tabs from background freezing** [66] quietly helps Warp's long mobile transfers; worth a note in the resilience copy, no code change.

### Blunt flags where implementation meets literature

1. **`idbStage.ts` falls back to IndexedDB on browsers that have supported OPFS for years.** iOS Safari since 15.2 (2021) and Firefox since 111 (2023) both support the Worker-only `FileSystemSyncAccessHandle` [47, 48], which avoids the in-RAM Blob-of-Blobs assembly that the file exists to prevent. This is the sharpest contradiction with the literature.
2. **The 16 MiB comment mislabels the layer.** The behavior is correct and primary-sourced [15, 16]; the term "SCTP send buffer" should read "send-queue / bufferedAmount cap." The SCTP association buffer is 256 KiB [13, 14].
3. **256 KiB messages exceed the RFC 8831 §6.6 SHOULD of 16 KB** [2]. Defensible for single-file bulk transfer, but undocumented in the code.
4. **Resume trusts written bytes, not verified bytes.** Known and tracked by #137; the literature (tus Checksum extension [36], BEP 52 [35], Hypercore [39]) all verify before trusting.

## 7. Proposed issues

New work the research justifies. These are listed, not filed. Refinements to existing issues (#137, #32, #36) are noted separately at the end so they are not mistaken for new issues.

### P1. OPFS receive sink as the primary large-file fallback

Replace IndexedDB Blob staging with an Origin Private File System sink using `FileSystemSyncAccessHandle` inside a DedicatedWorker, on iOS Safari 15.2+ and Firefox 111+. Keep `idbStage.ts` as the last resort for browsers without OPFS sync access.

Rationale: OPFS streams and seeks in place and never materializes a Blob-of-Blobs in RAM, which directly attacks the iOS jetsam ceiling (`IOS_HARD_CAP`, `idbStage.ts`) that the current fallback works around [47, 48, 53]. OPFS is supported on the exact browsers the IndexedDB path targets today [47, 48]. The Storage Foundation API was folded into OPFS, so this is the shipped modern answer [50, 51].

Constraints respected: $0 and client-side (OPFS is origin storage, no server); no relay; honest refusal preserved (OPFS still counts against quota and is best-effort evictable, so `estimateFits()` still gates [49, 52]). Touches `receiveController.ts`, `idbStage.ts`, `useWarpTransfer.ts`; adds a worker.

### P2. Optional per-file compression before send (Compression Streams, zstd)

Negotiate optional compression in the offer manifest; compress with the Compression Streams API on send and decompress on receive. Default off for already-compressed media (images, video, archives).

Rationale: Compression Streams is Baseline since May 2023 for gzip/deflate, with zstd in Chrome 123, Firefox 126, and Safari 18 [69, 70]. For compressible payloads (documents, text, source, databases) it is a pure client-side throughput win that also reduces the bytes crossing a constrained mobile uplink.

Constraints respected: $0 and client-side; no server in the path; no relay. Touches `transfer.ts` (manifest field), `peer.ts` (`streamFile` and the receive path). Medium-confidence on exact zstd version numbers [70]; gate on feature detection.

### P3. Correct and document the SCTP size-limit comments

Rewrite the `peer.ts` header comment and the `CLAUDE.md` bullet to name the three distinct limits: 64 KiB default `maxMessageSize` (RFC 8841 §6.1) [1], 256 KiB SCTP association send buffer (usrsctp / Chromium `kSendBufferSize`) [13, 14], and 16 MiB `bufferedAmount` send-queue cap (libwebrtc `MaxSendQueueSize`, Blink `ValidateSendLength`) [15, 16]. Add a short note that 256 KiB messages deviate from the RFC 8831 §6.6 SHOULD of 16 KB and why (single-stream bulk transfer; capped to the negotiated peer limit) [2].

Rationale: the behavior is correct; the documentation conflates layers and will mislead the next contributor who tries to tune these constants.

Constraints respected: documentation only; no behavior change; respects every constraint trivially.

### P4. Name the unrecoverable NAT cases in the honest-error path

Extend the NAT-failure diagnostic (#32) to distinguish symmetric-on-both-sides NAT from IPv6-only 464XLAT cellular, using ICE candidate-type introspection (host versus srflx versus relay) and RFC 5780-style NAT behavior discovery, and tailor the user-facing message and remediation per case.

Rationale: the two dominant unrecoverable cases have different causes and different workarounds (switch networks versus wait for IPv6 reachability), and the hardest one lands on the mobile platforms Warp targets first [19, 26, 21]. RFC 5780 warns its probes are only upper bounds [20], so the copy must stay probabilistic and honest.

Constraints respected: client-side introspection only; no relay; strengthens the honest-error commitment. Builds on #32 rather than replacing it.

### P5. (Refinement to #137 / #36, not a new issue) Verified-offset resume

When the per-chunk manifest lands (#137), make the resume offset the highest contiguous *verified* piece rather than the highest durable-written byte, and re-request any unverified or mismatched pieces by index before trusting the partial.

Rationale: the tus Checksum extension [36], BEP 52 [35], and Hypercore [39] all verify before trusting an offset. Warp's current `bytesWritten` is durable but unverified, so a corrupt tail could be trusted on resume. This is a refinement of existing #137/#36, listed here only to record that the research supports it.

## References

1. C. Holmberg, R. Shpount, S. Loreto, M. Tuexen, "Session Description Protocol (SDP) Offer/Answer Procedures for SCTP over DTLS Transport," RFC 8841, IETF, January 2021, §6.1. https://www.rfc-editor.org/rfc/rfc8841
2. R. Jesup, S. Loreto, M. Tuexen, "WebRTC Data Channels," RFC 8831, IETF, January 2021, §4 Req. 8, §6.1, §6.6. https://www.rfc-editor.org/rfc/rfc8831
3. R. Jesup, S. Loreto, M. Tuexen, "WebRTC Data Channel Establishment Protocol," RFC 8832, IETF, January 2021, §5.1. https://www.rfc-editor.org/rfc/rfc8832
4. R. Stewart, M. Tuexen, et al., "Stream Control Transmission Protocol," RFC 9260, IETF, June 2022, §1.5.2, §3.3.1. https://www.rfc-editor.org/rfc/rfc9260
5. M. Tuexen, et al., "Stream Schedulers and User Message Interleaving for SCTP," RFC 8260, IETF, April 2020. https://www.rfc-editor.org/rfc/rfc8260
6. W3C, "WebRTC: Real-Time Communication in Browsers," W3C Recommendation, 13 March 2025, §6.1.1 (`[[MaxMessageSize]]` = 65536), §6.2. https://www.w3.org/TR/webrtc/
7. MDN, "RTCDataChannel" (`bufferedAmountLowThreshold` default 0; `ordered` default true). https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
8. MDN, "RTCSctpTransport.maxMessageSize." https://developer.mozilla.org/en-US/docs/Web/API/RTCSctpTransport/maxMessageSize
9. J. Nurminen, V. Eskola, "Performance Evaluation of WebRTC Data Channels," IEEE Symposium on Computers and Communication (ISCC) 2015, pp. 676 to 680, DOI 10.1109/ISCC.2015.7884873. https://ieeexplore.ieee.org/document/7884873
10. V. Eskola, "Performance evaluation of WebRTC data channels," B.Sc. thesis, Aalto University, 2014. https://aaltodoc.aalto.fi/items/1d7e7694-3974-4991-992b-29ac07d8ec8e
11. S. Mladenov, "WebRTC Data Channel Message Size," viblast blog, 5 February 2015 (archived). https://web.archive.org/web/20160717191103/http://viblast.com/blog/2015/2/5/webrtc-data-channel-message-size
12. webrtc.link, "RTCDataChannel Complete Guide: File Transfer, Game Sync and Message Size Limits." https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/
13. usrsctp, `sctp_sysctl.h` (`SCTPCTL_MAXDGRAM_DEFAULT 262144`) and `sctp_sysctl.c`. https://github.com/sctplab/usrsctp
14. Chromium WebRTC, `media/sctp/sctptransport.cc` (`kSendBufferSize = 256 * 1024`, "the usrsctp default"; `kSendThreshold = sendspace/2`). https://chromium.googlesource.com/external/webrtc/+/branch-heads/70/media/sctp/sctptransport.cc
15. libwebrtc, `api/data_channel_interface.cc`, `DataChannelInterface::MaxSendQueueSize()` returns `16 * 1024 * 1024` ("16 MiB"). https://webrtc.googlesource.com/src/+/refs/heads/main/api/data_channel_interface.cc
16. Chromium Blink, `third_party/blink/renderer/modules/peerconnection/rtc_data_channel.cc`, `ValidateSendLength()` and `ThrowSendBufferFullException()` (`OperationError`, "RTCDataChannel send queue is full"). https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/peerconnection/rtc_data_channel.cc
17. A. Keranen, C. Holmberg, J. Rosenberg, "Interactive Connectivity Establishment (ICE)," RFC 8445, IETF, July 2018. https://www.rfc-editor.org/rfc/rfc8445
18. J. Rosenberg, R. Mahy, P. Matthews, D. Wing, "Session Traversal Utilities for NAT (STUN)," RFC 5389, IETF, October 2008, Abstract, §2, §14. https://www.rfc-editor.org/rfc/rfc5389
19. F. Audet, C. Jennings, "Network Address Translation (NAT) Behavioral Requirements for Unicast UDP," RFC 4787, IETF, January 2007, §4.1 REQ-1, §5. https://www.rfc-editor.org/rfc/rfc4787
20. D. Wing, "NAT Behavior Discovery Using Session Traversal Utilities for NAT (STUN)," RFC 5780, IETF, February 2010, §4. https://www.rfc-editor.org/rfc/rfc5780
21. D. Trautwein, M. Ihle, M. Schubotz, B. Gipp, "Challenging Tribal Knowledge: Large Scale Measurement Campaign on Decentralized NAT Traversal," arXiv:2510.27500, 2025. https://arxiv.org/html/2510.27500v1
22. Stack Overflow, "What percentage of users are behind symmetric NATs?" (answer by Yrlec, 19 March 2011; ~8% relayed, attributed to Google/libjingle). https://stackoverflow.com/questions/4810432/
23. ExpressTURN blog, "Why WebRTC Calls Fail on Mobile Networks," 18 September 2025. https://www.expressturn.com/blog/webrtc-calls-fail-on-mobile-networks
24. webrtc.org, "TURN server," updated 30 November 2024. https://webrtc.org/getting-started/turn-server
25. M. Ford, C. Holmberg, "Carrier-Grade NAT (CGN) Deployment Requirements," RFC 6888 (and RFC 4787 inheritance), IETF, April 2013, §1, REQ-7. https://www.rfc-editor.org/rfc/rfc6888
26. X. Li, C. Bao, F. Baker, "464XLAT: Combination of Stateful and Stateless Translation," RFC 6877, IETF, March 2013, §1, §6.6. https://www.rfc-editor.org/rfc/rfc6877
27. GetStream, "ICE Candidate Tutorial." https://getstream.io/resources/projects/webrtc/basics/ice-candidates/
28. R. C. Merkle, "A Digital Signature Based on a Conventional Encryption Function," CRYPTO '87, LNCS 293, Springer, 1988. https://people.eecs.berkeley.edu/~raluca/cs261-f15/readings/merkle.pdf
29. R. C. Merkle, "A Certified Digital Signature," CRYPTO '89, LNCS 435, Springer, 1990. https://link.springer.com/chapter/10.1007/0-387-34805-0_21
30. R. C. Merkle, "Secrecy, Authentication, and Public Key Systems," PhD thesis, Stanford University, 1979/1980. http://www.merkle.com/papers/Certified1979.pdf
31. J. O'Connor, J.-P. Aumasson, S. Neves, Z. Wilcox-O'Hearn, "BLAKE3: one function, fast everywhere," spec v20211102 (original 2020). https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf
32. MDN, "SubtleCrypto.digest()" (SHA-1/256/384/512 only). https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
33. B. Cohen, "BEP 3: The BitTorrent Protocol Specification." https://www.bittorrent.org/beps/bep_0003.html
34. B. Cohen, "Incentives Build Robustness in BitTorrent," P2PECON 2003. https://www.bittorrent.org/bittorrentecon.pdf
35. B. Cohen, "BEP 52: The BitTorrent Protocol Specification v2." https://www.bittorrent.org/beps/bep_0052.html
36. tus, "Resumable Upload Protocol" (core, Creation, and Checksum extensions). https://tus.io/protocols/resumable-upload
37. R. Polli, L. Pardue, "Digest Fields," RFC 9530, IETF, February 2024. https://www.rfc-editor.org/rfc/rfc9530
38. IPFS, "UnixFS Specification." https://specs.ipfs.tech/unixfs/
39. Holepunch, "Hypercore" (README). https://github.com/holepunchto/hypercore
40. libtorrent, "create_torrent / piece_size reference." https://www.libtorrent.org/reference-Create_Torrents.html
41. WHATWG, "File System Standard" (OPFS bucket, `FileSystemDirectoryHandle`, `FileSystemSyncAccessHandle` `[Exposed=DedicatedWorker]`). https://fs.spec.whatwg.org/
42. MDN, "Window.showSaveFilePicker()" (transient user activation; `SecurityError` otherwise). https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker
43. MDN, "File System API." https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
44. caniuse, "File System Access API" (Chrome/Edge from v105; Firefox and Safari not supported through 156 / 26.5). https://caniuse.com/native-filesystem-api
45. Chrome Developers blog, "Persistent permissions for the File System Access API." https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
46. MDN, "FileSystemHandle.requestPermission()." https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission
47. web.dev, "The Origin Private File System," updated 8 June 2023 (Chrome 86, Edge 86, Firefox 111, Safari 15.2). https://web.dev/articles/origin-private-file-system
48. WebKit blog, "The File System API with Origin Private File System," 14 February 2022. https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/
49. WHATWG, "Storage Standard" (best-effort default, persistent permission, eviction, quota estimate). https://storage.spec.whatwg.org/
50. Chrome Developers, "Storage Foundation API" explainer (folded into OPFS). https://developer.chrome.com/docs/web-platform/storage-foundation/
51. web.dev, "Storage for the web," (IndexedDB + OPFS + Cache; OPFS sync handle for large binary). https://web.dev/articles/storage-for-the-web
52. MDN, "Storage quotas and eviction criteria" (Chrome ~60%, Firefox 10%/50%, Safari ~60% on macOS 14/iOS 17+, 7-day Safari eviction). https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
53. WebKit bug 277848, "Inconsistent Memory Management in Safari on iPhone 12 Pro" (iOS ~1.5 GB soft jetsam limit; transient ~3 GB on iPhone 15 Pro). https://bugs.webkit.org/show_bug.cgi?id=277848
54. Apple Developer Forums, thread 761666 (iOS Safari memory ceiling). https://developer.apple.com/forums/thread/761666
55. MDN, "Blob." https://developer.mozilla.org/en-US/docs/Web/API/Blob
56. Chromium, IndexedDB design docs ("most Blobs in Chrome point to on-disk files"). https://chromium.googlesource.com/chromium/src/+/master/content/browser/indexed_db/docs/README.md
57. ChromeStatus, IndexedDB blob files ("blob files containing this data show up as opaque files"). https://chromestatus.com/feature/5140210640486400
58. BlobForge, "Browser memory limits" (mobile JS heaps ~256 to 512 MB). https://blobforge.io/blog/browser-memory-limits
59. W3C, "WebTransport," Working Draft, 6 July 2026. https://www.w3.org/TR/webtransport/
60. IETF, "WebTransport over HTTP/3," draft-ietf-webtrans-http3-16, 6 July 2026. https://datatracker.ietf.org/doc/draft-ietf-webtrans-http3/
61. IETF, "The WebTransport Protocol Framework," draft-ietf-webtrans-overview-13, 6 July 2026. https://datatracker.ietf.org/doc/draft-ietf-webtrans-overview/
62. caniuse, "WebTransport" (Chrome 97+, Edge 98+, Firefox 114+, Safari 26.4+). https://caniuse.com/webtransport
63. W3C GitHub, "p2p-webtransport" early draft (stale, references removed `QuicTransport`). https://w3c.github.io/p2p-webtransport/webtransport.html
64. MDN, "RTCSctpTransport.maxMessageSize" (Baseline since May 2023). https://developer.mozilla.org/en-US/docs/Web/API/RTCSctpTransport/maxMessageSize
65. W3C, "WebRTC Extended Use Cases," Group Draft Note, 14 December 2023. https://www.w3.org/TR/webrtc-nv-use-cases/
66. WebRTC for Developers, "WebRTC API Update 2025," 25 January 2025 (no data-channel changes M131 to M134 / Firefox 132 to 134 / Safari 18; Chrome M133 background-freeze exemption). https://www.webrtc-developers.com/webrtc-api-update-2025/
67. MDN, "WebCodecs API." https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
68. M. Richter, "WebTransport over WebSocket," draft-richter-webtransport-websocket. https://martenrichter.github.io/draft-ietf-webtransport-websocket/draft-richter-webtransport-websocket.html
69. MDN, "Compression Streams API" (Baseline since May 2023 for gzip/deflate). https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API
70. MDN browser-compat-data issue #29824 (zstd in CompressionStream: Chrome 123, Firefox 126; medium-confidence). https://github.com/mdn/browser-compat-data/issues/29824
