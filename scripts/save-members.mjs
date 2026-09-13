import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/members.json");
http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") return res.end();
    if (req.method === "GET" && req.url === "/members") {
      res.setHeader("content-type", "application/json");
      return res.end(fs.readFileSync(file));
    }
    if (req.method === "POST" && req.url === "/save") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let incoming;
        try { incoming = JSON.parse(Buffer.concat(chunks).toString()); } catch { return res.end("bad"); }
        const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { members: [] };
        const map = new Map();
        for (const m of cur.members || []) if (m?.id) map.set(m.id, m);
        for (const m of incoming.members || []) if (m?.id) map.set(m.id, m);
        const members = [...map.values()].sort((a, b) => (b.points || 0) - (a.points || 0));
        fs.writeFileSync(file, JSON.stringify({ syncedAt: incoming.syncedAt || new Date().toISOString(), members }));
        res.end(String(members.length));
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  })
  .listen(8787, () => console.log("8787"));
