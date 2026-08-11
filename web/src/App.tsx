import "./index.css";

import Landing from "./Landing";
import TransferFlow from "./transfer/TransferFlow";
import Theory from "./theory/Theory";
import ReceiveEntry from "./receive/ReceiveEntry";
import BrandKit from "./brand/BrandKit";
import Legal from "./legal/Legal";
import NotFound from "./NotFound";
import { useRoute } from "./router";
import { useDocumentSeo } from "./lib/useDocumentSeo";
import { VALID_RE, sanitize } from "./lib/warp/roomCode";

const CHANNEL_DESC =
  "Open a secure peer-to-peer channel and send files straight to another device.";

function getBreadcrumb(name: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Warp",
        item: "https://warp.ishannaik.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name,
        item: `https://warp.ishannaik.com${path}`,
      },
    ],
  };
}

interface RouteSeo {
  title: string;
  description: string;
  jsonLd?: Record<string, unknown>;
}

function seoForRoute(path: string): RouteSeo {
  if (path === "/send") {
    return {
      title: "Send a file · Warp",
      description: CHANNEL_DESC,
      jsonLd: getBreadcrumb("Send a file", "/send"),
    };
  }
  if (path.startsWith("/r/")) {
    return {
      title: "Receiving a file · Warp",
      description: CHANNEL_DESC,
      jsonLd: getBreadcrumb("Receive a file", "/receive"),
    };
  }
  if (path === "/receive") {
    return {
      title: "Receive a file · Warp",
      description:
        "Enter a code to receive files peer-to-peer, straight to your device.",
      jsonLd: getBreadcrumb("Receive a file", "/receive"),
    };
  }
  if (path === "/how") {
    return {
      title: "How Warp works · Warp",
      description:
        "How Warp moves files directly between devices over an encrypted peer-to-peer channel — no server ever sees them.",
      jsonLd: getBreadcrumb("How Warp works", "/how"),
    };
  }
  if (path === "/brand") {
    return {
      title: "Brand kit · Warp",
      description: "Warp logo marks, colours, and type — download the brand assets.",
      jsonLd: getBreadcrumb("Brand kit", "/brand"),
    };
  }
  if (path === "/terms") {
    return {
      title: "Terms · Warp",
      description: "The plain-language terms for using Warp.",
      jsonLd: getBreadcrumb("Terms", "/terms"),
    };
  }
  if (path === "/privacy") {
    return {
      title: "Privacy · Warp",
      description:
        "How Warp handles your data — short version: your files never touch a server.",
      jsonLd: getBreadcrumb("Privacy", "/privacy"),
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

  const { title, description, jsonLd } = seoForRoute(path);
  // Session URLs (/r/<code>) are ephemeral — canonicalize them to the stable
  // receive page so shared links don't fragment indexing across room codes.
  const canonicalPath = path.startsWith("/r/") ? "/receive" : path;
  useDocumentSeo(title, description, canonicalPath, jsonLd);

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

  return <NotFound />;
}
