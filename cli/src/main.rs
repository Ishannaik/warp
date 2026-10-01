//! warp — peer-to-peer WebRTC file transfer from the terminal.
//!
//! croc-style usage, wire-compatible with the Warp browser app
//! (github.com/Ishannaik/warp): same signaling server, same STUN servers,
//! same data-channel protocol, so a CLI and a browser swap files directly.
//!
//!   warp send photo.png notes/        # prints a code
//!   warp K7P2QR                       # receive (or the five code words)

mod peer;
mod protocol;
mod signaling;
mod ui;

use anyhow::{anyhow, bail, Context, Result};
use clap::{Args, Parser, Subcommand};
use peer::{PeerEvent, WarpPeer, MAX_SEND_MESSAGE};
use protocol::{
    file_id, file_key, format_bytes, manifest_for_file, normalize_code, resume_token,
    safe_relative_path, ControlMessage, OfferItem, PieceManifest, PieceVerifier, ServerFrame,
    SignalData,
};
use signaling::Signaling;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::sync::mpsc::UnboundedReceiver;
use ui::{style, Ui, UiState};

/// How much of a file we read from disk per pass.
const READ_BLOCK: usize = 4 * 1024 * 1024;
/// After the last byte, keep answering piece-requests this long before exiting
/// (a browser receiver keeps its tab open, so it never hangs up by itself).
const LINGER: Duration = Duration::from_secs(3);
/// After a text snippet, how long to wait for a file offer before finishing.
const TEXT_GRACE: Duration = Duration::from_secs(3);

#[derive(Parser)]
#[command(
    name = "warp",
    version,
    about = "peer-to-peer file transfer from the terminal (wire-compatible with warp.ishannaik.com)",
    args_conflicts_with_subcommands = true
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
    #[command(flatten)]
    receive: ReceiveArgs,
}

#[derive(Subcommand)]
enum Command {
    /// Send files or folders. Prints a code for the receiver.
    Send {
        /// Files and/or folders (folders are sent recursively).
        paths: Vec<PathBuf>,
        /// Send a text snippet instead of (or as well as) files.
        #[arg(long)]
        text: Option<String>,
    },
    /// Receive with a code (same as `warp <code>`).
    #[command(hide = true)]
    Receive(ReceiveArgs),
}

#[derive(Args)]
struct ReceiveArgs {
    /// The 6-char code or the five code words. Omit to be prompted, or set
    /// WARP_CODE to keep it out of the process list.
    code: Vec<String>,
    /// Folder to save into.
    #[arg(long, default_value = ".")]
    out: PathBuf,
    /// Accept offers without asking.
    #[arg(short, long)]
    yes: bool,
    /// Overwrite existing files instead of saving as "name (1).ext".
    #[arg(long)]
    overwrite: bool,
}

#[tokio::main]
async fn main() {
    env_logger::init();
    let cli = Cli::parse();
    let result = match cli.command {
        Some(Command::Send { paths, text }) => cmd_send(paths, text).await,
        Some(Command::Receive(args)) => cmd_receive(args).await,
        None => cmd_receive(cli.receive).await,
    };
    if let Err(e) = result {
        eprintln!("{} {e:#}", style("error:").fg(ui::AMBER).bold());
        std::process::exit(1);
    }
}

// ---- shared plumbing --------------------------------------------------------

/// Everything the peer or the server can tell us, merged into one stream.
enum Input {
    Server(ServerFrame),
    Peer(PeerEvent),
}

/// Wait for the next input from either side. A closed server socket is only
/// fatal before the data channel is up; after that the transfer is direct.
async fn next_input(
    frames: &mut UnboundedReceiver<ServerFrame>,
    peer: &mut WarpPeer,
    server_open: &mut bool,
) -> Result<Input> {
    loop {
        tokio::select! {
            f = frames.recv(), if *server_open => match f {
                Some(f) => return Ok(Input::Server(f)),
                None => *server_open = false,
            },
            ev = peer.events.recv() => {
                return Ok(Input::Peer(ev.unwrap_or(PeerEvent::Disconnected)));
            }
        }
    }
}

/// Non-blocking version of `next_input`, used between file chunks.
fn try_input(frames: &mut UnboundedReceiver<ServerFrame>, peer: &mut WarpPeer) -> Option<Input> {
    if let Ok(f) = frames.try_recv() {
        return Some(Input::Server(f));
    }
    peer.events.try_recv().ok().map(Input::Peer)
}

/// Pump the handshake until the data channel is open. Signal frames from the
/// peer are applied; everything else before open is noise.
async fn open_channel(
    frames: &mut UnboundedReceiver<ServerFrame>,
    peer: &mut WarpPeer,
    other: &str,
) -> Result<()> {
    let mut server_open = true;
    let deadline = tokio::time::sleep(Duration::from_secs(45));
    tokio::pin!(deadline);
    loop {
        let input = tokio::select! {
            i = next_input(frames, peer, &mut server_open) => i?,
            _ = &mut deadline => bail!(
                "couldn't open a direct channel to the {other}. One side may be behind a strict NAT. \
                 Warp is STUN-only and never relays your files."
            ),
        };
        match input {
            Input::Server(ServerFrame::Signal { data, .. }) => peer.handle_signal(data).await?,
            Input::Server(ServerFrame::PeerLeft { .. }) => bail!("the {other} left"),
            Input::Server(ServerFrame::Error { error, message }) => {
                bail!("server: {}", message.unwrap_or(error))
            }
            Input::Peer(PeerEvent::Connected) => return Ok(()),
            Input::Peer(PeerEvent::Disconnected) => bail!(
                "couldn't open a direct channel to the {other}. One side may be behind a strict NAT. \
                 Warp is STUN-only and never relays your files."
            ),
            _ => {}
        }
    }
}

/// Keep the progress bars animating. Dies with the process.
fn spawn_render(ui: Arc<Ui>) {
    tokio::spawn(async move {
        loop {
            ui.tick();
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    });
}

fn set_progress(state: &UiState, id: &str, done: u64, finished: bool) {
    if let Some(entry) = state.files.lock().unwrap().get_mut(id) {
        entry.1 = done.min(entry.2);
        entry.3 = finished;
    }
}

// ---- send -------------------------------------------------------------------

/// One file on disk, with the identity the receiver uses to match re-offers.
struct SendFile {
    path: PathBuf,
    /// Name on the wire: the file name, or `folder/sub/file` for folder sends.
    name: String,
    size: u64,
    key: String,
    token: String,
    manifest: Option<PieceManifest>,
}

/// Expand files and folders into a flat list. Folder entries keep their path
/// relative to the folder's parent, so `photos/` arrives as `photos/a.jpg`.
fn collect_files(paths: &[PathBuf]) -> Result<Vec<(PathBuf, String)>> {
    let mut out = Vec::new();
    for p in paths {
        let meta = std::fs::metadata(p).with_context(|| format!("can't read {}", p.display()))?;
        let base = p.file_name().map(|s| s.to_string_lossy().to_string());
        if meta.is_file() {
            out.push((p.clone(), base.unwrap_or_else(|| p.display().to_string())));
        } else if meta.is_dir() {
            let root = base.unwrap_or_else(|| "folder".to_string());
            let mut stack = vec![(p.clone(), root)];
            while let Some((dir, prefix)) = stack.pop() {
                let mut entries: Vec<_> = std::fs::read_dir(&dir)
                    .with_context(|| format!("can't read {}", dir.display()))?
                    .filter_map(|e| e.ok())
                    .collect();
                entries.sort_by_key(|e| e.file_name());
                for e in entries {
                    let name = format!("{prefix}/{}", e.file_name().to_string_lossy());
                    let ft = e.file_type()?;
                    if ft.is_dir() {
                        stack.push((e.path(), name));
                    } else if ft.is_file() {
                        out.push((e.path(), name));
                    }
                }
            }
        }
    }
    Ok(out)
}

async fn cmd_send(paths: Vec<PathBuf>, text: Option<String>) -> Result<()> {
    if paths.is_empty() && text.is_none() {
        bail!("nothing to send. Usage: warp send <files or folders> [--text \"...\"]");
    }
    let mut files = Vec::new();
    for (path, name) in collect_files(&paths)? {
        let meta = tokio::fs::metadata(&path).await?;
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        files.push(SendFile {
            key: file_key(&name, meta.len(), mtime_ms),
            path,
            name,
            size: meta.len(),
            token: resume_token(),
            manifest: None,
        });
    }
    if files.is_empty() && text.is_none() {
        bail!(
            "no files found in {}",
            paths
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        );
    }
    let total: u64 = files.iter().map(|f| f.size).sum();
    let summary = match (files.len(), &text) {
        (0, _) => "a text snippet".to_string(),
        (1, _) => format!("{} ({})", files[0].name, format_bytes(total)),
        (n, _) => format!("{n} files ({})", format_bytes(total)),
    };

    ui::banner();
    // Connect WITHOUT a room: the server mints the code.
    let (mut sig, _) = Signaling::connect(None).await?;
    let code = loop {
        match sig
            .next()
            .await?
            .ok_or_else(|| anyhow!("signaling closed"))?
        {
            ServerFrame::Joined { room, .. } => break room,
            ServerFrame::Error { error, message } => bail!("server: {}", message.unwrap_or(error)),
            _ => {}
        }
    };
    ui::print_code(&code, &summary);
    println!(
        "  {}",
        style("waiting for the receiver… (ctrl-c to cancel)").fg(ui::MUTED)
    );

    let writer = sig.clone_writer();
    let mut frames = sig.into_channel();
    let remote = loop {
        match frames
            .recv()
            .await
            .ok_or_else(|| anyhow!("signaling closed"))?
        {
            ServerFrame::PeerJoined { peer_id } => break peer_id,
            ServerFrame::Error { error, message } => bail!("server: {}", message.unwrap_or(error)),
            _ => {}
        }
    };

    // The receiver joined last, so it is the WebRTC initiator; we answer.
    let mut peer = WarpPeer::new(remote, false, writer).await?;
    open_channel(&mut frames, &mut peer, "receiver").await?;

    let state = Arc::new(UiState::new(code));
    let ui = Arc::new(Ui::new(state.clone()));
    spawn_render(ui.clone());

    let mut sender = Sender {
        frames,
        peer,
        ui: ui.clone(),
        state,
        paused: HashSet::new(),
        cancelled: HashSet::new(),
        resume_asked: HashSet::new(),
        piece_requests: Vec::new(),
        live: HashMap::new(),
    };
    let result = sender.run(&mut files, text).await;
    sender.peer.close().await;
    result?;
    ui.finish();
    Ok(())
}

struct Sender {
    frames: UnboundedReceiver<ServerFrame>,
    peer: WarpPeer,
    ui: Arc<Ui>,
    state: Arc<UiState>,
    /// Wire ids the receiver paused / cancelled / asked to resume.
    paused: HashSet<String>,
    cancelled: HashSet<String>,
    resume_asked: HashSet<String>,
    /// (wire id, piece index) waiting for an answer.
    piece_requests: Vec<(String, u64)>,
    /// Wire id -> index into `files`, for every id we have offered.
    live: HashMap<String, usize>,
}

impl Sender {
    async fn run(&mut self, files: &mut [SendFile], text: Option<String>) -> Result<()> {
        if let Some(text) = text {
            self.peer
                .send_control(&ControlMessage::Text {
                    id: file_id(),
                    text,
                })
                .await?;
            self.ui
                .line(format!("  {} text sent", style("✓").fg(ui::ACCENT)));
        }
        // Offer everything; a paused file is re-offered when the receiver
        // resumes it, exactly like the browser sender.
        let mut todo: Vec<usize> = (0..files.len()).collect();
        while !todo.is_empty() {
            let batch = std::mem::take(&mut todo);
            let paused = self.send_batch(files, &batch).await?;
            if paused.is_empty() {
                break;
            }
            todo = self.wait_for_resume(paused).await?;
        }
        self.peer.wait_drained(Duration::from_secs(60)).await?;
        // A browser receiver verifies pieces as they land and can still ask
        // for one after file-end. Answer until it goes quiet or hangs up.
        let mut quiet = tokio::time::Instant::now() + LINGER;
        loop {
            while let Some(input) = try_input(&mut self.frames, &mut self.peer) {
                if !self.handle(input).await? {
                    return Ok(()); // receiver hung up: done
                }
                quiet = tokio::time::Instant::now() + LINGER;
            }
            self.answer_piece_requests(files).await?;
            if tokio::time::Instant::now() >= quiet {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    /// Offer `batch`, wait for the answer, stream what was accepted. Returns
    /// the indices the receiver paused mid-stream.
    async fn send_batch(&mut self, files: &mut [SendFile], batch: &[usize]) -> Result<Vec<usize>> {
        let batch_id = file_id();
        let mut items = Vec::new();
        for &i in batch {
            let f = &files[i];
            let id = file_id();
            self.live.insert(id.clone(), i);
            items.push(OfferItem {
                id,
                name: f.name.clone(),
                size: f.size,
                mime: "application/octet-stream".to_string(),
                thumb: None,
                key: Some(f.key.clone()),
                resume_token: Some(f.token.clone()),
            });
        }
        self.peer
            .send_control(&ControlMessage::Offer {
                batch_id: batch_id.clone(),
                items: items.clone(),
            })
            .await?;
        *self.state.status.lock().unwrap() = "waiting for the receiver to accept…".to_string();

        let resume = loop {
            let mut open = true;
            let input = next_input(&mut self.frames, &mut self.peer, &mut open).await?;
            if let Input::Peer(PeerEvent::Control(text)) = &input {
                match serde_json::from_str::<ControlMessage>(text) {
                    Ok(ControlMessage::Accept {
                        batch_id: b,
                        resume,
                        ..
                    }) if b == batch_id => {
                        break resume.unwrap_or_default();
                    }
                    Ok(ControlMessage::Decline { batch_id: b }) if b == batch_id => {
                        bail!("the receiver declined the files");
                    }
                    _ => {}
                }
            }
            if !self.handle(input).await? {
                bail!("the receiver left before accepting");
            }
        };

        let mut paused = Vec::new();
        for item in &items {
            let i = self.live[&item.id];
            let offset = resume
                .get(&item.id)
                .and_then(|v| v.as_u64())
                .filter(|o| *o <= files[i].size)
                .unwrap_or(0);
            self.state.files.lock().unwrap().insert(
                item.id.clone(),
                (item.name.clone(), offset, item.size, false),
            );
            *self.state.status.lock().unwrap() = format!("sending {}", item.name);
            match self.stream_file(files, i, &item.id, offset).await? {
                Streamed::Done => set_progress(&self.state, &item.id, item.size, true),
                Streamed::Paused => {
                    self.ui.line(format!(
                        "  {} {} paused by the receiver",
                        style("‖").fg(ui::AMBER),
                        item.name
                    ));
                    paused.push(i);
                }
                Streamed::Cancelled => {
                    set_progress(&self.state, &item.id, 0, true);
                    self.ui.line(format!(
                        "  {} {} cancelled by the receiver",
                        style("✗").fg(ui::AMBER),
                        item.name
                    ));
                }
            }
        }
        Ok(paused)
    }

    /// Wait until the receiver resumes at least one paused file.
    async fn wait_for_resume(&mut self, paused: Vec<usize>) -> Result<Vec<usize>> {
        *self.state.status.lock().unwrap() =
            "paused. waiting for the receiver to resume…".to_string();
        loop {
            let ready: Vec<usize> = self
                .resume_asked
                .iter()
                .filter_map(|id| self.live.get(id).copied())
                .filter(|i| paused.contains(i))
                .collect();
            if !ready.is_empty() {
                self.resume_asked.clear();
                // Anything still paused stays paused; re-offer the rest later.
                let mut all = ready;
                all.sort_unstable();
                all.dedup();
                return Ok(all);
            }
            let mut open = true;
            let input = next_input(&mut self.frames, &mut self.peer, &mut open).await?;
            if !self.handle(input).await? {
                bail!("the receiver left while the transfer was paused");
            }
        }
    }

    async fn stream_file(
        &mut self,
        files: &mut [SendFile],
        i: usize,
        id: &str,
        offset: u64,
    ) -> Result<Streamed> {
        // Manifest (#137): hash once, reuse on a resumed re-offer (#171).
        if files[i].manifest.is_none() {
            *self.state.status.lock().unwrap() = format!("hashing {}", files[i].name);
            files[i].manifest = manifest_for_file(&files[i].path, files[i].size).await?;
        }
        let f = &files[i];
        // A resume must start on a piece boundary or the receiver can't verify.
        let offset = match &f.manifest {
            Some(m) if !offset.is_multiple_of(m.piece_size) => 0,
            _ => offset,
        };
        let mut file = File::open(&f.path)
            .await
            .with_context(|| format!("open {}", f.path.display()))?;
        file.seek(std::io::SeekFrom::Start(offset)).await?;
        self.peer
            .send_control(&ControlMessage::FileBegin {
                id: id.to_string(),
                offset,
                codec: None,
                pieces: f.manifest.clone(),
            })
            .await?;

        let mut sent = offset;
        let mut block = vec![0u8; READ_BLOCK];
        while sent < f.size {
            let n = file.read(&mut block).await?;
            if n == 0 {
                bail!("{} shrank while sending", f.path.display());
            }
            for chunk in block[..n].chunks(MAX_SEND_MESSAGE) {
                while let Some(input) = try_input(&mut self.frames, &mut self.peer) {
                    if !self.handle(input).await? {
                        bail!("the receiver left mid-transfer");
                    }
                }
                if self.cancelled.contains(id) {
                    return Ok(Streamed::Cancelled);
                }
                if self.paused.remove(id) {
                    // No file-end: the receiver keeps its partial open.
                    return Ok(Streamed::Paused);
                }
                self.answer_piece_requests(files).await?;
                self.peer.send_bytes(chunk).await?;
                sent += chunk.len() as u64;
                set_progress(&self.state, id, sent, false);
            }
        }
        self.peer
            .send_control(&ControlMessage::FileEnd { id: id.to_string() })
            .await?;
        Ok(Streamed::Done)
    }

    /// Re-send each requested piece as `piece` + ONE binary frame. A piece
    /// bigger than webrtc-rs can send in one frame gets an honest cancel.
    async fn answer_piece_requests(&mut self, files: &[SendFile]) -> Result<()> {
        for (id, index) in std::mem::take(&mut self.piece_requests) {
            let Some(f) = self.live.get(&id).map(|&i| &files[i]) else {
                continue;
            };
            let Some(m) = &f.manifest else { continue };
            if index >= m.piece_count() {
                continue;
            }
            let len = m.piece_len(index) as usize;
            if len > MAX_SEND_MESSAGE {
                self.peer
                    .send_control(&ControlMessage::Cancel { id: id.clone() })
                    .await?;
                self.ui.line(format!(
                    "  {} {}: the receiver found a corrupt piece and it is too big to re-send. Send the file again.",
                    style("✗").fg(ui::AMBER),
                    f.name
                ));
                continue;
            }
            let mut file = File::open(&f.path).await?;
            file.seek(std::io::SeekFrom::Start(index * m.piece_size))
                .await?;
            let mut buf = vec![0u8; len];
            file.read_exact(&mut buf).await?;
            self.peer
                .send_control(&ControlMessage::Piece {
                    id: id.clone(),
                    index,
                })
                .await?;
            self.peer.send_bytes(&buf).await?;
        }
        Ok(())
    }

    /// Apply one input. Returns false when the receiver is gone.
    async fn handle(&mut self, input: Input) -> Result<bool> {
        match input {
            Input::Server(ServerFrame::Signal { data, .. }) => match data {
                SignalData::Cancel { id } => {
                    self.cancelled.insert(id);
                }
                SignalData::Pause { id } => {
                    self.paused.insert(id);
                }
                SignalData::Resume { id } => {
                    self.paused.remove(&id);
                    self.resume_asked.insert(id);
                }
                other => self.peer.handle_signal(other).await?,
            },
            // The server only says who is in the room. A dropped signaling
            // socket doesn't end a direct transfer; the channel does.
            Input::Server(_) => {}
            Input::Peer(PeerEvent::Disconnected) => return Ok(false),
            Input::Peer(PeerEvent::Control(text)) => {
                match serde_json::from_str::<ControlMessage>(&text) {
                    Ok(ControlMessage::Cancel { id }) => {
                        self.cancelled.insert(id);
                    }
                    Ok(ControlMessage::Pause { id }) => {
                        self.paused.insert(id);
                    }
                    Ok(ControlMessage::PieceRequest { id, index }) => {
                        self.piece_requests.push((id, index))
                    }
                    Ok(ControlMessage::Text { text, .. }) => {
                        self.ui.line(format!(
                            "  {} {text}",
                            style("receiver says:").fg(ui::ACCENT)
                        ));
                    }
                    _ => {}
                }
            }
            Input::Peer(_) => {}
        }
        Ok(true)
    }
}

enum Streamed {
    Done,
    Paused,
    Cancelled,
}

// ---- receive ----------------------------------------------------------------

async fn cmd_receive(args: ReceiveArgs) -> Result<()> {
    let typed = if !args.code.is_empty() {
        args.code.join(" ")
    } else if let Ok(c) = std::env::var("WARP_CODE") {
        c
    } else {
        eprint!("code: ");
        let mut line = String::new();
        std::io::stdin().read_line(&mut line)?;
        line
    };
    let code = normalize_code(typed.trim()).ok_or_else(|| {
        anyhow!(
            "\"{}\" isn't a Warp code. Codes are 6 characters (like K7P2QR) or five words.",
            typed.trim()
        )
    })?;
    tokio::fs::create_dir_all(&args.out)
        .await
        .with_context(|| format!("create {}", args.out.display()))?;

    ui::banner();
    let (mut sig, _) = Signaling::connect(Some(code.clone())).await?;
    let (room, peers) = loop {
        match sig
            .next()
            .await?
            .ok_or_else(|| anyhow!("signaling closed"))?
        {
            ServerFrame::Joined { room, peers, .. } => break (room, peers),
            ServerFrame::Error { error, message } => bail!("server: {}", message.unwrap_or(error)),
            _ => {}
        }
    };
    let writer = sig.clone_writer();
    let mut frames = sig.into_channel();
    let sender_id = match peers.first() {
        Some(p) => p.clone(),
        None => {
            println!(
                "  {}",
                style(format!("joined {room}, waiting for the sender…")).fg(ui::MUTED)
            );
            loop {
                match frames
                    .recv()
                    .await
                    .ok_or_else(|| anyhow!("signaling closed"))?
                {
                    ServerFrame::PeerJoined { peer_id } => break peer_id,
                    ServerFrame::Error { error, message } => {
                        bail!("server: {}", message.unwrap_or(error))
                    }
                    _ => {}
                }
            }
        }
    };
    println!(
        "  {}",
        style("connecting directly to the sender…").fg(ui::MUTED)
    );

    // We joined last, so we initiate WebRTC (glare-free, like the browser).
    let mut peer = WarpPeer::new(sender_id, true, writer).await?;
    peer.create_offer().await?;
    open_channel(&mut frames, &mut peer, "sender").await?;

    let state = Arc::new(UiState::new(room));
    let ui = Arc::new(Ui::new(state.clone()));
    *state.status.lock().unwrap() = "connected. waiting for files…".to_string();
    spawn_render(ui.clone());

    let mut rx = Receiver {
        out: args.out,
        yes: args.yes,
        overwrite: args.overwrite,
        ui: ui.clone(),
        state,
        items: HashMap::new(),
        pending: HashSet::new(),
        current: None,
        received: 0,
        got_text: false,
    };
    let result = rx.run(&mut frames, &mut peer).await;
    peer.close().await;
    if let Some(cur) = rx.current.take() {
        let _ = tokio::fs::remove_file(&cur.part).await;
    }
    result?;
    ui.finish();
    Ok(())
}

struct Receiver {
    out: PathBuf,
    yes: bool,
    overwrite: bool,
    ui: Arc<Ui>,
    state: Arc<UiState>,
    /// Every accepted item by wire id.
    items: HashMap<String, OfferItem>,
    /// Accepted ids not finished yet.
    pending: HashSet<String>,
    current: Option<Incoming>,
    /// Files finished (text snippets don't count).
    received: usize,
    got_text: bool,
}

/// The file currently being written.
struct Incoming {
    id: String,
    final_path: PathBuf,
    /// Bytes land here and are renamed on success, so a half file never
    /// looks finished.
    part: PathBuf,
    file: File,
    written: u64,
    verifier: Option<PieceVerifier>,
    /// The next binary frame is this re-sent piece.
    pending_piece: Option<u64>,
    ended: bool,
    hasher: sha2::Sha256,
}

impl Receiver {
    async fn run(
        &mut self,
        frames: &mut UnboundedReceiver<ServerFrame>,
        peer: &mut WarpPeer,
    ) -> Result<()> {
        let mut server_open = true;
        loop {
            // Text-only so far: a file offer may follow right behind the
            // snippet on the same ordered channel. Give it a moment, then go.
            let text_only = self.got_text && self.received == 0 && self.pending.is_empty();
            let input = if text_only {
                match tokio::time::timeout(TEXT_GRACE, next_input(frames, peer, &mut server_open))
                    .await
                {
                    Ok(i) => i?,
                    Err(_) => return Ok(()),
                }
            } else {
                next_input(frames, peer, &mut server_open).await?
            };
            match input {
                Input::Server(ServerFrame::Signal { data, .. }) => match data {
                    SignalData::Cancel { id } => self.cancel(&id).await,
                    SignalData::Pause { .. } | SignalData::Resume { .. } => {}
                    other => peer.handle_signal(other).await?,
                },
                Input::Server(_) => {}
                Input::Peer(PeerEvent::Disconnected) => {
                    if (self.received > 0 || self.got_text) && self.pending.is_empty() {
                        return Ok(());
                    }
                    bail!("the sender disconnected before the transfer finished");
                }
                Input::Peer(PeerEvent::Binary(bytes)) => self.on_bytes(peer, bytes).await?,
                Input::Peer(PeerEvent::Control(text)) => {
                    let Ok(msg) = serde_json::from_str::<ControlMessage>(&text) else {
                        continue;
                    };
                    self.on_control(peer, msg).await?;
                }
                Input::Peer(PeerEvent::Connected) => {}
            }
            if self.received > 0 && self.pending.is_empty() && self.current.is_none() {
                return Ok(());
            }
        }
    }

    async fn on_control(&mut self, peer: &WarpPeer, msg: ControlMessage) -> Result<()> {
        match msg {
            ControlMessage::Offer { batch_id, items } => {
                let total: u64 = items.iter().map(|i| i.size).sum();
                let list = items
                    .iter()
                    .map(|i| format!("    {} ({})", i.name, format_bytes(i.size)))
                    .collect::<Vec<_>>()
                    .join("\n");
                let ui = self.ui.clone();
                let yes = self.yes;
                let n = items.len();
                let accept = yes
                    || tokio::task::block_in_place(|| {
                        ui.suspend(|| {
                            println!(
                                "  {} {n} file(s), {}:\n{list}",
                                style("incoming").fg(ui::ACCENT).bold(),
                                format_bytes(total)
                            );
                            eprint!("  accept? [y/N] ");
                            let mut line = String::new();
                            let _ = std::io::stdin().read_line(&mut line);
                            matches!(line.trim().to_lowercase().as_str(), "y" | "yes")
                        })
                    });
                if !accept {
                    peer.send_control(&ControlMessage::Decline { batch_id })
                        .await?;
                    bail!("declined");
                }
                // A re-offer after the sender paused carries the same resume
                // token under a new id. Retire the stale id and its partial;
                // we always restart from byte 0.
                for item in &items {
                    let stale: Vec<String> = self
                        .pending
                        .iter()
                        .filter(|id| {
                            item.resume_token.is_some()
                                && self.items[*id].resume_token == item.resume_token
                        })
                        .cloned()
                        .collect();
                    for id in stale {
                        if let Some(cur) = self.current.take_if(|c| c.id == id) {
                            let _ = tokio::fs::remove_file(&cur.part).await;
                        }
                        self.pending.remove(&id);
                        self.state.files.lock().unwrap().remove(&id);
                    }
                }
                for item in items {
                    self.pending.insert(item.id.clone());
                    self.state
                        .files
                        .lock()
                        .unwrap()
                        .insert(item.id.clone(), (item.name.clone(), 0, item.size, false));
                    self.items.insert(item.id.clone(), item);
                }
                // No resume offsets and no codecs: always a fresh, raw stream.
                peer.send_control(&ControlMessage::Accept {
                    batch_id,
                    resume: None,
                    codecs: None,
                })
                .await?;
                *self.state.status.lock().unwrap() = "receiving".to_string();
            }
            ControlMessage::FileBegin {
                id,
                offset,
                codec,
                pieces,
            } => {
                let Some(item) = self.items.get(&id).cloned() else {
                    return Ok(());
                };
                if offset != 0 || codec.is_some() {
                    // We never ask for either; refuse rather than write garbage.
                    peer.send_control(&ControlMessage::Cancel { id: id.clone() })
                        .await?;
                    self.finish_failed(&id, "unexpected resume/compression from sender");
                    return Ok(());
                }
                let final_path = self.target_path(&item.name).await?;
                let part = part_path(&final_path);
                if let Some(parent) = part.parent() {
                    tokio::fs::create_dir_all(parent).await?;
                }
                let file = File::create(&part)
                    .await
                    .with_context(|| format!("create {}", part.display()))?;
                let verifier = pieces
                    .filter(|m| {
                        m.size == item.size
                            && m.piece_size > 0
                            && m.hashes.len() as u64 == m.piece_count()
                    })
                    .map(PieceVerifier::new);
                *self.state.status.lock().unwrap() = format!("receiving {}", item.name);
                self.current = Some(Incoming {
                    id,
                    final_path,
                    part,
                    file,
                    written: 0,
                    verifier,
                    pending_piece: None,
                    ended: false,
                    hasher: Default::default(),
                });
            }
            ControlMessage::Piece { id, index } => {
                if let Some(cur) = self.current.as_mut().filter(|c| c.id == id) {
                    cur.pending_piece = Some(index);
                }
            }
            ControlMessage::FileEnd { id } => {
                if let Some(cur) = self.current.as_mut().filter(|c| c.id == id) {
                    cur.ended = true;
                }
                self.try_complete().await?;
            }
            ControlMessage::Cancel { id } => self.cancel(&id).await,
            ControlMessage::Text { text, .. } => {
                self.ui
                    .line(format!("  {} {text}", style("text:").fg(ui::ACCENT).bold()));
                self.got_text = true;
            }
            _ => {}
        }
        Ok(())
    }

    async fn on_bytes(&mut self, peer: &WarpPeer, bytes: Vec<u8>) -> Result<()> {
        let Some(cur) = self.current.as_mut() else {
            return Ok(());
        };
        let id = cur.id.clone();
        let verified = match (&mut cur.verifier, cur.pending_piece.take()) {
            (Some(v), Some(index)) => v.inject(index, bytes),
            (Some(v), None) => v.feed(&bytes),
            (None, _) => Ok(protocol::Verified {
                write: bytes,
                request: Vec::new(),
            }),
        };
        let data = match verified {
            Ok(out) => {
                for index in out.request {
                    peer.send_control(&ControlMessage::PieceRequest {
                        id: id.clone(),
                        index,
                    })
                    .await?;
                }
                out.write
            }
            Err(e) => {
                peer.send_control(&ControlMessage::Cancel { id: id.clone() })
                    .await?;
                self.cancel(&id).await;
                bail!("{} failed verification: {e}", self.items[&id].name);
            }
        };
        let cur = self.current.as_mut().expect("current file");
        if !data.is_empty() {
            use sha2::Digest;
            cur.hasher.update(&data);
            cur.file.write_all(&data).await?;
            cur.written += data.len() as u64;
            set_progress(&self.state, &id, cur.written, false);
        }
        self.try_complete().await
    }

    /// Finish the current file once file-end arrived AND every piece verified.
    async fn try_complete(&mut self) -> Result<()> {
        let ready = match &self.current {
            Some(c) => c.ended && c.verifier.as_ref().is_none_or(|v| v.done()),
            None => false,
        };
        if !ready {
            return Ok(());
        }
        let mut cur = self.current.take().unwrap();
        let item = &self.items[&cur.id];
        if cur.written != item.size {
            let _ = tokio::fs::remove_file(&cur.part).await;
            bail!("{}: got {} of {} bytes", item.name, cur.written, item.size);
        }
        cur.file.flush().await?;
        cur.file.sync_all().await?;
        drop(cur.file);
        tokio::fs::rename(&cur.part, &cur.final_path).await?;
        set_progress(&self.state, &cur.id, item.size, true);
        use sha2::Digest;
        let digest = hex::encode(cur.hasher.finalize());
        let how = match &cur.verifier {
            Some(v) => format!("{} pieces verified", v.manifest().piece_count()),
            None => "size checked".to_string(),
        };
        self.ui.line(format!(
            "  {} {}  {}  sha256 {}…",
            style("✓").fg(ui::ACCENT),
            cur.final_path.display(),
            style(how).fg(ui::MUTED),
            &digest[..12]
        ));
        self.pending.remove(&cur.id);
        self.received += 1;
        Ok(())
    }

    async fn cancel(&mut self, id: &str) {
        if let Some(cur) = self.current.take() {
            if cur.id == id {
                let _ = tokio::fs::remove_file(&cur.part).await;
            } else {
                self.current = Some(cur);
            }
        }
        if self.pending.contains(id) {
            self.finish_failed(id, "cancelled by the sender");
        }
    }

    fn finish_failed(&mut self, id: &str, why: &str) {
        self.pending.remove(id);
        set_progress(&self.state, id, 0, true);
        if let Some(item) = self.items.get(id) {
            self.ui.line(format!(
                "  {} {}: {why}",
                style("✗").fg(ui::AMBER),
                item.name
            ));
        }
    }

    /// Where to save `name`: inside the output folder (never outside it), and
    /// not on top of an existing file unless --overwrite.
    async fn target_path(&self, name: &str) -> Result<PathBuf> {
        let path = self.out.join(safe_relative_path(name));
        if self.overwrite || !tokio::fs::try_exists(&path).await? {
            return Ok(path);
        }
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let ext = path
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        for n in 1.. {
            let candidate = path.with_file_name(format!("{stem} ({n}){ext}"));
            if !tokio::fs::try_exists(&candidate).await? {
                return Ok(candidate);
            }
        }
        unreachable!()
    }
}

fn part_path(final_path: &Path) -> PathBuf {
    let mut name = final_path.file_name().unwrap_or_default().to_os_string();
    name.push(".warp-part");
    final_path.with_file_name(name)
}
