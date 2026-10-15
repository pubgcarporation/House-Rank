import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tierOf } from "../src/lib/tiers.js";
import { isoByName, norm } from "./countries.js";

const data = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data");
const file = path.join(data, "members.json");

let cache = null;
let spots = null;

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
        city: m.city,
        state: m.state,
        country: m.country,
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

export function places() {
  spots ??= JSON.parse(fs.readFileSync(path.join(data, "places.json"), "utf8"));
  const groups = new Map();
  const countries = new Map();
  let located = 0;
  for (const m of all()) {
    const key = [m.city, m.state, m.country].map((v) => v || "").join("|");
    const at = spots[key];
    if (!at) continue;
    const g = groups.get(key) || { lat: at[0], lng: at[1], n: 0, label: m.location || m.country };
    g.n++;
    groups.set(key, g);
    countries.set(m.country, (countries.get(m.country) || 0) + 1);
    located++;
  }
  return {
    located,
    places: [...groups.values()],
    countries: [...countries]
      .map(([country, n]) => ({ country, n, code: isoByName.get(norm(country))?.toLowerCase() }))
      .sort((a, b) => b.n - a.n),
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

const routes = {
  "/api/members": (url) => query(fromUrl(url)),
  "/api/places": () => places(),
};

export function handleMembersApi(req, res, next) {
  const route = routes[req.url.split("?")[0]];
  if (!route) return next();
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(route(req.url)));
}
