import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../dist");

const CHANNEL_DESC = "Open a secure peer-to-peer channel and send files straight to another device.";

const ROUTES = [
  { 
    path: "/", 
    title: "Warp — Send files directly between devices", 
    description: "Send files directly between devices — peer-to-peer, end-to-end encrypted. No uploads, no size limits, no account. Free & open-source." 
  },
  { 
    path: "/send", 
    title: "Send a file · Warp", 
    description: CHANNEL_DESC 
  },
  { 
    path: "/receive", 
    title: "Receive a file · Warp", 
    description: "Enter a code to receive files peer-to-peer, straight to your device." 
  },
  { 
    path: "/how", 
    title: "How Warp works · Warp", 
    description: "How Warp moves files directly between devices over an encrypted peer-to-peer channel — no server ever sees them." 
  },
  { 
    path: "/brand", 
    title: "Brand kit · Warp", 
    description: "Warp logo marks, colours, and type — download the brand assets." 
  },
  { 
    path: "/terms", 
    title: "Terms · Warp", 
    description: "The plain-language terms for using Warp." 
  },
  { 
    path: "/privacy", 
    title: "Privacy · Warp", 
    description: "How Warp handles your data — short version: your files never touch a server." 
  },
];

async function prerender() {
  const indexHtmlPath = path.join(dist, "index.html");
  let template = "";
  try {
    template = await fs.readFile(indexHtmlPath, "utf-8");
  } catch (err) {
    console.error("No dist/index.html found. Run vite build first.");
    process.exit(1);
  }

  for (const route of ROUTES) {
    let html = template;

    // Replace <title>
    html = html.replace(/<title>.*?<\/title>/, `<title>${route.title}</title>`);
    
    // Replace <meta name="description" ...>
    html = html.replace(/(<meta\s+name="description"\s+content=")([^"]*)(")/, `$1${route.description}$3`);
    
    // Replace <meta property="og:title" ...>
    html = html.replace(/(<meta\s+property="og:title"\s+content=")([^"]*)(")/, `$1${route.title}$3`);
    
    // Replace <meta property="og:description" ...>
    html = html.replace(/(<meta\s+property="og:description"\s+content=")([^"]*)(")/, `$1${route.description}$3`);
    
    // Replace <meta name="twitter:title" ...>
    html = html.replace(/(<meta\s+name="twitter:title"\s+content=")([^"]*)(")/, `$1${route.title}$3`);
    
    // Replace <meta name="twitter:description" ...>
    html = html.replace(/(<meta\s+name="twitter:description"\s+content=")([^"]*)(")/, `$1${route.description}$3`);

    // Replace canonical and og:url
    const fullUrl = `https://warp.ishannaik.com${route.path}`;
    html = html.replace(/(<link\s+rel="canonical"\s+href=")([^"]*)(")/, `$1${fullUrl}$3`);
    html = html.replace(/(<meta\s+property="og:url"\s+content=")([^"]*)(")/, `$1${fullUrl}$3`);

    if (route.path === "/") {
      await fs.writeFile(indexHtmlPath, html);
    } else {
      const routeDir = path.join(dist, route.path.slice(1));
      await fs.mkdir(routeDir, { recursive: true });
      await fs.writeFile(path.join(routeDir, "index.html"), html);
      // Create .html file too just in case routing expects it
      await fs.writeFile(path.join(dist, `${route.path.slice(1)}.html`), html);
    }
    console.log(`Prerendered SEO snapshot for ${route.path}`);
  }
}

prerender().catch(err => {
  console.error(err);
  process.exit(1);
});
