/**
 * NEW-only discover + Architects club tag.
 * Known DB ids are never counted as "added". API has no excludeIds — filter is client-side.
 *
 * fetch('http://127.0.0.1:8787/sync.js?'+Date.now()).then(r=>r.text()).then(eval)
 * await arcSync.syncNew()
 * await arcSync.tagArchitects()
 */
const TENANT = "688b1c42d1f8bff20fcac7a4";
const ARCHITECTS = "690e4758cbbcfcd6133a2d31";
const SAVE = "http://127.0.0.1:8787";
const LIMIT = 100;
const MAX_OFFSET = 2000;
const WORKERS = 16;
const PAGE_WORKERS = 8;
const SAVE_EVERY = 120;
const AZ = "abcdefghijklmnopqrstuvwxyz".split("");
const REGION_Q = "68d42a304c4d7c2e8f734a41";
const SECTOR_Q = "695fd454b17ebea087385b49";
const REGIONS = ["North America", "Latin America (LATAM)", "Europe", "Middle East or Africa", "Asia-Pacific, Australia, New Zealand (APAC)"];
const SECTORS = ["DeFi", "Borrowing and Lending", "RWA", "Privacy", "Agentic Economy", "Bridges and Interoperability", "Treasury (settlement/clearing)", "Payments", "Exchanges and Trading", "Wallets and Custody", "Identity", "Dev Tooling", "Data and Infra", "Governance"];

function mapMember(r, extra) {
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
    ...(extra || {}),
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
  await Promise.all(
    Array.from({ length: Math.min(n, items.length || 1) }, async () => {
      while (i < items.length && !window.__arcAbort) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    })
  );
}

async function page(client, queryDoc, vars) {
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

function makePipeline(known) {
  const pending = [];
  let added = 0;
  let tagged = 0;
  let scanned = 0;
  let dbTotal = known.size;
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
      console.log(`[arc] save batch=${members.length} fresh=${j.fresh} added=${added} db=${dbTotal}`);
    });
    await saving;
  }

  /** only NEW ids */
  function ingestNew(records, extra) {
    let n = 0;
    for (const r of records) {
      scanned++;
      if (!r?.id || known.has(r.id)) continue;
      known.add(r.id);
      pending.push(mapMember(r, extra));
      n++;
      added++;
    }
    return n;
  }

  /** update known + insert new (for club tagging) */
  function ingestTag(records, extra) {
    let nNew = 0;
    for (const r of records) {
      scanned++;
      if (!r?.id) continue;
      const isNew = !known.has(r.id);
      if (isNew) {
        known.add(r.id);
        added++;
        nNew++;
      } else tagged++;
      pending.push(mapMember(r, extra));
    }
    return nNew;
  }

  return {
    flush,
    ingestNew,
    ingestTag,
    stats: () => ({ added, tagged, scanned, dbTotal, known: known.size }),
  };
}

function discoverJobs() {
  const passes = [
    { claimed: true, finishedOnboarding: true },
    { claimed: true, finishedOnboarding: false },
    { claimed: false, finishedOnboarding: false },
  ];
  const out = [];
  const digraphs = [];
  for (const a of AZ) for (const b of AZ) digraphs.push(a + b);

  for (const pass of passes) {
    for (const text of ["", ...AZ]) {
      out.push({ clubId: null, sort: "DEFAULT", pass, text, filters: [], onlineOnly: false, label: `all:${text || "_"}` });
      out.push({ clubId: null, sort: "DEFAULT", pass, text, filters: [], onlineOnly: true, label: `on:${text || "_"}` });
    }
    for (const text of digraphs) {
      out.push({ clubId: null, sort: "DEFAULT", pass, text, filters: [], onlineOnly: false, label: `dg:${text}` });
    }
    for (const r of REGIONS) {
      out.push({ clubId: null, sort: "DEFAULT", pass, text: "", filters: [{ questionId: REGION_Q, value: [r] }], onlineOnly: false, label: `rg:${r.slice(0, 8)}` });
      for (const a of AZ.slice(0, 12)) {
        out.push({ clubId: null, sort: "DEFAULT", pass, text: a, filters: [{ questionId: REGION_Q, value: [r] }], onlineOnly: false, label: `rg:${r.slice(0, 4)}:${a}` });
      }
    }
    for (const s of SECTORS) {
      out.push({ clubId: null, sort: "DEFAULT", pass, text: "", filters: [{ questionId: SECTOR_Q, value: [s] }], onlineOnly: false, label: `sc:${s.slice(0, 8)}` });
    }
  }
  return out;
}

function clubJobs() {
  const passes = [
    { claimed: true, finishedOnboarding: true },
    { claimed: true, finishedOnboarding: false },
    { claimed: false, finishedOnboarding: false },
  ];
  const out = [];
  const digraphs = [];
  for (const a of AZ) for (const b of AZ) digraphs.push(a + b);
  for (const pass of passes) {
    for (const sort of ["JOIN_CLUB_DESC", "DEFAULT"]) {
      for (const text of ["", ...AZ, ...digraphs]) {
        out.push({ pass, sort, text, filters: [], label: `${sort}:${text || "_"}` });
      }
      for (const r of REGIONS) {
        out.push({ pass, sort, text: "", filters: [{ questionId: REGION_Q, value: [r] }], label: `${sort}:rg:${r.slice(0, 6)}` });
      }
      for (const s of SECTORS) {
        out.push({ pass, sort, text: "", filters: [{ questionId: SECTOR_Q, value: [s] }], label: `${sort}:sc:${s.slice(0, 6)}` });
      }
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

async function syncNew() {
  window.__arcAbort = false;
  const { client, queryDoc } = getApollo();
  const known = new Set((await (await fetch(SAVE + "/ids")).json()).ids || []);
  const start = known.size;
  const pipe = makePipeline(known);
  const t0 = performance.now();
  const list = discoverJobs();
  console.log(`[new] skip ${start} known | ${list.length} shards`);

  await mapPool(list, WORKERS, async (job) => {
    const base = {
      tenantId: TENANT,
      bookmarked: false,
      ...job.pass,
      text: job.text,
      profileQuestionFilters: job.filters,
      locationFilters: {},
      sort: job.sort,
    };
    if (job.onlineOnly) base.onlineOnly = true;
    const n = await pullWindow(client, queryDoc, base, (recs) => pipe.ingestNew(recs), pipe.flush);
    if (n) console.log(`[new] ${job.label} +${n}`);
    window.__arcProgress = { mode: "new", ...pipe.stats(), shard: job.label };
  });

  await pipe.flush(true);
  const j = await (await fetch(SAVE + "/flush", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
  const out = { ...pipe.stats(), db: j.total, skipped: start, ms: Math.round(performance.now() - t0) };
  console.log("[new] DONE", out);
  window.__arcProgress = out;
  return out;
}

async function tagArchitects() {
  window.__arcAbort = false;
  const { client, queryDoc } = getApollo();
  const known = new Set((await (await fetch(SAVE + "/ids")).json()).ids || []);
  const start = known.size;
  const pipe = makePipeline(known);
  const t0 = performance.now();
  const list = clubJobs();
  console.log(`[arch] tag+discover ${list.length} shards | known=${start}`);

  await mapPool(list, WORKERS, async (job) => {
    const base = {
      tenantId: TENANT,
      clubId: ARCHITECTS,
      bookmarked: false,
      ...job.pass,
      text: job.text,
      profileQuestionFilters: job.filters,
      locationFilters: {},
      sort: job.sort,
    };
    const n = await pullWindow(
      client,
      queryDoc,
      base,
      (recs) => pipe.ingestTag(recs, { clubs: ["architects"] }),
      pipe.flush
    );
    if (n) console.log(`[arch] ${job.label} +${n} new`);
    window.__arcProgress = { mode: "arch", ...pipe.stats(), shard: job.label };
  });

  await pipe.flush(true);
  const j = await (await fetch(SAVE + "/flush", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
  const out = { ...pipe.stats(), db: j.total, skipped: start, ms: Math.round(performance.now() - t0) };
  console.log("[arch] DONE", out);
  window.__arcProgress = out;
  return out;
}

window.arcSync = { syncNew, tagArchitects };
console.log("[arc] ready — arcSync.syncNew() / arcSync.tagArchitects()");
