/**
 * Members the people directory never lists: crawl the @mention index, then resolve each userId to a full profile.
 * Needs sync.js loaded first (reuses arcSync.mapMember / arcSync.getApollo).
 *
 * fetch('http://127.0.0.1:8787/mention.js?'+Date.now()).then(r=>r.text()).then(eval)
 * await arcMention.run()
 */
const { mapMember, getApollo } = window.arcSync || {};
if (!mapMember) throw new Error("load sync.js first");

const TENANT = "688b1c42d1f8bff20fcac7a4";
const SAVE = "http://127.0.0.1:8787";
const PAGE = 20;
const MAX_SKIP = 2000;
const CRAWLERS = 16;
const RESOLVERS = 6;
const START_GAP = 160;
const MIN_GAP = 50;
const MAX_GAP = 600;
const SAVE_EVERY = 20;
const FLUSH_EVERY = 60;
const TOKEN_MIN = 3;
const MAX_TOKENS = 2500;
const AZ = "abcdefghijklmnopqrstuvwxyz".split("");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const name = (value) => ({ kind: "Name", value });

function operation(op, vars) {
  const keys = Object.keys(vars);
  return {
    kind: "Document",
    definitions: [
      {
        kind: "OperationDefinition",
        operation: "query",
        name: name(op),
        variableDefinitions: keys.map((k) => ({
          kind: "VariableDefinition",
          variable: { kind: "Variable", name: name(k) },
          type: { kind: "NamedType", name: name("String") },
        })),
        selectionSet: {
          kind: "SelectionSet",
          selections: [
            {
              kind: "Field",
              name: name("result"),
              arguments: keys.map((k) => ({ kind: "Argument", name: name(k), value: { kind: "Variable", name: name(k) } })),
            },
          ],
        },
      },
    ],
  };
}

function makeApi(client) {
  const gate = { gap: START_GAP, next: 0, pause: 0, backoff: 6000, limited: 0 };

  const send = (op, vars) =>
    new Promise((resolve) => {
      let out = null;
      client.queryManager.getObservableFromLink(operation(op, vars), {}, vars, false).subscribe({
        next: (r) => (out = r),
        error: (e) => resolve({ error: String(e.message || e) }),
        complete: () => resolve({ data: out?.data }),
      });
    });

  async function call(op, vars) {
    for (let attempt = 0; attempt < 8 && !window.__arcAbort; attempt++) {
      const now = performance.now();
      const at = Math.max(now, gate.next, gate.pause);
      gate.next = at + gate.gap;
      if (at > now) await sleep(at - now);
      const r = await send(op, vars);
      if (!r.error) {
        gate.backoff = Math.max(6000, gate.backoff * 0.9);
        gate.gap = Math.max(MIN_GAP, gate.gap * 0.97);
        return r.data;
      }
      if (/429/.test(r.error)) {
        gate.limited++;
        gate.pause = performance.now() + gate.backoff;
        gate.backoff = Math.min(60000, gate.backoff * 1.6);
        gate.gap = Math.min(MAX_GAP, gate.gap * 1.2);
      } else await sleep(300 * (attempt + 1));
    }
    return null;
  }

  return { call, gate };
}

async function post(path, body) {
  const res = await fetch(SAVE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

function seedTexts(names) {
  const words = new Map();
  const chars = new Map();
  for (const full of names) {
    const lower = full.toLowerCase();
    for (const w of new Set(lower.split(/[^\p{L}\p{N}]+/u))) if (w.length > 1) words.set(w, (words.get(w) || 0) + 1);
    for (const c of new Set(lower)) if (/[\p{L}\p{N}]/u.test(c)) chars.set(c, (chars.get(c) || 0) + 1);
  }
  const top = (map, min) => [...map].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return [...new Set([...top(words, TOKEN_MIN).slice(0, MAX_TOKENS), ...top(chars, TOKEN_MIN), ...AZ])];
}

async function crawlWindow(api, text, onUser) {
  let fresh = 0;
  for (let skip = 0; skip <= MAX_SKIP; skip += PAGE) {
    const data = await api.call("SearchTenantUserForMention", { tenantId: TENANT, text, skip, limit: PAGE });
    const records = data?.searchMentionedLVTenantUser?.records || [];
    for (const u of records) if (onUser(u)) fresh++;
    if (records.length < PAGE) return { saturated: false, fresh };
  }
  return { saturated: true, fresh };
}

async function run() {
  window.__arcAbort = false;
  const api = makeApi(getApollo().client);
  const db = (await (await fetch(SAVE + "/people")).json()).people || [];
  const known = new Set(db.map((p) => p.id));
  const stats = { scanned: 0, found: 0, saved: 0, failed: 0, windows: 0, db: known.size };
  const t0 = performance.now();

  const texts = seedTexts(db.map((p) => p.name));
  const visited = new Set(texts);
  const people = [];
  const queued = new Set();
  const batch = [];
  let active = 0;
  let crawling = true;
  let flushed = 0;

  const report = () => {
    window.__arcProgress = { mode: "mention", ...stats, texts: texts.length, waiting: people.length, limited: api.gate.limited };
  };

  const onUser = (u) => {
    stats.scanned++;
    if (!u?.id || known.has(u.id) || queued.has(u.id)) return false;
    queued.add(u.id);
    people.push(u);
    stats.found++;
    return true;
  };

  async function drain(force) {
    if (!batch.length || (!force && batch.length < SAVE_EVERY)) return;
    const members = batch.splice(0);
    stats.db = (await post("/save", { members })).total;
    stats.saved += members.length;
    if (force || stats.saved - flushed >= FLUSH_EVERY) {
      await post("/flush", {});
      flushed = stats.saved;
    }
    console.log(`[mention] saved=${stats.saved} found=${stats.found} db=${stats.db}`);
  }

  async function crawler() {
    while (!window.__arcAbort) {
      const text = texts.shift();
      if (!text) {
        if (!active) return;
        await sleep(200);
        continue;
      }
      active++;
      try {
        const { saturated, fresh } = await crawlWindow(api, text, onUser);
        if (saturated && (fresh || text.length === 1)) {
          for (const c of AZ) {
            for (const t of [text + c, c + text]) {
              if (visited.has(t)) continue;
              visited.add(t);
              texts.push(t);
            }
          }
        }
      } finally {
        active--;
      }
      stats.windows++;
      report();
    }
  }

  async function resolver() {
    while (!window.__arcAbort) {
      const u = people.shift();
      if (!u) {
        if (!crawling) return;
        await sleep(500);
        continue;
      }
      const data = await api.call("GetTenantUserWithDetails", { tenantId: TENANT, userId: u.userId, getExternalProfile: false });
      if (data?.tenantUser) batch.push(mapMember(data.tenantUser));
      else stats.failed++;
      await drain(false);
      report();
    }
  }

  const crawl = Promise.all(Array.from({ length: CRAWLERS }, crawler)).then(() => (crawling = false));
  await Promise.all([crawl, ...Array.from({ length: RESOLVERS }, resolver)]);
  await drain(true);
  await post("/flush", {});

  const out = { ...stats, left: people.length, ms: Math.round(performance.now() - t0) };
  console.log("[mention] DONE", out);
  window.__arcProgress = out;
  return out;
}

window.arcMention = { run };
console.log("[arc] ready — arcMention.run()");
