//! Terminal UI — Warp design tokens, animated progress, spinners, verification
//! badges. indicatif MultiProgress keeps per-file bars live while status lines
//! render above them.

use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Re-export so `ui::style` works from main.rs. Internal code uses `style`
/// directly through this same binding.
pub use console::style;

/// Warp brand palette — single source of truth, closest ANSI-256 match to the
/// web design tokens (console 0.15 has no truecolor).
///   bg #121110 → 232 · ink #efe9da → 230
///   muted #6f6a5d → 243 · accent #5360ff → 63 · amber #ef6a3d → 208
pub const BG: console::Color = console::Color::Color256(232);
pub const INK: console::Color = console::Color::Color256(230);
pub const MUTED: console::Color = console::Color::Color256(243);
pub const ACCENT: console::Color = console::Color::Color256(63);
pub const AMBER: console::Color = console::Color::Color256(208);

/// Shared state the transfer engine updates; the render loop reads it.
pub struct UiState {
    pub room_code: String,
    pub status: Mutex<String>,
    /// file id -> (name, bytes done, bytes total, done)
    pub files: Mutex<HashMap<String, (String, u64, u64, bool)>>,
}

impl UiState {
    pub fn new(room_code: String) -> Self {
        UiState {
            room_code,
            status: Mutex::new("connecting…".to_string()),
            files: Mutex::new(HashMap::new()),
        }
    }
}

/// The banner shown at startup. Warp brand, colored.
pub fn banner() {
    let art = r#"
    __          __
   / /_____ ___/ /__  ____
  / __/ __ `__ \/ _ \/ __ \
 / /_/ / / / / /  __/ /_/ /
 \__/_/ /_/ /_/\___/\____/
"#;
    println!("{}", style(art).fg(ACCENT));
    println!(
        "{}  peer-to-peer file transfer. STUN-only, no relay, no server sees a byte.\n",
        style(" warp ").bg(BG).fg(INK).bold()
    );
}

/// The room code plus the exact commands for the other side: the CLI
/// one-liner (croc-style) and the browser link.
pub fn print_code(code: &str, summary: &str) {
    println!(
        "  {} {}",
        style("sending").fg(MUTED),
        style(summary).fg(INK)
    );
    println!();
    println!(
        "  {}  {}",
        style("code").fg(MUTED),
        style(code).fg(ACCENT).bold()
    );
    if let Some(words) = crate::protocol::code_to_alias(code) {
        println!(
            "  {}  {}",
            style("  or").fg(MUTED),
            style(words.replace('-', " ")).fg(INK)
        );
    }
    println!();
    println!("  {}", style("on the other device run:").fg(MUTED));
    println!("    {}", style(format!("warp {code}")).fg(INK).bold());
    println!("  {}", style("or open in a browser:").fg(MUTED));
    println!("    {}", style(format!("{WEB_URL}/r/{code}")).fg(INK));
    println!();
}

/// The web app, for receivers without the CLI.
pub const WEB_URL: &str = "https://warp.ishannaik.com";

/// The main progress renderer. Call `tick()` from the engine loop.
pub struct Ui {
    pub mp: MultiProgress,
    state: Arc<UiState>,
    bars: Mutex<HashMap<String, ProgressBar>>,
    status_bar: ProgressBar,
    started: Instant,
}

impl Ui {
    pub fn new(state: Arc<UiState>) -> Self {
        let mp = MultiProgress::new();
        let status_bar = mp.add(ProgressBar::new_spinner());
        status_bar.set_style(
            ProgressStyle::with_template("{spinner:.blue} {msg}")
                .unwrap()
                .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
        );
        status_bar.enable_steady_tick(Duration::from_millis(80));
        Ui {
            mp,
            state,
            bars: Mutex::new(HashMap::new()),
            status_bar,
            started: Instant::now(),
        }
    }

    /// Ensure a progress bar exists for `id`, return it.
    fn bar(&self, id: &str, name: &str, total: u64) -> ProgressBar {
        let mut bars = self.bars.lock().unwrap();
        if let Some(b) = bars.get(id) {
            return b.clone();
        }
        let bar = self.mp.add(ProgressBar::new(total.max(1)));
        bar.set_style(
            ProgressStyle::with_template(
                "{spinner:.blue} {msg:.bold} {wide_bar:.blue/240} {bytes}/{total_bytes} {percent:>3}% {bytes_per_sec:.blue} eta {eta}",
            )
            .unwrap()
            .progress_chars("█▉▊▋▌▍▎▏  ")
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
        );
        bar.set_message(name.to_string());
        bar.enable_steady_tick(Duration::from_millis(120));
        bars.insert(id.to_string(), bar.clone());
        bar
    }

    /// One render tick: sync bars from shared state, update status.
    pub fn tick(&self) {
        let files = self.state.files.lock().unwrap();
        for (id, (name, done, total, finished)) in files.iter() {
            let bar = self.bar(id, name, *total);
            bar.set_position(*done);
            if *finished && !bar.is_finished() {
                bar.finish_and_clear();
            }
        }
        drop(files);
        // keep the status bar current
        let elapsed = self.started.elapsed();
        let st = self.state.status.lock().unwrap().clone();
        let code = &self.state.room_code;
        self.status_bar.set_message(format!(
            "{st}  ·  room {code}  ·  {:.0}s",
            elapsed.as_secs_f64()
        ));
    }

    /// Print a line above the live bars without tearing them.
    pub fn line(&self, msg: impl AsRef<str>) {
        // indicatif draws nothing (println included) when stderr isn't a
        // terminal, so scripts and pipes would lose every result line.
        if self.mp.is_hidden() {
            println!("{}", msg.as_ref());
        } else {
            let _ = self.mp.println(msg.as_ref());
        }
    }

    /// Run `f` (e.g. a stdin prompt) with the bars hidden.
    pub fn suspend<R>(&self, f: impl FnOnce() -> R) -> R {
        self.mp.suspend(f)
    }

    /// Block until the UI is done (Ctrl+C ends the process anyway).
    pub fn finish(&self) {
        if self.mp.is_hidden() {
            println!("done. bytes went peer-to-peer, never through a server.");
            return;
        }
        self.status_bar.finish_with_message(
            style("done. bytes went peer-to-peer, never through a server.")
                .fg(AMBER)
                .to_string(),
        );
    }
}
