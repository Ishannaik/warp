import type { Strings } from "../lib/i18n";

/**
 * Bahasa Indonesia — the second locale, scaffolded by #164 as the
 * reference example for `docs/TRANSLATING.md`. `Partial<Strings>` so any
 * key added to `en.ts` later and not yet translated here falls back to
 * English instead of breaking the build.
 *
 * Untranslated on purpose (see the do-not-translate list in
 * TRANSLATING.md): the WARP wordmark, room codes, and UI glyphs/arrows
 * baked into a string (e.g. "→", "⧉") are kept as-is.
 */
const id = {
  // receive entry (/receive) — enter a room code by hand
  receive_eyebrow: "Terima · masukkan kode",
  receive_heading: "Terima file",
  receive_description:
    "Masukkan kode 6 karakter dari perangkat pengirim, atau buka tautannya / pindai kode QR-nya.",
  receive_code_label: "Kode ruang",
  receive_code_placeholder: "••••••",
  receive_hint_invalid: "Kode itu tidak valid — periksa lagi di perangkat pengirim.",
  receive_hint_format: "Huruf A–Z (tanpa I, L, O) dan angka 2–9.",
  receive_connect: "Sambungkan  →",
  receive_footer: "Dapat tautan? Buka saja — kamu akan tersambung otomatis.",

  // chrome shared across surfaces
  common_back: "← KEMBALI",
  common_close: "Tutup",

  // transfer flow (/send, /r/:code) — top bar, pre-connect steps, error panel
  transfer_step_select: "Pilih",
  transfer_step_pair: "Sambungkan",
  transfer_step_session: "Sesi",
  transfer_step_error: "Error",
  transfer_exit: "← KELUAR",
  transfer_reconnecting_banner: "KONEKSI TERPUTUS — MENYAMBUNGKAN ULANG… TRANSFER LANJUT OTOMATIS",
  transfer_heading_reconnecting: "Menyambungkan ulang…",
  transfer_heading_connected_receiver: "Tersambung ke pengirim",
  transfer_heading_connected: "Tersambung",
  transfer_peer_label_receiver: "pengirim",
  transfer_peer_label_sender: "rekanmu",
  transfer_queue_label: "Antrean",
  transfer_queue_files_suffix: (size: string) => ` file · ${size}`,
  transfer_queue_empty: "Belum ada yang diantre — jatuhkan file di atas untuk mulai.",
  transfer_remove_file_aria: (name: string) => `Hapus ${name}`,
  transfer_step01_select: "Langkah 01 / Pilih",
  transfer_select_heading: "Apa yang mau kamu kirim?",
  transfer_drop_here: "Jatuhkan file di sini",
  transfer_drop_hint: "atau klik untuk memilih · ukuran dan tipe apa pun",
  transfer_files_local_note: "File tetap di perangkatmu sampai rekan menerima.",
  transfer_open_channel: "Buka kanal aman  →",
  transfer_step02_pair: "Langkah 02 / Sambungkan",
  transfer_waiting_joining: "Bergabung ke kanal",
  transfer_waiting_for_sender: "Menunggu pengirim",
  transfer_waiting_one_joining: "1 perangkat bergabung — membuka kanal",
  transfer_waiting_many_joining: (n: number) => `${n} perangkat bergabung — membuka kanal`,
  transfer_waiting_for_devices: "Menunggu perangkat bergabung",
  transfer_connecting_heading: "Menyambungkanmu dalam",
  transfer_share_heading: "Bagikan kode ini",
  transfer_receiver_hint: "Tunggu sebentar — membuka kanal langsung ke pengirim.",
  transfer_pair_ready: (count: string, size: string) => `${count} file · ${size} siap ditawarkan`,
  transfer_linking_suffix: "menyambungkan",
  transfer_copy_link_default: "⧉ Salin tautan",
  transfer_copy_code_default: "⬚ Salin kode",
  transfer_copy_failed: "✕ gagal menyalin",
  transfer_copy_success_link: "✓ tersalin!",
  transfer_share_button: "↗ Bagikan",
  transfer_qr_aria: "Kode QR menuju transfer ini",
  transfer_add_more_files: "Tambah file lagi",
  transfer_add_more_hint: "jatuhkan atau klik — sunting antrean sampai rekanmu bergabung",
  transfer_error_eyebrow: "Kanal gagal",
  transfer_error_suffix:
    " Warp hanya memakai STUN — tidak ada relay cadangan, jadi ada jaringan yang memang tak bisa dijembatani.",
  transfer_retry: "Coba lagi",
  transfer_back_to_warp: "Kembali ke Warp",
  transfer_drop_send: "Jatuhkan untuk kirim",
  transfer_release_anywhere: "Lepaskan di mana saja",

  // transfer/nearby shared error copy
  error_nat_failed: "Tidak bisa membuka jalur langsung antar-perangkat. Salah satu sisi mungkin ada di jaringan yang ketat.",
  error_disconnected:
    "Koneksi terputus dan tidak bisa dipulihkan. Coba lagi untuk menyambung ulang — file yang belum selesai akan ditawarkan lagi.",
  error_channel_error: "Kanal data mengalami error.",
  error_no_files: "Tambahkan minimal satu file sebelum membuka kanal.",

  // ErrorPanel eyebrow/title per WarpError.kind
  error_eyebrow_nat_failed: "Kanal gagal",
  error_title_nat_failed: "Tidak ada jalur langsung.",
  error_eyebrow_disconnected: "Koneksi hilang",
  error_title_disconnected: "Koneksi terputus.",
  error_eyebrow_channel_error: "Kanal gagal",
  error_title_channel_error: "Kanal rusak.",
  error_eyebrow_signaling: "Gagal tersambung",
  error_title_signaling: "Tidak bisa menjangkau ruang.",
  error_eyebrow_no_files: "Belum ada yang dikirim",
  error_title_no_files: "Tambahkan file dulu.",
  error_eyebrow_too_large: "Terlalu besar",
  error_title_too_large: "File terlalu besar.",

  // session view (shared by the code-room and LAN flows) — tray, composer, accept modal
  transfer_status_offered: "MENUNGGU",
  transfer_status_transferring: "BERPINDAH",
  transfer_status_reconnecting: "MELANJUTKAN",
  transfer_status_done: "SELESAI",
  transfer_status_declined: "DITOLAK",
  transfer_status_cancelled: "DIBATALKAN",
  transfer_status_error: "ERROR",
  transfer_direction_in: "↓ MASUK",
  transfer_direction_out: "↑ KELUAR",
  transfer_direction_from: "dari",
  transfer_direction_to: "ke",
  transfer_text_snippet_label: "Cuplikan teks",
  transfer_cancel_aria: "Batalkan transfer",
  transfer_download: "Unduh",
  transfer_saved_to_disk: "✓ Tersimpan ke disk",
  transfer_copy_text_default: "⧉ salin",
  transfer_copy_text_success: "✓ tersalin",
  transfer_compose_label: "Tulis",
  transfer_composer_add_files: "＋ Tambah file",
  transfer_composer_send_files: "＋ Kirim file",
  transfer_composer_add_folder: "▤ Tambah folder",
  transfer_composer_send_folder: "▤ Kirim folder",
  transfer_text_placeholder: "…atau tempel tautan / catatan untuk dikirim sebagai teks",
  transfer_text_too_large: (size: string) =>
    `Terlalu panjang untuk dikirim sebagai teks (${size}). Simpan sebagai file .txt dan kirim itu sebagai gantinya.`,
  transfer_fanout: (n: number) => ` ke ${n} perangkat`,
  transfer_send_text_cta: (fanout: string) => `Kirim teks${fanout} →`,
  transfer_ready_to_send_prefix: "Siap dikirim · ",
  transfer_send_files_cta: (count: number, fanout: string) => `Kirim ${count} file${fanout} →`,
  transfer_tray_label_prefix: "Baki · ",
  transfer_download_all: "⤓ Unduh semua (.zip)",
  transfer_tray_empty: "Belum ada apa-apa — kirim file atau teks, atau tunggu sisi lain.",
  transfer_accept_eyebrow: "Masuk · tinjau sebelum menerima",
  transfer_accept_wants_send_suffix: (count: number) => ` ingin mengirimimu ${count} item`,
  transfer_accept_anon: (count: number) => `Terima ${count} item?`,
  transfer_accept_large_prefix: (size: string) => `Total ${size} — `,
  transfer_accept_large_emphasis: "transfer besar",
  transfer_accept_large_suffix: (pickTarget: string) =>
    `. Saat Terima, kamu akan memilih ${pickTarget} untuk disimpan, dan langsung dialirkan ke disk.`,
  transfer_accept_small_desc: (size: string) =>
    `Total ${size}. Tidak ada yang disimpan ke disk — file yang diterima masuk ke baki untuk diunduh saat kamu siap.`,
  transfer_pick_target_folder: "folder",
  transfer_pick_target_file: "file",
  transfer_decline: "Tolak",
  transfer_accept_cta: "Terima & ambil",
  transfer_accept_cta_large: (pickTarget: string) => `Terima & pilih ${pickTarget}`,
  transfer_devices_connected: (connected: number, total: number) =>
    `${connected} dari ${total} perangkat tersambung · P2P langsung`,
  transfer_heading_direct_p2p: (heading: string) => `${heading} · P2P langsung`,
  transfer_session_footer: "Kanal tetap terbuka — kirim lagi atau kirim balik kapan saja · jangan tutup tab ini",
  transfer_heading_session_open: "Sesi terbuka",

  // nearby devices (/) — LAN auto-discovery panel
  nearby_eyebrow: "Di jaringanmu",
  nearby_you_appear_as: "Kamu tampil sebagai",
  nearby_rename_device: "Ganti nama perangkat",
  nearby_heading: "Perangkat di dekatmu.",
  nearby_description:
    "Wi-Fi yang sama, tanpa kode. Ketuk perangkat untuk menawarkan file langsung — mereka meninjau dan menerima sebelum apa pun berpindah, dan bytes-nya lewat peer-to-peer, tanpa pernah menyentuh server.",
  nearby_tap_to_send: "Ketuk untuk kirim",
  nearby_empty_heading: "Belum ada perangkat lain",
  nearby_empty_hint: "Buka Warp di perangkat lain di Wi-Fi yang sama.",
  nearby_crowded_message: "Terlalu banyak perangkat di jaringan ini untuk didaftar otomatis — pakai kode saja.",
  nearby_use_code: "Pakai kode →",
  nearby_error_suffix: "Warp hanya memakai STUN — ada jaringan yang memang tak bisa dijembatani langsung.",
  nearby_close_session_aria: "Tutup sesi",
  nearby_heading_opening: "Membuka kanal",
} satisfies Partial<Strings>;

export default id;
