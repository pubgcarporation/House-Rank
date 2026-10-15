import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { withRanks } from "./map-member.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(dir, "../../src/data/members.json");
const PORT = 8787;
const SCRIPTS = { "/sync.js": "browser-sync.js", "/browser-sync.js": "browser-sync.js", "/mention.js": "mention-sync.js" };

let cache = null;
let dirty = false;

function load() {
  if (cache) return cache;
  cache = new Map();
  if (fs.existsSync(file)) {
    const db = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const m of db.members || []) if (m?.id) cache.set(m.id, m);
  }
  return cache;
}

function writeDb(syncedAt) {
  const members = withRanks([...load().values()]);
  fs.writeFileSync(file, JSON.stringify({ syncedAt: syncedAt || new Date().toISOString(), members }));
  dirty = false;
  return members.length;
}

function json(res, body) {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

http
  .createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathName = url.pathname;

    try {
      if (req.method === "GET" && pathName === "/health") return res.end("ok");

      if (req.method === "GET" && pathName === "/count") {
        return res.end(String(load().size));
      }

      if (req.method === "GET" && pathName === "/ids") {
        return json(res, { ids: [...load().keys()] });
      }

      if (req.method === "GET" && pathName === "/people") {
        return json(res, {
          people: [...load().values()].map((m) => ({ id: m.id, userId: m.userId || null, name: m.name || "", nanoId: m.nanoId || null })),
        });
      }

      if (req.method === "GET" && SCRIPTS[pathName]) {
        res.setHeader("content-type", "text/javascript; charset=utf-8");
        return res.end(fs.readFileSync(path.join(dir, SCRIPTS[pathName])));
      }

      if (req.method === "POST" && pathName === "/save") {
        const incoming = await readBody(req);
        const map = load();
        let upserted = 0;
        let fresh = 0;
        for (const m of incoming.members || []) {
          if (!m?.id) continue;
          const prev = map.get(m.id);
          if (!prev) fresh++;
          const clubs = [...new Set([...(prev?.clubs || []), ...(m.clubs || [])])];
          map.set(m.id, { ...prev, ...m, clubs: clubs.length ? clubs : undefined });
          upserted++;
        }
        dirty = true;
        return json(res, { ok: true, total: map.size, upserted, fresh, dirty });
      }

      if (req.method === "POST" && pathName === "/flush") {
        const total = writeDb((await readBody(req).catch(() => ({}))).syncedAt);
        return json(res, { ok: true, total });
      }

      if (req.method === "POST" && pathName === "/replace") {
        const incoming = await readBody(req);
        cache = new Map();
        for (const m of incoming.members || []) if (m?.id) cache.set(m.id, m);
        const total = writeDb(incoming.syncedAt);
        return json(res, { ok: true, total });
      }

      res.statusCode = 404;
      res.end();
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e.message || e));
    }
  })
  .listen(PORT, () => console.log(`arc save server http://127.0.0.1:${PORT}`));

process.on("SIGINT", () => {
  if (dirty) writeDb();
  process.exit(0);
});
