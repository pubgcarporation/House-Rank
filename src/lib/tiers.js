export const TIERS = [
  { n: 5, label: "Architect Tier 5", color: "#4A3D7A" },
  { n: 4, label: "Architect Tier 4", color: "#2F578C" },
  { n: 3, label: "Architect Tier 3", color: "#C9A227" },
  { n: 2, label: "Architect Tier 2", color: "#C4843A" },
  { n: 1, label: "Architect Tier 1", color: "#8D939E" },
];

const MEMBER = { n: 0, label: "Member", color: "#656B76" };

export function badgeTier(badge) {
  return Number((/Architect\s*Tier\s*(\d+)/i.exec(badge || "") || [])[1]) || 0;
}

export function tierOf(m) {
  return TIERS.find((t) => t.n === badgeTier(m?.badge)) || MEMBER;
}

export function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n || 0);
}
