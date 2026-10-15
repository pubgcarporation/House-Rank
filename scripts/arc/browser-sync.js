/**
 * fetch('http://127.0.0.1:8787/sync.js?'+Date.now()).then(r=>r.text()).then(eval)
 * await arcSync.sync()        // add missing + refresh DB (one shard pass)
 * await arcSync.syncNew()     // add unknown ids only
 * await arcSync.refreshAll()  // refresh every DB id, leftover via nanoId
 */
const TENANT = "688b1c42d1f8bff20fcac7a4";
const SAVE = "http://127.0.0.1:8787";
const LIMIT = 100;
const MAX_OFFSET = 2000;
const WORKERS = 16;
const PAGE_WORKERS = 8;
const NANO_WORKERS = 32;
const SAVE_EVERY = 120;
const AZ = "abcdefghijklmnopqrstuvwxyz".split("");
const REGION_Q = "68d42a304c4d7c2e8f734a41";
const SECTOR_Q = "695fd454b17ebea087385b49";
const REGIONS = ["North America", "Latin America (LATAM)", "Europe", "Middle East or Africa", "Asia-Pacific, Australia, New Zealand (APAC)"];
const SECTORS = ["DeFi", "Borrowing and Lending", "RWA", "Privacy", "Agentic Economy", "Bridges and Interoperability", "Treasury (settlement/clearing)", "Payments", "Exchanges and Trading", "Wallets and Custody", "Identity", "Dev Tooling", "Data and Infra", "Governance"];
const PASSES = [
  { claimed: true, finishedOnboarding: true },
  { claimed: true, finishedOnboarding: false },
  { claimed: false, finishedOnboarding: false },
];

function mapMember(r) {
  const company = typeof r.company === "string" ? r.company : r.company?.name || null;
  const profileBadge = r.profileBadge
    ? { id: r.profileBadge.id, name: r.profileBadge.name, pictureUrl: r.profileBadge.pictureUrl, description: r.profileBadge.description || null }
    : null;
  const badgeList = (r.contributionStatistics || [])
    .filter((s) => s.countType === "Badge" && s.countSource)
    .map((s) => ({ id: s.countSourceId, name: s.countSource.name, pictureUrl: s.countSource.pictureUrl, count: s.count }));
  return {
    id: r.id,
    userId: r.userId,
    nanoId: r.nanoId,
    name: r.displayName || [r.firstName, r.lastName].filter(Boolean).join(" "),
    firstName: r.firstName || null,
    lastName: r.lastName || null,
    headline: r.headline || null,
    position: r.position || null,
    company,
    pictureUrl: r.pictureUrl || null,
    city: r.city || null,
    state: r.state || null,
    country: r.country || null,
    location: r.displayLocation || [r.city, r.state, r.country].filter(Boolean).join(", ") || null,
    points: r.totalContributionPoints || 0,
    badges: r.totalContributionBadgeCount || 0,
    role: r.role || null,
    badge: badgeList[0]?.name || profileBadge?.name || null,
    badgeList,
    profileBadge,
  };
}

function getApollo() {
  const clients = new Set();
  const walk = (f, d = 0) => {
    if (!f || d > 80) return;
    try {
      const c = f.memoizedProps?.client || f.pendingProps?.client;
      if (c?.query) clients.add(c);
    } catch {}
    walk(f.child, d + 1);
    walk(f.sibling, d + 1);
  };
  for (const el of document.querySelectorAll("*")) {
    const k = Object.keys(el).find((x) => x.startsWith("__reactFiber") || x.startsWith("__reactContainer"));
    if (k) {
      walk(el[k]);
      if (clients.size) break;
    }
  }
  const client = [...clients][0];
  if (!client) throw new Error("Apollo not found");
  let queryDoc;
  for (const q of client.queryManager.queries.values()) {
    const doc = q.document || q.observableQuery?.options?.query;
    if (doc?.definitions?.[0]?.name?.value === "searchTenantUsersWithPagination") {
      queryDoc = doc;
      break;
    }
  }
  if (!queryDoc) throw new Error("people query missing — open /home/people");
  return { client, queryDoc };
}

async function mapPool(items, n, fn) {
  let i = 0;
  const workers = Math.min(n, items.length);
  if (!workers) return;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (i < items.length && !window.__arcAbort) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    })
  );
}

async function page(client, queryDoc, vars) {
  if (window.__arcAbort) return [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await client.query({ query: queryDoc, variables: vars, fetchPolicy: "network-only" });
      return r.data?.tenantUsers?.records || [];
    } catch (e) {
      if (/maximum offset/i.test(e.message || "")) return [];
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
  }
  return [];
}

function jobVars(job) {
  const v = {
    tenantId: TENANT,
    bookmarked: false,
    ...job.pass,
    text: job.text,
    profileQuestionFilters: job.filters,
    locationFilters: {},
    sort: "DEFAULT",
  };
  if (job.onlineOnly) v.onlineOnly = true;
  return v;
}

function searchVars(extra) {
  return {
    tenantId: TENANT,
    bookmarked: false,
    claimed: true,
    finishedOnboarding: true,
    text: "",
    profileQuestionFilters: [],
    locationFilters: {},
    sort: "DEFAULT",
    ...extra,
  };
}

function makePipeline(known) {
  const pending = [];
  let added = 0;
  let tagged = 0;
  let scanned = 0;
  let missed = 0;
  let dbTotal = known.size;
  const queued = new Set();
  let saving = Promise.resolve();

  async function flush(force) {
    if (!pending.length || (!force && pending.length < SAVE_EVERY)) return;
    const members = pending.splice(0, pending.length);
    saving = saving.then(async () => {
      const res = await fetch(SAVE + "/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ members }),
      });
      const j = await res.json();
      dbTotal = j.total;
      console.log(`[arc] save batch=${members.length} fresh=${j.fresh} added=${added} tagged=${tagged} db=${dbTotal}`);
    });
    await saving;
  }

  function ingest(records, mode) {
    let n = 0;
    for (const r of records) {
      scanned++;
      if (!r?.id || queued.has(r.id)) continue;
      const isNew = !known.has(r.id);
      if (mode === "new" && !isNew) continue;
      if (mode === "refresh" && isNew) continue;
      queued.add(r.id);
      known.add(r.id);
      pending.push(mapMember(r));
      n++;
      if (isNew) added++;
      else tagged++;
    }
    return n;
  }

  return {
    flush,
    ingest,
    miss: () => {
      missed++;
    },
    queued,
    stats: () => ({ added, tagged, unique: queued.size, scanned, missed, dbTotal, known: known.size }),
  };
}

function discoverJobs() {
  const out = [];
  const digraphs = [];
  for (const a of AZ) for (const b of AZ) digraphs.push(a + b);

  for (const pass of PASSES) {
    for (const text of ["", ...AZ]) {
      out.push({ pass, text, filters: [], onlineOnly: false, label: `all:${text || "_"}` });
      out.push({ pass, text, filters: [], onlineOnly: true, label: `on:${text || "_"}` });
    }
    for (const text of digraphs) {
      out.push({ pass, text, filters: [], onlineOnly: false, label: `dg:${text}` });
    }
    for (const r of REGIONS) {
      out.push({ pass, text: "", filters: [{ questionId: REGION_Q, value: [r] }], onlineOnly: false, label: `rg:${r.slice(0, 8)}` });
      for (const a of AZ.slice(0, 12)) {
        out.push({ pass, text: a, filters: [{ questionId: REGION_Q, value: [r] }], onlineOnly: false, label: `rg:${r.slice(0, 4)}:${a}` });
      }
    }
    for (const s of SECTORS) {
      out.push({ pass, text: "", filters: [{ questionId: SECTOR_Q, value: [s] }], onlineOnly: false, label: `sc:${s.slice(0, 8)}` });
    }
  }
  return out;
}

async function pullWindow(client, queryDoc, base, ingest, flush) {
  const first = await page(client, queryDoc, { ...base, limit: LIMIT, offset: 0 });
  if (!first.length) return 0;
  let n = ingest(first);
  if (first.length < LIMIT) {
    await flush(false);
    return n;
  }
  const offsets = [];
  for (let o = LIMIT; o <= MAX_OFFSET; o += LIMIT) offsets.push(o);
  await mapPool(offsets, PAGE_WORKERS, async (offset) => {
    const recs = await page(client, queryDoc, { ...base, limit: LIMIT, offset });
    if (recs.length) n += ingest(recs);
  });
  await flush(false);
  return n;
}

async function finish(pipe, start, t0, label) {
  await pipe.flush(true);
  const j = await (await fetch(SAVE + "/flush", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
  const out = { ...pipe.stats(), db: j.total, skipped: start, ms: Math.round(performance.now() - t0) };
  console.log(`[${label}] DONE`, out);
  window.__arcProgress = out;
  return out;
}

async function run(mode) {
  window.__arcAbort = false;
  const { client, queryDoc } = getApollo();
  const people = mode === "new" ? null : (await (await fetch(SAVE + "/people")).json()).people || [];
  const known = new Set(people ? people.map((p) => p.id) : (await (await fetch(SAVE + "/ids")).json()).ids || []);
  const start = known.size;
  const pipe = makePipeline(known);
  const t0 = performance.now();
  const list = discoverJobs();
  console.log(`[${mode}] db=${start} shards=${list.length}`);

  await mapPool(list, WORKERS, async (job) => {
    const n = await pullWindow(client, queryDoc, jobVars(job), (recs) => pipe.ingest(recs, mode), pipe.flush);
    if (n) console.log(`[${mode}] ${job.label} +${n}`);
    window.__arcProgress = { mode, ...pipe.stats(), shard: job.label };
  });

  if (people) {
    const left = people.filter((p) => !pipe.queued.has(p.id) && (p.nanoId || p.id));
    console.log(`[${mode}] nanoId leftover ${left.length}`);
    await mapPool(left, NANO_WORKERS, async (p, idx) => {
      const recs = await page(client, queryDoc, searchVars({ text: p.nanoId || p.id, limit: 5, offset: 0 }));
      const hit = recs.find((r) => r.id === p.id);
      if (hit) pipe.ingest([hit], mode);
      else pipe.miss();
      await pipe.flush(false);
      if (idx % 100 === 0) window.__arcProgress = { mode: `${mode}-nano`, ...pipe.stats(), at: idx, of: left.length };
    });
  }

  return finish(pipe, start, t0, mode);
}

async function syncNew() {
  return run("new");
}

async function refreshAll() {
  return run("refresh");
}

async function sync() {
  return run("all");
}

window.arcSync = { sync, syncNew, refreshAll };
console.log("[arc] ready — arcSync.sync() | arcSync.syncNew() | arcSync.refreshAll()");
