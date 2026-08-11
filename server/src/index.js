// Warp signaling server — Cloudflare Worker + Durable Object (WebSocket Hibernation).
// Genuinely free (no card) on the Workers free plan. Wire protocol is identical to
// the original Node `ws` server: connect, then send {type:'join', room?} / {type:'signal', to, data}.

const MAX_PEERS = 8;                                       // mesh blows up past this; honest cap
const MAX_DISCOVER = 8;                                    // >this many sockets per public IP => CGNAT/cellular; hide devices (privacy)
const MAX_SIGNAL_BYTES = 64 * 1024;                        // #98: real SDP/ICE frames are a few KB; this is generous headroom, not a guess-tight cap
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no ambiguous 0/O/1/I/L
const CODE_LEN = 6;
const ROOM_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`);

const WORDS = ["abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act", "action", "actor", "actress", "actual", "adapt", "add", "addict", "address", "adjust", "admit", "adult", "advance", "advice", "aerobic", "affair", "afford", "afraid", "again", "age", "agent", "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album", "alcohol", "alert", "alien", "all", "alley", "allow", "almost", "alone", "alpha", "already", "also", "alter", "always", "amateur", "amazing", "among", "amount", "amused", "analyst", "anchor", "ancient", "anger", "angle", "angry", "animal", "ankle", "announce", "annual", "another", "answer", "antenna", "antique", "anxiety", "any", "apart", "apology", "appear", "apple", "approve", "april", "arch", "arctic", "area", "arena", "argue", "arm", "armed", "armor", "army", "around", "arrange", "arrest", "arrive", "arrow", "art", "artefact", "artist", "artwork", "ask", "aspect", "assault", "asset", "assist", "assume", "asthma", "athlete", "atom", "attack", "attend", "attitude", "attract", "auction", "audit", "august", "aunt", "author", "auto", "autumn", "average", "avocado", "avoid", "awake", "aware", "away", "awesome", "awful", "awkward", "axis", "baby", "bachelor", "bacon", "badge", "bag", "balance", "balcony", "ball", "bamboo", "banana", "banner", "bar", "barely", "bargain", "barrel", "base", "basic", "basket", "battle", "beach", "bean", "beauty", "because", "become", "beef", "before", "begin", "behave", "behind", "believe", "below", "belt", "bench", "benefit", "best", "betray", "better", "between", "beyond", "bicycle", "bid", "bike", "bind", "biology", "bird", "birth", "bitter", "black", "blade", "blame", "blanket", "blast", "bleak", "bless", "blind", "blood", "blossom", "blouse", "blue", "blur", "blush", "board", "boat", "body", "boil", "bomb", "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss", "bottom", "bounce", "box", "boy", "bracket", "brain", "brand", "brass", "brave", "bread", "breeze", "brick", "bridge", "brief", "bright", "bring", "brisk", "broccoli", "broken", "bronze", "broom", "brother", "brown", "brush", "bubble", "buddy", "budget", "buffalo", "build", "bulb", "bulk", "bullet", "bundle", "bunker", "burden", "burger", "burst", "bus", "business", "busy", "butter", "buyer", "buzz", "cabbage", "cabin", "cable", "cactus", "cage", "cake", "call", "calm", "camera", "camp", "can", "canal", "cancel", "candy", "cannon", "canoe", "canvas", "canyon", "capable", "capital", "captain", "car", "carbon", "card", "cargo", "carpet", "carry", "cart", "case", "cash", "casino", "castle", "casual", "cat", "catalog", "catch", "category", "cattle", "caught", "cause", "caution", "cave", "ceiling", "celery", "cement", "census", "century", "cereal", "certain", "chair", "chalk", "champion", "change", "chaos", "chapter", "charge", "chase", "chat", "cheap", "check", "cheese", "chef", "cherry", "chest", "chicken", "chief", "child", "chimney", "choice", "choose", "chronic", "chuckle", "chunk", "churn", "cigar", "cinnamon", "circle", "citizen", "city", "civil", "claim", "clap", "clarify", "claw", "clay", "clean", "clerk", "clever", "click", "client", "cliff", "climb", "clinic", "clip", "clock", "clog", "close", "cloth", "cloud", "clown", "club", "clump", "cluster", "clutch", "coach", "coast", "coconut", "code", "coffee", "coil", "coin", "collect", "color", "column", "combine", "come", "comfort", "comic", "common", "company", "concert", "conduct", "confirm", "congress", "connect", "consider", "control", "convince", "cook", "cool", "copper", "copy", "coral", "core", "corn", "correct", "cost", "cotton", "couch", "country", "couple", "course", "cousin", "cover", "coyote", "crack", "cradle", "craft", "cram", "crane", "crash", "crater", "crawl", "crazy", "cream", "credit", "creek", "crew", "cricket", "crime", "crisp", "critic", "crop", "cross", "crouch", "crowd", "crucial", "cruel", "cruise", "crumble", "crunch", "crush", "cry", "crystal", "cube", "culture", "cup", "cupboard", "curious", "current", "curtain", "curve", "cushion", "custom", "cute", "cycle", "dad", "damage", "damp", "dance", "danger", "daring", "dash", "daughter", "dawn", "day", "deal", "debate", "debris", "decade", "december", "decide", "decline", "decorate", "decrease", "deer", "defense", "define", "defy", "degree", "delay", "deliver", "demand", "demise", "denial", "dentist", "deny", "depart", "depend", "deposit", "depth", "deputy", "derive", "describe", "desert", "design", "desk", "despair", "destroy", "detail", "detect", "develop", "device", "devote", "diagram", "dial", "diamond", "diary", "dice", "diesel", "diet", "differ", "digital", "dignity", "dilemma", "dinner", "dinosaur", "direct", "dirt", "disagree", "discover", "disease", "dish", "dismiss", "disorder", "display", "distance", "divert", "divide", "divorce", "dizzy", "doctor", "document", "dog", "doll", "dolphin", "domain", "donate", "donkey", "donor", "door", "dose", "double", "dove", "draft", "dragon", "drama", "drastic", "draw", "dream", "dress", "drift", "drill", "drink", "drip", "drive", "drop", "drum", "dry", "duck", "dumb", "dune", "during", "dust", "dutch", "duty", "dwarf", "dynamic", "eager", "eagle", "early", "earn", "earth", "easily", "east", "easy", "echo", "ecology", "economy", "edge", "edit", "educate", "effort", "egg", "eight", "either", "elbow", "elder", "electric", "elegant", "element", "elephant", "elevator", "elite", "else", "embark", "embody", "embrace", "emerge", "emotion", "employ", "empower", "empty", "enable", "enact", "end", "endless", "endorse", "enemy", "energy", "enforce", "engage", "engine", "enhance", "enjoy", "enlist", "enough", "enrich", "enroll", "ensure", "enter", "entire", "entry", "envelope", "episode", "equal", "equip", "era", "erase", "erode", "erosion", "error", "erupt", "escape", "essay", "essence", "estate", "eternal", "ethics", "evidence", "evil", "evoke", "evolve", "exact", "example", "excess", "exchange", "excite", "exclude", "excuse", "execute", "exercise", "exhaust", "exhibit", "exile", "exist", "exit", "exotic", "expand", "expect", "expire", "explain", "expose", "express", "extend", "extra", "eye", "eyebrow", "fabric", "face", "faculty", "fade", "faint", "faith", "fall", "false", "fame", "family", "famous", "fan", "fancy", "fantasy", "farm", "fashion", "fat", "fatal", "father", "fatigue", "fault", "favorite", "feature", "february", "federal", "fee", "feed", "feel", "female", "fence", "festival", "fetch", "fever", "few", "fiber", "fiction", "field", "figure", "file", "film", "filter", "final", "find", "fine", "finger", "finish", "fire", "firm", "first", "fiscal", "fish", "fit", "fitness", "fix", "flag", "flame", "flash", "flat", "flavor", "flee", "flight", "flip", "float", "flock", "floor", "flower", "fluid", "flush", "fly", "foam", "focus", "fog", "foil", "fold", "follow", "food", "foot", "force", "forest", "forget", "fork", "fortune", "forum", "forward", "fossil", "foster", "found", "fox", "fragile", "frame", "frequent", "fresh", "friend", "fringe", "frog", "front", "frost", "frown", "frozen", "fruit", "fuel", "fun", "funny", "furnace", "fury", "future", "gadget", "gain", "galaxy", "gallery", "game", "gap", "garage", "garbage", "garden", "garlic", "garment", "gas", "gasp", "gate", "gather", "gauge", "gaze", "general", "genius", "genre", "gentle", "genuine", "gesture", "ghost", "giant", "gift", "giggle", "ginger", "giraffe", "girl", "give", "glad", "glance", "glare", "glass", "glide", "glimpse", "globe", "gloom", "glory", "glove", "glow", "glue", "goat", "goddess", "gold", "good", "goose", "gorilla", "gospel", "gossip", "govern", "gown", "grab", "grace", "grain", "grant", "grape", "grass", "gravity", "great", "green", "grid", "grief", "grit", "grocery", "group", "grow", "grunt", "guard", "guess", "guide", "guilt", "guitar", "gun", "gym", "habit", "hair", "half", "hammer", "hamster", "hand", "happy", "harbor", "hard", "harsh", "harvest", "hat", "have", "hawk", "hazard", "head", "health", "heart", "heavy", "hedgehog", "height", "hello", "helmet", "help", "hen", "hero", "hidden", "high", "hill", "hint", "hip", "hire", "history", "hobby", "hockey", "hold", "hole", "holiday", "hollow", "home", "honey", "hood", "hope", "horn", "horror", "horse", "hospital", "host", "hotel", "hour", "hover", "hub", "huge", "human", "humble", "humor", "hundred", "hungry", "hunt", "hurdle", "hurry", "hurt", "husband", "hybrid", "ice", "icon", "idea", "identify", "idle", "ignore", "ill", "illegal", "illness", "image", "imitate", "immense", "immune", "impact", "impose", "improve", "impulse", "inch", "include", "income", "increase", "index", "indicate", "indoor", "industry", "infant", "inflict", "inform", "inhale", "inherit", "initial", "inject", "injury", "inmate", "inner", "innocent", "input", "inquiry", "insane", "insect", "inside", "inspire", "install", "intact", "interest", "into", "invest", "invite", "involve", "iron", "island", "isolate", "issue", "item", "ivory", "jacket", "jaguar", "jar", "jazz", "jealous", "jeans", "jelly", "jewel", "job", "join", "joke", "journey", "joy", "judge", "juice", "jump", "jungle", "junior", "junk", "just", "kangaroo", "keen", "keep", "ketchup", "key", "kick", "kid", "kidney", "kind", "kingdom", "kiss", "kit", "kitchen", "kite", "kitten", "kiwi", "knee", "knife", "knock", "know", "lab", "label", "labor", "ladder", "lady", "lake", "lamp", "language", "laptop", "large", "later", "latin", "laugh", "laundry", "lava", "law", "lawn", "lawsuit", "layer", "lazy", "leader", "leaf", "learn", "leave", "lecture", "left", "leg", "legal", "legend", "leisure", "lemon", "lend"];
function wordsToCode(alias) {
  const parts = alias.toLowerCase().split('-');
  if (parts.length !== 3) return null;
  let out = '';
  for (let i = 0; i < 3; i++) {
    const idx = WORDS.indexOf(parts[i]);
    if (idx === -1) return null;
    out += CODE_ALPHABET[Math.floor(idx / 32)];
    out += CODE_ALPHABET[idx % 32];
  }
  return out;
}

const RECLAIM_MS = 3 * 60 * 1000;                         // reserve a code ~3 min after its last socket drops (H6=A)
const DEVICE_TYPES = new Set(['mobile', 'tablet', 'desktop']); // #138: client-guessed UA hint, relayed as-is

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('warp signaling server\n', { headers: { 'content-type': 'text/plain' } });
    }
    // One Durable Object holds all rooms. Plenty for a hobby signaling server;
    // shard by room (idFromName(roomCode)) later if you ever outgrow it.
    const id = env.SIGNALING.idFromName('global');
    return env.SIGNALING.get(id).fetch(request);
  },
};

export class SignalingRoom {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);                   // hibernation-enabled
    // Stamp the client's public IP so LAN auto-discovery can group same-network peers.
    // Lives in the attachment, so it survives hibernation alongside room/peerId.
    let ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    // IPv6: group by the /64 prefix (first 4 hextets). Every device on a LAN gets its
    // OWN full IPv6, so grouping by the whole address would never match peers — the /64
    // is the shared-network unit (mirrors PairDrop's IPV6_LOCALIZE=4).
    if (ip.includes(':')) ip = ip.split(':').slice(0, 4).join(':');
    server.serializeAttachment({ ip });
    return new Response(null, { status: 101, webSocket: client });
  }

  // --- live-socket helpers ---------------------------------------------------
  // The sockets ARE the room state (hibernation-safe: nothing to desync).
  sockets(room, except) {
    return this.state.getWebSockets().filter((ws) => {
      const a = ws.deserializeAttachment();
      return a && a.room === room && ws !== except;
    });
  }

  roomExists(room) {
    return this.state.getWebSockets().some((ws) => {
      const a = ws.deserializeAttachment();
      return a && a.room === room;
    });
  }

  makeCode() {
    let code;
    do {
      const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
      code = '';
      for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    } while (this.roomExists(code));
    return code;
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch { /* socket gone */ }
  }

  // --- message handling ------------------------------------------------------
  async webSocketMessage(ws, raw) {
    // Size guard (#98): reject oversized frames BEFORE parsing/relay. Workers raised
    // the WebSocket message limit to 32 MiB, so without this one bad client could
    // push huge frames that each cost a JSON.parse + relay inside the single shared
    // DO — burning CPU for every room on the instance. Signaling only ever carries
    // SDP offers/answers and ICE candidates (a few KB), so a generous byte ceiling
    // never touches a legitimate handshake. `raw` is a string for text frames or an
    // ArrayBuffer for binary; measure bytes either way (a string's .length is UTF-16
    // units, a fine lower-bound proxy for a large-frame guard).
    const bytes = typeof raw === 'string' ? raw.length : (raw && raw.byteLength) || 0;
    if (bytes > MAX_SIGNAL_BYTES) {
      return this.send(ws, { type: 'error', error: 'message-too-large', message: `Message exceeds ${MAX_SIGNAL_BYTES} bytes.` });
    }
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return this.send(ws, { type: 'error', error: 'bad-message', message: 'Expected JSON.' }); }
    if (!msg || typeof msg.type !== 'string') return this.send(ws, { type: 'error', error: 'bad-message' });

    if (msg.type === 'ping') return; // keepalive — receiving it keeps the DO awake so it won't hibernate (10s) and drop a waiting room
    if (msg.type === 'join') return this.handleJoin(ws, msg);
    if (msg.type === 'announce') return this.handleAnnounce(ws, msg);
    if (msg.type === 'signal') return this.handleSignal(ws, msg);
    return this.send(ws, { type: 'error', error: 'unknown-type', message: msg.type });
  }

  async handleJoin(ws, msg) {
    const prev = ws.deserializeAttachment();
    if (prev && prev.room != null) this.notifyLeft(ws, prev); // one room per socket; ignore an ip-only attachment

    let code = msg.room;
    if (code == null) {
      code = this.makeCode();                             // no code given => create a room
    } else if (typeof code === 'string') {
      code = wordsToCode(code) || code;
    }
    
    if (typeof code !== 'string' || !ROOM_RE.test(code)) {
      return this.send(ws, { type: 'error', error: 'bad-room', message: 'Invalid room code.' });
    } else if (!this.roomExists(code)) {
      // Room has no live sockets — but if it was reserved within the reclaim window
      // (both devices dropped at once, e.g. a shared tunnel), resurrect it under the
      // SAME code so they can rejoin and resume (H6=A). Re-validate expiry on read
      // (an alarm can be delayed/coalesced). No transfer state is restored — the
      // client registry + resumeToken carry the file resume; the server only owes
      // the same rendezvous code.
      const rec = await this.state.storage.get('reclaim:' + code);
      if (!rec || rec.expiresAt < Date.now()) {
        return this.send(ws, { type: 'error', error: 'room-not-found', message: 'Room not found.' });
      }
      await this.state.storage.delete('reclaim:' + code); // first reclaim-join wins; the second sees a live room
    } else if (this.sockets(code, null).length >= MAX_PEERS) {
      return this.send(ws, { type: 'error', error: 'room-full', message: `Room is full (max ${MAX_PEERS}).` });
    }

    const existing = this.sockets(code, ws);              // current members, before we join
    const peerId = crypto.randomUUID();
    ws.serializeAttachment({ ip: prev && prev.ip, peerId, room: code }); // keep ip; room flow ignores it

    // Glare-free mesh: the new peer offers to every existing peer; they wait.
    this.send(ws, { type: 'joined', selfId: peerId, room: code, peers: existing.map((p) => p.deserializeAttachment().peerId) });
    for (const p of existing) this.send(p, { type: 'peer-joined', peerId });
  }

  handleAnnounce(ws, msg) {
    const prev = ws.deserializeAttachment() || {};
    const peerId = crypto.randomUUID();
    ws.serializeAttachment({
      ip: prev.ip,                                        // keep the IP stamped at connect time
      peerId,
      name: String(msg.name || 'Device').slice(0, 40),
      // Client-guessed display hint (phone/tablet/desktop icon) — relayed as-is,
      // never interpreted server-side; unrecognized values fall back to 'desktop'.
      deviceType: DEVICE_TYPES.has(msg.deviceType) ? msg.deviceType : 'desktop',
      discoverable: true,
      pairedTokens: Array.isArray(msg.pairedTokens) ? msg.pairedTokens.filter(t => typeof t === 'string').slice(0, 50) : [],
    });
    this.broadcastNearby(prev.ip);
    this.broadcastPaired(ws);
  }

  // Everyone discoverable on the same public IP. Privacy guardrail: if the group is
  // bigger than MAX_DISCOVER, the network is shared (CGNAT/cellular) — hide the list.
  broadcastNearby(ip) {
    const group = this.state.getWebSockets().filter((ws) => {
      const a = ws.deserializeAttachment();
      return a && a.discoverable === true && a.ip === ip;
    });
    if (group.length > MAX_DISCOVER) {
      for (const m of group) {
        const a = m.deserializeAttachment();
        this.send(m, { type: 'nearby', selfId: a.peerId, devices: [], crowded: true });
      }
      return;
    }
    for (const m of group) {
      const a = m.deserializeAttachment();
      const devices = group
        .filter((x) => x !== m)
        .map((x) => {
          const xa = x.deserializeAttachment();
          return { peerId: xa.peerId, name: xa.name, deviceType: xa.deviceType || 'desktop' };
        });
      this.send(m, { type: 'nearby', selfId: a.peerId, devices });
    }
  }

  // Find other sockets sharing at least one pairedToken and cross-announce them.
  broadcastPaired(ws) {
    const a = ws.deserializeAttachment();
    if (!a || !a.pairedTokens || a.pairedTokens.length === 0) return;

    const allSockets = this.state.getWebSockets();
    const matched = allSockets.filter((other) => {
      if (other === ws) return false;
      const oa = other.deserializeAttachment();
      if (!oa || !oa.pairedTokens) return false;
      return oa.pairedTokens.some((t) => a.pairedTokens.includes(t));
    });

    for (const other of matched) {
      const oa = other.deserializeAttachment();
      // Inform the other socket about us
      this.send(other, { type: 'paired-online', peerId: a.peerId, name: a.name, deviceType: a.deviceType });
      // Inform us about the other socket
      this.send(ws, { type: 'paired-online', peerId: oa.peerId, name: oa.name, deviceType: oa.deviceType });
    }
  }

  handleSignal(ws, msg) {
    // Refuse obviously malformed frames. A non-string `to` just failed the lookup below
    // and vanished silently; a missing `data` still reached the peer as `data: undefined`,
    // which every client then had to special-case. `data` itself stays opaque — this
    // checks that the key is present, never what is inside it, so `null` is a value and
    // relays normally.
    if (typeof msg.to !== 'string' || msg.data === undefined) {
      return this.send(ws, { type: 'error', error: 'bad-message', message: 'signal requires to + data.' });
    }
    const a = ws.deserializeAttachment();
    if (!a) return;
    // Relay to the target peer if it's reachable from this sender: either same room,
    // or both discoverable on the same public IP. `from` is server-stamped (no forging).
    const target = this.state.getWebSockets().find((p) => {
      if (p === ws) return false;
      const pa = p.deserializeAttachment();
      if (!pa || pa.peerId !== msg.to) return false;
      const sameRoom = a.room != null && pa.room === a.room;
      const sameNetwork = a.discoverable && pa.discoverable && a.ip === pa.ip;
      const paired = a.pairedTokens && pa.pairedTokens && a.pairedTokens.some(t => pa.pairedTokens.includes(t));
      return sameRoom || sameNetwork || paired;
    });
    if (target) this.send(target, { type: 'signal', from: a.peerId, data: msg.data });
  }

  notifyLeft(ws, a) {
    for (const p of this.sockets(a.room, ws)) this.send(p, { type: 'peer-left', peerId: a.peerId });
  }

  async handleGone(ws) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    if (a.room != null) {
      this.notifyLeft(ws, a);                             // room flow: tell peers it left
      // If this was the LAST socket in the room, reserve the code for ~3 min so a
      // both-sides drop can rejoin the SAME code and resume (H6=A). The DO isn't
      // evicted mid-storage-op (output gate holds it until the put is durable), so
      // awaiting here is safe and avoids losing the record to hibernation.
      if (this.sockets(a.room, ws).length === 0) {
        const expiresAt = Date.now() + RECLAIM_MS;
        await this.state.storage.put('reclaim:' + a.room, { code: a.room, expiresAt });
        await this.state.storage.setAlarm(expiresAt);
      }
    }
    // The socket is closing, so it's already excluded from getWebSockets() by the time
    // the recompute runs; broadcasting on its IP refreshes the rest of the nearby group.
    if (a.discoverable) this.broadcastNearby(a.ip);
  }

  // GC expired reclaim records. The alarm is best-effort (can be delayed/coalesced),
  // so reads also re-validate expiry — this just stops stale reservations piling up.
  async alarm() {
    const now = Date.now();
    const recs = await this.state.storage.list({ prefix: 'reclaim:' });
    for (const [k, v] of recs) {
      if (!v || v.expiresAt <= now) await this.state.storage.delete(k);
    }
  }

  async webSocketClose(ws) {
    await this.handleGone(ws);
  }

  async webSocketError(ws) {
    await this.handleGone(ws);
  }
}
