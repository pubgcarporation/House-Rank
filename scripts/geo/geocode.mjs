/**
 * Resolve member city/state/country to coordinates with GeoNames -> src/data/places.json.
 * Falls back city -> state centroid -> country centroid. Only places missing from places.json are resolved.
 *
 * npm run geo
 */
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { isoByName as knownIso, norm } from "../../server/countries.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const membersFile = path.join(root, "src/data/members.json");
const placesFile = path.join(root, "src/data/places.json");
const cacheDir = path.join(os.tmpdir(), "house-rank-geo");
const BASE = "https://download.geonames.org/export/dump/";

async function download(name) {
  const file = path.join(cacheDir, name);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  fs.mkdirSync(cacheDir, { recursive: true });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(BASE + name, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(file, buf);
      return buf;
    } catch (e) {
      if (attempt === 8) throw new Error(`${name}: ${e.cause?.code || e.message}`);
      console.log(`${name}: retry ${attempt}`);
    }
  }
}

function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const dir = buf.readUInt32LE(end + 16);
  const size = buf.readUInt32LE(dir + 20);
  const local = buf.readUInt32LE(dir + 42);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  return zlib.inflateRawSync(buf.subarray(start, start + size)).toString("utf8");
}

function centroid(cities) {
  let x = 0;
  let y = 0;
  let z = 0;
  let w = 0;
  for (const c of cities) {
    const lat = (c.lat * Math.PI) / 180;
    const lng = (c.lng * Math.PI) / 180;
    const weight = c.pop + 1;
    x += Math.cos(lat) * Math.cos(lng) * weight;
    y += Math.cos(lat) * Math.sin(lng) * weight;
    z += Math.sin(lat) * weight;
    w += weight;
  }
  return {
    lat: (Math.atan2(z / w, Math.hypot(x / w, y / w)) * 180) / Math.PI,
    lng: (Math.atan2(y / w, x / w) * 180) / Math.PI,
  };
}

async function loadGazetteer() {
  const admin = new Map();
  for (const line of (await download("admin1CodesASCII.txt")).toString("utf8").split("\n")) {
    const [code, name] = line.split("\t");
    if (code) admin.set(code, norm(name));
  }

  const isoByName = new Map(knownIso);
  const rows = (await download("countryInfo.txt")).toString("utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));
  for (const f of rows) if (!isoByName.has(norm(f[4]))) isoByName.set(norm(f[4]), f[0]);
  const countries = new Map();
  for (const line of unzip(await download("cities1000.zip")).split("\n")) {
    const f = line.split("\t");
    if (f.length < 15) continue;
    const country = countries.get(f[8]) || { names: new Map(), list: [] };
    countries.set(f[8], country);
    const city = { lat: +f[4], lng: +f[5], pop: +f[14], admin: admin.get(`${f[8]}.${f[10]}`) || "" };
    country.list.push(city);
    for (const name of new Set([f[1], f[2], ...f[3].split(",")].map(norm))) {
      if (!name) continue;
      if (!country.names.has(name)) country.names.set(name, []);
      country.names.get(name).push(city);
    }
  }
  for (const country of countries.values()) country.center = centroid(country.list);
  return { isoByName, countries };
}

function locate({ city, state, country }, { isoByName, countries }) {
  const data = countries.get(isoByName.get(norm(country)));
  if (!data) return null;
  const s = norm(state);
  const inState = (c) => s && c.admin && (c.admin.includes(s) || s.includes(c.admin));

  const hits = data.names.get(norm(city));
  if (hits) {
    const score = (c) => (inState(c) ? 1000 : 0) + Math.log10(c.pop + 1);
    return { ...hits.reduce((a, b) => (score(b) > score(a) ? b : a)), level: "city" };
  }
  const region = data.list.filter(inState);
  if (region.length) return { ...centroid(region), level: "state" };
  return { ...data.center, level: "country" };
}

const members = JSON.parse(fs.readFileSync(membersFile, "utf8")).members;
const places = fs.existsSync(placesFile) ? JSON.parse(fs.readFileSync(placesFile, "utf8")) : {};

const missing = new Map();
for (const m of members) {
  if (!m.country) continue;
  const key = [m.city, m.state, m.country].map((v) => v || "").join("|");
  if (!places[key] && !missing.has(key)) missing.set(key, m);
}

if (missing.size) {
  const gazetteer = await loadGazetteer();
  const levels = { city: 0, state: 0, country: 0 };
  const failed = new Set();
  for (const [key, m] of missing) {
    const spot = locate(m, gazetteer);
    if (!spot) {
      failed.add(m.country);
      continue;
    }
    places[key] = [+spot.lat.toFixed(2), +spot.lng.toFixed(2)];
    levels[spot.level]++;
  }
  const body = Object.keys(places)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${JSON.stringify(places[k])}`)
    .join(",\n");
  fs.writeFileSync(placesFile, `{\n${body}\n}\n`);
  console.log("resolved", levels, "| unknown countries:", [...failed]);
}
console.log(`places: ${Object.keys(places).length}`);
