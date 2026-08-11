const STAGE_DB = "warp-share";
const STAGE_STORE = "stage";

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const files = formData.getAll("files");
        const title = formData.get("title");
        const text = formData.get("text");

        await new Promise((resolve, reject) => {
          const req = indexedDB.open(STAGE_DB, 1);
          req.onupgradeneeded = () => {
            req.result.createObjectStore(STAGE_STORE);
          };
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(STAGE_STORE, "readwrite");
            tx.objectStore(STAGE_STORE).put({ files, title, text, ts: Date.now() }, "shared");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        console.error("Share target error:", err);
      }
      return Response.redirect("/send?shared=1", 303);
    })());
  }
});
