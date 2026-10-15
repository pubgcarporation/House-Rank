export const PAGE = 100;

const get = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  });

export function fetchMembers({ q, tier, offset, limit = PAGE }) {
  const p = new URLSearchParams({
    q: q || "",
    tier: tier || "all",
    offset: String(offset || 0),
    limit: String(limit),
  });
  return get(`/api/members?${p}`);
}

export const fetchPlaces = () => get("/api/places");
