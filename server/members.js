import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tierOf } from "../src/lib/tiers.js";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/members.json");

let cache = null;

function all() {
  const mtime = fs.statSync(file).mtimeMs;
  if (!cache || cache.mtime !== mtime) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    cache = {
      mtime,
      members: data.members.map((m, i) => ({
        id: m.id,
        userId: m.userId,
        name: m.name,
        headline: m.headline,
        position: m.position,
        pictureUrl: m.pictureUrl,
        location: m.location,
        company: m.company,
        points: m.points,
        badge: m.badge || null,
        profileBadge: m.profileBadge || null,
        rank: i + 1,
      })),
    };
  }
  return cache.members;
}

function match(m, q) {
  return [m.name, m.headline, m.location, m.company, m.id, m.userId]
    .filter(Boolean)
    .some((v) => v.toLowerCase().includes(q));
}

export function query({ q = "", tier = "all", offset = 0, limit = 100 }) {
  const text = q.trim().toLowerCase();
  const rows = all().filter((m) => {
    if (tier !== "all" && tierOf(m).n !== Number(tier)) return false;
    return !text || match(m, text);
  });
  const start = Math.max(0, offset);
  return {
    total: rows.length,
    members: rows.slice(start, start + limit),
    top: !text && tier === "all" ? all().slice(0, 3) : [],
  };
}

export function fromUrl(urlStr) {
  const url = new URL(urlStr, "http://localhost");
  return {
    q: url.searchParams.get("q") || "",
    tier: url.searchParams.get("tier") || "all",
    offset: Math.max(0, Number(url.searchParams.get("offset")) || 0),
    limit: Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 100)),
  };
}

export function handleMembersApi(req, res, next) {
  if (req.url.split("?")[0] !== "/api/members") return next();
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(query(fromUrl(req.url))));
}
