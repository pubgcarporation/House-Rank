export const PAGE = 100;

export function fetchMembers({ q, tier, offset, limit = PAGE }) {
  const p = new URLSearchParams({
    q: q || "",
    tier: tier || "all",
    offset: String(offset || 0),
    limit: String(limit),
  });
  return fetch(`/api/members?${p}`).then((r) => r.json());
}
