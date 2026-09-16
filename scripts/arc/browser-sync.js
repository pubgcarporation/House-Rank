/**
 * Arc people sync — AGGRESSIVE multi-strategy approach
 * Tries EVERY possible combination to capture all 62k users
 *
 * npm run sync:server, open /home/people logged in:
 *   fetch('http://127.0.0.1:8787/sync.js?'+Date.now()).then(r=>r.text()).then(eval)
 *   await arcSync.syncAll()
 */
const TENANT = "688b1c42d1f8bff20fcac7a4";
const SAVE = "http://127.0.0.1:8787";
const LIMIT = 100;
const MAX_OFFSET = 2000;
const WORKERS = 16;
const PAGE_WORKERS = 6;
const SAVE_EVERY = 200;

const REGION_Q = "68d42a304c4d7c2e8f734a41";
const SECTOR_Q = "695fd454b17ebea087385b49";
const REGIONS = [
  "North America",
  "Latin America (LATAM)",
  "Europe",
  "Middle East or Africa",
  "Asia-Pacific, Australia, New Zealand (APAC)",
];
const SECTORS = [
  "DeFi",
  "Borrowing and Lending",
  "RWA",
  "Privacy",
  "Agentic Economy",
  "Bridges and Interoperability",
  "Treasury (settlement/clearing)",
  "Payments",
  "Exchanges and Trading",
  "Wallets and Custody",
  "Identity",
  "Dev Tooling",
  "Data and Infra",
  "Governance",
];

// All possible sort orders to try
const SORT_ORDERS = ["DEFAULT", "RECENT", "ALPHABETICAL"];

// Common countries to shard by
const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France",
  "India", "Singapore", "Netherlands", "Switzerland", "Japan", "China",
  "Brazil", "Mexico", "Spain", "Italy", "Sweden", "Denmark", "Norway",
  "Argentina", "Chile", "Colombia", "United Arab Emirates", "South Africa",
  "South Korea", "Hong Kong", "New Zealand", "Belgium", "Austria", "Portugal",
  "Ireland", "Israel", "Poland", "Turkey", "Indonesia", "Thailand", "Vietnam",
  "Philippines", "Malaysia", "Nigeria", "Kenya", "Egypt", "Pakistan"
];

function mapMember(r) {
  const company = typeof r.company === "string" ? r.company : r.company?.name || null;
  const profileBadge = r.profileBadge
    ? {
        id: r.profileBadge.id,
        name: r.profileBadge.name,
        pictureUrl: r.profileBadge.pictureUrl,
        description: r.profileBadge.description || null,
      }
    : null;
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
    badge: profileBadge?.name || null,
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
  await Promise.all(
    Array.from({ length: Math.min(n, items.length || 1) }, async () => {
      while (i < items.length && !window.__arcSyncAbort) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    })
  );
}

function generateShards() {
  const shards = [];
  
  // Strategy 1: No filters with different sort orders
  for (const sort of SORT_ORDERS) {
    shards.push({ 
      label: `sort:${sort}`, 
      filters: [], 
      locationFilters: {},
      sort 
    });
  }
  
  // Strategy 2: Region filters with all sort orders
  for (const region of REGIONS) {
    for (const sort of SORT_ORDERS) {
      shards.push({
        label: `region:${region}:${sort}`,
        filters: [{ questionId: REGION_Q, value: [region] }],
        locationFilters: {},
        sort
      });
    }
  }
  
  // Strategy 3: Sector filters with all sort orders
  for (const sector of SECTORS) {
    for (const sort of SORT_ORDERS) {
      shards.push({
        label: `sector:${sector}:${sort}`,
        filters: [{ questionId: SECTOR_Q, value: [sector] }],
        locationFilters: {},
        sort
      });
    }
  }
  
  // Strategy 4: Country-based sharding with DEFAULT sort
  for (const country of COUNTRIES) {
    shards.push({
      label: `country:${country}`,
      filters: [],
      locationFilters: { countries: [country] },
      sort: "DEFAULT"
    });
  }
  
  // Strategy 5: Region + Sector combinations (DEFAULT sort only to avoid explosion)
  for (const region of REGIONS) {
    for (const sector of SECTORS) {
      shards.push({
        label: `cross:${region}|${sector}`,
        filters: [
          { questionId: REGION_Q, value: [region] },
          { questionId: SECTOR_Q, value: [sector] }
        ],
        locationFilters: {},
        sort: "DEFAULT"
      });
    }
  }
  
  console.log(`[arc-sync] generated ${shards.length} shards`);
  return shards;
}

async function syncAll() {
  window.__arcSyncAbort = false;
  const { client, queryDoc } = getApollo();
  const seen = new Set();
  const pending = [];
  let dbTotal = 0;
  let saving = Promise.resolve();
  const t0 = performance.now();

  async function flushSave(force) {
    if (!pending.length) return;
    if (!force && pending.length < SAVE_EVERY) return;
    const chunk = pending.splice(0, pending.length);
    saving = saving.then(async () => {
      const res = await fetch(SAVE + "/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ members: chunk }),
      });
      if (!res.ok) throw new Error("save " + res.status);
      const j = await res.json();
      dbTotal = j.total;
      window.__arcProgress = { unique: seen.size, db: dbTotal };
      console.log(`[arc-sync] save +${chunk.length} unique=${seen.size} db=${dbTotal}`);
    });
    await saving;
  }

  function ingest(records) {
    let n = 0;
    for (const r of records) {
      if (!r?.id || seen.has(r.id)) continue;
      seen.add(r.id);
      pending.push(mapMember(r));
      n++;
    }
    return n;
  }

  async function page(base, shard, offset) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await client.query({
          query: queryDoc,
          variables: {
            ...base,
            text: "",
            profileQuestionFilters: shard.filters,
            locationFilters: shard.locationFilters,
            sort: shard.sort,
            limit: LIMIT,
            offset,
          },
          fetchPolicy: "network-only",
        });
        return r.data?.tenantUsers?.records || [];
      } catch (e) {
        if (/maximum offset/i.test(e.message || "")) return [];
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      }
    }
    return [];
  }

  async function pullWindow(base, shard) {
    const first = await page(base, shard, 0);
    if (!first.length) return 0;
    let added = ingest(first);
    if (first.length < LIMIT) {
      await flushSave(false);
      return added;
    }
    const offsets = [];
    for (let o = LIMIT; o <= MAX_OFFSET; o += LIMIT) offsets.push(o);
    await mapPool(offsets, PAGE_WORKERS, async (offset) => {
      const records = await page(base, shard, offset);
      if (records.length) added += ingest(records);
    });
    await flushSave(false);
    return added;
  }

  const passes = [
    { claimed: true, finishedOnboarding: true },
    { claimed: true, finishedOnboarding: false },
    { claimed: false },
  ];
  const shards = generateShards();
  console.log(`[arc-sync] workers=${WORKERS} shards=${shards.length} passes=${passes.length}`);
  console.log(`[arc-sync] theoretical max: ${shards.length * passes.length * (MAX_OFFSET + LIMIT)} records`);

  for (const pass of passes) {
    if (window.__arcSyncAbort) break;
    const base = {
      tenantId: TENANT,
      bookmarked: false,
      ...pass,
    };
    console.log("[arc-sync] pass", pass);
    await mapPool(shards, WORKERS, async (shard) => {
      const n = await pullWindow(base, shard);
      if (n) console.log(`[arc-sync] ${shard.label} +${n} unique=${seen.size}`);
      window.__arcProgress = { unique: seen.size, db: dbTotal, shard: shard.label, pass };
    });
    await flushSave(true);
  }

  await flushSave(true);
  const res = await fetch(SAVE + "/flush", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const j = await res.json();
  const out = { count: seen.size, total: j.total, ms: Math.round(performance.now() - t0) };
  console.log("[arc-sync] DONE", out);
  window.__arcProgress = out;
  return out;
}

async function syncOne(id) {
  const { client, queryDoc } = getApollo();
  const r = await client.query({
    query: queryDoc,
    variables: {
      tenantId: TENANT,
      bookmarked: false,
      claimed: true,
      finishedOnboarding: true,
      text: "",
      profileQuestionFilters: [],
      locationFilters: {},
      sort: "DEFAULT",
      limit: 5,
      offset: 0,
      includeIds: [id],
    },
    fetchPolicy: "network-only",
  });
  const members = (r.data?.tenantUsers?.records || []).map(mapMember);
  if (!members.length) throw new Error("not found");
  await fetch(SAVE + "/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ members }),
  });
  await fetch(SAVE + "/flush", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  return members[0];
}

window.arcSync = { syncAll, syncOne };
console.log("[arc-sync] ready (AGGRESSIVE multi-strategy: sorts + regions + sectors + countries + crosses)");
