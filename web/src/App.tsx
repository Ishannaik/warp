import "./index.css";

import Landing from "./Landing";
import TransferFlow from "./transfer/TransferFlow";
import Theory from "./theory/Theory";
import ReceiveEntry from "./receive/ReceiveEntry";
import BrandKit from "./brand/BrandKit";
import Legal from "./legal/Legal";
import { useRoute } from "./router";
import { useDocumentSeo } from "./lib/useDocumentSeo";

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
  return {
    title: "Warp — Send files directly between devices",
    description:
      "Send files directly between devices — peer-to-peer, end-to-end encrypted. No uploads, no size limits, no account. Free & open-source.",
  };
}

export default function App() {
  const { path, code } = useRoute();

  const { title, description } = seoForRoute(path);
  useDocumentSeo(title, description);

  if (path === "/send") return <TransferFlow />;
  if (path === "/receive") return <ReceiveEntry />;
  if (path.startsWith("/r/") && code) return <TransferFlow joinCode={code} />;
  if (path === "/how") return <Theory />;
  if (path === "/brand") return <BrandKit />;
  if (path === "/terms") return <Legal kind="terms" />;
  if (path === "/privacy") return <Legal kind="privacy" />;

  return <Landing />;
}
