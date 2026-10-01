//! Wire protocol types — mirrors `web/src/lib/warp/transfer.ts` and
//! `signaling.ts` exactly so the CLI interoperates with the browser app.
//!
//! Control frames travel as JSON strings over the data channel; file bytes
//! travel as binary chunks between `file-begin` and `file-end`.

use serde::{Deserialize, Serialize};

// ---- signaling (WebSocket to the Cloudflare Worker) -----------------------

pub const SIGNALING_URL: &str = "wss://warp-signaling.ishannaik7.workers.dev";

/// Client -> server frames.
#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum ClientFrame {
    #[serde(rename = "join")]
    Join {
        #[serde(skip_serializing_if = "Option::is_none")]
        room: Option<String>,
    },
    #[serde(rename = "signal")]
    Signal { to: String, data: SignalData },
    #[serde(rename = "ping")]
    Ping,
}

/// The opaque WebRTC handshake payload the server relays between peers.
/// Field names match the JS `SignalData` union.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SignalData {
    Offer { sdp: String },
    Answer { sdp: String },
    Ice { candidate: IceCandidate },
    Cancel { id: String },
    Pause { id: String },
    Resume { id: String },
}

/// Mirrors the JS `RTCIceCandidateInit` (camelCase on the wire).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceCandidate {
    pub candidate: String,
    #[serde(rename = "sdpMid")]
    pub sdp_mid: Option<String>,
    #[serde(rename = "sdpMLineIndex")]
    pub sdp_mline_index: Option<u16>,
    #[serde(rename = "usernameFragment")]
    pub username_fragment: Option<String>,
}

/// Server -> client frames.
/// Some fields are read for CLI state; others exist for wire compatibility
/// with the browser signaling protocol (serde needs them to parse).
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
pub enum ServerFrame {
    #[serde(rename = "joined")]
    Joined {
        #[serde(rename = "selfId")]
        self_id: String,
        room: String,
        #[serde(default)]
        peers: Vec<String>,
    },
    #[serde(rename = "peer-joined")]
    PeerJoined {
        #[serde(rename = "peerId")]
        peer_id: String,
    },
    #[serde(rename = "peer-left")]
    PeerLeft {
        #[serde(rename = "peerId")]
        peer_id: String,
    },
    #[serde(rename = "signal")]
    Signal { from: String, data: SignalData },
    #[serde(rename = "nearby")]
    Nearby,
    #[serde(rename = "error")]
    Error {
        error: String,
        #[serde(default)]
        message: Option<String>,
    },
}

// ---- data channel control frames (JSON strings) ---------------------------

/// One file descriptor inside a batch offer.
/// Field names match the JS `OfferItem` (camelCase on the wire).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfferItem {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub mime: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumb: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    #[serde(rename = "resumeToken", skip_serializing_if = "Option::is_none")]
    pub resume_token: Option<String>,
}

/// Control frames over the RTCDataChannel.
/// Field names match the JS `ControlMessage` union (camelCase on the wire).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "t")]
pub enum ControlMessage {
    #[serde(rename = "offer")]
    Offer {
        #[serde(rename = "batchId")]
        batch_id: String,
        items: Vec<OfferItem>,
    },
    #[serde(rename = "accept")]
    Accept {
        #[serde(rename = "batchId")]
        batch_id: String,
        #[serde(default)]
        resume: Option<serde_json::Map<String, serde_json::Value>>,
        #[serde(default)]
        codecs: Option<Vec<String>>,
    },
    #[serde(rename = "decline")]
    Decline {
        #[serde(rename = "batchId")]
        batch_id: String,
    },
    #[serde(rename = "file-begin")]
    FileBegin {
        id: String,
        offset: u64,
        #[serde(default)]
        codec: Option<String>,
        #[serde(default)]
        pieces: Option<PieceManifest>,
    },
    #[serde(rename = "file-end")]
    FileEnd { id: String },
    #[serde(rename = "piece-request")]
    PieceRequest { id: String, index: u64 },
    #[serde(rename = "piece")]
    Piece { id: String, index: u64 },
    #[serde(rename = "cancel")]
    Cancel { id: String },
    #[serde(rename = "pause")]
    Pause { id: String },
    #[serde(rename = "text")]
    Text { id: String, text: String },
}

/// Per-piece SHA-256 manifest (#137). Mirrors `PieceManifest` in
/// `web/src/lib/warp/pieceManifest.ts`: `{ pieceSize, size, hashes }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PieceManifest {
    /// Piece size in bytes (the last piece may be shorter).
    #[serde(rename = "pieceSize")]
    pub piece_size: u64,
    /// Total plaintext file size in bytes.
    pub size: u64,
    /// Lower-case hex SHA-256, one per piece, in order.
    pub hashes: Vec<String>,
}

impl PieceManifest {
    pub fn piece_count(&self) -> u64 {
        self.size.div_ceil(self.piece_size.max(1))
    }

    /// Byte length of piece `index` (the last one may be short).
    pub fn piece_len(&self, index: u64) -> u64 {
        let start = index * self.piece_size;
        self.piece_size.min(self.size.saturating_sub(start))
    }
}

/// Size window for per-piece verification, matching the web app:
/// fresh files >= 1 MiB and <= 2 GiB get a manifest.
pub const MANIFEST_MIN_SIZE: u64 = 1024 * 1024;
pub const MANIFEST_MAX_SIZE: u64 = 2 * 1024 * 1024 * 1024;
/// Cap the hash count at 512, like `MAX_PIECES` in the web app, so the
/// manifest frame stays far below any peer's max message size.
pub const MAX_PIECES: u64 = 512;
/// The CLI's smallest piece. The web app starts at 256 KiB, but a re-requested
/// piece travels as ONE binary frame and webrtc-rs cannot send a frame over
/// 64 KiB. Starting at 64 KiB means files up to 32 MiB can answer a
/// `piece-request`. The receiver reads the size from the manifest.
pub const CLI_PIECE_SIZE: u64 = 64 * 1024;

/// Whether a fresh (offset 0) file should carry a piece manifest.
pub fn should_manifest(size: u64) -> bool {
    (MANIFEST_MIN_SIZE..=MANIFEST_MAX_SIZE).contains(&size)
}

/// Double `floor` until the piece count fits MAX_PIECES. Same rule as
/// `choosePieceSize` in the web app (ceil division), from a given floor.
pub fn choose_piece_size(size: u64, floor: u64) -> u64 {
    let mut piece = floor.max(1);
    while size.div_ceil(piece) > MAX_PIECES {
        piece *= 2;
    }
    piece
}

/// Hash one piece.
pub fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(data))
}

/// Build a manifest by reading `path` one piece at a time (never the whole
/// file in memory). Returns None outside the manifest size window.
pub async fn manifest_for_file(
    path: &std::path::Path,
    size: u64,
) -> std::io::Result<Option<PieceManifest>> {
    use tokio::io::AsyncReadExt;
    if !should_manifest(size) {
        return Ok(None);
    }
    let piece_size = choose_piece_size(size, CLI_PIECE_SIZE);
    let mut file = tokio::fs::File::open(path).await?;
    let mut buf = vec![0u8; piece_size as usize];
    let mut hashes = Vec::new();
    let mut left = size;
    while left > 0 {
        let want = piece_size.min(left) as usize;
        file.read_exact(&mut buf[..want]).await?;
        hashes.push(sha256_hex(&buf[..want]));
        left -= want as u64;
    }
    Ok(Some(PieceManifest {
        piece_size,
        size,
        hashes,
    }))
}

/// Receiver side of #137: buffers the byte stream into pieces, checks each
/// against the manifest, and hands back only VERIFIED bytes, in file order.
/// A bad piece is reported for a `piece-request`; pieces after it wait in
/// memory until its re-send verifies, so the sink never holds a hole.
pub struct PieceVerifier {
    manifest: PieceManifest,
    /// Next piece index the forward stream is filling.
    filling: u64,
    current: Vec<u8>,
    /// Next piece index the sink needs.
    write_next: u64,
    /// Verified pieces waiting behind a bad one.
    held: std::collections::BTreeMap<u64, Vec<u8>>,
    /// Re-request count per bad index.
    retries: std::collections::HashMap<u64, u32>,
}

/// What a verifier step produced.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Verified {
    /// Verified bytes to append to the sink, in order.
    pub write: Vec<u8>,
    /// Piece indices that failed and must be re-requested.
    pub request: Vec<u64>,
}

/// Give up on a piece after this many bad re-sends.
pub const MAX_PIECE_RETRIES: u32 = 3;

impl PieceVerifier {
    pub fn new(manifest: PieceManifest) -> Self {
        PieceVerifier {
            manifest,
            filling: 0,
            current: Vec::new(),
            write_next: 0,
            held: Default::default(),
            retries: Default::default(),
        }
    }

    pub fn manifest(&self) -> &PieceManifest {
        &self.manifest
    }

    /// Every piece verified and handed out.
    pub fn done(&self) -> bool {
        self.write_next >= self.manifest.piece_count()
    }

    /// Feed forward-stream bytes (any chunking).
    pub fn feed(&mut self, mut bytes: &[u8]) -> Result<Verified, String> {
        let mut out = Verified::default();
        while !bytes.is_empty() {
            if self.filling >= self.manifest.piece_count() {
                return Err("more bytes than the manifest describes".into());
            }
            let need = self.manifest.piece_len(self.filling) as usize - self.current.len();
            let take = need.min(bytes.len());
            self.current.extend_from_slice(&bytes[..take]);
            bytes = &bytes[take..];
            if self.current.len() == self.manifest.piece_len(self.filling) as usize {
                let piece = std::mem::take(&mut self.current);
                let index = self.filling;
                self.filling += 1;
                self.accept(index, piece, &mut out)?;
            }
        }
        Ok(out)
    }

    /// A re-sent piece (the binary frame after a `piece` control).
    pub fn inject(&mut self, index: u64, piece: Vec<u8>) -> Result<Verified, String> {
        let mut out = Verified::default();
        if index < self.write_next || self.held.contains_key(&index) {
            return Ok(out); // already have it
        }
        if index >= self.manifest.piece_count() {
            return Err(format!("re-sent piece {index} is outside the manifest"));
        }
        self.accept(index, piece, &mut out)?;
        Ok(out)
    }

    fn accept(&mut self, index: u64, piece: Vec<u8>, out: &mut Verified) -> Result<(), String> {
        let ok = piece.len() as u64 == self.manifest.piece_len(index)
            && self.manifest.hashes.get(index as usize) == Some(&sha256_hex(&piece));
        if !ok {
            let n = self.retries.entry(index).or_insert(0);
            *n += 1;
            if *n > MAX_PIECE_RETRIES {
                return Err(format!(
                    "piece {index} failed verification {MAX_PIECE_RETRIES} times"
                ));
            }
            out.request.push(index);
            return Ok(());
        }
        self.held.insert(index, piece);
        while let Some(p) = self.held.remove(&self.write_next) {
            out.write.extend_from_slice(&p);
            self.write_next += 1;
        }
        Ok(())
    }
}

/// Make a sender-supplied name safe to create under the output directory.
/// Keeps `a/b.txt` sub-folders (a folder send) but drops empty, `.`, `..`
/// and drive/root components, so `../../.bashrc` lands as `.bashrc` inside
/// the output directory. Never returns an empty path.
pub fn safe_relative_path(name: &str) -> std::path::PathBuf {
    let mut out = std::path::PathBuf::new();
    for part in name.split(['/', '\\']) {
        let part = part.trim();
        if part.is_empty() || part == "." || part == ".." || part.contains(':') {
            continue;
        }
        let clean: String = part.chars().filter(|c| !c.is_control()).collect();
        if !clean.is_empty() {
            out.push(clean);
        }
    }
    if out.as_os_str().is_empty() {
        out.push("file");
    }
    out
}

/// Room code alphabet (A-Z minus I, L, O, plus 2-9), same as the server.
pub const CODE_ALPHABET: &str = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/// The first 100 words of `WORDS` in `shared/codewords.js` (#42). Order is
/// the encoding, so a unit test checks this list against the JS file.
pub const WORDS: [&str; 100] = [
    "acorn", "amber", "anchor", "apple", "arrow", "aspen", "atlas", "aurora", "badge", "bamboo",
    "basil", "beacon", "birch", "bison", "breeze", "brook", "cactus", "canyon", "cedar", "chalk",
    "cherry", "cinder", "citrus", "clover", "comet", "coral", "cosmos", "crane", "daisy", "delta",
    "denim", "dune", "eagle", "ember", "fable", "falcon", "fern", "flint", "forest", "fossil",
    "gecko", "ginger", "granite", "grove", "harbor", "hazel", "helix", "heron", "indigo", "ivory",
    "jade", "jasmine", "juniper", "kelp", "kernel", "lagoon", "lantern", "larch", "lichen",
    "lotus", "lynx", "mango", "maple", "marble", "meadow", "mesa", "mint", "moss", "nebula",
    "nectar", "nimbus", "north", "nova", "oak", "onyx", "opal", "orbit", "otter", "paddle",
    "pebble", "pine", "plume", "prairie", "quartz", "quill", "radish", "raven", "reef", "ridge",
    "river", "rocket", "sage", "sand", "sparrow", "spruce", "summit", "talon", "thistle", "timber",
    "topaz",
];

/// Five-word alias -> canonical code, the Rust twin of `aliasToCode`. Each
/// word is one base-100 digit of the code's base-31 value.
pub fn alias_to_code(alias: &str) -> Option<String> {
    let words: Vec<String> = alias
        .split(|c: char| c.is_whitespace() || c == '-')
        .filter(|w| !w.is_empty())
        .map(|w| w.to_lowercase())
        .collect();
    if words.len() != 5 {
        return None;
    }
    let mut v: u64 = 0;
    for w in &words {
        v = v * 100 + WORDS.iter().position(|x| x == w)? as u64;
    }
    let base = CODE_ALPHABET.len() as u64;
    if v >= base.pow(6) {
        return None; // outside the code space: not a real alias
    }
    let alphabet = CODE_ALPHABET.as_bytes();
    let mut out = [0u8; 6];
    for slot in out.iter_mut().rev() {
        *slot = alphabet[(v % base) as usize];
        v /= base;
    }
    Some(String::from_utf8(out.to_vec()).expect("ascii alphabet"))
}

/// Canonical code -> five-word alias, the Rust twin of `codeToAlias`.
pub fn code_to_alias(code: &str) -> Option<String> {
    let mut v: u64 = 0;
    for c in code.chars() {
        v = v * CODE_ALPHABET.len() as u64 + CODE_ALPHABET.find(c)? as u64;
    }
    let mut words = [""; 5];
    for slot in words.iter_mut().rev() {
        *slot = WORDS[(v % 100) as usize];
        v /= 100;
    }
    Some(words.join("-"))
}

/// Normalise what the user typed into a room code. A code is upper-cased with
/// spaces and dashes removed; five words are decoded locally (the browser does
/// the same), so joining never depends on the server knowing aliases.
pub fn normalize_code(input: &str) -> Option<String> {
    if input.chars().filter(|c| c.is_ascii_alphabetic()).count() > 6 {
        return alias_to_code(input);
    }
    let code: String = input
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect::<String>()
        .to_uppercase();
    let valid = code.len() == 6 && code.chars().all(|c| CODE_ALPHABET.contains(c));
    valid.then_some(code)
}

/// File identity key: name + size + mtime, unit-separator delimited.
pub fn file_key(name: &str, size: u64, mtime_ms: u64) -> String {
    format!("{name}\u{241F}{size}\u{241F}{mtime_ms}")
}

/// Human byte formatting matching the web app's `formatBytes`.
pub fn format_bytes(b: u64) -> String {
    let b = b as f64;
    if b >= 1e9 {
        return format!("{:.1} GB", b / 1e9);
    }
    if b >= 1e6 {
        let mb = b / 1e6;
        let decimals = if b >= 1e8 { 0 } else { 1 };
        let rounded = format!("{mb:.decimals$}", decimals = decimals)
            .parse::<f64>()
            .unwrap_or(mb);
        if rounded >= 1000.0 {
            return format!("{:.1} GB", b / 1e9);
        }
        return format!("{rounded:.decimals$} MB");
    }
    if b >= 1e3 {
        let kb = (b / 1e3).round() as u64;
        if kb >= 1000 {
            return format!("{:.1} MB", b / 1e6);
        }
        return format!("{kb} KB");
    }
    format!("{} B", b as u64)
}

/// Random 8-char alphanumeric id, matching `fileId()` in the web app.
pub fn file_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..8)
        .map(|_| {
            let c = rng.gen_range(0..36);
            if c < 10 {
                (b'0' + c as u8) as char
            } else {
                (b'a' + (c - 10) as u8) as char
            }
        })
        .collect()
}

/// Random resume token (16 chars), matching `newResumeToken()`.
pub fn resume_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..16)
        .map(|_| {
            let c = rng.gen_range(0..36);
            if c < 10 {
                (b'0' + c as u8) as char
            } else {
                (b'a' + (c - 10) as u8) as char
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_bytes_like_web() {
        assert_eq!(format_bytes(500), "500 B");
        assert_eq!(format_bytes(1500), "2 KB");
        assert_eq!(format_bytes(5_000_000), "5.0 MB");
        assert_eq!(format_bytes(2_000_000_000), "2.0 GB");
    }

    #[test]
    fn manifest_piece_size_matches_web_rule() {
        // Web: 256 KiB floor, doubled while ceil(size / piece) > 512.
        assert_eq!(
            choose_piece_size(2 * 1024 * 1024 * 1024, 256 * 1024),
            4 * 1024 * 1024
        );
        // Ceil, not floor: 512 pieces + 1 byte must double.
        assert_eq!(
            choose_piece_size(512 * 256 * 1024 + 1, 256 * 1024),
            512 * 1024
        );
        assert_eq!(choose_piece_size(512 * 256 * 1024, 256 * 1024), 256 * 1024);
        assert_eq!(
            choose_piece_size(32 * 1024 * 1024, CLI_PIECE_SIZE),
            CLI_PIECE_SIZE
        );
    }

    #[test]
    fn file_key_uses_unit_separator() {
        let k = file_key("a\u{241F}b", 10, 20);
        assert_eq!(k, "a\u{241F}b\u{241F}10\u{241F}20");
    }

    #[test]
    fn joined_frame_parses_camelcase_self_id() {
        // The server sends selfId (camelCase); regression test for the
        // serde rename bug that broke the live handshake.
        let raw = r#"{"type":"joined","selfId":"abc123","room":"RSSZ82","peers":[]}"#;
        let frame: ServerFrame = serde_json::from_str(raw).unwrap();
        match frame {
            ServerFrame::Joined {
                self_id,
                room,
                peers,
            } => {
                assert_eq!(self_id, "abc123");
                assert_eq!(room, "RSSZ82");
                assert!(peers.is_empty());
            }
            _ => panic!("expected Joined"),
        }
    }

    #[test]
    fn peer_joined_frame_parses_peer_id() {
        let raw = r#"{"type":"peer-joined","peerId":"xyz789"}"#;
        let frame: ServerFrame = serde_json::from_str(raw).unwrap();
        match frame {
            ServerFrame::PeerJoined { peer_id } => assert_eq!(peer_id, "xyz789"),
            _ => panic!("expected PeerJoined"),
        }
    }

    #[test]
    fn signal_frame_round_trips_offer_sdp() {
        let msg = ControlMessage::Offer {
            batch_id: "batch-1".to_string(),
            items: vec![OfferItem {
                id: "f1".to_string(),
                name: "photo.png".to_string(),
                size: 1024,
                mime: "image/png".to_string(),
                thumb: None,
                key: Some("k1".to_string()),
                resume_token: Some("rt1".to_string()),
            }],
        };
        let json = serde_json::to_string(&msg).unwrap();
        // The web app serializes batchId / resumeToken in camelCase.
        assert!(json.contains("\"batchId\""));
        assert!(json.contains("\"resumeToken\""));
        assert!(json.contains("\"t\":\"offer\""));
        let back: ControlMessage = serde_json::from_str(&json).unwrap();
        match back {
            ControlMessage::Offer { batch_id, items } => {
                assert_eq!(batch_id, "batch-1");
                assert_eq!(items[0].name, "photo.png");
                assert_eq!(items[0].resume_token.as_deref(), Some("rt1"));
            }
            _ => panic!("expected Offer"),
        }
    }

    #[test]
    fn should_manifest_respects_size_window() {
        let tiny = 100 * 1024; // 100 KB — below window
        let fresh = 5 * 1024 * 1024; // 5 MiB — in window
        let huge = 4u64 * 1024 * 1024 * 1024; // 4 GiB — above window
        assert!(!should_manifest(tiny));
        assert!(should_manifest(fresh));
        assert!(!should_manifest(huge));
    }

    #[test]
    fn browser_manifest_parses() {
        // Exactly what pieceManifest.ts puts in file-begin. The old CLI struct
        // failed here with `missing field piece_size` and dropped the file.
        let raw = r#"{"t":"file-begin","id":"ab12cd34","offset":0,"pieces":{"pieceSize":262144,"size":1086501,"hashes":["aa","bb","cc","dd","ee"]}}"#;
        match serde_json::from_str::<ControlMessage>(raw).unwrap() {
            ControlMessage::FileBegin {
                pieces: Some(m), ..
            } => {
                assert_eq!(m.piece_size, 262144);
                assert_eq!(m.size, 1086501);
                assert_eq!(m.piece_count(), 5);
                assert_eq!(m.piece_len(4), 1086501 - 4 * 262144);
            }
            other => panic!("expected FileBegin with pieces, got {other:?}"),
        }
        let out = serde_json::to_string(&PieceManifest {
            piece_size: 1,
            size: 1,
            hashes: vec![],
        })
        .unwrap();
        assert_eq!(out, r#"{"pieceSize":1,"size":1,"hashes":[]}"#);
    }

    fn manifest_of(data: &[u8], piece_size: u64) -> PieceManifest {
        PieceManifest {
            piece_size,
            size: data.len() as u64,
            hashes: data.chunks(piece_size as usize).map(sha256_hex).collect(),
        }
    }

    #[test]
    fn verifier_writes_short_last_piece() {
        // The old receiver never flushed a short final piece, so any file not
        // a multiple of the piece size lost its tail.
        let data: Vec<u8> = (0..10_000u32).map(|i| (i * 31 % 251) as u8).collect();
        let mut v = PieceVerifier::new(manifest_of(&data, 4096));
        let mut written = Vec::new();
        for chunk in data.chunks(1000) {
            let out = v.feed(chunk).unwrap();
            assert!(out.request.is_empty());
            written.extend(out.write);
        }
        assert!(v.done());
        assert_eq!(written, data);
    }

    #[test]
    fn verifier_rerequests_bad_piece_and_holds_later_ones() {
        let data: Vec<u8> = (0..12_288u32).map(|i| (i % 253) as u8).collect();
        let mut v = PieceVerifier::new(manifest_of(&data, 4096));
        let mut bad = data.clone();
        bad[5000] ^= 0xff; // corrupt piece 1
        let out = v.feed(&bad).unwrap();
        assert_eq!(out.request, vec![1]);
        assert_eq!(out.write, data[..4096], "piece 2 must wait behind the hole");
        assert!(!v.done());
        let out = v.inject(1, data[4096..8192].to_vec()).unwrap();
        assert_eq!(out.write, data[4096..], "re-sent piece 1 releases piece 2");
        assert!(v.done());
    }

    #[test]
    fn verifier_gives_up_after_retries() {
        let data = vec![7u8; 8192];
        let mut v = PieceVerifier::new(manifest_of(&data, 4096));
        v.feed(&vec![0u8; 4096]).unwrap();
        for _ in 0..MAX_PIECE_RETRIES - 1 {
            assert_eq!(v.inject(0, vec![0u8; 4096]).unwrap().request, vec![0]);
        }
        assert!(v.inject(0, vec![0u8; 4096]).is_err());
    }

    #[test]
    fn verifier_rejects_extra_bytes() {
        let data = vec![1u8; 100];
        let mut v = PieceVerifier::new(manifest_of(&data, 64));
        assert!(v.feed(&[1u8; 101]).is_err());
    }

    #[tokio::test]
    async fn manifest_for_file_matches_in_memory_hashes() {
        let dir = std::env::temp_dir().join(format!("warp-manifest-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("m.bin");
        let data: Vec<u8> = (0..(3 * 1024 * 1024 + 777u32))
            .map(|i| (i % 249) as u8)
            .collect();
        std::fs::write(&path, &data).unwrap();
        let m = manifest_for_file(&path, data.len() as u64)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(m, manifest_of(&data, CLI_PIECE_SIZE));
        assert!(manifest_for_file(&path, 10).await.unwrap().is_none());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn safe_relative_path_blocks_traversal() {
        use std::path::PathBuf;
        assert_eq!(
            safe_relative_path("../../.bashrc"),
            PathBuf::from(".bashrc")
        );
        assert_eq!(
            safe_relative_path("/etc/passwd"),
            PathBuf::from("etc/passwd")
        );
        assert_eq!(
            safe_relative_path("C:\\Windows\\x.dll"),
            PathBuf::from("Windows/x.dll")
        );
        assert_eq!(
            safe_relative_path("photos/2026/a.jpg"),
            PathBuf::from("photos/2026/a.jpg")
        );
        assert_eq!(safe_relative_path(".."), PathBuf::from("file"));
        assert_eq!(safe_relative_path(""), PathBuf::from("file"));
    }

    #[test]
    fn normalize_code_accepts_codes_and_aliases() {
        assert_eq!(normalize_code("k7p2qr").as_deref(), Some("K7P2QR"));
        assert_eq!(normalize_code("K7P-2QR").as_deref(), Some("K7P2QR"));
        // Vector from shared/codewords.js: codeToAlias("YHJT2M").
        assert_eq!(
            normalize_code("atlas-aurora-sparrow-birch-hazel").as_deref(),
            Some("YHJT2M")
        );
        assert_eq!(
            normalize_code("Atlas aurora sparrow birch hazel").as_deref(),
            Some("YHJT2M")
        );
        assert_eq!(normalize_code("atlas aurora sparrow birch nope"), None);
        assert_eq!(
            normalize_code("zephyr zephyr zephyr zephyr zephyr"),
            None,
            "outside code space"
        );
        assert_eq!(
            code_to_alias("YHJT2M").as_deref(),
            Some("atlas-aurora-sparrow-birch-hazel")
        );
        for code in ["222222", "ZZZZZZ", "K7P2QR"] {
            assert_eq!(
                alias_to_code(&code_to_alias(code).unwrap()).as_deref(),
                Some(code)
            );
        }
        assert_eq!(normalize_code("K0P2QR"), None, "0 is not in the alphabet");
        assert_eq!(normalize_code("ABC"), None);
    }

    #[test]
    fn words_match_shared_codewords_js() {
        let js = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../shared/codewords.js"
        ))
        .expect("shared/codewords.js next to cli/");
        let start = js.find("const WORDS = [").unwrap();
        let end = js[start..].find("].slice(0, 100)").unwrap() + start;
        let js_words: Vec<&str> = js[start..end]
            .split('\'')
            .skip(1)
            .step_by(2)
            .take(100)
            .collect();
        assert_eq!(
            js_words,
            WORDS.to_vec(),
            "WORDS drifted from shared/codewords.js"
        );
    }
}
