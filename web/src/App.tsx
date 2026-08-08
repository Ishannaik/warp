import "./index.css";

import Landing from "./Landing";
import TransferFlow from "./transfer/TransferFlow";
import Theory from "./theory/Theory";
import ReceiveEntry from "./receive/ReceiveEntry";
import BrandKit from "./brand/BrandKit";
import Legal from "./legal/Legal";
import SendWithoutUploading from "./content/SendWithoutUploading";
import NotFound from "./NotFound";
import { useRoute } from "./router";
import { useDocumentSeo } from "./lib/useDocumentSeo";
import { VALID_RE, sanitize } from "./lib/warp/roomCode";

const CHANNEL_DESC =
  "Open a secure peer-to-peer channel and send files straight to another device.";

function seoForRoute(path: string): { title: string; description: string } {
  if (path === "/send") {
    return { title: "Send a file · Warp", description: CHANNEL_DESC };
  }
  if (path.startsWith("/r/")) {
    return { title: "Receiving a file · Warp", description: CHANNEL_DESC };
  }
  if (path === "/receive") {
    return {
      title: "Receive a file · Warp",
      description:
        "Enter a code to receive files peer-to-peer, straight to your device.",
    };
  }
  if (path === "/how") {
    return {
      title: "How Warp works · Warp",
      description:
        "How Warp moves files directly between devices over an encrypted peer-to-peer channel — no server ever sees them.",
    };
  }
  if (path === "/brand") {
    return {
      title: "Brand kit · Warp",
      description: "Warp logo marks, colours, and type — download the brand assets.",
    };
  }
  if (path === "/terms") {
    return {
      title: "Terms · Warp",
      description: "The plain-language terms for using Warp.",
    };
  }
  if (path === "/privacy") {
    return {
      title: "Privacy · Warp",
      description:
        "How Warp handles your data — short version: your files never touch a server.",
    };
  }
  if (path === "/send-without-uploading") {
    return {
      title: "Send files without uploading to a server · Warp",
      description:
        "Warp sends files device-to-device over an encrypted peer-to-peer connection — no cloud copy, no upload step. Here's exactly what the signaling server does and doesn't see.",
    };
  }
  if (path !== "/") {
    return {
      title: "Page not found · Warp",
      description: "This Warp URL doesn’t match a known page.",
    };
  }
  return {
    title: "Warp — Send files directly between devices",
    description:
      "Send files directly between devices — peer-to-peer, end-to-end encrypted. No uploads, no size limits, no account. Free & open-source.",
  };
}

export default function App() {
  const { path, code } = useRoute();

  const { title, description } = seoForRoute(path);
  // Session URLs (/r/<code>) are ephemeral — canonicalize them to the stable
  // receive page so shared links don't fragment indexing across room codes.
  const canonicalPath = path.startsWith("/r/") ? "/receive" : path;
  useDocumentSeo(title, description, canonicalPath);

  if (path === "/") return <Landing />;
  if (path === "/send") return <TransferFlow />;
  if (path === "/receive") return <ReceiveEntry />;
  if (path.startsWith("/r/") && code) {
    const cleaned = sanitize(code);
    if (VALID_RE.test(cleaned)) {
      return <TransferFlow joinCode={cleaned} />;
    }
    // Malformed deep link — show the receive form with a hint, no WebSocket yet.
    return <ReceiveEntry initialCode={cleaned} />;
  }
  if (path === "/how") return <Theory />;
  if (path === "/brand") return <BrandKit />;
  if (path === "/terms") return <Legal kind="terms" />;
  if (path === "/privacy") return <Legal kind="privacy" />;
  if (path === "/send-without-uploading") return <SendWithoutUploading />;

  return <NotFound />;
}
