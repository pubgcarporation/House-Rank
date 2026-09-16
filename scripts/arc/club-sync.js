/**
 * Arc Club Members Scraper - Throttled API access
 * Tries to find and extract ALL club members
 */
const TENANT = "688b1c42d1f8bff20fcac7a4";
const SAVE = "http://127.0.0.1:8787";
const LIMIT = 100;
const MAX_OFFSET = 2000;
const THROTTLE_MS = 200; // 200ms between requests

function mapMember(r) {
  const company = typeof r.company === "string" ? r.company : r.company?.name || null;
  const profileBadge = r.profileBadge ? {id: r.profileBadge.id, name: r.profileBadge.name, pictureUrl: r.profileBadge.pictureUrl, description: r.profileBadge.description || null} : null;
  return {
    id: r.id, userId: r.userId, nanoId: r.nanoId,
    name: r.displayName || [r.firstName, r.lastName].filter(Boolean).join(" "),
    firstName: r.firstName || null, lastName: r.lastName || null,
    headline: r.headline || null, position: r.position || null, company,
    pictureUrl: r.pictureUrl || null, city: r.city || null, state: r.state || null, country: r.country || null,
    location: r.displayLocation || [r.city, r.state, r.country].filter(Boolean).join(", ") || null,
    points: r.totalContributionPoints || 0, badges: r.totalContributionBadgeCount || 0,
    role: r.role || null, badge: profileBadge?.name || null, profileBadge,
  };
}

function getApollo() {
  const clients = new Set();
  const walk = (f, d = 0) => {
    if (!f || d > 80) return;
    try { const c = f.memoizedProps?.client || f.pendingProps?.client; if (c?.query) clients.add(c); } catch {}
    walk(f.child, d + 1); walk(f.sibling, d + 1);
  };
  for (const el of document.querySelectorAll("*")) {
    const k = Object.keys(el).find((x) => x.startsWith("__reactFiber"));
    if (k) { walk(el[k]); if (clients.size) break; }
  }
  const client = [...clients][0];
  if (!client) throw new Error("Apollo not found");
  let queryDoc;
  for (const q of client.queryManager.queries.values()) {
    const doc = q.document || q.observableQuery?.options?.query;
    if (doc?.definitions?.[0]?.name?.value === "searchTenantUsersWithPagination") { queryDoc = doc; break; }
  }
  if (!queryDoc) throw new Error("people query missing");
  return { client, queryDoc };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrapeWithThrottle() {
  const { client, queryDoc } = getApollo();
  const seen = new Set();
  const members = [];
  let saveCount = 0;
  
  console.log("[club-sync] Starting throttled scrape...");
  
  // Try ALL possible offset/filter combinations
  const passes = [
    { claimed: true, finishedOnboarding: true },
    { claimed: true, finishedOnboarding: false },
    { claimed: false, finishedOnboarding: false },
  ];
  
  for (const pass of passes) {
    console.log(`[club-sync] Pass: ${JSON.stringify(pass)}`);
    
    for (let offset = 0; offset <= MAX_OFFSET; offset += LIMIT) {
      try {
        await sleep(THROTTLE_MS);
        
        const r = await client.query({
          query: queryDoc,
          variables: {
            tenantId: TENANT,
            bookmarked: false,
            ...pass,
            text: "",
            profileQuestionFilters: [],
            locationFilters: {},
            sort: "DEFAULT",
            limit: LIMIT,
            offset,
          },
          fetchPolicy: "network-only",
        });
        
        const records = r.data?.tenantUsers?.records || [];
        if (!records.length) break;
        
        let newCount = 0;
        for (const rec of records) {
          if (!rec?.id || seen.has(rec.id)) continue;
          seen.add(rec.id);
          members.push(mapMember(rec));
          newCount++;
        }
        
        console.log(`[club-sync] offset=${offset} +${newCount} new, total unique=${seen.size}`);
        
        // Save batch every 500 members
        if (members.length >= 500) {
          const res = await fetch(SAVE + "/save", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({members: members.splice(0, members.length)}),
          });
          const j = await res.json();
          saveCount = j.total;
          console.log(`[club-sync] Saved batch, DB total: ${saveCount}`);
        }
        
        if (records.length < LIMIT) break;
        
      } catch (e) {
        if (/maximum offset/i.test(e.message)) {
          console.log(`[club-sync] Hit offset limit at ${offset}`);
          break;
        }
        console.error(`[club-sync] Error at offset ${offset}:`, e.message);
      }
    }
  }
  
  // Final save
  if (members.length > 0) {
    const res = await fetch(SAVE + "/save", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({members}),
    });
    const j = await res.json();
    saveCount = j.total;
  }
  
  // Flush
  await fetch(SAVE + "/flush", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: "{}",
  });
  
  console.log(`[club-sync] ✅ COMPLETE: ${seen.size} unique scraped, ${saveCount} in DB`);
  return {unique: seen.size, saved: saveCount};
}

window.clubSync = { scrapeWithThrottle };
console.log("[club-sync] Throttled scraper ready");
